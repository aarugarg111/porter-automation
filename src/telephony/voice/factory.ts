// src/telephony/voice/factory.ts
// Picks the speech engines for the real-time voice agent. With SARVAM_API_KEY set we use the real
// Sarvam adapters (Hindi-native); otherwise the mocks keep the pipeline runnable (a soft tone) so the
// server still boots and the route is exercisable without any account.
import type { SttEngine, TtsEngine } from './types.js';
import { MockSttEngine, MockTtsEngine } from './mock.js';
import { SarvamSttEngine, SarvamTtsEngine } from './sarvam.js';
import { GuidanceBrain, type Brain } from './brain.js';
import { LlmBrain } from './llm_brain.js';
import { OpenAiCompatChat } from './llm.js';
import type { LandmarkKB } from '../../landmarks/kb.js';

export interface VoiceEngines { stt: SttEngine; tts: TtsEngine; mode: string }

// Per-call brain. With LLM_API_KEY set → a real LLM conversation (Cashflohero-style); else the
// rule-based landmark brain. Defaults target Gemini's OpenAI-compatible endpoint; override via env
// (LLM_BASE_URL / LLM_MODEL) to use Groq, OpenAI, etc.
export function createBrain(kb: LandmarkKB): Brain {
  const key = process.env.LLM_API_KEY;
  if (key) {
    const base = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai';
    const model = process.env.LLM_MODEL || 'gemini-flash-latest';
    // Reasoning models (e.g. sarvam-30b) spend tokens "thinking" before the answer → give enough budget.
    const maxTokens = Number(process.env.LLM_MAX_TOKENS) || 400;
    return new LlmBrain(new OpenAiCompatChat(base, key, model, { maxTokens }), kb);
  }
  return new GuidanceBrain(kb);
}

export function makeVoiceEngines(): VoiceEngines {
  const key = process.env.SARVAM_API_KEY;
  if (key) {
    return { stt: new SarvamSttEngine(key), tts: new SarvamTtsEngine(key), mode: 'sarvam' };
  }
  console.warn('[voice] no SARVAM_API_KEY — running MOCK voice (soft tone, no real speech).');
  return { stt: new MockSttEngine(), tts: new MockTtsEngine(), mode: 'mock' };
}
