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
  payment_status(pending|settled), expected_minutes, started_at, reached_at, created_at.
- **events**: id, delivery_id, status, source(notif|manual|sim|call), raw_text, created_at.
- **capture_inbox**: raw Porter app notifications (audit + re-parse).

Status: `INTENT → ASSIGNED → REACHED_PICKUP → PICKED_UP → REACHED_AREA → DELIVERED` (+CANCELLED).

## Job 1 — Driver coordination (WhatsApp + call, no SMS)
On ASSIGNED (driver # from notification, or when the driver calls 9599157340), bot WhatsApps the
driver from 9599157340: location pin + shopfront photo + Hindi voice note (Pillar 25, Canara→
Faridabad 5 shops, nariyal wale ke saamne, Kishwarna Eye Hospital ke baaju, Bosch+Havells board).
AI phone call backup for those who don't respond (Phase-2 budget doc). No SMS fallback.

## Job 2 — Tracking + diversion detection (honest scope)
No continuous GPS without the API. Approach:
- `expected_minutes` from Google Directions (pickup→drop) at booking.
- Walk status from notifications; if elapsed since PICKED_UP exceeds `expected_minutes × threshold`
  without REACHED_AREA → flag **"running late / possible diversion."**
- Optional: request driver's **WhatsApp live-location** for deliveries that matter. Not default.

## Job 3 — Reached confirmation
REACHED_AREA / DELIVERED parsed from Porter app notifications → status + alert.

## Job 4 — Destination-owner confirmation
On DELIVERED, auto-WhatsApp the receiver (number from locations): "Parcel aa gaya? Confirm karein."
AI call fallback. Result logged + pushed to owner.

## Job 5 — Payment coordination (no gateway, no collection)
Receiver pays the Porter driver directly; owner pays Porter via wallet OR cash (mix). So:
- Each delivery `payer = ME | RECEIVER` (default from shop's `default_payer`, editable).
- **RECEIVER**: auto-WhatsApp the receiver "Porter charge ~₹{amount} hoga, driver ko de dena"; mark
  `settled` on delivery. Owner out of the loop.
- **ME**: capture `amount` from the Porter notification, add to running spend, mark settled (works
  whether wallet auto-deducts or owner pays cash).
- **Ledger**: today's deliveries by payer, amount, pending vs settled, totals.

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
