import { test, expect } from 'vitest';
import { parseNotification } from '../src/capture/parsers.js';
const cases: [string, any][] = [
  // ── Real Porter notifications (verified live 2026-06-21) ──
  // Assigned: "<Name> has been assigned for your order CRN…" — name only, no phone, CRN order id.
  ['Shrimanta Mandal has been assigned for your order CRN1657868951',
    { type:'ASSIGNED', orderId:'CRN1657868951', driverName:'Shrimanta Mandal' }],
  // Same, as the Android listener delivers it (title — body joined).
  ['Shrimanta Mandal has been assigned for your order CRN1657868951 — Shrimanta Mandal is on his way. Tap for details.',
    { type:'ASSIGNED', orderId:'CRN1657868951', driverName:'Shrimanta Mandal' }],
  // Cancelled (title + body forms).
  ['Your order CRN1657868951 has been cancelled.', { type:'CANCELLED', orderId:'CRN1657868951' }],
  ['CRN1657868951 got cancelled. Tap for more details.', { type:'CANCELLED', orderId:'CRN1657868951' }],
  // Single-word and multi-word ALL-CAPS driver names both work.
  ['Rahul has been assigned for your order CRN1522854534',
    { type:'ASSIGNED', orderId:'CRN1522854534', driverName:'Rahul' }],
  ['ABHIMANYU KUMAR SINHA has been assigned for your order CRN1713000111',
    { type:'ASSIGNED', orderId:'CRN1713000111', driverName:'ABHIMANYU KUMAR SINHA' }],
  // Trip started / now live → in-transit (title + body forms).
  ['Your order CRN1522854534 has started.', { type:'STARTED', orderId:'CRN1522854534' }],
  ['CRN1522854534 is now live. Tap for live updates.', { type:'STARTED', orderId:'CRN1522854534' }],
  // Driver fell through, Porter reassigning (no order id in Porter's text).
  ['Searching for a new driver — Finding a new driver to serve your order. We will update the driver and vehicle details for your order in next few minutes',
    { type:'SEARCHING' }],

  // ── Legacy/alt formats still supported ──
  ['Partner Ramesh (9876543210) assigned to your order PRTR12345',
    { type:'ASSIGNED', orderId:'PRTR12345', driverName:'Ramesh', driverPhone:'9876543210' }],
  ['Your order PRTR12345 has been delivered', { type:'DELIVERED', orderId:'PRTR12345' }],
  ['Trip fare for PRTR12345 is Rs 148', { type:'RECEIPT', orderId:'PRTR12345', amountPaise:14800 }],
  // comma grouping must not truncate to ₹1 (HANDOFF §9)
  ['Trip fare for PRTR99 is Rs 1,250', { type:'RECEIPT', orderId:'PRTR99', amountPaise:125000 }],
  // ₹ symbol + paise precision
  ['Fare ₹150.50 for PRTR42', { type:'RECEIPT', orderId:'PRTR42', amountPaise:15050 }],
  // INR prefix
  ['PRTR7 total INR 2,000', { type:'RECEIPT', orderId:'PRTR7', amountPaise:200000 }],
];
test.each(cases)('parses %s', (text, expected) => {
  expect(parseNotification(text)).toMatchObject(expected);
});
// The real "assigned" notification has no phone — must not invent one.
test('real assigned carries no driver phone', () => {
  const p = parseNotification('Shrimanta Mandal has been assigned for your order CRN1657868951');
  expect(p?.driverPhone).toBeUndefined();
});
// A cancellation must never be misread as a forward status.
test('cancelled beats other matchers', () => {
  expect(parseNotification('Your order CRN1 has been cancelled.')?.type).toBe('CANCELLED');
});
test('unknown returns null', () => expect(parseNotification('hello')).toBeNull());
