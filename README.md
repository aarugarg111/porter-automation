# Porter Coordination Cockpit

> **👋 Picking this up? (maintained by [@sarthakgoel31](https://github.com/sarthakgoel31))**
> **Open [`START-HERE.md`](START-HERE.md) first** — it's the guided reading order (which files to
> read and in what order), current state, and what to work on next. Then [`HANDOFF.md`](HANDOFF.md)
> for the deep context. Everything runs locally in fake mode (no phone/accounts) — see
> [Run the whole thing locally](#run-the-whole-thing-locally-no-phone-no-paid-accounts) below.

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
Plans 1–4 implemented and green. Plan 3 (WhatsApp + AI calls) is tested against fakes; live wiring
needs the Porter phone QR scan + a Bolna/Exotel account (`HANDOFF.md` §11). Plan 4 (Android capture
app, `android/`) is scaffolded — build it in Android Studio. See `HANDOFF.md` for the single-file
resume context and `docs/` for design specs, plans, and `docs/DEPLOY.md` for hosting.

## Run the whole thing locally (no phone, no paid accounts)

Everything runs in **dev/fake mode** (`PORTER_LIVE=0`, the default). The WhatsApp and AI-call
adapters are replaced by logging adapters that **print exactly what would be sent** to the server
console — so you can watch the full coordination flow without a phone or a Bolna account.

```bash
# terminal 1 — backend API on :3000 (dev/fake mode)
npm install
npx tsx src/index.ts

# terminal 2 — dashboard on :5173, proxies /api → :3000
cd web && npm install && npm run dev
```

Open the dashboard, tap a shop to book, then **simulate Porter notifications** to drive a delivery
through its lifecycle (the real data source — the Android app — does exactly this POST):

```bash
B=http://localhost:3000
# 1. add a customer shop
LID=$(curl -s -X POST $B/locations -H 'content-type: application/json' \
  -d '{"nickname":"Sharma Auto Parts","relationship":"customer","phone":"9810012345"}' | sed 's/[^0-9]//g')
# 2. one-tap booking (SEND, receiver pays)
curl -s -X POST $B/intent -H 'content-type: application/json' \
  -d "{\"direction\":\"SEND\",\"otherLocationId\":$LID,\"payer\":\"RECEIVER\"}"
# 3. simulate the Porter app notifications
for T in "Partner Ramesh (9876501234) assigned for order PRTR12345" \
         "Order PRTR12345 picked up" "Driver reached drop location for PRTR12345" \
         "Order PRTR12345 delivered" "PRTR12345 fare Rs 150"; do
  curl -s -X POST $B/capture -H 'content-type: application/json' -d "{\"text\":\"$T\"}"; echo
done
# 4. driver calls in for directions (Hindi landmark match)
curl -s -X POST $B/voice/inbound -H 'content-type: application/json' \
  -d '{"driverPhone":"9876501234","spoken":"canara bank ke paas hoon"}'; echo
# 5. payment ledger
curl -s $B/ledger; echo
```

Watch terminal 1: you'll see the WhatsApp pin/photo/voice-note and the AI-call script that *would*
be sent. The dashboard (terminal 2) shows the live delivery + timeline + ledger. When the Porter
phone + Bolna account are ready, set `PORTER_LIVE=1` to swap the logging adapters for the real ones.

## Live WhatsApp test (Stage 1 — free, needs the Porter phone)

Proves the real WhatsApp send against the Porter number (9599157340) without any paid accounts:

```bash
npm i whatsapp-web.js qrcode-terminal   # one-time (heavy — pulls puppeteer)
# If puppeteer's bundled Chromium fails to download, point at an installed browser:
export PUPPETEER_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
npm run wa:login                        # prints a QR in the terminal
#   → on the Porter phone: WhatsApp → Linked Devices → scan it
npm run wa:login -- 91XXXXXXXXXX        # log in + send a test WhatsApp to that number
```

`wa:login` saves the session under `.wwebjs_auth/` (gitignored) using the same id the server uses,
so afterwards `PORTER_LIVE=1 npx tsx src/index.ts` reuses the login with no re-scan.
`PUPPETEER_EXECUTABLE_PATH` (optional) makes both `wa:login` and the live server use a system
Chrome/Edge instead of puppeteer's download. See `HANDOFF.md` §11 for the rest of go-live
(Bolna/Exotel AI calls, assets) and the staged test ladder.

## Develop

**Backend (API engine):**
```bash
npm install
npm test               # vitest — 55 tests
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
  orchestrator · `src/api` REST + voice routes · `src/dev` logging adapters (fake-mode visibility) ·
  `src/sim` dev simulator.
- `web/` React dashboard · `android/` notification-capture app (Plan 4) · `docs/` specs, plans, deploy.
- `docs/` design spec, plans, and phase docs.
