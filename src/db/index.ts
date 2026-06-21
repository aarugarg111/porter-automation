import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export type DB = DatabaseSync;
export function getDb(path = 'cockpit.sqlite'): DB {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  migrate(db);
  return db;
}

// Idempotent column adds for DBs created before these columns existed (no formal migration
// system yet — `CREATE TABLE IF NOT EXISTS` won't ALTER an existing table).
function migrate(db: DB) {
  const have = new Set((db.prepare('pragma table_info(deliveries)').all() as any[]).map(c => c.name));
  for (const [col, type] of [['late_alerted_at','TEXT'], ['receiver_confirmed_at','TEXT']] as const) {
    if (!have.has(col)) db.exec(`ALTER TABLE deliveries ADD COLUMN ${col} ${type}`);
  }
}
