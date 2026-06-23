// src/telephony/voice/factory.ts
// Picks the speech engines for the real-time voice agent. Real Sarvam/Deepgram adapters are wired in
// when their keys are present; otherwise the mocks keep the pipeline runnable (a soft tone) so the
// server still boots and the route is exercisable without any account.
import type { SttEngine, TtsEngine } from './types.js';
import { MockSttEngine, MockTtsEngine } from './mock.js';

export interface VoiceEngines { stt: SttEngine; tts: TtsEngine; mode: string }

export function makeVoiceEngines(): VoiceEngines {
  // TODO(next): when SARVAM_API_KEY (TTS Bulbul µ-law 8k + STT ws) / DEEPGRAM_API_KEY (STT µ-law)
  // are set, return the real adapters here. Spec verified — see docs/VOICE-AGENT.md.
  if (process.env.SARVAM_API_KEY || process.env.DEEPGRAM_API_KEY) {
    console.warn('[voice] real STT/TTS adapters not wired yet — running MOCK voice (skeleton).');
  }
  return { stt: new MockSttEngine(), tts: new MockTtsEngine(), mode: 'mock' };
}
