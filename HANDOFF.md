# HANDOFF — Porter Coordination Cockpit

_Single-file context to resume work in a fresh session without re-reading history._
_Last updated: 2026-06-21._

> **2026-06-21 flow-gaps pass (branch `feat/flow-gaps`):** four code-level gaps found while
> driving the flow end-to-end are now fixed + tested (backend 69, web 15). See §12.

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
- **Backend (API engine):** `npm install` · `npm test` (51 tests) · `npx tsx src/index.ts` (API on :3000). Set `PORTER_LIVE=1` to use the real WhatsApp/Bolna adapters instead of fakes (needs creds — see `.env.example`).
- **Dashboard (web):** `cd web` · `npm install` · `npm test` (15 tests) · `npm run dev` (Vite, proxies `/api`→:3000) · `npm run build`.

## 4. Build status
| Plan | What | Status |
|------|------|--------|
| 1 | Backend engine: delivery state machine, notification capture (`POST /capture`), 5-job hooks behind a `Messenger` interface (mock), tracking/diversion, payment ledger, REST API, dev simulator | ✅ Done — 24 tests |
| 2 | React dashboard (`web/`): split main (quick-book + active list), 1-tap booking, delivery detail timeline, payment ledger | ✅ Done — 15 tests, builds clean |
| 3 | WhatsApp bot (whatsapp-web.js) + AI calls (answer driver, call receiver, budget tracker) — real adapters behind the seams | ✅ Code-complete — 31 new tests (55 total then; **69 after the 2026-06-21 flow-gaps pass, §12**), tested against fakes. Inbound driver call (`/voice/inbound`) + outbound receiver call (`/voice/confirm-receiver`) both wired. Live wiring (phone QR + Bolna account) pending — see §11 |
| 4 | Android notification-listener app on the Porter phone → POSTs Porter notifications to `/capture` | ✅ Source scaffolded (`android/`, Kotlin) — posts `{text}` to `/capture`. NOT YET BUILT: needs Android Studio (no SDK on dev box). See `android/README.md` |
| 5 | Deploy backend (`Dockerfile`) + dashboard static build | 🟡 Scaffolded (`Dockerfile`, `.dockerignore`, `docs/DEPLOY.md`) — not executed; needs host choice + budget. |
| 6 | Wrap dashboard as Android APK (PWA or Capacitor) | ⬜ NOT STARTED — options written up in `docs/DEPLOY.md` |

## 5. Architecture / key seams
- **Stack:** Node 24 + TypeScript + Express + built-in **`node:sqlite`** (NOT better-sqlite3). Web: Vite + React 18 + TS, Vitest + testing-library.
- **`PorterClient` seam:** `mock`(dev) · **`notifBridge`(now — the `/capture` ingest path → `applyParsed`)** · `real`(when API lands). Swapping later = no rewrite.
- **`Messenger` interface** (`src/messenger/`): `sendDriverDirections`, `confirmReceiver`, `notifyReceiverPayment`. Implemented for real by **`WhatsAppMessenger`** (Plan 3) over a `WhatsAppClient` port (`WhatsAppWebClient` real / `FakeWhatsAppClient` test) — interface shape unchanged, so `src/deliveries/service.ts` does not change.
- **Telephony seam (Plan 3):** `TelephonyProvider` interface (`src/telephony/`) with `BolnaAdapter` (real, Exotel +91 number, global `fetch`) / `FakeTelephonyProvider` (test). `VoiceAgent` decides each inbound call turn from `LandmarkKB`. Provider-agnostic — swap Plivo/Twilio later.
- **`CoordinationService`** (`src/coordination/`): budget-aware orchestrator wiring WhatsApp + voice + `BudgetTracker`; warm-transfers to the spare phone when the landmark is unknown, confidence is low, or the ₹2k/mo budget nears its cap. Voice webhooks: `POST /voice/inbound`, `POST /voice/status` (`src/api/voice.ts`).
- **Code layout:** `src/db` (schema+seed) · `src/deliveries` (status machine + service) · `src/capture` (parsers + matcher) · `src/tracking` (diversion) · `src/messenger` (WhatsApp) · `src/telephony` (voice/Bolna) · `src/landmarks` (KB + matcher) · `src/budget` (spend tracker) · `src/coordination` (orchestrator) · `src/api` (read + capture + voice routers) · `src/sim`. Web: `web/src/components/*`, `web/src/api.ts`.
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
`src/capture/parsers.ts` regexes are **PROVISIONAL** (test table in `tests/parsers.test.ts`). Plan: during real/dummy Porter runs, `capture_inbox` stores raw notifications → tune the parsers from actual messages (no need for the user to pre-send samples). The order-id pattern (`PRTR…`) and driver-phone shape are the most likely to need tuning against real Porter notifications.

- **Amount parsing — FIXED (2026-06-21):** `parseFarePaise` now handles `Rs`/`Rs.`/`INR`/`₹`, comma grouping (`1,250`), and paise (`150.50`). (Was: `/Rs\.?\s*(\d+)/` → "Rs 1,250" became ₹1.)
- **Ordering — FIXED (2026-06-21):** the RECEIVER pre-notify is now order-independent. `maybeSettleReceiverPayment` only fires once the delivery is `DELIVERED` **and** the fare is known, so the receiver is never told "₹0" — whether Porter's "delivered" or "fare" notification lands first. Idempotent. (See §12.)

## 10. HOW TO RESUME (next step)
All code (Plans 1–4) is on `main` + green/scaffolded. The remaining work is **ops/tooling**, not code:
- **(a) Build + install the Android capture app** — open `android/` in Android Studio, build the APK, install on the Porter phone, set the backend URL, grant notification access, send the test ping. See `android/README.md`.
- **(b) Live-wire Plan 3** — §11 (WhatsApp QR + Bolna/Exotel account + assets).
- **(c) Deploy** — `docs/DEPLOY.md` (host the backend via `Dockerfile`, host the dashboard static build, then APK-wrap the dashboard via PWA/Capacitor).
- **(d) Tune parsers** — once real Porter notifications land in `capture_inbox`, tune `src/capture/parsers.ts` (see §9).

Key docs to read on resume: this file · `docs/superpowers/specs/2026-06-20-phase3-whatsapp-ai-calling-design.md` + its plan `docs/superpowers/plans/2026-06-20-phase3-whatsapp-ai-calling.md` · `docs/DEPLOY.md` · `android/README.md` · `docs/PROJECT-TLDR.md`. Plan 1/2 plans live in `docs/superpowers/plans/2026-06-20-cockpit-core.md` and `…-dashboard.md`. Internal SDD review notes are in `.superpowers/` (git-ignored).

## 11. Plan 3 live-wiring checklist (code done — these are USER/ops steps)
All Plan 3 code runs against **fakes** by default. To go live (`PORTER_LIVE=1`):
1. **WhatsApp:** install `whatsapp-web.js` (`npm i whatsapp-web.js` — pulls puppeteer/Chromium) on the host with the Porter phone reachable; first run prints a QR → scan it from WhatsApp on **9599157340** (`LocalAuth` persists the session). `WhatsAppWebClient` uses a lazy `import('whatsapp-web.js')`, so the package is only needed when live.
2. **Telephony (Bolna on Exotel +91 number):** create the account, build the Hindi voice agent, set `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `EXOTEL_FROM`. Point the Exotel number's inbound webhook at `POST /voice/inbound` and call-status at `POST /voice/status`. Verify `BolnaAdapter`'s request/response field names against Bolna's current API (the adapter is a best-effort scaffold).
3. **Assets:** drop `assets/shopfront.jpg` (shopfront photo) and `assets/directions-hi.ogg` (Hindi voice note) so the driver WhatsApp includes them (absent → text-only, no error).
4. **Budget:** tune `AI_CALL_PAISE_PER_MIN` to the real Bolna+Exotel rate; cap stays `AI_BUDGET_PAISE_PER_MONTH=200000` (₹2,000).
5. **Landmarks:** `src/landmarks/seed.ts` seeds 5 curated landmarks; add more as drivers name new ones (edit seed or insert into the `landmarks` table).

## 12. Flow-gaps pass (2026-06-21, branch `feat/flow-gaps`)
Drove the whole flow end-to-end in fake mode and closed four code-level gaps. All fixed + tested; no new paid accounts needed.

| Gap | Fix | Files | Tests |
|-----|-----|-------|-------|
| **A — receiver told "₹0"** when the fare notification arrives after "delivered" | `maybeSettleReceiverPayment` — pre-notify the receiver only once DELIVERED **and** fare known; idempotent + order-independent | `src/deliveries/service.ts` | `tests/service.test.ts` (new ordering test) |
| **B — amount parser dropped commas/paise**, no `₹`/`INR` | `parseFarePaise` handles `Rs`/`Rs.`/`INR`/`₹`, `1,250`, `150.50` | `src/capture/parsers.ts` | `tests/parsers.test.ts` |
| **C — Job 2 (catch delay) was dead** — `expected_minutes` never set, no proactive alert | set `expected_minutes` on intent (`DEFAULT_ETA_MINUTES`/`expectedMinutes`); `sweepLateDeliveries` WhatsApps the owner **once** when a delivery first goes late; `GET /alerts` for the dashboard | `src/deliveries/service.ts`, `src/tracking/monitor.ts`, `src/api/read.ts`, `src/index.ts` | `tests/monitor.test.ts` |
| **D — no inbound WhatsApp at all** — receiver replies + driver UPI/QR forwards were never read | `onMessage` seam on `WhatsAppClient` (live: `client.on('message')`, saves media to `assets/inbound` served at `/inbound-media`); `handleInboundWhatsApp` records receiver confirmation (`receiver_confirmed_at`) and UPI id/QR (`payment_upi_id`/`payment_qr_url`) + pings owner to pay. **Never auto-settles money.** `POST /whatsapp/inbound` | `src/capture/inbound.ts`, `src/api/inbound.ts`, `src/messenger/whatsapp_client.ts`, `src/index.ts` | `tests/inbound.test.ts` |

**Schema:** added `deliveries.late_alerted_at`, `deliveries.receiver_confirmed_at`, table `inbound_messages`. `getDb()` now runs an idempotent `migrate()` (ALTERs missing columns) — no formal migration system yet, but existing dev DBs upgrade in place.

**New env (see `.env.example`):** `DEFAULT_ETA_MINUTES`, `OWNER_ALERT_PHONE`, `LATE_SWEEP_MS`.

**Follow-ups since the initial pass (2026-06-21):**
- ✅ **Job 4 no-reply auto-call (DONE).** `sweepReceiverConfirmations` (`src/coordination/confirm_sweep.ts`) places ONE budget-gated AI call to the receiver when no WhatsApp confirmation lands within `CONFIRM_GRACE_MINUTES` (default 15) of `delivered_at`. Idempotent via `receiver_call_at`; over budget → nudges the owner to confirm manually. **Opt-in** via `AUTO_CONFIRM_CALL=1` (off by default — placing calls costs money). Schema: + `deliveries.delivered_at`, `deliveries.receiver_call_at`. Tests: `tests/confirm_sweep.test.ts`.
- ✅ **Dashboard surfaces the new data (DONE, PR #2).** Late-alert banner, `receiver_confirmed_at` badge, inbound UPI/QR feed all shown; colour-coded, mobile-first; hash routing.

**Still open (genuine gaps, need ops/product decisions):**
- **Budget is only recorded if `/voice/status` is called** (Bolna/Exotel webhook). Verify the webhook fires on call end, else the ₹2k cap never advances.
- The real `client.on('message')` handler is best-effort (untested, like the other live adapters) — verify against whatsapp-web.js once the phone is wired.
- The auto-call result (receiver said haan/na on the AI call) isn't fed back to `receiver_confirmed_at` yet — would need the Bolna call-outcome webhook.
