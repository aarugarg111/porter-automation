import { test, expect } from 'vitest';
import { MockMessenger } from '../src/messenger/mock.js';
test('mock records sends', async () => {
  const m = new MockMessenger();
  await m.notifyReceiverPayment('999', 14800);
  expect(m.sent[0]).toMatchObject({ kind:'payment', phone:'999' });
});
