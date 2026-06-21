# Deployment Guide (Plan 5 hosting + Plan 6 APK wrap)

Status: **scaffolded, not yet executed.** These steps need a hosting account + a few decisions
(host choice, domain, HTTPS) that are owner/Sarthak calls. The artifacts below are starting points.
The `Dockerfile` and configs here were written without Docker/Android tooling on the authoring
machine, so **build them once on a tooling-equipped box before relying on them.**

## Single-box deploy (recommended — implemented)
The backend now **serves the built dashboard itself**, so one container/process is the whole thing:
- `GET /` → the dashboard (from `web/dist`, if present).
- `GET /api/*` → the API (also mounted at root for the Android app's `POST /capture`).
- `GET /health` → `{ ok: true }` for platform health checks.
- `CAPTURE_TOKEN` (env) → if set, `/capture` and `/whatsapp/inbound` require the `x-capture-token`
  header (the Android app sends it). Leave blank on a trusted LAN; **set it on any public host.**

Build + run locally (proves the single-box path):
```bash
npm run build:web          # → web/dist
npm install
npx tsx src/index.ts        # serves API + dashboard on :3000
# open http://localhost:3000  (dashboard) · curl http://localhost:3000/health
```
Docker (same thing, the image builds `web/dist` for you):
```bash
docker build -t porter-cockpit .
docker run -p 3000:3000 -e CAPTURE_TOKEN=some-long-secret -v porter_data:/app porter-cockpit
```
The dashboard calls same-origin `/api/*`, so nothing else needs configuring. (In dev, `npm run dev`
in `web/` still proxies `/api` → the backend via `VITE_API_TARGET`.)

## Architecture for deploy
Three deployables (or one box, as above):
1. **Backend API** (`src/`, Express + `node:sqlite`) — the always-on server; also serves the dashboard.
2. **Dashboard** (`web/`, Vite static build) — served by the backend, or any static host.
3. **Android capture app** (`android/`) + the dashboard-as-APK (Plan 6).

## Plan 5a — Backend hosting

### Option A (recommended): container host (Render / Railway / Fly.io / a small VPS)
- Build: `docker build -t porter-cockpit .` (uses the root `Dockerfile`).
- Run: `docker run -p 3000:3000 -v porter_data:/app porter-cockpit`
  - The volume persists `cockpit.sqlite`. SQLite is single-file; one container instance only
    (no horizontal scaling — fine for one shop).
- Set env from `.env.example`. Keep `PORTER_LIVE=0` until Plan 3 live-wiring is ready.
- Cost target: ~₹500–1,000/mo (the small tier on any of these).

### Option B: plain VPS without Docker
- Node 24+, `npm ci`, run under a process manager: `pm2 start "npx tsx src/index.ts" --name cockpit`.
- Put nginx in front for HTTPS (Let's Encrypt) — the Android app and PWA should use HTTPS in prod
  (then drop `usesCleartextTraffic` in the Android manifest).

### Live WhatsApp mode (later)
`PORTER_LIVE=1` loads `WhatsAppWebClient` (whatsapp-web.js → puppeteer/Chromium). That needs:
- `npm i whatsapp-web.js` and a Chromium-capable image (`node:24` full, plus the puppeteer system
  libs), NOT `node:24-slim` as-is. Add the libs or use `ghcr.io/puppeteer/puppeteer` as a base.
- A persistent volume for the `LocalAuth` WhatsApp session so the QR isn't re-scanned each deploy.
- Realistically the WhatsApp bot wants the **Porter phone** online; many setups run the bot on a box
  on the same network as the phone rather than a remote container.

## Plan 5b — Dashboard hosting
- Build: `cd web && npm ci && npm run build` → `web/dist/`.
- Host the static `web/dist` on Netlify / Vercel / Cloudflare Pages / nginx.
- Point the dashboard's API base at the deployed backend URL (the Vite dev proxy `/api`→:3000 is
  dev-only; for prod set the API base via the web app's env/config and rebuild).

## Plan 6 — Dashboard as an Android APK
Two routes, pick one:

### Route 1 (lightest): installable PWA
- Add a web manifest + service worker to `web/` (e.g. `vite-plugin-pwa`). Users "Add to Home Screen."
- No store, no APK build pipeline. Good enough for a single internal user.

### Route 2 (real APK): Capacitor wrapper
- `cd web && npm i @capacitor/core @capacitor/cli @capacitor/android`
- `npx cap init "Porter Cockpit" com.flobiz.portercockpit --web-dir=dist`
- `npm run build && npx cap add android && npx cap sync && npx cap open android`
- Build the APK in Android Studio (same tooling as the `android/` capture app).
- Note: this is a SEPARATE Android project from `android/` (the capture app). They can share the
  phone but are distinct installs.

## Remaining decisions (owner / Sarthak)
- [ ] Host choice + budget approval (~₹500–1k/mo).
- [ ] Domain + HTTPS (needed before dropping cleartext on the Android app).
- [ ] Where the WhatsApp bot runs (same-network box vs remote container).
- [ ] PWA vs Capacitor for the dashboard APK.
