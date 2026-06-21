import { test, expect } from 'vitest';
import { parseNotification } from '../src/capture/parsers.js';
const cases: [string, any][] = [
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
test('unknown returns null', () => expect(parseNotification('hello')).toBeNull());
