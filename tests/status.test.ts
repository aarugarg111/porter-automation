import { test, expect } from 'vitest';
import { canTransition } from '../src/deliveries/status.js';
test('valid forward transitions only', () => {
  expect(canTransition('INTENT','ASSIGNED')).toBe(true);
  expect(canTransition('ASSIGNED','DELIVERED')).toBe(true); // forward skips allowed
  expect(canTransition('DELIVERED','ASSIGNED')).toBe(false); // no backward
  expect(canTransition('INTENT','CANCELLED')).toBe(true);
});
