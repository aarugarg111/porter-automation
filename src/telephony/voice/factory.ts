// src/telephony/voice/factory.ts
// Picks the speech engines for the real-time voice agent. With SARVAM_API_KEY set we use the real
// Sarvam adapters (Hindi-native); otherwise the mocks keep the pipeline runnable (a soft tone) so the
// server still boots and the route is exercisable without any account.
import type { SttEngine, TtsEngine } from './types.js';
import { MockSttEngine, MockTtsEngine } from './mock.js';
import { SarvamSttEngine, SarvamTtsEngine } from './sarvam.js';
import { EdgeTtsEngine } from './edge.js';
import { GuidanceBrain, type Brain } from './brain.js';
import { LlmBrain } from './llm_brain.js';
import { OpenAiCompatChat } from './llm.js';
import { GoogleMaps } from '../../maps/google.js';
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
    // Optional live map grounding (Google) for landmarks Aryan didn't pre-list; off if no key.
    const maps = process.env.GOOGLE_MAPS_API_KEY ? new GoogleMaps(process.env.GOOGLE_MAPS_API_KEY) : undefined;
    return new LlmBrain(new OpenAiCompatChat(base, key, model, { maxTokens }), kb, maps);
  }
  return new GuidanceBrain(kb);
}

// STT and TTS are picked INDEPENDENTLY so we can mix providers — e.g. Sarvam STT + Edge TTS (the
// clearest Hindi voice, what Cashflohero uses) via TTS_ENGINE=edge. Each falls back to a mock with no key.
export function makeVoiceEngines(): VoiceEngines {
  const sarvamKey = process.env.SARVAM_API_KEY;
  const edgeTts = process.env.TTS_ENGINE === 'edge';

  const stt: SttEngine = sarvamKey ? new SarvamSttEngine(sarvamKey) : new MockSttEngine();
  const sttMode = sarvamKey ? 'sarvam' : 'mock';

  let tts: TtsEngine; let ttsMode: string;
  if (edgeTts) { tts = new EdgeTtsEngine(); ttsMode = `edge:${process.env.EDGE_VOICE || 'hi-IN-SwaraNeural'}`; }
  else if (sarvamKey) { tts = new SarvamTtsEngine(sarvamKey); ttsMode = 'sarvam'; }
  else { tts = new MockTtsEngine(); ttsMode = 'mock'; }

  if (!sarvamKey && !edgeTts) console.warn('[voice] no SARVAM_API_KEY — running MOCK voice (soft tone, no real speech).');
  return { stt, tts, mode: `stt=${sttMode} tts=${ttsMode}` };
}
