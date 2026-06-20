# Shop Location (used as BOTH pickup origin AND drop destination)

Aryan Enterprises is the user's own shop. It is **not one-way** — the app must support deliveries
in both directions:

- **Outbound (you SEND):** pickup = **this shop** → drop = customer / other shop
- **Inbound (you RECEIVE / get material):** pickup = supplier / source → drop = **this shop**

So this location can be either end of a Porter booking. Treat it as the user's "home" address that
auto-fills as **pickup** for outbound jobs and as **drop** for inbound jobs.

| Field | Value |
|---|---|
| **Business name** | Aryan Enterprises |
| **Type** | Bosch Tools Authorised Dealer · Electrical & Hardware store |
| **Address** | 446, Bankey Lal Market, opposite Red Light, Badarpur, New Delhi – 110044 |
| **Phone** | 9910774205 |
| **City / Area** | Badarpur, South East Delhi |
| **Pincode** | 110044 |
| **Latitude** | 28.5000777 |
| **Longitude** | 77.3018299 |
| **Google Maps pin** | https://maps.app.goo.gl/6nvqDxUDgt8QVQDy6 |
| **Place ID (Google)** | /g/11rsqfbzrs |
| **Role in app** | HOME location — default pickup (outbound) and default drop (inbound) |

Source: Bosch official dealer locator + user's Google Maps share link (verified — listing name
matches exactly). ✅ Fully captured and ready for Porter API booking in either direction.

## Impact on the app design
- A **delivery** has a `direction` field: `OUTBOUND` (send) or `INBOUND` (receive).
- The saved-locations directory (see delivery-destinations-template.csv) holds the **other end** —
  these are both **customers/drop points** (outbound) AND **suppliers/source points** (inbound).
- Booking flow: pick direction → the shop auto-fills on the correct end → pick the other location
  from the directory → confirm.
- Tracking + alerts work the same both ways; for INBOUND the "reached delivery area" milestone means
  the driver is approaching **your shop**.
