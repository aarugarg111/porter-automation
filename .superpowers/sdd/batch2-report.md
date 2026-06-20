# Batch 2 Report — Tasks 8, 9, 10

## Status: DONE

---

## Per-Task Summary

### Task 8: Delivery service (intent + applyEvent + 5-job hooks)
**Status:** DONE

**Files created:**
- `src/deliveries/service.ts`
- `tests/service.test.ts`

**Implementation notes:**
- `createIntent` returns `Number(...)` wrapping `lastInsertRowid` as required by the correctness note (bigint guard).
- `applyParsed` handles RECEIPT (sets amount, returns early), status transitions (guarded by `canTransition`), ASSIGNED hook (sends driver directions), DELIVERED hook (confirms receiver + notifyReceiverPayment if RECEIVER payer, marks `payment_status='settled'`).
- Commit: `90437c9 feat: delivery service with 5-job hooks`

---

### Task 9: Capture matcher + endpoint
**Status:** DONE

**Files created:**
- `src/capture/matcher.ts`
- `src/api/capture.ts`
- `tests/capture.test.ts`
- Directory `src/api/` (created as it didn't exist)

**Implementation notes:**
- `matchDelivery` first tries to match by `porter_order_id`, then falls back to newest open (INTENT/ASSIGNED, no orderId) delivery.
- `captureRouter` exposes `POST /capture { text }`, logs to `capture_inbox`, parses, matches, and calls `applyParsed`.
- Commit: `4132867 feat: capture matcher + /capture endpoint`

---

### Task 10: Diversion check
**Status:** DONE

**Files created:**
- `src/tracking/diversion.ts`
- `tests/diversion.test.ts`
- Directory `src/tracking/` (created as it didn't exist)

**Implementation notes:**
- `isLate` returns false for terminal statuses (DELIVERED, REACHED_AREA, CANCELLED) and when data is missing.
- Uses `(nowMs - Date.parse(started_at)) / 60000 > expected_minutes * threshold` (default threshold 1.5).
- Commit: `835b5e8 feat: time-based diversion/late flag`

---

## Final `npm test` Output

```
> porter-automation@1.0.0 test
> vitest run


 RUN  v4.1.9 C:/Users/Aryan Garg/porter-automation


 Test Files  9 passed (9)
      Tests  12 passed (12)
   Start at  14:58:37
   Duration  730ms (transform 599ms, setup 0ms, import 1.09s, tests 93ms, environment 3ms)
```

---

## Git Log (`git log --oneline`)

```
835b5e8 feat: time-based diversion/late flag
4132867 feat: capture matcher + /capture endpoint
90437c9 feat: delivery service with 5-job hooks
7596c04 feat: messenger interface + logging mock
62d94e9 feat: locations repo + csv import
1080e0d feat: porter notification parsers (provisional regexes)
2c3dffb feat: delivery status state machine
71fa0e7 feat: seed HOME location + landmarks
b6b02f3 feat: sqlite schema for cockpit
a7f9060 chore: scaffold cockpit core project
```

---

## Concerns / Deviations

None. Implementation followed the plan verbatim. The `Number(...)` bigint guard was applied to `createIntent`'s `lastInsertRowid` return as instructed in the correctness note. The `src/api/` and `src/tracking/` directories were created as needed (they didn't exist yet). No extra features added (YAGNI).

---

## Fix pass

### What changed

1. **RECEIPT audit event** (`src/deliveries/service.ts`): Added `INSERT INTO events` with `status='RECEIPT'` immediately before the early `return` in the RECEIPT branch, so every receipt notification is audit-logged.

2. **payer=ME negative test** (`tests/service.test.ts`): New test `'payer=ME: delivered confirms receiver but does NOT notify payment or settle'` — creates a SEND intent with `payer:'ME'`, applies ASSIGNED + RECEIPT + DELIVERED, and asserts `payment_status` stays `'pending'`, `amount` is set, messenger has `'directions'` and `'confirm'` but NOT `'payment'`.

3. **isLate boundary test** (`tests/diversion.test.ts`): New test `'isLate boundary: exactly at threshold is NOT late, just over IS late'` — uses fixed `started_at='2026-01-01T10:00:00.000Z'`, `expected_minutes=20`, `threshold=1.5` (boundary = 30 min). Asserts `nowMs = startMs + 30*60000` → false; `nowMs = startMs + 30*60000 + 1000` → true.

### Covering test names

- `RECEIPT notification inserts an audit event row with status RECEIPT`
- `payer=ME: delivered confirms receiver but does NOT notify payment or settle`
- `isLate boundary: exactly at threshold is NOT late, just over IS late`

### Command and result

```
npm test
```

```
 Test Files  9 passed (9)
      Tests  15 passed (15)
   Start at  15:02:36
   Duration  810ms (transform 702ms, setup 0ms, import 1.24s, tests 107ms, environment 3ms)
```

### Commit hash

(see below — committed as `test+fix: receipt audit event, payer=ME negative test, isLate boundary`)
