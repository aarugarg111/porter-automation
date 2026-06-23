# Real-time voice agent (replaces the IVR)

Why: the old `<Say>`/`<Gather>` IVR monologued for ~20s, sounded robotic (`Polly.Aditi`), and escalated
to the owner on its first miss. This replaces it with a **streaming voice agent** — natural Hindi, low
latency, interruptible (barge-in), and it **always guides** (never dead-ends to the owner).

## Pipeline
```
Twilio call ──µ-law 8k──▶ Media Streams WS ──▶ STT ──transcript──▶ Brain ──text──▶ TTS ──µ-law──▶ Twilio
                              (src/telephony/media_stream.ts)        (KB)            (back to caller)
```
- **`src/api/voice_stream.ts`** — inbound webhook returns `<Connect><Stream wss://<host>/media-stream>` (passes From + CallSid as `<Parameter>`s).
- **`src/telephony/media_stream.ts`** — the WebSocket call session: greets, streams audio to STT, runs the brain on each finished utterance, streams TTS back, and on **barge-in** (caller starts talking) sends Twilio a `clear` to stop the bot mid-sentence.
- **`src/telephony/voice/brain.ts`** — generous KB guidance: a known landmark → its leg; arrived → hang up; lost/"connect me" → owner; **anything else → universal "come to Canara Bank / Pillar 25" directions, not an escalation.**
- **`src/telephony/audio.ts`** — G.711 µ-law codec + resample/frame helpers.
- **`src/telephony/voice/{types,mock,factory}.ts`** — pluggable STT/TTS; mocks run the whole pipeline with no API key (used by `tests/media_stream.test.ts`).

## Enable
Set `VOICE_AGENT=1` → the inbound webhook serves `<Connect><Stream>` instead of the IVR (default off, so
the IVR stays live until the real engines are wired). The WS endpoint attaches on the same port at
`/media-stream`. cloudflared proxies `wss://` over the same tunnel.

## Speech engines — verified spec (to wire in `factory.ts`)
Twilio is the fixed anchor: **everything in/out is µ-law (G.711) 8 kHz mono, header-less, base64.**

**TTS — Sarvam Bulbul (natural Hindi):** `POST https://api.sarvam.ai/text-to-speech`, header
`api-subscription-key`. Request `output_audio_codec:"mulaw"` + `speech_sample_rate:8000` → **Twilio-ready
µ-law, zero conversion.** Body `{text, target_language_code:"hi-IN", speaker:"anushka", model:"bulbul:v2"}`;
response `{audios:[<base64>]}`. Max 1500 chars (v2) — chunk by sentence. Hindi speakers: anushka, manisha,
vidya, arya, abhilash, karun, hitesh.

**STT option A — Sarvam (one Indian vendor):** `wss://api.sarvam.ai/speech-to-text/ws?model=saarika:v2.5&language-code=hi-IN&sample_rate=8000&vad_signals=true`,
header `api-subscription-key`. Wants **PCM16** (not µ-law) → decode with `muLawToPcm16` first. Send
`{audio:{data:<base64 pcm_s16le>, encoding:"audio/wav", sample_rate:"8000"}}`; results `{type:"data", data:{transcript}}`;
barge-in/endpointing via `{type:"events", data:{signal_type:"START_SPEECH"|"END_SPEECH"}}`.

**STT option B — Deepgram (cleanest for telephony, fallback):** accepts Twilio µ-law **directly** (no
conversion). `wss://api.deepgram.com/v1/listen?model=nova-3&language=hi&encoding=mulaw&sample_rate=8000&channels=1&interim_results=true&endpointing=300&utterance_end_ms=1000&vad_events=true`,
header `Authorization: Token <KEY>`. Send raw µ-law bytes as **binary** frames; `KeepAlive` every <10s.
Barge-in via `SpeechStarted`; final via `speech_final`/`UtteranceEnd`. $200 free credit.

**Recommended:** Sarvam for both (one key, Hindi-native). Cost ≈ TTS ₹15/10k chars + STT ₹30/hr;
Sarvam free ₹100 on signup. Add Deepgram STT later if Hindi accuracy/barge-in needs it.

## Status
Built + tested with mock engines (`tests/media_stream.test.ts`, `tests/audio.test.ts`). Pending: a
**Sarvam API key** → wire the real adapters in `factory.ts` → flip `VOICE_AGENT=1` → live call test.
Optional: `redirectCall`/`hangupCall` (Twilio REST) for owner-transfer / clean hangup (today transfer
just ends the stream).
