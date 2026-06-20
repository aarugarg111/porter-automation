# Phase 0 — Porter Enterprise Outreach & API Checklist

Goal: confirm Porter Enterprise will give us programmatic access **before** any code is built.
Contacts: help@porter.in · 080 4410 4410 · https://porter.in/api-integrations

---

## A. Ready-to-send email

**To:** help@porter.in
**Subject:** Porter Enterprise + API access for daily intra-city deliveries (~20/day)

Hello Porter Enterprise team,

I run a shop and currently book around **20 Porter deliveries every day** within the city. I want
to move to **Porter Enterprise** and integrate with your **API** so I can book, track, and pay
automatically from my own system instead of doing each one manually.

Before I set everything up, could you please help me confirm a few things:

1. **Account:** How do I open a Porter Enterprise account, what KYC/documents are needed, and how
   long does activation take? Is ~20 deliveries/day (~600/month) enough to qualify?

2. **API access:** Do I get API access to:
   - Creating/booking an order programmatically
   - Cancelling an order
   - Getting live status / tracking updates (via webhooks and/or polling)
   Could you share the **API documentation** and how I receive **credentials / a sandbox**?

3. **Live tracking detail:** Does the API give the driver's **real-time location (latitude/
   longitude)**, or only status checkpoints (e.g. assigned, reached pickup, picked up, reached
   drop, delivered)? I want to show where the driver is on the route.

4. **Vehicles:** I understand the direct API currently supports **2-wheelers**. Is that correct,
   and are larger vehicles available via API? (I need to know if 2-wheeler capacity fits my
   parcels.)

5. **Payment:** How does the **prepaid wallet** work? Is payment deducted automatically per trip,
   and does the API/webhook report the **amount charged per order** and the **wallet balance**?

6. **Pricing:** What are the Enterprise rates/fees at my volume?

Thank you — happy to hop on a quick call.

Best regards,
[Your name] · [Shop name] · [Phone] · aryan.garg@flobiz.in

---

## B. Data-field checklist (confirm with Porter before building)

Tick each once Porter confirms — this is the contract Phase 1 depends on.

### Order creation (request)
- [ ] Pickup address + lat/long + contact
- [ ] Drop address + lat/long + receiver contact
- [ ] Vehicle type field + allowed values
- [ ] Parcel/notes field
- [ ] Returns: Porter **order id** + tracking URL

### Status / tracking (webhook + polling)
- [ ] Webhook callback URL registration supported
- [ ] Event types: assigned, en-route-to-pickup, reached-pickup, picked-up,
      en-route-to-drop, reached-drop, delivered, cancelled
- [ ] Each event includes timestamp + order id
- [ ] Driver **real-time lat/long** available? (Y / N — decides live map vs. status-only)
- [ ] ETA field available?
- [ ] Polling endpoint (fallback if webhook is delayed)

### Driver info
- [ ] Driver name + phone exposed (needed for auto-sending pickup pin in Phase 2)

### Call routing (for AI driver-direction calls, Phase 2)
- [ ] Can we set the **pickup-contact phone per booking** (so we can put a virtual AI number)?
- [ ] Does Porter **mask numbers** — does the driver call a Porter proxy caller-ID, or the raw
      contact number? (decides AI call-routing Option A vs B)

### Payment
- [ ] Prepaid wallet auto-deducts per trip (Y / N)
- [ ] Per-order **amount charged** reported via API/webhook
- [ ] **Wallet balance** query endpoint
- [ ] Low-balance handling / top-up method

### Auth & limits
- [ ] Auth method (API key / OAuth)
- [ ] Sandbox environment available
- [ ] Rate limits
- [ ] Cancellation cutoff/fees

---

## C. Decision gate

- **All green** → proceed to Phase 1 build (booking + tracking + auto-payment).
- **No driver lat/long** → Phase 1 ships status-checkpoint tracking (no live map dot); revisit later.
- **2-wheeler doesn't fit parcels, or API access denied** → STOP and re-scope with the user; the
  automation premise no longer holds.
