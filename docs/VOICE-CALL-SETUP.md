# Driver call → AI answers in Hindi (setup)

**Goal:** the Porter driver calls a number, the call is auto-answered, and a Hindi voice reads out
the directions to the shop ("Metro Pillar 25 ke saamne, Canara Bank se 5 dukaan, …"). Press **1** to
repeat, **9** to be connected to the owner.

This is **deterministic** — we *play a fixed, correct script*, no live speech recognition to mis-hear.
For a single fixed shop that's 100% accuracy. No FloBiz infra; standalone; minimal cost.

## What's already built (the backend side — done + tested)
- `POST /voice/twilio-inbound` returns TwiML that answers + speaks the seeded shop's directions and
  offers the 1/9 menu. Greets the driver by name if their number matches an active delivery.
- Runs on the single-box server (`npm run build:web && npm start`, or Docker). See `START-HERE.md`.

You only need to point a phone number at it.

## Cost
- **Twilio free trial** gives you credit + a test number → first calls are **free**.
- Production: ~**₹0.6–0.7/min** + a small monthly number rental. At ~25 calls/day × ~1 min ≈ **₹500/mo**.
  (Twilio is the cheapest *reliable* option that needs no business onboarding to start.)

## One-time setup (~15 min)
1. **Sign up at twilio.com** (free trial). Note your trial number.
2. **Expose the box** with a free tunnel (so Twilio can reach it):
   ```bash
   # on the headless box, with the cockpit running on :3000
   cloudflared tunnel --url http://localhost:3000      # prints https://<random>.trycloudflare.com
   ```
   (or `ngrok http 3000`). Use a permanent domain later.
3. **Point the number at the webhook.** Twilio Console → your number → *Voice* → **A call comes in** →
   Webhook → `https://<your-tunnel-or-domain>/voice/twilio-inbound` → **HTTP POST**. Save.
4. **Set who "press 9" reaches:** start the backend with `OWNER_ALERT_PHONE=9910774205` (Aryan's
   number). Otherwise it dials the Porter number.
5. **Call the number yourself** → you'll hear the Hindi directions. ✅ Proof done.

## Getting the *driver* to that number
The driver dials whatever Porter shows as the pickup contact. Two ways:
- **Best:** set the Twilio number as the Porter account's pickup/contact number.
- **Or:** keep Aryan's SIM and set **conditional call-forwarding** (busy/no-answer/all) on it to the
  Twilio number — driver dials the normal number, it lands on the AI.

> India number note: an *Indian* Twilio DID needs a one-time KYC "regulatory bundle". For the first
> proof you can use the trial number and call it directly; provision the Indian number for go-live.

## Upgrades (optional, later)
- **Aryan's own voice:** record the directions once, host the mp3, switch `<Say>` → `<Play>` in
  `src/telephony/twiml.ts` for maximum authenticity/clarity.
- **Conversational** ("driver says where he is"): add Twilio `<Gather input="speech" language="hi-IN">`
  and route the transcript through the existing `LandmarkKB` match. (Adds STT error risk — that's why
  the default is the deterministic playback.)
- **Security:** validate Twilio's `X-Twilio-Signature` header on the webhook before go-live.
