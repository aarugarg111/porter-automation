// src/telephony/voice/sarvam.ts
// Real Sarvam adapters for the voice agent (Indian, Hindi-native). Protocol verified live 2026-06-23.
//   TTS  — POST /text-to-speech, output_audio_codec:"mulaw" + 8000 → raw µ-law 8k, Twilio-ready.
//   STT  — wss /speech-to-text/ws, wants PCM16 → we decode µ-law first; VAD events drive barge-in.
import { WebSocket } from 'ws';
import type { SttEngine, SttSession, SttHandlers, TtsEngine } from './types.js';
import { muLawToPcm16, pcm16SamplesToBytes } from '../audio.js';

const TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const STT_URL = 'wss://api.sarvam.ai/speech-to-text/ws?model=saarika:v2.5&language-code=hi-IN&sample_rate=8000&vad_signals=true';
const TTS_LIMIT = 1400; // bulbul:v2 caps at 1500 chars/call — chunk long lines by sentence.

// Split on sentence punctuation (Hindi danda + Latin .?!) so each TTS call stays under the limit.
function chunkText(text: string): string[] {
  if (text.length <= TTS_LIMIT) return [text];
  const parts = text.split(/(?<=[।.?!])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length > TTS_LIMIT) { if (cur) out.push(cur.trim()); cur = p; }
    else cur = (cur + ' ' + p).trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}

export class SarvamTtsEngine implements TtsEngine {
  constructor(private key: string, private speaker = process.env.SARVAM_SPEAKER || 'anushka') {}
  async synthesize(text: string): Promise<Buffer> {
    const buffers: Buffer[] = [];
    for (const chunk of chunkText(text)) {
      const res = await fetch(TTS_URL, {
        method: 'POST',
        headers: { 'api-subscription-key': this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chunk, target_language_code: 'hi-IN', speaker: this.speaker,
          model: 'bulbul:v2', speech_sample_rate: 8000, output_audio_codec: 'mulaw',
          pace: Number(process.env.SARVAM_PACE) || 0.9, // a touch SLOWER = clearer directions on a call
        }),
      });
      if (!res.ok) { console.error('[sarvam.tts]', res.status, (await res.text()).slice(0, 200)); continue; }
      const j = (await res.json()) as { audios?: string[] };
      if (j.audios?.[0]) buffers.push(Buffer.from(j.audios[0], 'base64')); // raw µ-law 8k
    }
    return Buffer.concat(buffers);
  }
}

class SarvamSttSession implements SttSession {
  private ws: WebSocket;
  private ready = false;
  private queue: string[] = [];
  private awaitingFinal = false;
  private lastTranscript = '';

  constructor(key: string, private handlers: SttHandlers) {
    this.ws = new WebSocket(STT_URL, { headers: { 'api-subscription-key': key } });
    this.ws.on('open', () => { this.ready = true; for (const m of this.queue) this.ws.send(m); this.queue = []; });
    this.ws.on('message', (d) => this.onMessage(d.toString()));
    this.ws.on('error', (e) => console.error('[sarvam.stt]', (e as Error).message));
  }

  private onMessage(raw: string): void {
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'events') {
      const sig = m.data?.signal_type;
      if (sig === 'START_SPEECH') this.handlers.onSpeechStarted?.();        // → barge-in
      else if (sig === 'END_SPEECH') this.awaitingFinal = true;            // utterance boundary
      return;
    }
    if (m.type === 'data') {
      const t = (m.data?.transcript || '').trim();
      if (!t) return;
      this.lastTranscript = t;
      if (this.awaitingFinal) { this.awaitingFinal = false; this.handlers.onFinal(t); }
      else this.handlers.onPartial?.(t);
    }
  }

  pushAudio(muLaw: Buffer): void {
    const pcm = pcm16SamplesToBytes(muLawToPcm16(muLaw));
    const msg = JSON.stringify({ audio: { data: pcm.toString('base64'), encoding: 'audio/wav', sample_rate: '8000' } });
    if (this.ready) this.ws.send(msg); else if (this.queue.length < 500) this.queue.push(msg);
  }

  close(): void {
    try { if (this.ready) this.ws.send(JSON.stringify({ type: 'flush' })); } catch {}
    try { this.ws.close(); } catch {}
    // Flush a trailing transcript the call didn't get an END_SPEECH for.
    if (this.lastTranscript && this.awaitingFinal) { this.awaitingFinal = false; this.handlers.onFinal(this.lastTranscript); }
  }
}

export class SarvamSttEngine implements SttEngine {
  constructor(private key: string) {}
  open(handlers: SttHandlers): SttSession { return new SarvamSttSession(this.key, handlers); }
}
