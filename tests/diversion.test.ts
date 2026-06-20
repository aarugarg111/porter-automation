import { test, expect } from 'vitest';
import { isLate } from '../src/tracking/diversion.js';
test('flags when elapsed exceeds expected*threshold pre-arrival', () => {
  const started = new Date(Date.now()-60*60000).toISOString(); // 60 min ago
  expect(isLate({status:'PICKED_UP', started_at:started, expected_minutes:20}, Date.now())).toBe(true);
  expect(isLate({status:'DELIVERED', started_at:started, expected_minutes:20}, Date.now())).toBe(false);
});
