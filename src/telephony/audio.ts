// src/telephony/audio.ts
// G.711 µ-law codec + helpers for Twilio Media Streams. Twilio sends/receives 8-bit µ-law mono at
// 8000 Hz, 20 ms frames (160 bytes). STT/TTS engines usually speak linear PCM16, so we convert at the
// edges. Pure, dependency-free, unit-tested — this is the one piece that must be exactly right.

const BIAS = 0x84;
const CLIP = 32635;

// Linear PCM16 sample (-32768..32767) → one µ-law byte.
export function encodeMuLawSample(sample: number): number {
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

// One µ-law byte → linear PCM16 sample.
export function decodeMuLawSample(muLawByte: number): number {
  muLawByte = ~muLawByte & 0xff;
  const sign = muLawByte & 0x80;
  const exponent = (muLawByte >> 4) & 0x07;
  const mantissa = muLawByte & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign !== 0 ? -sample : sample;
}

// Buffer of µ-law bytes → Int16Array of PCM16 (for STT).
export function muLawToPcm16(mu: Buffer): Int16Array {
  const out = new Int16Array(mu.length);
  for (let i = 0; i < mu.length; i++) out[i] = decodeMuLawSample(mu[i]);
  return out;
}

// Int16Array PCM16 → Buffer of µ-law bytes (for sending TTS back to Twilio).
export function pcm16ToMuLaw(pcm: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = encodeMuLawSample(pcm[i]);
  return out;
}

// Raw little-endian PCM16 bytes → Int16Array.
export function pcm16BytesToSamples(buf: Buffer): Int16Array {
  const out = new Int16Array(Math.floor(buf.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

// Int16Array → raw little-endian PCM16 bytes (what Sarvam STT wants on the wire).
export function pcm16SamplesToBytes(pcm: Int16Array): Buffer {
  const buf = Buffer.allocUnsafe(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], i * 2);
  return buf;
}

// Nearest-neighbour resample of PCM16 from one rate to another. Crude but fine for 8 kHz telephony
// (a TTS that outputs 22050/24000 Hz must be brought down to Twilio's 8000 Hz before µ-law encoding).
export function resamplePcm16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = input[Math.floor(i * ratio)] ?? 0;
  return out;
}

// Twilio media frame = 20 ms = 160 µ-law bytes @ 8 kHz. Split a longer µ-law buffer into frames so
// audio can be streamed back paced (the WS handler ships one frame per 20 ms).
export const TWILIO_FRAME_BYTES = 160;
export function chunkMuLaw(mu: Buffer, frame = TWILIO_FRAME_BYTES): Buffer[] {
  const frames: Buffer[] = [];
  for (let i = 0; i < mu.length; i += frame) {
    let f = mu.subarray(i, i + frame);
    if (f.length < frame) f = Buffer.concat([f, Buffer.alloc(frame - f.length, 0xff)]); // 0xff = µ-law silence
    frames.push(f);
  }
  return frames;
}

// Convenience: arbitrary-rate PCM16 → Twilio-ready µ-law 8 kHz buffer.
export function pcm16ToTwilioMuLaw(pcm: Int16Array, fromRate: number): Buffer {
  return pcm16ToMuLaw(resamplePcm16(pcm, fromRate, 8000));
}
