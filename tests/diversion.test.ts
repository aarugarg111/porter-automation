import { test, expect } from 'vitest';
import { isLate } from '../src/tracking/diversion.js';
test('flags when elapsed exceeds expected*threshold pre-arrival', () => {
  const started = new Date(Date.now()-60*60000).toISOString(); // 60 min ago
  expect(isLate({status:'PICKED_UP', started_at:started, expected_minutes:20}, Date.now())).toBe(true);
  expect(isLate({status:'DELIVERED', started_at:started, expected_minutes:20}, Date.now())).toBe(false);
});

test('isLate boundary: exactly at threshold is NOT late, just over IS late', () => {
  const startedAt = '2026-01-01T10:00:00.000Z';
  const startMs = Date.parse(startedAt);
  const expected_minutes = 20;
  const threshold = 1.5;
  // exactly 30 min elapsed => NOT late (strict >)
  const atBoundary = startMs + 30 * 60000;
  expect(isLate({ status: 'PICKED_UP', started_at: startedAt, expected_minutes }, atBoundary, threshold)).toBe(false);
  // 30 min + 1 second elapsed => IS late
  const justOver = startMs + 30 * 60000 + 1000;
  expect(isLate({ status: 'PICKED_UP', started_at: startedAt, expected_minutes }, justOver, threshold)).toBe(true);
});
