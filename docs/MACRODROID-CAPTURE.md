# Auto-capture Porter notifications with MacroDroid (no code)

Makes the **Porter phone** forward every Porter notification to the cockpit automatically — so nobody
ever opens the **Capture** screen by hand. MacroDroid is a free Android automation app; one macro does
it. It POSTs each notification to the same `/capture` endpoint the app already uses (manual paste and
this auto-forward are identical to the backend — only the trigger differs).

## You need
- The **Porter phone** (the one that receives Porter's notifications).
- **MacroDroid** — free, Play Store.
- The **box URL** (where the cockpit runs) and the **`CAPTURE_TOKEN`** from the box's `.env`.

## The box URL (must be reachable *from the phone*)
| Situation | URL |
|---|---|
| Phone on the **same Wi-Fi** as the box (quick test) | `http://<box-LAN-IP>:3009` — e.g. `http://192.168.1.20:3009` |
| Box is **public** (production) | `https://<your-domain-or-tunnel>` — the item-2 cloudflared URL, or a real host |

## The macro — "Porter → Cockpit"
**Trigger:** *Notification Received*
- Applications → select **Porter** only.
- Leave the "text content" filter blank (catch every Porter notification).

**Action:** *HTTP Request*  (older MacroDroid versions call it "HTTP POST")

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `<BOX_URL>/capture` |
| Content Type | `application/json` |
| Header | name `x-capture-token`, value **`<YOUR_CAPTURE_TOKEN>`** (from the box's `.env`) |
| Body | `{"text":"[notification_title] — [notification_text]"}` |

> `[notification_title]` and `[notification_text]` are **magic-text variables** — don't type them by
> hand. Tap the magic-text button (the `{ }` / wand icon) in the Body field and insert *Notification
> Title* and *Notification Text*. MacroDroid then substitutes the real notification on every fire.

Save the macro and toggle it **on**. On first run Android asks for **Notification access** for
MacroDroid — grant it (the same permission the native app would need).

## Test it
1. From the phone's browser open `<BOX_URL>/health` → should show `{"ok":true}` (confirms the phone can
   reach the box).
2. Trigger any Porter notification — or in MacroDroid long-press the macro → **Test Actions**.
3. The matching delivery moves forward on the dashboard. With a token set, a wrong/missing one returns
   `401` (enable MacroDroid's "Response → store in variable" to see it).

## Notes
- If you set no `CAPTURE_TOKEN` on the box (local/LAN only), skip the header.
- Porter notifications are plain text, so the JSON body is safe. If one ever contains a `"` and breaks
  the JSON, flag it — we'll teach `/capture` to also accept form-encoded bodies.
- A free cloudflared quick-tunnel URL changes on every restart; update the macro's URL if it does, or
  host the box / use a named tunnel for a stable address.
