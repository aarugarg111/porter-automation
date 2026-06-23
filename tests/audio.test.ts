import { test, expect } from 'vitest';
import {
  encodeMuLawSample, decodeMuLawSample, muLawToPcm16, pcm16ToMuLaw,
  resamplePcm16, chunkMuLaw, TWILIO_FRAME_BYTES,
} from '../src/telephony/audio.js';

// µ-law is lossy (8-bit), so a round-trip won't be exact — but it must stay close, and never blow up.
test('µ-law round-trip stays within quantisation error', () => {
  let worstRel = 0;
  for (let s = -32000; s <= 32000; s += 137) {
    const back = decodeMuLawSample(encodeMuLawSample(s));
    const err = Math.abs(back - s);
    const rel = err / (Math.abs(s) + 256); // µ-law step grows with amplitude
    worstRel = Math.max(worstRel, rel);
  }
  expect(worstRel).toBeLessThan(0.12);
});

test('µ-law silence and polarity are sane', () => {
  expect(decodeMuLawSample(encodeMuLawSample(0))).toBeLessThan(256);   // ~silence
  expect(decodeMuLawSample(encodeMuLawSample(20000))).toBeGreaterThan(0);
  expect(decodeMuLawSample(encodeMuLawSample(-20000))).toBeLessThan(0);
  expect(encodeMuLawSample(0)).toBeGreaterThanOrEqual(0);
  expect(encodeMuLawSample(0)).toBeLessThanOrEqual(255);
});

test('buffer helpers round-trip length-for-length', () => {
  const pcm = Int16Array.from([0, 1000, -1000, 16000, -16000, 32000]);
  const mu = pcm16ToMuLaw(pcm);
  expect(mu.length).toBe(pcm.length);
  expect(muLawToPcm16(mu).length).toBe(pcm.length);
});

test('resample halves the sample count from 16k → 8k', () => {
  const src = new Int16Array(320); // 20 ms @ 16 kHz
  for (let i = 0; i < src.length; i++) src[i] = i;
  const out = resamplePcm16(src, 16000, 8000);
  expect(out.length).toBe(160); // 20 ms @ 8 kHz
});

test('chunkMuLaw pads the final frame to a full 160-byte Twilio frame', () => {
  const frames = chunkMuLaw(Buffer.alloc(400, 0x55)); // 2.5 frames
  expect(frames).toHaveLength(3);
  expect(frames.every((f) => f.length === TWILIO_FRAME_BYTES)).toBe(true);
  expect(frames[2][TWILIO_FRAME_BYTES - 1]).toBe(0xff); // padded with µ-law silence
});
