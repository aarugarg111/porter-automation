import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
test('schema has core tables', () => {
  const db = getDb(':memory:');
  const names = db.prepare("select name from sqlite_master where type='table'").all().map((r:any)=>r.name);
  for (const t of ['locations','deliveries','events','capture_inbox']) expect(names).toContain(t);
});
test('deliveries table has payment_method column', () => {
  const db = getDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(deliveries)").all().map((r:any)=>r.name);
  expect(cols).toContain('payment_method');
});
