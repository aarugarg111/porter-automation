# SDD Progress — Cockpit Core (plan 2026-06-20-cockpit-core.md)

Branch: feat/cockpit-core

## Completed
- Batch 1 (Tasks 1-7): complete (commits a7f9060..7596c04, review clean — SPEC ✅, QUALITY approved, Minors only).
  - 6 test files, 9 tests passing. Verified independently.

## Carried-forward Minor findings (for final review / later fix)
- `src/locations/repo.ts` importCsv: naive `split(',')` misparses quoted fields with commas
  (real shop addresses have commas). FIX when the CSV import endpoint is built.
- `src/capture/parsers.ts`: regexes are PROVISIONAL — replace using the owner's 4 real Porter
  notification samples (update the test table in tests/parsers.test.ts).
- node:sqlite `lastInsertRowid` is number|bigint → guard with Number() wherever cast `as number`.

## Environment notes (durable)
- Node 24.17 at /c/Program Files/nodejs; node/npm/npx shims in /c/Users/Aryan Garg/bin (on bash PATH).
- npm `script-shell` set to git bash globally (so npm scripts find node, not cmd.exe).

## Remaining
- Batch 2 (Tasks 8-10): delivery service + capture matcher/endpoint + diversion.
- Batch 3 (Tasks 11-12): read API + app wiring + e2e.
- Final whole-branch review.
