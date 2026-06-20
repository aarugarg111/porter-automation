import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export type DB = DatabaseSync;
export function getDb(path = 'cockpit.sqlite'): DB {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return db;
}
