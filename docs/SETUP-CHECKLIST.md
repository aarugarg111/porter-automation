# Setup checklist — what YOU do (ELI5, step by step)

Everything in the code is done. These are the real-world steps only you can do (need a phone,
an account, or a device). Do them in this order. **Items 1–2 + a test call = the whole POC working
in ~15 minutes, free.**

---

## ⭐ 1. Twilio — get a phone number + point it at the app
**Site:** https://www.twilio.com

1. Click **Sign up** → make a free account (no card needed for the trial). Verify your email and your
   phone number. You land in the **Console** (`console.twilio.com`). Free trial gives you ~$15 credit.
2. Get a number: left menu → **Phone Numbers → Manage → Buy a number** → pick any number (the trial
   gives one free). For the first test, *any* number is fine — you'll just call it yourself.
3. Point it at the app: **Phone Numbers → Manage → Active numbers** → click your number → scroll to
   **Voice Configuration → "A call comes in"** → choose **Webhook** → paste:
   ```
   https://<YOUR-TUNNEL-URL>/voice/twilio-inbound
   ```
   (the tunnel URL comes from step 2) → method **HTTP POST** → **Save**.
4. **Done.** Call the number from any phone → you'll hear the Hindi conversation.

**Get me (optional):** nothing required — you configure it. If you want me to double-check, send me
the **phone number** and the **tunnel URL**. (Account SID / Auth Token are only needed later for
signature security — not now.)

---

## ⭐ 2. cloudflared — make the box reachable from the internet (free)
**Why:** Twilio (step 1) needs a public `https://` URL to reach your box.

1. Install it:
   - Mac: `brew install cloudflared`
   - Linux box: download from https://github.com/cloudflare/cloudflared/releases (or `apt install cloudflared`)
2. Start the app on the box: `npm run build:web && npm start` (runs on port 3000).
3. In another terminal: `cloudflared tunnel --url http://localhost:3000`
4. It prints a line like `https://brave-tiger-1234.trycloudflare.com`. **That's your public URL.**
   Paste `https://brave-tiger-1234.trycloudflare.com/voice/twilio-inbound` into Twilio (step 1.3).

**Note:** the free quick-tunnel URL changes every time you restart it. Fine for testing; for a
permanent URL set up a named tunnel later (or just host the box with a real domain).
**Get me (optional):** the printed `https://…` URL.

---

## 3. Make the *driver* reach the AI (point Porter's number at Twilio)
**Why:** the driver dials whatever number Porter shows him. For the AI to answer, that number must
be (or forward to) your Twilio number. *Skip this for the first self-test — just call the Twilio
number yourself.*

Pick ONE:
- **A — change Porter's contact number:** in the Porter app/account, set the pickup contact number to
  your **Twilio number**. (Check if Porter lets you change it.)
- **B — call-forwarding (easier):** keep Aryan's SIM as the Porter number, and turn on call-forwarding
  on that SIM to the Twilio number. Dial the forwarding code on the phone:
  - all calls: `**21*<TwilioNumber>#` then call
  - or "when busy / no answer": `**61*<TwilioNumber>#`
  - (exact code varies by carrier — Jio/Airtel/Vi have it in *Settings → Call forwarding* too.)

**Get me:** nothing — your Porter/SIM settings. Tell me if Porter blocks changing the contact number.

---

## 4. Shopfront photo (so the WhatsApp to the driver includes it)
1. Take a clear photo of the shop front — Bosch+Havells board, the nariyal (coconut) stall visible.
2. Put it on the box at: `assets/shopfront.jpg`
3. (Optional) record a 15-sec Hindi voice note of the directions, save as `assets/directions-hi.ogg`.

**Get me:** just drop the file in `assets/`, OR send me the photo and I'll add it. Nothing else.

---

## 5. WhatsApp login (so real WhatsApp messages actually send)
**Why:** by default the app only *prints* what it would send. To really send, log in the bot once.

On the box, with the **Porter phone (9599157340)** in hand:
1. `npm i whatsapp-web.js qrcode-terminal` (one-time, downloads a browser — heavy)
2. `npm run wa:login` → a **QR code** prints in the terminal.
3. On the Porter phone: **WhatsApp → Settings → Linked Devices → Link a Device → scan the QR.**
4. From now run the server with `PORTER_LIVE=1` (e.g. `PORTER_LIVE=1 npm start`).

**Get me:** nothing — you scan the QR on the phone. (Don't delete the `.wwebjs_auth/` folder it
creates — that's the saved login.)

---

## 6. Android capture app (auto-forward Porter notifications)
**Why:** so you don't have to copy Porter notifications by hand — the phone forwards them.
*Not needed for the call POC; do it when you want full automation.*

1. Install **Android Studio** (free): https://developer.android.com/studio
2. Open the `android/` folder in Android Studio → wait for Gradle to sync.
3. Connect the Porter phone by USB (enable *Developer options → USB debugging*) → press **Run** ▶,
   OR **Build → Build APK** and copy the APK to the phone to install.
4. In the installed app: enter the **backend URL** (your tunnel/box URL), enter the **CAPTURE_TOKEN**
   if you set one (step 7) → **Save** → **Grant notification access** (toggle it on for this app) →
   **Send test ping** (should say "Test OK").

**Get me:** nothing — it's on your machine/phone. I can't build it here (no Android SDK on this box).

---

## 7. Environment variables on the box
The app **auto-loads `.env`** on start (no extra flags) — inline vars like `PORTER_LIVE=1 npm start`
still override it.
1. In the repo on the box: `cp .env.example .env`
2. Edit `.env`:
   - `OWNER_ALERT_PHONE=9910774205` ← Aryan's number (gets late alerts + the "press 9 → owner" call)
   - `CAPTURE_TOKEN=<a long random secret>` ← only if the box is on the public internet (then put the
     **same** value in the Android app, step 6). Leave blank on a home/LAN network.
   - `AUTO_CONFIRM_CALL=1` ← optional, lets the AI auto-call the receiver if they don't reply on WhatsApp.

**Get me:** tell me the numbers/secret you want and I'll set them, or just edit `.env` yourself.

---

## 8. A few real Porter notifications (so I can tune the parser)
The text-reading rules (`src/capture/parsers.ts`) are a best guess until they see the real wording.

**Get me:** during a few real/dummy deliveries, **screenshot or copy 4–5 real Porter app
notifications** — one each of: *driver assigned*, *picked up*, *reached drop*, *delivered*, *fare/receipt* —
and send them to me. I'll tune the parser to match exactly. (They also auto-save in the DB's
`capture_inbox` once the Android app is running.)

---

## 9. More landmark directions (so the AI guides from more places)
The AI reads directions from the `landmarks` table. Right now it knows Pillar 25, Canara Bank, nariyal
wala, Kishwarna Hospital, Badarpur Border/BK. Anything else → it routes the driver to Canara Bank, then
to you.

**Get me:** ask Aryan for the common spots drivers start from (Mohan Estate, Sarita Vihar, Apollo,
Tughlakabad…) and the **exact Hindi directions from each to the shop**, e.g.:
> "Mohan Estate se: metro ke neeche se Faridabad side, 2 red light cross karke Canara Bank."

Send me that list and I'll add each as a landmark. The more it knows, the fewer calls reach you.

---

### TL;DR — to prove the driver call TODAY (free, ~15 min)
1. `npm run build:web && npm start` on the box.
2. `cloudflared tunnel --url http://localhost:3000` → copy the `https://…` URL.
3. Twilio → your number → "A call comes in" → `https://…/voice/twilio-inbound` (POST) → Save.
4. **Call the number.** You'll hear it ask where you are, guide you in Hindi, and connect to the owner on "9".
