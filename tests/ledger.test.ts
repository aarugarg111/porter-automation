import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { readRouter } from '../src/api/read.js';

test('GET /ledger returns rows and totals with pending amount', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'L',relationship:'customer'}) as number;
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;
  // create an intent (payment_status defaults to 'pending')
  await fetch(`http://localhost:${port}/intent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'SEND',otherLocationId:r})});
  const data:any = await (await fetch(`http://localhost:${port}/ledger`)).json();
  expect(data).toHaveProperty('rows');
  expect(data).toHaveProperty('totals');
  expect(Array.isArray(data.rows)).toBe(true);
  expect(data.rows.length).toBeGreaterThan(0);
  expect(data.totals).toHaveProperty('count');
  expect(data.totals).toHaveProperty('pending');
  expect(data.totals).toHaveProperty('settled');
  expect(typeof data.totals.pending).toBe('number');
  server.close();
});
