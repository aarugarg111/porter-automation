// src/config/load-env.ts
// Load a local .env into process.env BEFORE anything reads it. Dependency-free (Node's built-in
// process.loadEnvFile, Node 20.12+/21.7+). Imported first in src/index.ts so it runs ahead of any
// module that reads process.env. No-op when .env is absent (dev/tests/CI), and inline/shell env
// always wins — loadEnvFile fills gaps, it does not overwrite already-set variables.
import { existsSync } from 'node:fs';

const path = process.env.ENV_FILE || '.env';
if (existsSync(path) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path);
  } catch (e) {
    console.error(`[env] failed to load ${path}:`, (e as Error).message);
  }
}
