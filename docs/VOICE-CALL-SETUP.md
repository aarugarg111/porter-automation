# Driver call → AI guides him in (conversational, Hindi)

**Goal:** the Porter driver calls a number, the call is auto-answered, and a Hindi voice **talks him
in turn by turn** — "Aap kahaan ho?" → he says a landmark → AI gives the next leg → repeat until he's
at the shop. Press **9** any time to be connected to the owner.

Example:
```
AI:     Namaste! Aap abhi kis landmark ke paas ho?
Driver: BK pe hoon
AI:     Badarpur Border se Mathura Road pakad ke Faridabad ki taraf chaliye, Canara Bank tak aao…
Driver: canara bank aa gaya
AI:     Canara Bank se 5 dukaan aage, Bosch+Havells board, nariyal wale ke saamne…
Driver: dukaan dikh gaya
AI:     Bahut badhiya! Aa jaiye, dhanyavaad.
```

**Reliability by design:** the AI only ever speaks directions it *knows* (from the landmark KB).
Anything it doesn't recognise → it routes the driver to the known waypoint (Canara Bank) and re-asks;
if it's still stuck (or the line is silent) → it **connects him to the owner**. It never dead-ends and
never invents a wrong turn. No FloBiz infra; standalone; minimal cost.

## What's already built (backend — done + tested)
- `POST /voice/twilio-inbound` runs the whole conversation (Twilio does the Hindi speech-to-text in
  `<Gather input="speech">`; we decide each reply). Greets the driver by name if his number matches an
  active delivery. Logic: `src/telephony/guide.ts`; directions come from the editable `landmarks` table.
- Runs on the single-box server (`npm run build:web && npm start`, or Docker). See `START-HERE.md`.

**Tune the directions** by editing the landmarks (e.g. add "from Mohan Estate, do X"): edit
`src/landmarks/seed.ts` (fresh DBs) or `INSERT` into the `landmarks` table. Each row = keyword +
aliases + the Hindi directions to speak when the driver says it. The owner's local knowledge goes here.

You only need to point a phone number at it.

## Cost
- **Twilio free trial** gives you credit + a test number → first calls are **free**.
- Production: ~**₹0.6–0.7/min** voice + a small per-turn **speech-recognition** fee (~$0.02/turn) +
  a small monthly number rental. At ~25 calls/day this is roughly **₹600–800/mo** — minimal.
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
- **Richer guidance:** keep adding landmark rows (Mohan Estate, Sarita Vihar, Apollo, …) with the exact
  Hindi turn-by-turn from each — the more the KB knows, the fewer calls route to the owner.
- **Aryan's own voice:** swap Twilio TTS for recorded mp3s per leg (`<Say>` → `<Play>`) for authenticity.
- **Security:** validate Twilio's `X-Twilio-Signature` header on the webhook before go-live.
