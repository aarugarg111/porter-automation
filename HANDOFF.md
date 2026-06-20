# HANDOFF — Porter Coordination Cockpit

_Single-file context to resume work in a fresh session without re-reading history._
_Last updated: 2026-06-20._

## 1. What this is (1 paragraph)
A system that automates the **post-booking coordination** for a shop (Aryan Enterprises, Badarpur,
Delhi) running **20–30 Porter deliveries/day**, both SENDING to customers and RECEIVING from
suppliers. Booking stays **manual** in the Porter app (~30s). Porter's official API is **stalled
indefinitely**, so the system works **without it** by reading the **Porter app's notifications** on
a dedicated phone. A `PorterClient` seam lets the real API drop in later with no rewrite.

## 2. The product = 5 coordination jobs
1. **Get the agent to the shop** — auto-WhatsApp location pin + shopfront photo + Hindi voice note, AND **the AI answers the driver's incoming call** and guides him in Hindi.
2. **Track + catch diversion/delay** — notification milestones + expected-vs-actual time flag.
3. **Confirm reached** — from Porter notifications.
4. **Confirm with the receiving shop owner** — WhatsApp **AND an AI phone call** ("parcel aa gaya?").
5. **Payment coordination** — `payer = ME | RECEIVER`; when ME, `method` = CARD/WALLET (auto), CASH (pay agent at pickup), or UPI (agent sends QR/UPI-id to WhatsApp 9599157340 → dashboard → you pay). Settlement ledger. No payment gateway.

## 3. Repo / how to run
- **GitHub (public):** https://github.com/aarugarg111/porter-automation — owner `aarugarg111`, collaborator `sarthakgoel31` (admin; invite pending acceptance). Branch: `main`.
- **Local:** `C:\Users\Aryan Garg\porter-automation`
- **Backend (API engine):** `npm install` · `npm test` (24 tests) · `npx tsx src/index.ts` (API on :3000).
- **Dashboard (web):** `cd web` · `npm install` · `npm test` (15 tests) · `npm run dev` (Vite, proxies `/api`→:3000) · `npm run build`.

## 4. Build status
| Plan | What | Status |
|------|------|--------|
| 1 | Backend engine: delivery state machine, notification capture (`POST /capture`), 5-job hooks behind a `Messenger` interface (mock), tracking/diversion, payment ledger, REST API, dev simulator | ✅ Done — 24 tests |
| 2 | React dashboard (`web/`): split main (quick-book + active list), 1-tap booking, delivery detail timeline, payment ledger | ✅ Done — 15 tests, builds clean |
| 3 | WhatsApp bot (whatsapp-web.js) + AI calls (answer driver, call receiver) + UPI-QR forwarding — wire the real `Messenger` impl | ⬜ NOT STARTED (next) |
| 4 | Android notification-listener app on the Porter phone → POSTs Porter notifications to `/capture` | ⬜ NOT STARTED |
| — | Deploy backend + dashboard; wrap dashboard as Android APK (PWA/Capacitor) | ⬜ NOT STARTED |

## 5. Architecture / key seams
- **Stack:** Node 24 + TypeScript + Express + built-in **`node:sqlite`** (NOT better-sqlite3). Web: Vite + React 18 + TS, Vitest + testing-library.
- **`PorterClient` seam:** `mock`(dev) · **`notifBridge`(now — the `/capture` ingest path → `applyParsed`)** · `real`(when API lands). Swapping later = no rewrite.
- **`Messenger` interface** (`src/messenger/`): `sendDriverDirections`, `confirmReceiver`, `notifyReceiverPayment`. Mock now; Plan 3 implements the real whatsapp-web.js + AI-call version behind the same interface — `src/deliveries/service.ts` does not change.
- **Code layout:** `src/db` (schema+seed) · `src/deliveries` (status machine + service) · `src/capture` (parsers + matcher) · `src/tracking` (diversion) · `src/messenger` · `src/api` (read + capture routers) · `src/sim`. Web: `web/src/components/*`, `web/src/api.ts`.
- **Data model highlights:** `deliveries(direction, status, payer, payment_method, payment_qr_url, payment_upi_id, payment_status, started_at, reached_at, amount[paise], …)`, `events(event_type 'status'|'receipt', status, …)`, `locations(is_home, default_payer, default_direction, relationship, landmark_notes, …)`, `capture_inbox(raw_text)`.
- Status flow: `INTENT → ASSIGNED → REACHED_PICKUP → PICKED_UP → REACHED_AREA → DELIVERED` (+CANCELLED). Money in **integer paise**. Times UTC ISO-8601.

## 6. Hard constraints / decisions (do not relitigate)
- **No Porter API** (build around it via notification capture). **No SMS anywhere** — comms via WhatsApp + AI call.
- **Booking is manual**; the engine only ingests + coordinates, never books.
- **WhatsApp = whatsapp-web.js** (unofficial) running ONLY on the dedicated Porter number **9599157340** (ban-contained); reference repo github.com/sarthakgoel31/whatsapp-bot-starter, but build on whatsapp-web.js directly.
- **AI calling budget ≤ ₹2,000/month**: keep calls short (~1.5 min), lean on free WhatsApp pin/voice-note, escalate hard calls to the spare phone. (See `docs/phase2-ai-call-budget.md`.) "Supernova"/free-calling unverified — default to free WhatsApp + cheap/short AI calls.
- **Shop (HOME):** Aryan Enterprises, 446 Bankey Lal Market, opp Red Light, Badarpur, New Delhi 110044. **Lat 28.5000777, Lng 77.3018299.** Phone 9910774205.
- **Landmarks for AI directions:** opposite **Metro Pillar 25**, ~5 shops from **Canara Bank** towards Faridabad, **nariyal (coconut) wala** directly opposite, beside **Kishwarna Charitable Eye Hospital**, **Bosch + Havells** board. (See `docs/shop-landmark-directions-template.csv`.)

## 7. Environment gotchas (Windows — already fixed, don't redo)
- Node 24.17 at `C:\Program Files\nodejs`. The Bash tool runs non-login shells that DON'T see the system PATH → **node/npm/npx shims live in `/c/Users/Aryan Garg/bin`** (on bash PATH). gh shim there too.
- **npm `script-shell` is set to git bash** globally so npm scripts find node (cmd.exe can't). If `npm test`/`vitest` errors with `'"node"' is not recognized`, that config got lost — reset: `npm config set script-shell "C:/Program Files/Git/bin/bash.exe"`.
- Root `vitest.config.ts` excludes `web/**` (web has its own jsdom vitest).
- `gh` CLI v2.95 installed; authenticated as `aarugarg111`.

## 8. Pending USER actions
- Sarthak: accept GitHub invite. · Approve hosting (~₹500–1k/mo). · Set Porter wallet/card as default payment + fund it. · During dummy runs, let the parser see real Porter notifications. · Hand over Porter API key whenever it's enabled.

## 9. Notification parser note
`src/capture/parsers.ts` regexes are **PROVISIONAL** (test table in `tests/parsers.test.ts`). Plan: during real/dummy Porter runs, `capture_inbox` stores raw notifications → tune the parsers from actual messages (no need for the user to pre-send samples). The amount regex currently drops paise/comma-grouping — fix when tuning.

## 10. HOW TO RESUME (next step)
**Next task = Plan 3 (WhatsApp bot + AI calls).** To resume:
1. Read this file + `docs/superpowers/specs/2026-06-19-porter-phase1-dashboard-design.md` (jobs/payment detail) + `docs/phase2-inbound-driver-directions.md` + `docs/phase2-ai-call-budget.md`.
2. Use Superpowers `writing-plans` → write `docs/superpowers/plans/2026-06-2x-whatsapp-ai.md`, then `subagent-driven-development` to build it.
3. Implement the real `Messenger` (whatsapp-web.js on 9599157340: send pin+photo+voice-note, send receiver confirm, forward UPI QR), the **inbound AI call** answerer (driver directions via landmark sheet), the **outbound AI call** to the receiver, and the call→`events(event_type='call')` + payment hooks. Keep within the ₹2k budget design.
4. Other key docs: `docs/PROJECT-TLDR.md` (overview), `docs/superpowers/plans/2026-06-20-cockpit-core.md` (Plan 1), `docs/superpowers/plans/2026-06-20-dashboard.md` (Plan 2). Internal SDD review notes are in `.superpowers/` (git-ignored).
