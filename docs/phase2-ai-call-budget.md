# Phase 2 — AI Calling Budget & Cost-Control Design

## Hard constraint
- **Budget: ₹2,000/month for AI calling ONLY** (hosting + spare SIM are separate/extra).
- Owner wants **AI to handle (almost) all driver calls**, without exceeding ₹2,000.
- Volume: **20–30 Porter deliveries/day**. Today calls run **5–15 min** (unstructured).

## The economics
- AI voice all-in ≈ **₹4–5/min** (Bolna on Exotel/Plivo, pay-as-you-go).
- ₹2,000 budget ⇒ **~400–500 AI minutes/month** (~13–16 min/day).
- Full AI at today's call length (15 calls/day × 8 min) ≈ **₹18,000/mo — NOT viable.**
- Therefore the design MUST cut both the **number** of calls and the **minutes per call**.

## Messaging channel: WhatsApp via the Porter-phone bot (NO SMS, NOT official API)
- Run **whatsapp-web.js** (unofficial WhatsApp Web automation) on the **Porter SIM 9599157340**.
- Sends the driver a **WhatsApp location pin + landmark line + shopfront photo + Hindi voice note** —
  **free**. Agents don't read SMS, so **no SMS at all**.
- **Guardrail:** runs only on the dedicated Porter number 9599157340, never the owner's main
  WhatsApp (unofficial automation carries ban risk; contained on a low-volume dedicated number).
- **Reliability caveat:** needs the Porter phone online + bot process running; re-scan QR if it logs
  out. **Fallback = the AI phone call** (not SMS) if the driver doesn't act on WhatsApp.
- Build on whatsapp-web.js directly (ref: github.com/sarthakgoel31/whatsapp-bot-starter).

## How we fit ₹2,000 (cost-control levers)
1. **Auto-WhatsApp directions on booking** — the moment a delivery is created, the spare-SIM bot
   WhatsApps the driver the **location pin + shopfront photo** + landmark line (Pillar 25,
   Canara→Faridabad 5 shops, nariyal wale ke saamne, Kishwarna Eye Hospital ke baaju, Bosch+Havells
   board). Driver taps the pin → cuts ~40–50% of calls and shortens the rest. (SMS = fallback only.)
2. **AI texts the live Google Maps pin during the call** → "pin bhej diya, tap karke aa jao" →
   call ends fast.
3. **Tight Hindi script**: ask landmark → one-line direction → send pin → confirm → hang up.
   Target **~1.5 min/call** (vs 8 today).
4. **Hard escalation cap**: if AI is unsure OR call exceeds ~2–3 min → **warm-transfer to owner's
   spare phone** (human finishes it, FREE). Protects budget from long calls.
5. **Live spend tracking**: system tracks ₹ spent this month; as it nears ₹2,000 it escalates to
   the spare phone sooner (graceful degradation, never silently overspends).

## Realistic monthly estimate (with this design)
- 25 deliveries/day → auto-SMS all → ~10/day still call (~300/month)
- ~80% resolved by AI in ~1.5 min; ~20% escalate to spare phone after ~1 min
- ≈ **420 AI min/month × ₹4.5 ≈ ₹1,900/month** ✅ within budget
- Per call: ~₹6–8 (AI) / ₹0 (escalated to spare phone)

## Spare SIM = dedicated Porter line (free key piece)
- Old phone + spare SIM = the **contact number on every Porter booking** → only drivers call it
  (solves "only those calls"), no paid virtual number needed, keeps personal number private.
- Runs the auto-SMS sender, and receives AI escalations / overflow.

## Honest caveat
Fitting ₹2,000 depends on the short-call design + drivers using the SMS pin. If calls stay long,
the system escalates to the (free) spare phone faster to stay under budget — coverage stays "full,"
cost stays capped, but more of the hard calls land on the owner rather than AI.
