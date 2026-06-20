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
  interface, a dev simulator, and a REST API. Fully unit + e2e tested.
- **Messaging (Plan 3 — done):** `WhatsAppMessenger` over a `whatsapp-web.js` bot on a dedicated phone
  (driver/receiver comms; no SMS), behind a `WhatsAppClient` port (real/fake).
- **AI calls (Plan 3 — done):** provider-agnostic `TelephonyProvider` (`BolnaAdapter`) + `VoiceAgent`
  giving Hindi landmark-based directions, a `BudgetTracker` capping spend at ₹2,000/month, and a
  `CoordinationService` that warm-transfers hard/over-budget calls to the spare phone.
- **Dashboard (Plan 2):** React web app, installable as an Android APK.
- **Capture app (Plan 4):** Android notification-listener that forwards Porter notifications.

## Status
Plans 1–3 implemented and green (Plan 3 tested against fakes; live wiring needs the Porter phone QR
scan + a Bolna/Exotel account — see `HANDOFF.md` §11). Set `PORTER_LIVE=1` to use the real adapters.
See `docs/` for the design specs, implementation plans, and phase docs.

## Develop

**Backend (API engine):**
```bash
npm install
npm test               # vitest — 51 tests
npx tsx src/index.ts   # boots the API on :3000 (PORTER_LIVE=1 for real adapters)
```
Requires Node 24+ (uses the built-in `node:sqlite`).

**Dashboard (web UI) — in `web/`:**
```bash
cd web
npm install
npm test               # vitest + testing-library — 15 tests
npm run dev            # Vite dev server (proxies /api → backend :3000)
npm run build          # production build → web/dist
```
Run the backend and `web` dev server together; the dashboard talks to the API via the `/api` proxy.

## Layout
- `src/db` schema + seed · `src/deliveries` status machine + service · `src/capture` notification
  parsers + matcher · `src/tracking` diversion · `src/messenger` WhatsApp adapter · `src/telephony`
  voice/Bolna · `src/landmarks` KB + matcher · `src/budget` spend tracker · `src/coordination`
  orchestrator · `src/api` REST + voice routes · `src/sim` dev simulator.
- `docs/` design spec, plans, and phase docs.
