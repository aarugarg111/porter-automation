# Porter Cockpit — Phase 3 Design: WhatsApp Bot + AI Calling
_2026-06-20. Bridges the mock `Messenger` layer to production driver/receiver communication.
NO SMS anywhere — WhatsApp + AI voice call only. Budget for AI calling: **₹2,000/month**._

## Goal
Make the 5 coordination jobs talk to the real world: send drivers a WhatsApp pin + photo + Hindi
voice note on assignment, answer drivers' inbound calls with a Hindi AI that gives landmark-based
last-stretch directions, place outbound AI confirmation calls to receivers, and never exceed the
₹2,000/month AI-calling budget (escalate to the owner's spare phone — free — as the cap nears).

## Scope of THIS build session
Real-world resources (Porter phone online running whatsapp-web.js; paid Bolna/Exotel account) are
**not wired yet**. This session ships **production-ready adapter + orchestration code behind the
existing seams, fully unit/integration-tested against fakes** — no hardware or paid account needed
to build or verify. Real credentials load from env and plug in later with **zero rewrites**.

- **In scope:** WhatsApp adapter (whatsapp-web.js), provider-agnostic telephony interface + Bolna
  adapter, landmark knowledge base + matcher, AI-call budget tracker + spend ledger, inbound-call
  voice webhooks, and a `CoordinationService` that wires it together with budget-aware escalation.
- **Out of scope (deferred):** live QR-scan/session for the real phone, a real Bolna/Exotel account,
  Phase 4 Android notification-capture app, deployment/hosting.

## Key constraint recap
- **No SMS.** Drivers/receivers reached via WhatsApp (free) + AI voice call (paid, capped).
- **₹2,000/month** AI calling only (~400–500 min at ₹4–5/min). Cut both number-of-calls (auto-WhatsApp
  pin deflects ~40–50%) and minutes-per-call (tight Hindi script, ~1.5 min target, hard escalation
  cap at ~2–3 min). Live spend tracking → escalate to spare phone sooner as cap nears.
- All unofficial WhatsApp automation runs **only** on the dedicated Porter number **9599157340**.

## Architecture
```
                         CoordinationService
                  (budget-aware orchestrator + escalation)
                 /              |                 \
     WhatsAppMessenger      VoiceAgent          BudgetTracker
   (implements Messenger)  (TelephonyProvider)  (spend ledger, ₹2k cap)
          |                     |
     WhatsAppClient port    BolnaAdapter (Exotel +91 number)
   real: whatsapp-web.js    real: Bolna API ; fake for tests
   fake: records sends

     LandmarkKB  ──────────────► used by inbound voice flow
   (CSV → repo; match(spoken) → Hindi directions line)

     Express routes: POST /api/voice/inbound , POST /api/voice/status
```

**Seam preserved:** the existing `Messenger` interface (3 methods) is **implemented for real by
`WhatsAppMessenger`**, not reshaped — so `applyParsed` in `src/deliveries/service.ts` and all current
tests keep working unchanged. AI calling is a **separate** concern (`TelephonyProvider`), not crammed
into `Messenger`.

## Components

### 1. LandmarkKB (`src/landmarks/`)
- **Purpose:** map a landmark a driver names ("Muthoot ke paas", "Pillar 25") to the prepared
  Hindi/Hinglish directions line for the last 50 m to the shop.
- **Data:** load `docs/shop-landmark-directions-template.csv` into a `landmarks` table
  (`keyword`, `aliases`, `directions_hi`, `priority`). Seeded at startup if empty.
- **API:** `match(spoken: string): { directions: string; confidence: number } | null` — normalized
  keyword/alias containment match (lowercased, Hindi+Latin), ranked by `priority`; returns best hit
  with a confidence score. No fuzzy ML — deterministic and unit-testable.
- **Fallback:** no match → `null`; caller shares the Google Maps pin and offers owner hand-off.

### 2. BudgetTracker (`src/budget/`)
- **Purpose:** keep AI-call spend under ₹2,000 per calendar month and decide when to escalate.
- **Data:** `ai_call_spend` table (`id`, `delivery_id`, `direction` IN/OUT, `seconds`, `paise`,
  `escalated` INT, `created_at`). Rate from env `AI_CALL_PAISE_PER_MIN` (default 450).
- **API:** `record(call)`, `spentThisMonthPaise()`, `remainingPaise()`,
  `shouldEscalate(estSeconds): boolean` (true if a projected call would breach a soft threshold —
  default 85% of cap — or exceeds the per-call duration cap). Pure; clock injected for tests.

### 3. WhatsAppMessenger (`src/messenger/whatsapp.ts`)
- **Purpose:** real implementation of the existing `Messenger` interface.
- **Port:** `WhatsAppClient { sendText, sendLocation, sendImage, sendVoiceNote }`.
  - Real adapter: `WhatsAppWebClient` wrapping **whatsapp-web.js** (`LocalAuth` session, QR on first
    run, guarded to run only on 9599157340 via configured `WHATSAPP_SELF`).
  - Fake adapter: `FakeWhatsAppClient` records every send for assertions.
- **Behaviour:** `sendDriverDirections` → shop **location pin** (28.5000777, 77.3018299) + shopfront
  **photo** (`assets/shopfront.jpg` if present) + **landmark line** + Hindi **voice note**
  (`assets/directions-hi.ogg` if present; text-only if assets absent). `confirmReceiver` /
  `notifyReceiverPayment` → templated Hindi WhatsApp text. Missing assets degrade to text, never throw.

### 4. Telephony: VoiceAgent + TelephonyProvider (`src/telephony/`)
- **`TelephonyProvider` interface:** `placeOutboundCall(opts)`, `warmTransfer(callId, toPhone)`,
  `sendPinSms` is **explicitly excluded** (no SMS). Inbound is webhook-driven (below).
- **`BolnaAdapter`:** concrete default; talks to Bolna on an Exotel +91 number. Reads
  `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `EXOTEL_FROM`. Returns call ids/outcomes; throws typed errors.
- **`FakeTelephonyProvider`:** records calls/transfers for tests.
- **`VoiceAgent`:** orchestrates a call turn given `LandmarkKB`: takes the driver's spoken landmark →
  KB match → returns the Hindi directions to speak + whether to send the WhatsApp pin + confirm/hang
  up; on no-match or low confidence or over-duration → instruct **warm-transfer to owner spare phone**.

### 5. Voice webhooks (`src/api/voice.ts`)
- `POST /api/voice/inbound` — telephony posts the recognized landmark utterance + call/delivery
  context; route asks `CoordinationService` for the next AI turn and returns the directions/transfer
  instruction. `POST /api/voice/status` — terminal call status + duration → `BudgetTracker.record` +
  a `voice` event logged against the delivery. Zod-validated payloads, matching existing API style.

### 6. CoordinationService (`src/coordination/service.ts`)
- **Purpose:** the manager that wires WhatsApp + voice + budget with escalation, depends on all four
  units above. Integration layer, built **after** the parallel units land.
- **Driver inbound turn:** `LandmarkKB.match` → if confident & under budget/duration → speak
  directions + trigger `WhatsAppMessenger` pin → confirm; else `BudgetTracker.shouldEscalate` or
  no-match → `TelephonyProvider.warmTransfer` to spare phone. Records spend via `BudgetTracker`.
- **Receiver outbound (Job 4):** on `DELIVERED`, WhatsApp confirm first (free); AI call only if no
  WhatsApp ack AND budget allows.

## Data flow
1. Notification → `applyParsed` reaches `ASSIGNED` → `WhatsAppMessenger.sendDriverDirections`
   (pin + photo + landmark + voice note) — **free, deflects most calls**.
2. Driver still calls the Exotel number → `POST /api/voice/inbound` → `CoordinationService` →
   `VoiceAgent`/`LandmarkKB` → Hindi directions + pin, or warm-transfer to spare phone.
3. `POST /api/voice/status` → `BudgetTracker.record(seconds, paise)`; spend tracked vs ₹2,000.
4. `DELIVERED` → `WhatsAppMessenger.confirmReceiver` (+ payment notify); outbound AI call only if
   needed and within budget.

## Error handling
- WhatsApp client offline / QR expired → adapter throws typed `WhatsAppUnavailable`; orchestrator
  logs it and the **AI call is the fallback** (per design). Missing media assets → degrade to text.
- Telephony/Bolna error → typed error; orchestrator warm-transfers to spare phone (never silently
  drops a driver).
- Budget at/over cap → `shouldEscalate` returns true → warm-transfer; system never silently overspends.
- All env-backed creds absent in tests → adapters constructed with `Fake*` ports; no network calls.

## Testing strategy (TDD, against fakes — no hardware/account)
- `landmarks.test.ts` — match keyword/alias/priority/no-match/confidence.
- `budget.test.ts` — month boundary, record + totals, soft-threshold + duration escalation (injected clock).
- `whatsapp.test.ts` — `Messenger` methods drive correct `FakeWhatsAppClient` sends; asset-missing → text fallback.
- `telephony.test.ts` — `VoiceAgent` turn logic over `FakeTelephonyProvider` + `LandmarkKB`: confident match, no-match→transfer, over-duration→transfer.
- `voice_api.test.ts` — `/api/voice/inbound` + `/status` happy path, zod rejection, spend recorded.
- `coordination.test.ts` — end-to-end over fakes: assign→WhatsApp, inbound→directions vs escalate, delivered→confirm, budget-near-cap→escalate.
- Existing 39 tests stay green; `tsc` typecheck + clean build.

## Multi-agent execution plan
Four independent units built in **parallel** (each TDD against fakes, no shared files):
- **Agent A — LandmarkKB** (`src/landmarks/*`, schema add, `landmarks.test.ts`)
- **Agent B — BudgetTracker** (`src/budget/*`, schema add, `budget.test.ts`)
- **Agent C — WhatsAppMessenger** (`src/messenger/whatsapp.ts` + `WhatsAppClient` port + fake, `whatsapp.test.ts`)
- **Agent D — Telephony** (`src/telephony/*` provider+Bolna+fake+VoiceAgent, `telephony.test.ts`)

Then the orchestrator (me, serial, depends on all four): `CoordinationService`, `/api/voice/*`
routes, app wiring in `src/index.ts`, `coordination.test.ts` + `voice_api.test.ts`, full suite +
build verification. Schema additions (`landmarks`, `ai_call_spend`) are coordinated up front to
avoid edit collisions on `schema.sql`.

## Env vars (loaded later; absent in tests)
`WHATSAPP_SELF=9599157340`, `BOLNA_API_KEY`, `BOLNA_AGENT_ID`, `EXOTEL_FROM`,
`AI_CALL_PAISE_PER_MIN=450`, `AI_BUDGET_PAISE_PER_MONTH=200000`.
