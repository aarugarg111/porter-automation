// src/telephony/voice/factory.ts
// Picks the speech engines for the real-time voice agent. With SARVAM_API_KEY set we use the real
// Sarvam adapters (Hindi-native); otherwise the mocks keep the pipeline runnable (a soft tone) so the
// server still boots and the route is exercisable without any account.
import type { SttEngine, TtsEngine } from './types.js';
import { MockSttEngine, MockTtsEngine } from './mock.js';
import { SarvamSttEngine, SarvamTtsEngine } from './sarvam.js';

export interface VoiceEngines { stt: SttEngine; tts: TtsEngine; mode: string }

export function makeVoiceEngines(): VoiceEngines {
  const key = process.env.SARVAM_API_KEY;
  if (key) {
    return { stt: new SarvamSttEngine(key), tts: new SarvamTtsEngine(key), mode: 'sarvam' };
  }
  console.warn('[voice] no SARVAM_API_KEY — running MOCK voice (soft tone, no real speech).');
  return { stt: new MockSttEngine(), tts: new MockTtsEngine(), mode: 'mock' };
}
