import { test, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The loader fills missing vars from the file but must NOT clobber vars already set inline/in the
// shell (so `OWNER_ALERT_PHONE=x npm start` always wins). Both behaviours in one import.
test('load-env fills gaps from .env but keeps inline env', async () => {
  vi.resetModules();
  const file = join(tmpdir(), `porter-loadenv-${process.pid}.env`);
  writeFileSync(file, 'LOADENV_EXISTING=from_file\nLOADENV_NEW=from_file\n');
  process.env.ENV_FILE = file;
  process.env.LOADENV_EXISTING = 'from_shell';
  delete process.env.LOADENV_NEW;

  await import('../src/config/load-env.js');

  expect(process.env.LOADENV_EXISTING).toBe('from_shell'); // inline wins
  expect(process.env.LOADENV_NEW).toBe('from_file');       // gap filled
});

test('load-env is a no-op when the file is absent', async () => {
  vi.resetModules();
  process.env.ENV_FILE = join(tmpdir(), 'porter-loadenv-does-not-exist.env');
  // Importing must not throw even though the file is missing.
  await expect(import('../src/config/load-env.js')).resolves.toBeDefined();
});
