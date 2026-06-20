# Porter Coordination Cockpit — Design (NO-API)
_Revised 2026-06-20. Porter API stalled indefinitely; product re-centered on post-booking coordination.
NO SMS anywhere — driver/receiver comms via WhatsApp + AI call; tracking via Porter app notifications._

## Primary objective (the owner's actual pain)
Booking is ~30s and is NOT the problem. The 5 coordination jobs that repeat 20–30×/day are:

| # | Job | Automation (no Porter API, no SMS) |
|---|---|---|
| 1 | Get the agent to the pickup (when SENDING) | Auto-WhatsApp location pin + shopfront photo + Hindi voice note; Hindi AI call backup |
| 2 | Track + catch route diversion/delay | App-notification milestones + expected-vs-actual time flag; optional WhatsApp live-location |
| 3 | Confirm reached | "Reached/Delivered" auto-detected from Porter app notifications |
| 4 | Confirm with destination owner | Auto outbound WhatsApp/AI call to receiver ("parcel aa gaya?") |
| 5 | Payment coordination | Per-delivery payer tag + auto WhatsApp pre-notify + settlement ledger |

Booking stays MANUAL in the Porter app. Everything above is the product.

## Comms rules
- **To drivers & receivers: WhatsApp + AI phone call ONLY. No SMS** (agents don't read SMS).
- **Tracking data source (no API): read the Porter app's push notifications** on the Porter phone
  (Android NotificationListenerService) → order id, status, driver #, cost. Invisible; sends nothing.

## The "Porter phone" (one spare device)
SIM **9599157340** (the Porter account number AND the WhatsApp-sending number). This old phone runs:
- Porter app (manual booking)
- **Notification-capture** service → forwards Porter app notifications to the backend
- **whatsapp-web.js bot** (sends to drivers/receivers from 9599157340)

Owner monitors via the dashboard on their own phone.

## Architecture
```
Owner books in Porter app on 9599157340 (~30s) + taps destination shop in dashboard (1 tap = INTENT)
        │
Porter-phone notification-capture reads Porter app alerts → order id, status, driver #, cost
        │
Backend matches alert → delivery, runs the 5 jobs:
   1 driver coord (WhatsApp/AI)  2 tracking+diversion  3 reached  4 receiver confirm  5 payment
```
**Seam:** `PorterClient` = `mock`(dev) · **`notifBridge`(now)** · `real`(when API lands). Swap-in later, no rewrite.

## Data model
- **locations**: id, nickname, relationship(customer|supplier|both), contact, phone, address,
  lat, lng, default_direction, default_vehicle, default_payer, landmark_notes, is_home.
  Seed HOME = Aryan Enterprises (28.5000777/77.3018299) + landmarks.
- **deliveries**: id, direction(SEND|RECEIVE), pickup_location_id, drop_location_id, status,
  porter_order_id, driver_name, driver_phone, amount, payer(ME|RECEIVER),
  payment_method(CARD|WALLET|CASH|UPI|null), payment_qr_url, payment_upi_id,
  payment_status(pending|settled), expected_minutes, started_at, reached_at, created_at.
- **events**: id, delivery_id, status, source(notif|manual|sim|call), raw_text, created_at.
- **capture_inbox**: raw Porter app notifications (audit + re-parse).

Status: `INTENT → ASSIGNED → REACHED_PICKUP → PICKED_UP → REACHED_AREA → DELIVERED` (+CANCELLED).

## Job 1 — Driver coordination (WhatsApp + INBOUND AI call, no SMS)
Two channels:
- **Proactive (on ASSIGNED):** bot WhatsApps the driver from 9599157340: location pin + shopfront
  photo + Hindi voice note (Pillar 25, Canara→Faridabad 5 shops, nariyal wale ke saamne, Kishwarna
  Eye Hospital ke baaju, Bosch+Havells board).
- **Reactive (driver CALLS 9599157340):** the system detects an incoming voice call and the **AI
  answers it**, then guides the driver to the shop in Hindi using the landmark sheet — escalating to
  the owner only if it can't resolve. This is the key "driver calls me for directions" automation
  (see phase2-inbound-driver-directions.md + phase2-ai-call-budget.md). No SMS anywhere.

## Job 2 — Tracking + diversion detection (honest scope)
No continuous GPS without the API. Approach:
- `expected_minutes` from Google Directions (pickup→drop) at booking.
- Walk status from notifications; if elapsed since PICKED_UP exceeds `expected_minutes × threshold`
  without REACHED_AREA → flag **"running late / possible diversion."**
- Optional: request driver's **WhatsApp live-location** for deliveries that matter. Not default.

## Job 3 — Reached confirmation
REACHED_AREA / DELIVERED parsed from Porter app notifications → status + alert.

## Job 4 — Destination-owner confirmation (WhatsApp AND AI call)
On DELIVERED: (1) auto-WhatsApp the receiver "Parcel aa gaya? Confirm karein.", AND (2) the AI
**phones the receiving shop owner** to confirm "parcel aa gaya ki nahi." The call result (confirmed
/ not yet / no answer) is logged and pushed to the owner. The call is the primary confirmation; the
WhatsApp is the written record / fallback.

## Job 5 — Payment coordination
Each delivery: `payer = ME | RECEIVER`. When `payer = ME`, `method` is the Porter method chosen at
booking: **CARD / WALLET (automatic)**, **CASH**, or **UPI** (both manual). Method is read from the
fare notification if it carries it, else set per delivery (default per shop, editable).

- **RECEIVER pays:** receiver pays the Porter driver directly. App pre-notifies the receiver
  (WhatsApp + the Job-4 AI confirmation call) "Porter charge ~₹{amount} hoga, driver ko de dena";
  mark `settled`. Owner out of the loop.
- **ME + CARD/WALLET (automatic):** Porter auto-charges the card/wallet. App logs `amount` from the
  notification, tracks running spend, warns on low balance. No action needed.
  - CONSTRAINT: manual booking + no API → the app cannot pick the method per booking; the owner
    selects CARD/WALLET at booking (or sets it as the Porter default once). The app reflects, it
    doesn't control.
- **ME + CASH:** owner pays the agent **cash at pickup** (when the agent leaves the shop). Dashboard
  shows a "Give ₹{amount} cash to agent" prompt; owner taps paid → `settled`.
- **ME + UPI:** after the agent reaches the drop, the agent sends a **QR code / UPI number to the
  Porter WhatsApp (9599157340)** (or says it on the call). The bot captures it → dashboard surfaces
  the **QR + UPI id + amount** with a "Pay now" prompt → owner pays → taps paid → `settled`.
- **How this reaches the dashboard (no Porter API):** method/amount/status come from **captured
  Porter notifications**; the UPI QR/number comes from the **WhatsApp message** to 9599157340. Same
  end effect as an API feed, via the capture layer.
- **Ledger**: today's deliveries by payer + method, amount, pending vs settled, totals.

## Screens
1. **Main (split):** quick-book chips (tap = INTENT + open Porter app); below = live active
   deliveries (status chip + ⚠ diversion flag + payer tag).
2. **Confirm/intent:** tap shop → pre-filled (direction, vehicle, payer) → "Booking…" until captured.
3. **Delivery detail:** status timeline, driver, amount + payer, WhatsApp/confirm states, raw trail.
4. **Ledger:** payments today (pending/settled, totals).
5. **Saved shops:** directory + CSV import.

## Alerts (4) + diversion flag
Assigned+on-the-way · Reached pickup · Reached delivery area · Delivered+payment-state. Plus
⚠ diversion/late. Others silent.

## Components
`db/` · `porter/`(iface + notifBridge + mock) · `capture/`(notification parsers + matcher) ·
`messenger/`(iface → whatsapp-web.js) · `tracking/`(expected-time + diversion) ·
`payments/`(payer + ledger) · `deliveries/`(service) · `api/` · `web/` · `sim/`(dev).

## Testing (TDD)
- Notification parsers: real sample texts → correct fields/events (table-driven).
- Matcher: order notification → right open INTENT; no-intent + duplicate handling.
- Diversion: elapsed > expected×threshold → flag.
- Payment: payer routing (ME vs RECEIVER) → correct notify + ledger entry.
- Integration: tap shop → INTENT → feed sample notification sequence → walks to DELIVERED with
  receiver-confirm + payment + alerts.

## Verification (today, no API key)
Run backend + web → tap a shop (INTENT) → POST a sample Porter notification sequence to the capture
endpoint → delivery advances through all 5 jobs with alerts + ledger. Then one real booking on
9599157340 end-to-end.

## Open items
1. Real Porter **app-notification** samples (assigned / en route / delivered / receipt) to build parsers.
2. Verify any "free AI calling" provider before relying on it; default = free WhatsApp pin + voice note.
