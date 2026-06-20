import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { readRouter } from '../src/api/read.js';

test('POST /locations then GET /locations returns the created location', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;

  // POST a new location
  const postRes = await fetch(`http://localhost:${port}/locations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'TestShop', relationship: 'customer', phone: '9876543210' }),
  });
  expect(postRes.status).toBe(200);
  const { id } = await postRes.json();
  expect(typeof id).toBe('number');

  // GET all locations — should include the newly created one
  const getRes = await fetch(`http://localhost:${port}/locations`);
  expect(getRes.status).toBe(200);
  const list = await getRes.json();
  const found = list.find((l: any) => l.id === id);
  expect(found).toBeDefined();
  expect(found.nickname).toBe('TestShop');
  expect(found.relationship).toBe('customer');
  expect(found.phone).toBe('9876543210');

  server.close();
});

test('POST /locations rejects invalid body (missing nickname)', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;

  const postRes = await fetch(`http://localhost:${port}/locations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ relationship: 'customer' }),
  });
  expect(postRes.status).toBe(400);
  const body = await postRes.json();
  expect(body.error).toBeTruthy();

  server.close();
});

test('POST /locations rejects invalid relationship enum', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;

  const postRes = await fetch(`http://localhost:${port}/locations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'X', relationship: 'invalid' }),
  });
  expect(postRes.status).toBe(400);

  server.close();
});
