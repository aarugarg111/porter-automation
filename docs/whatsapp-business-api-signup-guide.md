# WhatsApp Business API — Signup Guide (for our delivery app)

**Why:** This is how the app messages you ("Driver reached your shop", "Delivered") and how you
book deliveries by chatting. It's the slowest thing to get approved (a few days), so start early.

**Important:** This is the *WhatsApp Business **API*** (for software), **NOT** the normal "WhatsApp
Business" green app you download. We go through a provider (BSP) that makes it easy. Recommended:
**AiSensy** (cheapest/simplest in India) or **Gupshup**.

---

## What you need ready before starting
- A **phone number** that is **NOT currently on any WhatsApp account** (best: buy a fresh SIM just
  for the app, ~₹200). If a number already has WhatsApp, you must delete WhatsApp from it first.
- **Business PAN or GST** (same docs as Porter)
- A **Facebook account** (used to create a Meta Business account — the API runs on Meta)
- Business name, address, logo (optional)

---

## Steps (AiSensy path — recommended)

1. Go to **aisensy.com** → "Sign Up" → create an account with your email.
2. Choose a plan (their **Basic** paid plan, ~₹999/month, is enough to start — there's a free
   trial too).
3. In the dashboard, click **"Create WhatsApp API / Connect Number"**.
4. It will connect to **Meta** — log in with your Facebook account and let it create/select a
   **Meta Business Account**.
5. **Verify your business** — upload PAN/GST and business details. (Meta review: usually 1–3 days.)
6. **Add your phone number** for WhatsApp → you'll get an **OTP** on that number → enter it.
7. Set your **display name** (e.g. "Aryan Deliveries") — Meta approves this (can take a day).
8. Done → you now have a WhatsApp API number. AiSensy gives an **API key** — **send that key to me**
   (it lets the app send/receive messages). Keep it private.

> Gupshup path is almost identical: gupshup.io → sign up → "WhatsApp" → connect number via Meta →
> verify business → get API key.

---

## Message templates (do this once connected)
WhatsApp requires pre-approved **templates** for app-initiated messages. I will write these and you
just submit them in the dashboard for approval (each takes a few hours to a day). Examples we'll need:
- "🛵 Driver assigned for your delivery to {{shop}}. ETA {{mins}} min."
- "📍 Driver reached your shop. Order {{id}}."
- "✅ Delivered to {{shop}}. Amount ₹{{amount}}. Wallet balance ₹{{balance}}."
- "⚠️ Porter wallet low (₹{{balance}}). Please recharge."

---

## What to send me when done
1. The **API key** from AiSensy/Gupshup
2. The **WhatsApp number** you connected
3. Confirmation your **business is verified** on Meta

Then I can wire the app to message you. ⏱️ Start step 1 today — the Meta verification wait is the
bottleneck.
