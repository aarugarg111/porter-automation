# Porter Cockpit Dashboard (Plan 2) — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** A React web dashboard (later wrappable as an Android APK) for the shop owner to book and watch all daily Porter deliveries, talking to the existing cockpit backend API.

**Architecture:** Vite + React + TypeScript in `web/`, calling the existing Express API (`src/api`). Dev uses a Vite proxy to the backend on :3000. Screens match the spec: split main (quick-book + active list), booking confirm, delivery detail, ledger.

**Tech Stack:** Vite, React 18, TypeScript, Vitest + @testing-library/react for smoke tests.

## Global Constraints
- Talks ONLY to the existing backend API; no business logic duplicated in the UI.
- Money shown as ₹ (amount is integer paise from API → divide by 100).
- Direction arrows: SEND `→`, RECEIVE `←`. Show `late` ⚠ flag and payer/method badges.
- No secrets in the frontend. Keep components small + focused.

---

### Task 1: Backend — add locations endpoints (the dashboard needs the saved shops)
**Files:** Modify `src/api/read.ts`; Test `tests/locations_api.test.ts`.
**Interfaces produced:** `GET /locations` → all locations; `POST /locations` → `{id}` (validated with zod: nickname required, relationship in customer|supplier|both, optional phone/address/lat/lng/default_direction/default_vehicle/default_payer/landmark_notes).

- [ ] Step 1: Failing test — POST /locations then GET /locations returns it (express listen(0)+fetch pattern as in tests/read.test.ts).
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Add routes to `readRouter` using `createLocation`/`listLocations` from `src/locations/repo.ts`; zod-validate POST body; reuse the existing zod import.
- [ ] Step 4: Run → PASS (full suite green).
- [ ] Step 5: Commit `feat(api): GET/POST /locations`.

---

### Task 2: Scaffold the web app
**Files:** Create `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`.

- [ ] Step 1: `cd web && npm create vite@latest . -- --template react-ts` (or hand-create equivalent). Install: `npm i` then `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`.
- [ ] Step 2: `vite.config.ts` — dev server proxy: `server.proxy = { '/api': 'http://localhost:3000' }`; vitest config `environment:'jsdom'`.
- [ ] Step 3: Minimal `App.tsx` renders `<h1>Porter Cockpit</h1>`; `main.tsx` mounts it.
- [ ] Step 4: Add a trivial render test `web/src/App.test.tsx` (renders the heading) → `npm test` passes.
- [ ] Step 5: Commit `chore(web): scaffold vite react dashboard`.

---

### Task 3: API client
**Files:** Create `web/src/api.ts`; Test `web/src/api.test.ts`.
**Interfaces produced:** typed `Delivery`, `LocationRow`, and functions `listDeliveries()`, `getDelivery(id)`, `listLocations()`, `createIntent(body)`, `getLedger()` — each `fetch('/api'+path)` and returns JSON. (The backend routes are mounted at root; the Vite proxy maps `/api/*`→backend `/*`, so client calls `/api/deliveries` etc. — confirm proxy rewrites `^/api`.)

- [ ] Step 1: Failing test — mock `fetch`, assert `listDeliveries()` calls `/api/deliveries` and returns parsed array.
- [ ] Step 2→4: Implement; run → PASS.
- [ ] Step 5: Commit `feat(web): typed api client`.

---

### Task 4: Main screen — split quick-book + active deliveries
**Files:** Create `web/src/components/QuickBook.tsx`, `web/src/components/ActiveList.tsx`, `web/src/components/DeliveryRow.tsx`; modify `App.tsx`; Test `web/src/components/ActiveList.test.tsx`.
**Behavior:** Top = quick-book chips from `listLocations()` (tap → opens booking confirm for that shop, see Task 5). Bottom = `listDeliveries()` rendered as rows: direction arrow, other party nickname, status chip, ⚠ if `late`, payer/method badge, ₹amount. Poll every 5s.

- [ ] Step 1: Failing test — `ActiveList` given mock deliveries renders a row per delivery with status text and shows ⚠ when `late:true`.
- [ ] Step 2→4: Implement components; App composes `<QuickBook/>` over `<ActiveList/>`; run → PASS.
- [ ] Step 5: Commit `feat(web): main split screen (quick-book + active list)`.

---

### Task 5: Booking confirm flow
**Files:** Create `web/src/components/BookConfirm.tsx`; Test alongside.
**Behavior:** Given a chosen location, show a pre-filled confirm (direction defaulted from the shop's `default_direction`/relationship, vehicle + payer defaults), with Confirm/Edit. Confirm → `createIntent({direction, otherLocationId, payer})` → shows "Booking…" and the new delivery appears in the active list on next poll.

- [ ] Step 1: Failing test — selecting a customer defaults direction SEND; clicking Confirm calls `createIntent` with the right body (mock api).
- [ ] Step 2→4: Implement; run → PASS.
- [ ] Step 5: Commit `feat(web): one-tap booking confirm`.

---

### Task 6: Delivery detail (timeline + payment)
**Files:** Create `web/src/components/DeliveryDetail.tsx`; Test alongside.
**Behavior:** `getDelivery(id)` → status timeline from `events` filtered to `event_type==='status'`, driver name/phone, amount + payer + method, payment_status, and (if UPI) the `payment_qr_url`/`payment_upi_id` with a "Pay now" prompt; show a tracking/map link if drop lat/lng present.

- [ ] Step 1: Failing test — given a delivery with events, renders the status steps in order and the ₹amount.
- [ ] Step 2→4: Implement; run → PASS.
- [ ] Step 5: Commit `feat(web): delivery detail with timeline + payment`.

---

### Task 7: Ledger view
**Files:** Create `web/src/components/Ledger.tsx`; Test alongside.
**Behavior:** `getLedger()` → table of today's deliveries by payer+method with pending/settled, and the `totals` (pending ₹, settled ₹). A simple tab/route switch between Main and Ledger.

- [ ] Step 1: Failing test — renders totals.pending and a row per ledger row (mock api).
- [ ] Step 2→4: Implement; run → PASS.
- [ ] Step 5: Commit `feat(web): payment ledger view`.

---

### Task 8: Wire-up + README + manual smoke
**Files:** modify `App.tsx` (nav between Main/Ledger, open DeliveryDetail on row tap); update root `README.md` with how to run web.
- [ ] Step 1: Ensure `npm test` (web) all green.
- [ ] Step 2: Manual smoke — run backend (`npx tsx src/index.ts`) + `cd web && npm run dev`; book via a quick-book chip; POST a sample notification to backend `/capture`; confirm the row advances and detail shows the timeline.
- [ ] Step 3: Commit `feat(web): wire navigation + docs`.

## Self-Review Notes
- Spec coverage: split main (T4), one-tap booking (T5), detail timeline + payment incl. UPI QR (T6), ledger totals (T7), locations for quick-book (T1). APK wrap is a later step (PWA/Capacitor), not this plan.
- Deferred: real WhatsApp/AI (Plan 3), Android capture app (Plan 4), live map (needs drop lat/lng + a map lib). One-off destination entry (drop_address_text) can be a follow-up field on BookConfirm.
- Tests are component/api smoke tests (testing-library) — lighter than backend TDD but assert real render/behavior.
