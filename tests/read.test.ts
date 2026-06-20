import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { readRouter } from '../src/api/read.js';
test('intent then list returns the delivery', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'S',relationship:'customer'}) as number;
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;
  await fetch(`http://localhost:${port}/intent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'SEND',otherLocationId:r})});
  const list = await (await fetch(`http://localhost:${port}/deliveries`)).json();
  expect(list.length).toBe(1); server.close();
});
