# Porter Automation — TL;DR

**Build status (2026-06-20):** ✅ Plan 1 backend engine (24 tests) + ✅ Plan 2 dashboard UI
(15 tests) built, reviewed, on GitHub. ⬜ Left: Plan 3 (WhatsApp bot + AI calls), Plan 4 (Android
notification-capture app), then deploy.

**Goal:** automate the post-booking coordination for 20–30 Porter deliveries/day. Booking stays
manual (~30s in the app); the app handles everything painful after it. **Works WITHOUT Porter's
API** (stalled indefinitely) by reading the **Porter app's notifications**; swaps to the real API
whenever it's enabled. **No SMS anywhere** — driver/receiver comms via WhatsApp + AI call.
**Porter account + WhatsApp number = 9599157340** (the spare "Porter phone").

## The product = 5 coordination jobs

| # | Job | How (no API) |
|---|---|---|
| 1 | Get agent to your shop | Auto-WhatsApp pin + photo + Hindi voice note, AND the **AI answers the driver's incoming call** to guide him in Hindi |
| 2 | Track + catch diversion/delay | Notification milestones + expected-vs-actual time flag; optional WhatsApp live-location |
| 3 | Confirm reached | Auto-detected from Porter notifications |
| 4 | Confirm with destination owner | Auto WhatsApp **AND AI phone call** to the receiver |
| 5 | Payment coordination | RECEIVER→pre-notify; ME+CARD/WALLET→auto; ME+CASH→pay agent at pickup; ME+UPI→agent's QR/number to your WhatsApp after drop; settlement ledger |

## How it works
```
Book in Porter app (manual) → tap destination shop in dashboard (1 tap)
Porter-phone helper reads Porter SMS → auto-captures order, driver #, status, ₹
Backend runs the 5 jobs → dashboard + WhatsApp
```

## Payment model (clarified)
- **Receiver pays** → they pay the Porter driver directly. App pre-notifies "₹X, driver ko de dena",
  marks settled. You're out of the loop. No gateway needed.
- **You pay** → wallet or cash (mix). App logs amount, tracks spend, marks settled.

## Tech
Node+TS + SQLite backend · React web → Android APK · whatsapp-web.js on spare "Porter phone" ·
`PorterClient` seam: smsBridge now → real API later.

## Who does what

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | Porter account + WhatsApp number = 9599157340 | 🧑 You | ✅ |
| 2 | Send 4 real Porter **app-notification** samples (assigned/en route/delivered/receipt) | 🧑 You | ⏳ |
| 3 | Spare "Porter phone" (9599157340): Porter app + notification capture + WhatsApp | 🧑 You | ⏳ |
| 4 | Fill saved-shops list (+ who-pays per shop) | 🧑 You | ⏳ |
| 5 | Approve hosting (~₹500–1k/mo) | 🧑 You | ⏳ |
| 6 | Review the spec | 🧑 You | ⏳ Now |
| 7 | Install APK | 🧑 You | 🔒 Later |
| 8 | Porter API key — swap in whenever it arrives | 🧑 You | 🔁 Whenever |
| A | Prep · Superpowers · shop/landmarks · Phase-2 design | 🤖 Me | ✅ |
| B | Design spec (no-API, 5 jobs) | 🤖 Me | ✅ |
| C | Implementation plan (writing-plans) | 🤖 Me | ▶️ Next |
| D | Build the cockpit (SMS bridge + 5 jobs + dashboard) | 🤖 Me | 🔜 |
| E | Wire WhatsApp bot + AI call backup | 🤖 Me | 🔜 |
