// src/telephony/media_stream.ts
// Real-time voice agent over Twilio Media Streams (bidirectional <Connect><Stream>). Per call:
//   Twilio --µ-law audio--> STT --transcript--> Brain --reply text--> TTS --µ-law--> Twilio
// with barge-in: when the caller starts talking we flush Twilio's playback buffer and listen.
// Engines are injected (Sarvam/Deepgram in prod, mocks in tests) so this runs with no API key.
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { DatabaseSync } from 'node:sqlite';
import type { LandmarkKB } from '../landmarks/kb.js';
import type { SttEngine, SttSession, TtsEngine } from './voice/types.js';
import { GuidanceBrain, type BrainAction } from './voice/brain.js';
import { chunkMuLaw } from './audio.js';
import { logCallTurn } from './call_log.js';
import { e164 } from './twiml.js';

export interface MediaStreamDeps {
  db: DatabaseSync;
  stt: SttEngine;
  tts: TtsEngine;
  kb: LandmarkKB;
  ownerPhone: string;
  // Prod wires these to the Twilio REST API; optional so the pipeline runs in tests without it.
  redirectCall?: (callSid: string, twiml: string) => Promise<void>;
  hangupCall?: (callSid: string) => Promise<void>;
  path?: string; // default '/media-stream'
}

// One live call. Public methods are driven by the Twilio WS protocol; engine callbacks drive the rest.
export class CallSession {
  private streamSid = '';
  private callSid = '';
  private fromPhone = '';
  private stt?: SttSession;
  private brain: GuidanceBrain;
  private speakGen = 0;          // bumped on every new utterance + on barge-in → stale frames are dropped
  private speaking = false;
  private mutedUntilMs = 0;      // ignore transcripts briefly after we finish talking (echo tail)
  private speakTimer?: ReturnType<typeof setTimeout>;
  private pendingAfterSpeech?: BrainAction; // 'transfer'/'hangup' to run once the line finishes playing

  private log(...a: unknown[]): void { console.log(`[voice ${this.callSid || this.streamSid}]`, ...a); }

  constructor(private ws: WebSocket, private deps: MediaStreamDeps) {
    this.brain = new GuidanceBrain(deps.kb);
  }

  handle(raw: string): void {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.event) {
      case 'start': return this.onStart(msg);
      case 'media': return this.onMedia(msg);
      case 'mark': return this.onMark(msg);
      case 'stop': return this.onStop();
    }
  }

  private onStart(msg: any): void {
    this.streamSid = msg.streamSid || msg.start?.streamSid || '';
    this.callSid = msg.start?.callSid || msg.start?.customParameters?.callSid || '';
    this.fromPhone = msg.start?.customParameters?.from || '';
    logCallTurn(this.deps.db, { callSid: this.callSid, fromPhone: this.fromPhone });

    this.log('call started, from=', this.fromPhone || '(masked)');
    this.stt = this.deps.stt.open({
      onSpeechStarted: () => this.onBargeIn(),
      onFinal: (text) => this.onUtterance(text),
    });
    void this.speak(this.brain.greeting());
  }

  private onMedia(msg: any): void {
    const payload = msg.media?.payload;
    if (payload && this.stt) this.stt.pushAudio(Buffer.from(payload, 'base64'));
  }

  // HALF-DUPLEX by default: we do NOT interrupt ourselves. The earlier echo loop was the bot hearing
  // its own voice (call echo) and "barging in" on itself. Opt back into true barge-in with VOICE_BARGE_IN=1
  // only once acoustic echo cancellation is sorted.
  private onBargeIn(): void {
    if (process.env.VOICE_BARGE_IN !== '1') return; // half-duplex
    if (!this.speaking) return;
    this.log('barge-in: caller interrupted');
    this.speakGen++;
    this.speaking = false;
    this.pendingAfterSpeech = undefined;
    this.sendJson({ event: 'clear', streamSid: this.streamSid });
  }

  private onUtterance(text: string): void {
    // Ignore anything heard WHILE we're talking (or just after) — that's our own echo, not the caller.
    if (this.speaking || Date.now() < this.mutedUntilMs) { this.log('heard (ignored, self-echo):', JSON.stringify(text)); return; }
    this.log('heard:', JSON.stringify(text));
    logCallTurn(this.deps.db, { callSid: this.callSid, fromPhone: this.fromPhone, spoken: text });
    const reply = this.brain.onTranscript(text);
    this.log('→', reply.action, JSON.stringify(reply.say));
    this.pendingAfterSpeech = reply.action === 'speak' ? undefined : reply.action;
    void this.speak(reply.say);
  }

  // Synthesise + stream a line back, paced at ~20 ms/frame (clean playback). Guarded by speakGen.
  private async speak(text: string): Promise<void> {
    const gen = ++this.speakGen;
    this.speaking = true;
    let mu: Buffer;
    try { mu = await this.deps.tts.synthesize(text); }
    catch (e) { console.error('[media] tts', e); this.finishSpeaking(gen); return; }
    if (gen !== this.speakGen) return; // superseded
    const frames = chunkMuLaw(mu);
    this.log(`speaking ${frames.length} frames (~${(mu.length / 8000).toFixed(1)}s)`);
    for (const frame of frames) {
      if (gen !== this.speakGen) return;
      this.sendJson({ event: 'media', streamSid: this.streamSid, media: { payload: frame.toString('base64') } });
      await new Promise((r) => setTimeout(r, 20));
    }
    if (gen !== this.speakGen) return;
    this.sendJson({ event: 'mark', streamSid: this.streamSid, mark: { name: `say-${gen}` } });
    // Fallback in case Twilio never echoes the mark — start listening after the audio would have played.
    this.speakTimer = setTimeout(() => this.finishSpeaking(gen), 1500);
  }

  // Twilio echoes our mark once the audio has played out → resume listening (+ run any deferred action).
  private onMark(msg: any): void {
    const name: string = msg.mark?.name || '';
    if (name === `say-${this.speakGen}`) this.finishSpeaking(this.speakGen);
  }

  private finishSpeaking(gen: number): void {
    if (gen !== this.speakGen || !this.speaking) return;
    if (this.speakTimer) { clearTimeout(this.speakTimer); this.speakTimer = undefined; }
    this.speaking = false;
    this.mutedUntilMs = Date.now() + Number(process.env.VOICE_ECHO_GRACE_MS ?? 500); // echo-tail grace
    this.log('done speaking → listening');
    const action = this.pendingAfterSpeech;
    this.pendingAfterSpeech = undefined;
    if (action === 'hangup') void this.endCall();
    else if (action === 'transfer') void this.transfer();
  }

  private async transfer(): Promise<void> {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${e164(this.deps.ownerPhone)}</Dial></Response>`;
    if (this.deps.redirectCall && this.callSid) {
      try { await this.deps.redirectCall(this.callSid, twiml); } catch (e) { console.error('[media] transfer', e); }
    }
    this.close();
  }

  private async endCall(): Promise<void> {
    if (this.deps.hangupCall && this.callSid) {
      try { await this.deps.hangupCall(this.callSid); } catch (e) { console.error('[media] hangup', e); }
    }
    this.close();
  }

  private onStop(): void { this.close(); }

  private sendJson(o: unknown): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  private close(): void {
    try { this.stt?.close(); } catch {}
    try { if (this.ws.readyState === WebSocket.OPEN) this.ws.close(); } catch {}
  }
}

// Attach the Media Streams WS endpoint to the existing HTTP server (shares the port with Express).
export function attachMediaStream(server: Server, deps: MediaStreamDeps): WebSocketServer {
  const path = deps.path || '/media-stream';
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url || '').split('?')[0] !== path) return; // let other WS paths/handlers be
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    const session = new CallSession(ws, deps);
    ws.on('message', (data) => session.handle(data.toString()));
  });
  return wss;
}
