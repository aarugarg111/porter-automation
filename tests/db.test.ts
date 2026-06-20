import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
test('schema has core tables', () => {
  const db = getDb(':memory:');
  const names = db.prepare("select name from sqlite_master where type='table'").all().map((r:any)=>r.name);
  for (const t of ['locations','deliveries','events','capture_inbox']) expect(names).toContain(t);
});
