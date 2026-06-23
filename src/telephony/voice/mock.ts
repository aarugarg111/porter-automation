// src/telephony/voice/mock.ts
// Test/dev speech engines — no network, no keys. MockStt lets a test inject what the caller "said";
// MockTts returns a deterministic µ-law buffer sized to the text so the pipeline produces real frames.
import type { SttEngine, SttSession, SttHandlers, TtsEngine } from './types.js';
import { pcm16ToMuLaw } from '../audio.js';

export class MockSttSession implements SttSession {
  audioBytes = 0;
  constructor(private handlers: SttHandlers) {}
  pushAudio(muLaw: Buffer): void { this.audioBytes += muLaw.length; }
  close(): void {}
  // Test hooks — simulate the caller speaking.
  speechStarted(): void { this.handlers.onSpeechStarted?.(); }
  say(text: string): void { this.handlers.onSpeechStarted?.(); this.handlers.onFinal(text); }
}

export class MockSttEngine implements SttEngine {
  sessions: MockSttSession[] = [];
  open(handlers: SttHandlers): SttSession {
    const s = new MockSttSession(handlers);
    this.sessions.push(s);
    return s;
  }
  get last(): MockSttSession | undefined { return this.sessions[this.sessions.length - 1]; }
}

export class MockTtsEngine implements TtsEngine {
  spoken: string[] = [];
  // ~8 kHz * 60 ms per word of "audio" — enough to produce several Twilio frames per utterance.
  async synthesize(text: string): Promise<Buffer> {
    this.spoken.push(text);
    const words = Math.max(1, text.trim().split(/\s+/).length);
    const samples = new Int16Array(8000 * 0.06 * words);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.round(3000 * Math.sin(i / 6)); // soft tone
    return pcm16ToMuLaw(samples);
  }
}
