import { test, expect } from 'vitest';
import { parseNotification } from '../src/capture/parsers.js';
const cases: [string, any][] = [
  ['Partner Ramesh (9876543210) assigned to your order PRTR12345',
    { type:'ASSIGNED', orderId:'PRTR12345', driverName:'Ramesh', driverPhone:'9876543210' }],
  ['Your order PRTR12345 has been delivered', { type:'DELIVERED', orderId:'PRTR12345' }],
  ['Trip fare for PRTR12345 is Rs 148', { type:'RECEIPT', orderId:'PRTR12345', amountPaise:14800 }],
];
test.each(cases)('parses %s', (text, expected) => {
  expect(parseNotification(text)).toMatchObject(expected);
});
test('unknown returns null', () => expect(parseNotification('hello')).toBeNull());
