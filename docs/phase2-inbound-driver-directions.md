# Phase 2 — Inbound Driver-Direction AI Call (spec)

## Goal
When a Porter delivery agent calls the shop's number, an **AI voice agent answers in Hindi**, finds
out where the driver is (usually a nearby landmark, e.g. "Main Muthoot bank pe hoon"), and gives
**turn-by-turn last-stretch directions** to the shop ("ulta haath lein, 20 meter seedha, Bosch board
wali dukaan, 3rd shop"). If unsure, it asks a clarifying question and can hand off to the user.

This is the "direct the driver to my shop" pain, fully automated.

## Why this is hard (and the chosen approach)
- Google Maps gets a driver to the **street**, not the **shop-front**. In Bankey Lal Market the
  last 50 meters (which gali, which side, which board) is where drivers actually get lost.
- Maps cannot describe that. **The shop owner's local knowledge can.**
- **Chosen approach:** a curated **landmark → shop directions** knowledge base that the owner fills
  in once. The AI matches the landmark the driver names and reads out the prepared Hindi directions.

## How the call flows
1. Driver calls the shop's AI number (a dedicated +91 number via Exotel/Plivo).
2. AI (Hindi): "Aryan Enterprises. Aap abhi kahan pe hain? Koi nazdeeki dukaan ya landmark bataaiye."
3. Driver: "Muthoot Finance ke paas."
4. AI matches "Muthoot" in the landmark sheet → reads its directions:
   "Muthoot se ulta haath (left) lein, 20 meter seedha aaiye, daayein taraf Bosch board wali
    dukaan — Aryan Enterprises."
5. AI confirms: "Mil gayi? Nahi mili toh batao." Re-guides or **hands off to owner** if stuck.
6. Call outcome + transcript logged against the delivery in the dashboard.

## What the AI needs (data)
- **Shop fixed location** — already captured (28.5000777, 77.3018299), Bosch board, Bankey Lal
  Market, opp. Red Light, Badarpur.
- **Landmark → directions sheet** — see `shop-landmark-directions-template.csv`. Owner fills the
  landmarks drivers commonly reach + the exact Hindi/Hinglish directions from each.
- **Fallback:** if landmark unknown → AI shares live Google Maps pin link by SMS AND offers to
  connect the owner.

## Tech (Phase 2, not built yet)
- Telephony + voice: **Bolna** (Indic languages) on **Exotel/Plivo** +91 number (NOT Twilio).
- Brain: LLM (Claude) with the landmark sheet as grounding/context; STT+TTS Hindi.
- Guardrails: max re-tries, hand-off to owner, quiet-hours, per-call cost + transcript logging.

## Call routing: ONLY driver calls go to AI, everything else rings the owner normally

**Enabler:** the Porter API returns the **assigned driver's phone number** for each booking, so the
app always knows which numbers are "active drivers." A plain SIM can't route by caller, so calls
must pass through a **cloud telephony layer (Exotel/Plivo)**. Two implementations:

- **Option A (RECOMMENDED): dedicated virtual number as Porter pickup contact.**
  Set the booking's pickup-contact phone to a dedicated AI number. Drivers call *that* (never the
  owner's personal number) → every call to it is a driver → straight to AI. Owner's number stays
  private. AI **warm-transfers to owner's real number** if it can't resolve.

- **Option B: owner keeps own number (what owner described).**
  Owner's published number flows *through* the cloud layer. It rings the owner normally for
  everyone; when caller-ID matches a **known active driver number** (from the Porter booking), it
  routes to AI instead. Achieves "only those calls" but requires porting/forwarding the owner's
  number into the cloud layer.

**To confirm with Porter (Phase 0):** (1) can we set the **pickup-contact phone per booking**?
(2) does Porter **mask numbers** (driver calls via a Porter proxy caller-ID)? These answers decide
A vs B. If Porter masks with a known proxy range, filtering in Option B becomes trivial.

## Verified landmarks around the shop (from owner + maps research)
- **Metro Pillar No. 25** — shop is directly opposite (strongest, map-verified).
- **Canara Bank** (opp Metro Pillar 24) — shop is ~5 shops towards **Faridabad** (south).
- **Nariyal (coconut) wala** — directly opposite the shop.
- **Kishwarna Charitable Eye Hospital** — immediately beside the shop.
- Shop boards: **Bosch + Havells**. Main road: **Mathura Road, Badarpur**.
See `shop-landmark-directions-template.csv` for the AI's Hindi direction lines.
