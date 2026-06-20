import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { captureRouter } from '../src/api/capture.js';
import { readRouter } from '../src/api/read.js';
test('intent + notification sequence drives delivery to DELIVERED', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'S',relationship:'customer',phone:'999',default_payer:'RECEIVER'}) as number;
  const app = express(); app.use(express.json());
  app.use(readRouter(db)); app.use(captureRouter(db, new MockMessenger()));
  const server = app.listen(0); const port=(server.address() as any).port; const base=`http://localhost:${port}`;
  const { id } = await (await fetch(`${base}/intent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'SEND',otherLocationId:r,payer:'RECEIVER'})})).json();
  for (const text of [
    'Partner Ramesh (9876543210) assigned to your order PRTR777',
    'Trip fare for PRTR777 is Rs 148',
    'Your order PRTR777 has been delivered'])
    await fetch(`${base}/capture`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});
  const d:any = await (await fetch(`${base}/deliveries/${id}`)).json();
  expect(d.status).toBe('DELIVERED'); expect(d.amount).toBe(14800); expect(d.payment_status).toBe('settled');
  server.close();
});
