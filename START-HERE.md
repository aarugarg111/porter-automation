# START HERE — onboarding for @sarthakgoel31

This is the one file to open first. It tells you **what this is**, **what's done**, **what's left**,
and **exactly which files to read, in order**. Repo: https://github.com/aarugarg111/porter-automation

---

## 1. What this project is (30 seconds)
Automates the **post-booking coordination** for a shop (Aryan Enterprises, Badarpur) running 20–30
[Porter](https://porter.in) deliveries/day. Booking stays manual in the Porter app; this system does
everything painful after it — get the driver to the shop, track, confirm with the receiver, and
coordinate payment. It works **without Porter's API** (stalled) by reading the Porter app's
**notifications**, and reaches drivers/receivers via **WhatsApp + AI phone call (no SMS)**.

## 2. Current state (as of this handoff)
- **Plans 1–2 (backend engine + React dashboard):** ✅ done.
- **Plan 3 (WhatsApp bot + AI calls + budget):** ✅ code-complete, tested against fakes. Live WhatsApp
  login is **proven working** (`npm run wa:login`). Pending: a Bolna/Exotel account for AI calls.
- **Plan 4 (Android notification-capture app):** ✅ source scaffolded in `android/`, needs an Android
  Studio build.
- **Plans 5–6 (hosting + dashboard APK):** 🟡 scaffolded (`Dockerfile`, `docs/DEPLOY.md`), not executed.
- **Flow-gaps pass (2026-06-21, branch `feat/flow-gaps`):** ✅ fixed four code-level gaps found by
  driving the flow end-to-end — the "₹0" receiver-payment ordering bug, the amount parser (commas/`₹`/
  `INR`), Job 2 delay-detection now actually fires (`/alerts` + owner WhatsApp), and inbound WhatsApp
  capture (receiver confirmations + driver UPI/QR forwards → `POST /whatsapp/inbound`). See `HANDOFF.md` §12.
- **Tests:** backend 69 + web 15, all green. Everything runs locally in **fake mode** (no phone, no
  paid accounts) — see README.

## 3. Read the repo in THIS order
| # | File | Why read it |
|---|------|-------------|
| 1 | [`README.md`](README.md) | Overview + **"Run the whole thing locally"** (2-min local setup, copy-paste smoke test) + the live-WhatsApp test. |
| 2 | [`HANDOFF.md`](HANDOFF.md) | The deep single-file context: build-status table, architecture/seams, constraints, **§10 resume steps**, **§11 go-live checklist**. |
| 3 | [`docs/PROJECT-TLDR.md`](docs/PROJECT-TLDR.md) | One-page product summary (the 5 jobs, who does what). |
| 4 | [`docs/superpowers/specs/2026-06-20-phase3-whatsapp-ai-calling-design.md`](docs/superpowers/specs/2026-06-20-phase3-whatsapp-ai-calling-design.md) | The Plan 3 design (WhatsApp + telephony seams, budget). |
| 5 | [`docs/superpowers/plans/2026-06-20-phase3-whatsapp-ai-calling.md`](docs/superpowers/plans/2026-06-20-phase3-whatsapp-ai-calling.md) | The Plan 3 task-by-task implementation plan (how the code was built). |
| 6 | [`docs/DEPLOY.md`](docs/DEPLOY.md) | Hosting (Plan 5) + dashboard-APK (Plan 6) routes and decisions. |
| 7 | [`android/README.md`](android/README.md) | Build + install the notification-capture app (Plan 4). |

## 4. Where the code lives (so you can navigate)
| Area | Path |
|------|------|
| Backend entry / wiring | [`src/index.ts`](src/index.ts) |
| DB schema + seeds | [`src/db/`](src/db/) |
| Delivery state machine + service | [`src/deliveries/`](src/deliveries/) |
| Notification capture (parsers, matcher) | [`src/capture/`](src/capture/) · API: [`src/api/capture.ts`](src/api/capture.ts) |
| WhatsApp adapter (real + fake) | [`src/messenger/`](src/messenger/) |
| Telephony (provider + Bolna + voice agent) | [`src/telephony/`](src/telephony/) |
| Landmark KB, budget tracker, orchestrator | [`src/landmarks/`](src/landmarks/) · [`src/budget/`](src/budget/) · [`src/coordination/`](src/coordination/) |
| Voice webhooks | [`src/api/voice.ts`](src/api/voice.ts) |
| Dev logging adapters (fake-mode visibility) | [`src/dev/logging.ts`](src/dev/logging.ts) |
| WhatsApp login helper | [`scripts/wa-login.ts`](scripts/wa-login.ts) |
| React dashboard | [`web/`](web/) |
| Android capture app | [`android/`](android/) |
| Tests | [`tests/`](tests/) (backend) · `web/src/**/*.test.tsx` (web) |

## 5. Run it locally right now (no phone, no accounts)
```bash
npm install
npm test                 # 55 backend tests
npx tsx src/index.ts     # API on :3000 (fake mode — prints what WhatsApp/AI-call WOULD send)

cd web && npm install && npm run dev   # dashboard on http://localhost:5173
```
Then follow the **smoke test** in `README.md` to drive a delivery end-to-end. (Full details + the
live-WhatsApp test are in the README.)

## 6. What to pick up next (all ops, not code)
In priority order — each is detailed in `HANDOFF.md` §10–11 and `docs/DEPLOY.md`:
1. **Live WhatsApp test (free):** `npm i whatsapp-web.js qrcode-terminal` → `npm run wa:login` → scan
   the QR on the Porter phone (9599157340). Already proven to work on the dev box.
2. **Build the Android capture app:** open `android/` in Android Studio, build the APK, install on the
   Porter phone, set the backend URL, grant notification access, send the test ping.
3. **AI calls:** create a Bolna + Exotel account, set the env keys, point the number's webhooks at
   `/voice/inbound` and `/voice/status`, verify `BolnaAdapter`'s fields against Bolna's live API.
4. **Deploy:** host the backend (`Dockerfile`) + the dashboard build; make it reachable for the phone.
5. **Tune parsers:** once real Porter notifications land in `capture_inbox`, tune
   `src/capture/parsers.ts` (`HANDOFF.md` §9).

## 7. Conventions
TypeScript ESM (relative imports end in `.js`), money in **integer paise**, `node:sqlite` (not
better-sqlite3), TDD with Vitest. Keep `main` pushed and `HANDOFF.md` current — it's the source of
truth for resuming.
