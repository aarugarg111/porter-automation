# Porter Coordination Cockpit

Automates the **post-booking coordination** for a shop running 20–30 [Porter](https://porter.in)
deliveries/day — both sending to customers and receiving from suppliers. Booking stays manual in the
Porter app; this system handles everything painful after it.

> Built to work **without Porter's API** (which is currently unavailable) by ingesting the Porter
> app's notifications. A `PorterClient` seam lets the real API drop in later with no rewrite.

## The 5 coordination jobs
1. **Get the agent to the pickup** — WhatsApp location pin + shopfront photo + voice note (AI call backup).
2. **Track + catch route diversion/delay** — status milestones + expected-vs-actual time flag.
3. **Confirm reached** — auto-detected from Porter notifications.
4. **Confirm with the destination owner** — auto WhatsApp/AI call to the receiver.
5. **Payment coordination** — per-delivery payer tag + auto pre-notify + settlement ledger.

## Architecture
- **Backend (this repo, Plan 1 — done):** Node + TypeScript + Express + Node's built-in `node:sqlite`.
  A delivery state machine driven by captured notifications, the 5-job engine behind a `Messenger`
  interface, a dev simulator, and a REST API. Fully unit + e2e tested (17 tests).
- **Messaging (Plan 3):** `whatsapp-web.js` bot on a dedicated phone (driver/receiver comms; no SMS).
- **AI call backup (Plan 3):** Hindi landmark-based directions, budget-capped.
- **Dashboard (Plan 2):** React web app, installable as an Android APK.
- **Capture app (Plan 4):** Android notification-listener that forwards Porter notifications.

## Status
Plan 1 (core engine) is implemented and green. See `docs/` for the design spec, the implementation
plan, and the phase docs.

## Develop
```bash
npm install
npm test          # vitest — 17 tests
npx tsx src/index.ts   # boots the API on :3000
```
Requires Node 24+ (uses the built-in `node:sqlite`).

## Layout
- `src/db` schema + seed · `src/deliveries` status machine + service · `src/capture` notification
  parsers + matcher · `src/tracking` diversion · `src/messenger` interface + mock · `src/api`
  REST routes · `src/sim` dev simulator.
- `docs/` design spec, plans, and phase docs.
