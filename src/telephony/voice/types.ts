// src/telephony/voice/types.ts
// Pluggable speech engines for the real-time voice agent. The Media Streams handler depends only on
// these interfaces — the real Sarvam/Deepgram adapters and the test mocks both implement them, so the
// whole pipeline runs (and is tested) without any API key.

export interface SttHandlers {
  onPartial?: (text: string) => void;   // interim transcript (optional)
  onFinal: (text: string) => void;      // a finished utterance
  onSpeechStarted?: () => void;         // caller began speaking → trigger barge-in
}

export interface SttSession {
  pushAudio(muLaw: Buffer): void;       // feed inbound Twilio µ-law 8 kHz audio
  close(): void;
}

export interface SttEngine {
  // Open a streaming recognition session for one call.
  open(handlers: SttHandlers): SttSession;
}

export interface TtsEngine {
  // Synthesise Hindi text → Twilio-ready µ-law 8 kHz audio.
  synthesize(text: string): Promise<Buffer>;
}
