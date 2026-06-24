// src/telephony/voice/edge.ts
// Edge (Microsoft) Neural TTS — hi-IN-SwaraNeural, the same voice Cashflohero uses. Free, no API key.
// Far clearer than Sarvam Bulbul on a phone line, and handles Hindi+English code-switching naturally.
// msedge-tts streams 24 kHz MP3 (node-native, no Python); we transcode to Twilio-ready µ-law 8 kHz with
// ffmpeg. Replies are one short sentence, so no chunking is needed (unlike Sarvam's 1500-char cap).
import { spawn } from 'node:child_process';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { TtsEngine } from './types.js';

const FFMPEG = process.env.EDGE_FFMPEG || 'ffmpeg';

export class EdgeTtsEngine implements TtsEngine {
  constructor(private voice = process.env.EDGE_VOICE || 'hi-IN-SwaraNeural') {}

  async synthesize(text: string): Promise<Buffer> {
    const mp3 = await this.toMp3(text);
    if (!mp3.length) return Buffer.alloc(0);
    return this.mp3ToMuLaw8k(mp3);
  }

  // One short utterance → MP3 over Edge's WS. New client per call keeps it simple and stateless.
  private async toMp3(text: string): Promise<Buffer> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(this.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];
    return await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('edge-tts timeout')), 15000);
      audioStream.on('data', (c: Buffer) => chunks.push(c));
      audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      audioStream.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    });
  }

  // MP3 → raw µ-law 8 kHz mono (Twilio Media Streams format), straight off ffmpeg's stdout.
  private mp3ToMuLaw8k(mp3: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ff = spawn(FFMPEG, ['-loglevel', 'error', '-i', 'pipe:0', '-f', 'mulaw', '-ar', '8000', '-ac', '1', 'pipe:1']);
      const out: Buffer[] = []; const err: Buffer[] = [];
      ff.stdout.on('data', (c) => out.push(c));
      ff.stderr.on('data', (c) => err.push(c));
      ff.on('error', reject); // e.g. ffmpeg not installed
      ff.on('close', (code) => code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(0, 200)}`)));
      ff.stdin.on('error', () => {}); // swallow EPIPE if ffmpeg dies early
      ff.stdin.end(mp3);
    });
  }
}
