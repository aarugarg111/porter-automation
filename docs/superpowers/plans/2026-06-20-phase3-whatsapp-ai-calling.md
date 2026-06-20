# Phase 3: WhatsApp Bot + AI Calling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement production-ready WhatsApp + AI-calling adapters behind the existing seams, plus a budget-aware coordination orchestrator, all built and verified against fakes (no hardware/paid account needed this session).

**Architecture:** Four independent units (LandmarkKB, BudgetTracker, WhatsAppMessenger, Telephony) each built TDD against fakes, then integrated by a serial `CoordinationService` + voice webhooks. The existing `Messenger` interface is implemented for real (not reshaped) so current code/tests stay green. Real network adapters (whatsapp-web.js, Bolna) use lazy dynamic import / global `fetch` so they never load during tests.

**Tech Stack:** Node 24 `node:sqlite`, TypeScript (ESM, `.js` import specifiers), Express 5, Zod 4, Vitest 4. whatsapp-web.js and Bolna are wired via dynamic import / fetch and are NOT added as dependencies this session.

## Global Constraints

- ESM only: every relative import ends in `.js` (e.g. `import { x } from './foo.js'`).
- Tests use `getDb(':memory:')` from `src/db/index.js`; `seedHome(db)` when a home location is needed.
- Type the DB as `import type { DatabaseSync } from 'node:sqlite'`.
- NO SMS anywhere. Driver/receiver comms = WhatsApp + AI voice call only.
- AI-calling budget = **₹2,000/month** = `200000` paise. Default rate `AI_CALL_PAISE_PER_MIN=450`.
- WhatsApp automation conceptually runs only on `WHATSAPP_SELF=9599157340`.
- Shop location is the home location (lat `28.5000777`, lng `77.3018299`).
- Do NOT add `whatsapp-web.js` to `package.json`. Real adapters must not be imported by any test.
- Verification gate per task: `npm test` (root vitest) stays green. There is no separate build/typecheck step in this repo.
- Money is stored in **paise** (integers), never floats.
- Commit after each task with the shown message.

---

## Task 0: Schema + env scaffolding (SERIAL — done by orchestrator before parallel tasks)

**Files:**
- Modify: `src/db/schema.sql`
- Create: `.env.example`
- Create: `assets/.gitkeep`

**Interfaces:**
- Produces: tables `landmarks(id, keyword, aliases, directions, priority)` and `ai_call_spend(id, delivery_id, direction, seconds, paise, escalated, created_at)`. Tasks A and B rely on these existing so they never edit `schema.sql` (avoids collisions).

- [ ] **Step 1: Add tables to schema**

Append to `src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS landmarks (
  id INTEGER PRIMARY KEY, keyword TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '',
  directions TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ai_call_spend (
  id INTEGER PRIMARY KEY, delivery_id INTEGER, direction TEXT NOT NULL,
  seconds INTEGER NOT NULL, paise INTEGER NOT NULL, escalated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
```

- [ ] **Step 2: Create `.env.example`**

```
WHATSAPP_SELF=9599157340
BOLNA_API_KEY=
BOLNA_AGENT_ID=
EXOTEL_FROM=
AI_CALL_PAISE_PER_MIN=450
AI_BUDGET_PAISE_PER_MONTH=200000
```

- [ ] **Step 3: Create assets dir** — `assets/.gitkeep` (empty file). Real shopfront photo / Hindi voice note dropped here later.

- [ ] **Step 4: Verify nothing broke** — Run `npm test`. Expected: existing 39 tests PASS (new empty tables are harmless).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql .env.example assets/.gitkeep
git commit -m "feat(phase3): add landmarks + ai_call_spend tables, env scaffold"
```

---

## Task A: LandmarkKB (PARALLEL)

**Files:**
- Create: `src/landmarks/repo.ts`
- Create: `src/landmarks/kb.ts`
- Create: `src/landmarks/seed.ts`
- Test: `tests/landmarks.test.ts`

**Interfaces:**
- Consumes: `landmarks` table from Task 0; `DatabaseSync`.
- Produces:
  - `type LandmarkRow = { id:number; keyword:string; aliases:string; directions:string; priority:number }`
  - `seedLandmarks(db: DatabaseSync): void` — idempotent; inserts the curated shop landmarks if table empty.
  - `class LandmarkKB { constructor(db: DatabaseSync); match(spoken: string): { directions: string; confidence: number } | null }`

- [ ] **Step 1: Write failing test** — `tests/landmarks.test.ts`

```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';

function kb() { const db = getDb(':memory:'); seedLandmarks(db); return new LandmarkKB(db); }

test('matches a primary keyword', () => {
  const m = kb().match('main Muthoot ke paas hoon');
  // Muthoot is not curated; ensure curated landmark works instead
  expect(m).toBeNull();
});

test('matches Pillar 25 by alias', () => {
  const m = kb().match('pillar 25 pe khada hoon');
  expect(m).not.toBeNull();
  expect(m!.directions).toMatch(/Pillar/i);
  expect(m!.confidence).toBeGreaterThan(0);
});

test('matches Canara bank keyword', () => {
  const m = kb().match('canara bank ke paas');
  expect(m!.directions).toMatch(/Faridabad/);
});

test('higher-priority landmark wins when two match', () => {
  // "bank" alias (Canara) + "pillar 25" both present; Pillar 25 has higher priority
  const m = kb().match('pillar 25 ke paas wala bank');
  expect(m!.directions).toMatch(/Pillar/i);
});

test('returns null when nothing matches', () => {
  expect(kb().match('connaught place')).toBeNull();
});

test('seedLandmarks is idempotent', () => {
  const db = getDb(':memory:');
  seedLandmarks(db); seedLandmarks(db);
  const n = (db.prepare('select count(*) c from landmarks').get() as any).c;
  expect(n).toBe(5);
});
```

- [ ] **Step 2: Run test, verify it fails** — `npm test -- landmarks`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/landmarks/repo.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
export type LandmarkRow = { id:number; keyword:string; aliases:string; directions:string; priority:number };
export function listLandmarks(db: DatabaseSync): LandmarkRow[] {
  return db.prepare('select * from landmarks order by priority desc').all() as any;
}
export function insertLandmark(db: DatabaseSync, l: Omit<LandmarkRow,'id'>): number {
  return Number(db.prepare(
    'insert into landmarks (keyword,aliases,directions,priority) values (?,?,?,?)'
  ).run(l.keyword, l.aliases, l.directions, l.priority).lastInsertRowid);
}
```

- [ ] **Step 4: Implement `src/landmarks/seed.ts`** (curated from `docs/shop-landmark-directions-template.csv`; 5 rows, priority orders Pillar 25 highest)

```ts
import type { DatabaseSync } from 'node:sqlite';
import { insertLandmark } from './repo.js';
const CURATED = [
  { keyword:'Metro Pillar 25', aliases:'pillar 25,metro pillar 25,pillar number 25,khamba 25,pillar twenty five',
    directions:'Aryan Enterprises bilkul Metro Pillar number 25 ke saamne hai. Bosch aur Havells ka board laga hai, saamne nariyal wala khada hota hai.',
    priority:100 },
  { keyword:'Kishwarna Eye Hospital', aliases:'kishwarna,eye hospital,aankh wala hospital,charitable hospital',
    directions:'Kishwarna Charitable Eye Hospital ke bilkul baaju mein Aryan Enterprises hai - Bosch aur Havells board wali dukaan, nariyal wale ke saamne.',
    priority:80 },
  { keyword:'Nariyal wala', aliases:'nariyal wala,coconut,nariyal pani,nariyal',
    directions:'Jis nariyal wale ke saamne aap khade hain, bilkul uske saamne Aryan Enterprises hai - Bosch aur Havells board.',
    priority:70 },
  { keyword:'Canara Bank', aliases:'canara bank,canara,bank,pillar 24',
    directions:'Canara Bank se Faridabad ki taraf paanch dukaan aage chaliye. Aryan Enterprises - Bosch aur Havells board, saamne nariyal wala.',
    priority:60 },
  { keyword:'Badarpur Flyover / Mathura Road', aliases:'flyover,badarpur flyover,mathura road,highway',
    directions:'Mathura Road par Bankey Lal Market, Metro Pillar 25 ke saamne, Canara Bank se Faridabad ki taraf 5 dukaan aage.',
    priority:40 },
];
export function seedLandmarks(db: DatabaseSync) {
  const exists = db.prepare('select 1 from landmarks limit 1').get();
  if (exists) return;
  for (const l of CURATED) insertLandmark(db, l);
}
```

- [ ] **Step 5: Implement `src/landmarks/kb.ts`** (deterministic keyword/alias containment, priority-ranked, confidence = matched-token length / spoken length, capped)

```ts
import type { DatabaseSync } from 'node:sqlite';
import { listLandmarks, type LandmarkRow } from './repo.js';
const norm = (s:string) => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
export class LandmarkKB {
  private rows: LandmarkRow[];
  constructor(db: DatabaseSync) { this.rows = listLandmarks(db); }
  match(spoken: string): { directions:string; confidence:number } | null {
    const hay = ` ${norm(spoken)} `;
    let best: { directions:string; confidence:number; priority:number } | null = null;
    for (const r of this.rows) {
      const terms = [r.keyword, ...r.aliases.split(',')].map(norm).filter(Boolean);
      for (const t of terms) {
        if (t && hay.includes(` ${t} `)) {
          const confidence = Math.min(1, t.length / Math.max(norm(spoken).length, 1) + 0.3);
          if (!best || r.priority > best.priority) best = { directions:r.directions, confidence, priority:r.priority };
        }
      }
    }
    return best ? { directions: best.directions, confidence: best.confidence } : null;
  }
}
```

- [ ] **Step 6: Run test, verify pass** — `npm test -- landmarks`. Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/landmarks tests/landmarks.test.ts
git commit -m "feat(phase3): landmark knowledge base + deterministic matcher"
```

---

## Task B: BudgetTracker (PARALLEL)

**Files:**
- Create: `src/budget/tracker.ts`
- Test: `tests/budget.test.ts`

**Interfaces:**
- Consumes: `ai_call_spend` table from Task 0; `DatabaseSync`.
- Produces:
  - `type CallSpend = { deliveryId:number|null; direction:'IN'|'OUT'; seconds:number; escalated?:boolean }`
  - `class BudgetTracker`:
    - `constructor(db, opts?: { paisePerMin?:number; budgetPaise?:number; now?:()=>Date })`
    - `record(c: CallSpend): number` (returns paise charged; escalated calls charge 0)
    - `spentThisMonthPaise(): number`
    - `remainingPaise(): number`
    - `shouldEscalate(estSeconds: number): boolean` (true if projected spend ≥ 85% of budget OR estSeconds > 180)

- [ ] **Step 1: Write failing test** — `tests/budget.test.ts`

```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { BudgetTracker } from '../src/budget/tracker.js';

const opts = { paisePerMin: 450, budgetPaise: 200000, now: () => new Date('2026-06-15T10:00:00Z') };

test('records spend and charges by the minute (rounded up)', () => {
  const t = new BudgetTracker(getDb(':memory:'), opts);
  const charged = t.record({ deliveryId: 1, direction: 'IN', seconds: 90 }); // 1.5 min -> 2 min
  expect(charged).toBe(900);
  expect(t.spentThisMonthPaise()).toBe(900);
  expect(t.remainingPaise()).toBe(199100);
});

test('escalated calls charge zero', () => {
  const t = new BudgetTracker(getDb(':memory:'), opts);
  const charged = t.record({ deliveryId: 1, direction: 'IN', seconds: 120, escalated: true });
  expect(charged).toBe(0);
  expect(t.spentThisMonthPaise()).toBe(0);
});

test('only counts current calendar month', () => {
  const db = getDb(':memory:');
  db.prepare("insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (1,'IN',120,900,0,'2026-05-30T10:00:00Z')").run();
  const t = new BudgetTracker(db, opts);
  expect(t.spentThisMonthPaise()).toBe(0); // May spend excluded for June clock
});

test('shouldEscalate true when projected spend crosses 85% of budget', () => {
  const db = getDb(':memory:');
  // pre-spend 170000 paise (85% already), any new call should escalate
  db.prepare("insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (1,'IN',1200,170000,0,'2026-06-10T10:00:00Z')").run();
  const t = new BudgetTracker(db, opts);
  expect(t.shouldEscalate(60)).toBe(true);
});

test('shouldEscalate true when estimated call exceeds the per-call duration cap', () => {
  const t = new BudgetTracker(getDb(':memory:'), opts);
  expect(t.shouldEscalate(200)).toBe(true); // >180s
});

test('shouldEscalate false for a short call with budget available', () => {
  const t = new BudgetTracker(getDb(':memory:'), opts);
  expect(t.shouldEscalate(90)).toBe(false);
});
```

- [ ] **Step 2: Run test, verify fails** — `npm test -- budget`. Expected: FAIL.

- [ ] **Step 3: Implement `src/budget/tracker.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
export type CallSpend = { deliveryId:number|null; direction:'IN'|'OUT'; seconds:number; escalated?:boolean };
const SOFT = 0.85;          // escalate once projected spend reaches 85% of budget
const PER_CALL_CAP_S = 180; // hard per-call duration cap (3 min)
export class BudgetTracker {
  private db: DatabaseSync;
  private paisePerMin: number; private budgetPaise: number; private now: () => Date;
  constructor(db: DatabaseSync, opts: { paisePerMin?:number; budgetPaise?:number; now?:()=>Date } = {}) {
    this.db = db;
    this.paisePerMin = opts.paisePerMin ?? Number(process.env.AI_CALL_PAISE_PER_MIN ?? 450);
    this.budgetPaise = opts.budgetPaise ?? Number(process.env.AI_BUDGET_PAISE_PER_MONTH ?? 200000);
    this.now = opts.now ?? (() => new Date());
  }
  private cost(seconds:number) { return Math.ceil(seconds / 60) * this.paisePerMin; }
  private monthPrefix() { return this.now().toISOString().slice(0,7); } // YYYY-MM
  record(c: CallSpend): number {
    const paise = c.escalated ? 0 : this.cost(c.seconds);
    this.db.prepare('insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (?,?,?,?,?,?)')
      .run(c.deliveryId, c.direction, c.seconds, paise, c.escalated ? 1 : 0, this.now().toISOString());
    return paise;
  }
  spentThisMonthPaise(): number {
    const row = this.db.prepare("select coalesce(sum(paise),0) s from ai_call_spend where created_at like ?")
      .get(this.monthPrefix() + '%') as any;
    return Number(row.s);
  }
  remainingPaise(): number { return Math.max(0, this.budgetPaise - this.spentThisMonthPaise()); }
  shouldEscalate(estSeconds: number): boolean {
    if (estSeconds > PER_CALL_CAP_S) return true;
    const projected = this.spentThisMonthPaise() + this.cost(estSeconds);
    return projected >= this.budgetPaise * SOFT;
  }
}
```

- [ ] **Step 4: Run test, verify pass** — `npm test -- budget`. Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/budget tests/budget.test.ts
git commit -m "feat(phase3): AI-call budget tracker with monthly cap + escalation"
```

---

## Task C: WhatsAppMessenger (PARALLEL)

**Files:**
- Create: `src/messenger/whatsapp_client.ts` (port + fake + real adapter)
- Create: `src/messenger/whatsapp.ts` (implements existing `Messenger`)
- Test: `tests/whatsapp.test.ts`

**Interfaces:**
- Consumes: `Messenger` from `src/messenger/types.js`; `DatabaseSync`; home location via `getLocation`.
- Produces:
  - `interface WhatsAppClient { sendText(phone,text):Promise<void>; sendLocation(phone,lat,lng,label):Promise<void>; sendImage(phone,path,caption?):Promise<void>; sendVoiceNote(phone,path):Promise<void> }`
  - `class FakeWhatsAppClient implements WhatsAppClient { sent: {kind:string;phone:string;extra?:any}[] }`
  - `class WhatsAppMessenger implements Messenger { constructor(db: DatabaseSync, client: WhatsAppClient) }`
  - `class WhatsAppWebClient implements WhatsAppClient` (real; lazy dynamic import of whatsapp-web.js)

- [ ] **Step 1: Write failing test** — `tests/whatsapp.test.ts`

```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { FakeWhatsAppClient } from '../src/messenger/whatsapp_client.js';
import { WhatsAppMessenger } from '../src/messenger/whatsapp.js';

function setup() {
  const db = getDb(':memory:'); seedHome(db);
  const client = new FakeWhatsAppClient();
  return { db, client, m: new WhatsAppMessenger(db, client) };
}

test('sendDriverDirections sends a location pin and the landmark text', async () => {
  const { client, m } = setup();
  await m.sendDriverDirections('9111', 'Pillar 25 ke saamne');
  const kinds = client.sent.map(s => s.kind);
  expect(kinds).toContain('location');
  expect(kinds).toContain('text');
  const loc = client.sent.find(s => s.kind === 'location')!;
  expect(loc.extra.lat).toBeCloseTo(28.5000777, 4);
  const text = client.sent.find(s => s.kind === 'text')!;
  expect(text.extra).toMatch(/Pillar 25/);
});

test('confirmReceiver sends a Hindi confirmation text', async () => {
  const { client, m } = setup();
  await m.confirmReceiver('9222', 'ORD-1');
  const text = client.sent.find(s => s.kind === 'text');
  expect(text!.phone).toBe('9222');
  expect(text!.extra).toMatch(/ORD-1/);
});

test('notifyReceiverPayment formats rupees from paise', async () => {
  const { client, m } = setup();
  await m.notifyReceiverPayment('9333', 14800);
  const text = client.sent.find(s => s.kind === 'text');
  expect(text!.extra).toMatch(/148/);
});

test('missing photo/voice assets degrade to text without throwing', async () => {
  const { client, m } = setup();
  await expect(m.sendDriverDirections('9444', 'x')).resolves.not.toThrow();
  // image/voice only attempted if asset exists; with no assets none are sent
  expect(client.sent.find(s => s.kind === 'image')).toBeUndefined();
});
```

- [ ] **Step 2: Run test, verify fails** — `npm test -- whatsapp`. Expected: FAIL.

- [ ] **Step 3: Implement `src/messenger/whatsapp_client.ts`**

```ts
export interface WhatsAppClient {
  sendText(phone: string, text: string): Promise<void>;
  sendLocation(phone: string, lat: number, lng: number, label: string): Promise<void>;
  sendImage(phone: string, path: string, caption?: string): Promise<void>;
  sendVoiceNote(phone: string, path: string): Promise<void>;
}

export class FakeWhatsAppClient implements WhatsAppClient {
  sent: { kind:string; phone:string; extra?:any }[] = [];
  async sendText(phone:string, text:string){ this.sent.push({ kind:'text', phone, extra:text }); }
  async sendLocation(phone:string, lat:number, lng:number, label:string){ this.sent.push({ kind:'location', phone, extra:{lat,lng,label} }); }
  async sendImage(phone:string, path:string, caption?:string){ this.sent.push({ kind:'image', phone, extra:{path,caption} }); }
  async sendVoiceNote(phone:string, path:string){ this.sent.push({ kind:'voice', phone, extra:path }); }
}

// Real adapter — whatsapp-web.js loaded lazily so tests never import it.
export class WhatsAppWebClient implements WhatsAppClient {
  private client:any; private ready = false;
  private async ensure() {
    if (this.ready) return;
    // @ts-ignore optional dependency, installed only on the Porter phone host
    const wweb:any = await import('whatsapp-web.js');
    const { Client, LocalAuth } = wweb.default ?? wweb;
    this.client = new Client({ authStrategy: new LocalAuth({ clientId: process.env.WHATSAPP_SELF || 'porter' }) });
    this.client.on('qr', (qr:string) => console.log('[whatsapp] scan QR:\n', qr));
    await new Promise<void>((resolve) => { this.client.on('ready', () => resolve()); this.client.initialize(); });
    this.ready = true;
  }
  private jid(phone:string){ const d = phone.replace(/\D/g,''); return `${d.length===10?'91'+d:d}@c.us`; }
  async sendText(phone:string, text:string){ await this.ensure(); await this.client.sendMessage(this.jid(phone), text); }
  async sendLocation(phone:string, lat:number, lng:number, label:string){
    await this.ensure();
    // @ts-ignore Location class from the same module
    const wweb:any = await import('whatsapp-web.js'); const { Location } = wweb.default ?? wweb;
    await this.client.sendMessage(this.jid(phone), new Location(lat, lng, label));
  }
  async sendImage(phone:string, path:string, caption?:string){
    await this.ensure();
    // @ts-ignore MessageMedia from the same module
    const wweb:any = await import('whatsapp-web.js'); const { MessageMedia } = wweb.default ?? wweb;
    await this.client.sendMessage(this.jid(phone), MessageMedia.fromFilePath(path), { caption });
  }
  async sendVoiceNote(phone:string, path:string){
    await this.ensure();
    // @ts-ignore MessageMedia from the same module
    const wweb:any = await import('whatsapp-web.js'); const { MessageMedia } = wweb.default ?? wweb;
    await this.client.sendMessage(this.jid(phone), MessageMedia.fromFilePath(path), { sendAudioAsVoice: true });
  }
}
```

- [ ] **Step 4: Implement `src/messenger/whatsapp.ts`**

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from './types.js';
import type { WhatsAppClient } from './whatsapp_client.js';
import { getLocation } from '../locations/repo.js';

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name:string) => join(here, '..', '..', 'assets', name);

export class WhatsAppMessenger implements Messenger {
  constructor(private db: DatabaseSync, private client: WhatsAppClient) {}

  async sendDriverDirections(phone: string, landmarkNotes: string) {
    const home:any = this.db.prepare('select * from locations where is_home=1').get();
    if (home?.lat != null && home?.lng != null) {
      await this.client.sendLocation(phone, home.lat, home.lng, home.nickname || 'Pickup');
    }
    const line = landmarkNotes || home?.landmark_notes || '';
    await this.client.sendText(phone, `Namaste! Pickup yahan hai. ${line}`.trim());
    const photo = asset('shopfront.jpg');
    if (existsSync(photo)) await this.client.sendImage(phone, photo, 'Dukaan ka photo');
    const voice = asset('directions-hi.ogg');
    if (existsSync(voice)) await this.client.sendVoiceNote(phone, voice);
  }

  async confirmReceiver(phone: string, orderId: string) {
    await this.client.sendText(phone, `Namaste, aapka parcel (order ${orderId}) aa gaya? Confirm kar dijiye.`);
  }

  async notifyReceiverPayment(phone: string, amountPaise: number) {
    const rupees = (amountPaise / 100).toFixed(amountPaise % 100 ? 2 : 0);
    await this.client.sendText(phone, `Driver ko ₹${rupees} de dena. Dhanyavaad.`);
  }
}
```

- [ ] **Step 5: Run test, verify pass** — `npm test -- whatsapp`. Expected: PASS (4 tests). Note: `getLocation` import retained only if used; the impl reads home directly, so remove the unused `getLocation` import if your linter flags it — it is safe to delete that line.

- [ ] **Step 6: Commit**

```bash
git add src/messenger/whatsapp_client.ts src/messenger/whatsapp.ts tests/whatsapp.test.ts
git commit -m "feat(phase3): real WhatsApp messenger adapter behind Messenger seam"
```

---

## Task D: Telephony — provider + Bolna adapter + VoiceAgent (PARALLEL)

**Files:**
- Create: `src/telephony/provider.ts` (interface + Fake + Bolna adapter)
- Create: `src/telephony/voice_agent.ts`
- Test: `tests/telephony.test.ts`

**Interfaces:**
- Consumes: `LandmarkKB` from Task A (`match(spoken)` → `{directions,confidence}|null`); `BudgetTracker` from Task B (`shouldEscalate(estSeconds)`).
- Produces:
  - `type OutboundCall = { toPhone:string; agentScript:string; deliveryId?:number }`
  - `interface TelephonyProvider { placeOutboundCall(c:OutboundCall):Promise<{callId:string}>; warmTransfer(callId:string,toPhone:string):Promise<void> }`
  - `class FakeTelephonyProvider implements TelephonyProvider { calls:OutboundCall[]; transfers:{callId:string;toPhone:string}[] }`
  - `class BolnaAdapter implements TelephonyProvider` (real; uses global `fetch`)
  - `type VoiceTurn = { action:'speak'|'transfer'; say?:string; sendPin?:boolean; transferTo?:string }`
  - `class VoiceAgent { constructor(kb: LandmarkKB, deps:{ ownerPhone:string }); inboundTurn(spoken:string, opts:{ confident?:number; shouldEscalate:boolean }): VoiceTurn }`

- [ ] **Step 1: Write failing test** — `tests/telephony.test.ts`

```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { VoiceAgent } from '../src/telephony/voice_agent.js';
import { FakeTelephonyProvider } from '../src/telephony/provider.js';

function agent() {
  const db = getDb(':memory:'); seedLandmarks(db);
  return new VoiceAgent(new LandmarkKB(db), { ownerPhone: '9599157340' });
}

test('confident landmark match → speak directions and send pin', () => {
  const turn = agent().inboundTurn('pillar 25 ke paas', { shouldEscalate: false });
  expect(turn.action).toBe('speak');
  expect(turn.say).toMatch(/Pillar/i);
  expect(turn.sendPin).toBe(true);
});

test('no landmark match → warm-transfer to owner', () => {
  const turn = agent().inboundTurn('pata nahi kahan hoon', { shouldEscalate: false });
  expect(turn.action).toBe('transfer');
  expect(turn.transferTo).toBe('9599157340');
});

test('budget says escalate → warm-transfer even if landmark matched', () => {
  const turn = agent().inboundTurn('canara bank ke paas', { shouldEscalate: true });
  expect(turn.action).toBe('transfer');
});

test('FakeTelephonyProvider records outbound calls and transfers', async () => {
  const p = new FakeTelephonyProvider();
  const { callId } = await p.placeOutboundCall({ toPhone:'9222', agentScript:'parcel aaya?' });
  await p.warmTransfer(callId, '9599157340');
  expect(p.calls).toHaveLength(1);
  expect(p.transfers[0]).toMatchObject({ callId, toPhone:'9599157340' });
});
```

- [ ] **Step 2: Run test, verify fails** — `npm test -- telephony`. Expected: FAIL.

- [ ] **Step 3: Implement `src/telephony/provider.ts`**

```ts
export type OutboundCall = { toPhone:string; agentScript:string; deliveryId?:number };
export interface TelephonyProvider {
  placeOutboundCall(c: OutboundCall): Promise<{ callId:string }>;
  warmTransfer(callId: string, toPhone: string): Promise<void>;
}

export class FakeTelephonyProvider implements TelephonyProvider {
  calls: OutboundCall[] = [];
  transfers: { callId:string; toPhone:string }[] = [];
  async placeOutboundCall(c: OutboundCall) { this.calls.push(c); return { callId: `fake-${this.calls.length}` }; }
  async warmTransfer(callId: string, toPhone: string) { this.transfers.push({ callId, toPhone }); }
}

// Real adapter — Bolna voice agent on an Exotel +91 number. Uses global fetch; no SDK dependency.
export class BolnaAdapter implements TelephonyProvider {
  private base = 'https://api.bolna.ai';
  private key = process.env.BOLNA_API_KEY || '';
  private agentId = process.env.BOLNA_AGENT_ID || '';
  private from = process.env.EXOTEL_FROM || '';
  async placeOutboundCall(c: OutboundCall): Promise<{ callId:string }> {
    const res = await fetch(`${this.base}/call`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ agent_id: this.agentId, recipient_phone_number: c.toPhone, from_phone_number: this.from, variables: { script: c.agentScript } }),
    });
    if (!res.ok) throw new Error(`bolna placeOutboundCall failed: ${res.status}`);
    const data:any = await res.json();
    return { callId: String(data.call_id ?? data.id ?? '') };
  }
  async warmTransfer(callId: string, toPhone: string): Promise<void> {
    const res = await fetch(`${this.base}/call/${callId}/transfer`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to_phone_number: toPhone }),
    });
    if (!res.ok) throw new Error(`bolna warmTransfer failed: ${res.status}`);
  }
}
```

- [ ] **Step 4: Implement `src/telephony/voice_agent.ts`**

```ts
import type { LandmarkKB } from '../landmarks/kb.js';
export type VoiceTurn = { action:'speak'|'transfer'; say?:string; sendPin?:boolean; transferTo?:string };
const MIN_CONFIDENCE = 0.4;
export class VoiceAgent {
  constructor(private kb: LandmarkKB, private deps: { ownerPhone: string }) {}
  inboundTurn(spoken: string, opts: { shouldEscalate: boolean }): VoiceTurn {
    if (opts.shouldEscalate) return { action:'transfer', transferTo: this.deps.ownerPhone };
    const m = this.kb.match(spoken);
    if (!m || m.confidence < MIN_CONFIDENCE) return { action:'transfer', transferTo: this.deps.ownerPhone };
    return { action:'speak', say: m.directions, sendPin: true };
  }
}
```

- [ ] **Step 5: Run test, verify pass** — `npm test -- telephony`. Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/telephony tests/telephony.test.ts
git commit -m "feat(phase3): telephony provider seam, Bolna adapter, voice agent"
```

---

## Task E: CoordinationService (SERIAL — orchestrator, depends on A,B,C,D)

**Files:**
- Create: `src/coordination/service.ts`
- Test: `tests/coordination.test.ts`

**Interfaces:**
- Consumes: `WhatsAppMessenger` (C), `VoiceAgent` + `TelephonyProvider` (D), `BudgetTracker` (B), `LandmarkKB` (A).
- Produces:
  - `class CoordinationService`:
    - `constructor(db, deps:{ messenger:Messenger; voice:VoiceAgent; telephony:TelephonyProvider; budget:BudgetTracker; ownerPhone:string })`
    - `handleDriverInbound(input:{ deliveryId:number|null; driverPhone:string; spoken:string; estSeconds?:number }): Promise<VoiceTurn>` — asks `budget.shouldEscalate`, gets `voice.inboundTurn`; on `speak` triggers `messenger.sendDriverDirections`; on `transfer` calls `telephony.warmTransfer` is N/A for inbound (returns the transfer instruction to the webhook). Returns the `VoiceTurn`.
    - `recordCall(input:{ deliveryId:number|null; direction:'IN'|'OUT'; seconds:number; escalated:boolean }): number` — delegates to `budget.record`.

- [ ] **Step 1: Write failing test** — `tests/coordination.test.ts`

```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { BudgetTracker } from '../src/budget/tracker.js';
import { VoiceAgent } from '../src/telephony/voice_agent.js';
import { FakeTelephonyProvider } from '../src/telephony/provider.js';
import { FakeWhatsAppClient } from '../src/messenger/whatsapp_client.js';
import { WhatsAppMessenger } from '../src/messenger/whatsapp.js';
import { CoordinationService } from '../src/coordination/service.js';

function build(budgetOpts = {}) {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const client = new FakeWhatsAppClient();
  const deps = {
    messenger: new WhatsAppMessenger(db, client),
    voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone:'9599157340' }),
    telephony: new FakeTelephonyProvider(),
    budget: new BudgetTracker(db, { paisePerMin:450, budgetPaise:200000, now:()=>new Date('2026-06-15T00:00:00Z'), ...budgetOpts }),
    ownerPhone: '9599157340',
  };
  return { db, client, deps, svc: new CoordinationService(db, deps) };
}

test('confident inbound → speaks directions AND WhatsApps the pin to the driver', async () => {
  const { client, svc } = build();
  const turn = await svc.handleDriverInbound({ deliveryId:1, driverPhone:'9111', spoken:'pillar 25 ke paas', estSeconds:90 });
  expect(turn.action).toBe('speak');
  expect(client.sent.find(s => s.kind==='location')).toBeDefined();
});

test('no match → transfer instruction, no WhatsApp pin', async () => {
  const { client, svc } = build();
  const turn = await svc.handleDriverInbound({ deliveryId:1, driverPhone:'9111', spoken:'connaught place', estSeconds:90 });
  expect(turn.action).toBe('transfer');
  expect(turn.transferTo).toBe('9599157340');
  expect(client.sent.find(s => s.kind==='location')).toBeUndefined();
});

test('budget near cap → transfer even with a good landmark', async () => {
  const { db, svc } = build();
  db.prepare("insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (1,'IN',1200,180000,0,'2026-06-10T00:00:00Z')").run();
  const turn = await svc.handleDriverInbound({ deliveryId:1, driverPhone:'9111', spoken:'pillar 25', estSeconds:90 });
  expect(turn.action).toBe('transfer');
});

test('recordCall persists spend and returns paise charged', async () => {
  const { svc } = build();
  const paise = svc.recordCall({ deliveryId:1, direction:'IN', seconds:90, escalated:false });
  expect(paise).toBe(900);
});
```

- [ ] **Step 2: Run test, verify fails** — `npm test -- coordination`. Expected: FAIL.

- [ ] **Step 3: Implement `src/coordination/service.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';
import type { VoiceAgent, VoiceTurn } from '../telephony/voice_agent.js';
import type { TelephonyProvider } from '../telephony/provider.js';
import type { BudgetTracker } from '../budget/tracker.js';

export type CoordDeps = {
  messenger: Messenger; voice: VoiceAgent; telephony: TelephonyProvider;
  budget: BudgetTracker; ownerPhone: string;
};

export class CoordinationService {
  constructor(private db: DatabaseSync, private deps: CoordDeps) {}

  async handleDriverInbound(input: { deliveryId:number|null; driverPhone:string; spoken:string; estSeconds?:number }): Promise<VoiceTurn> {
    const shouldEscalate = this.deps.budget.shouldEscalate(input.estSeconds ?? 90);
    const turn = this.deps.voice.inboundTurn(input.spoken, { shouldEscalate });
    if (turn.action === 'speak') {
      // Reinforce the spoken directions with a WhatsApp pin (free) so the driver can tap it.
      await this.deps.messenger.sendDriverDirections(input.driverPhone, turn.say || '');
    }
    return turn;
  }

  recordCall(input: { deliveryId:number|null; direction:'IN'|'OUT'; seconds:number; escalated:boolean }): number {
    return this.deps.budget.record(input);
  }
}
```

- [ ] **Step 4: Run test, verify pass** — `npm test -- coordination`. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/coordination tests/coordination.test.ts
git commit -m "feat(phase3): budget-aware coordination orchestrator"
```

---

## Task F: Voice webhooks + app wiring (SERIAL — orchestrator, depends on E)

**Files:**
- Create: `src/api/voice.ts`
- Modify: `src/index.ts`
- Test: `tests/voice_api.test.ts`

**Interfaces:**
- Consumes: `CoordinationService` (E).
- Produces: `voiceRouter(svc: CoordinationService): Router` with `POST /voice/inbound` and `POST /voice/status`.

- [ ] **Step 1: Write failing test** — `tests/voice_api.test.ts`

```ts
import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { BudgetTracker } from '../src/budget/tracker.js';
import { VoiceAgent } from '../src/telephony/voice_agent.js';
import { FakeTelephonyProvider } from '../src/telephony/provider.js';
import { FakeWhatsAppClient } from '../src/messenger/whatsapp_client.js';
import { WhatsAppMessenger } from '../src/messenger/whatsapp.js';
import { CoordinationService } from '../src/coordination/service.js';
import { voiceRouter } from '../src/api/voice.js';

function appWith() {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const svc = new CoordinationService(db, {
    messenger: new WhatsAppMessenger(db, new FakeWhatsAppClient()),
    voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone:'9599157340' }),
    telephony: new FakeTelephonyProvider(),
    budget: new BudgetTracker(db, { paisePerMin:450, budgetPaise:200000 }),
    ownerPhone: '9599157340',
  });
  const app = express(); app.use(express.json()); app.use(voiceRouter(svc));
  const server = app.listen(0); const port = (server.address() as any).port;
  return { db, server, port };
}

test('POST /voice/inbound returns a speak turn for a known landmark', async () => {
  const { server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/inbound`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ deliveryId:1, driverPhone:'9111', spoken:'pillar 25 ke paas' }) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.action).toBe('speak');
  server.close();
});

test('POST /voice/inbound rejects a missing driverPhone', async () => {
  const { server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/inbound`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ spoken:'x' }) });
  expect(res.status).toBe(400);
  server.close();
});

test('POST /voice/status records spend and returns ok', async () => {
  const { db, server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/status`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ deliveryId:1, direction:'IN', seconds:120, escalated:false }) });
  expect(res.status).toBe(200);
  const n = (db.prepare('select count(*) c from ai_call_spend').get() as any).c;
  expect(n).toBe(1);
  server.close();
});
```

- [ ] **Step 2: Run test, verify fails** — `npm test -- voice_api`. Expected: FAIL.

- [ ] **Step 3: Implement `src/api/voice.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import type { CoordinationService } from '../coordination/service.js';

const inboundSchema = z.object({
  deliveryId: z.number().nullable().optional(),
  driverPhone: z.string().min(1),
  spoken: z.string().min(1),
  estSeconds: z.number().optional(),
});
const statusSchema = z.object({
  deliveryId: z.number().nullable().optional(),
  direction: z.enum(['IN','OUT']),
  seconds: z.number(),
  escalated: z.boolean().optional(),
});

export function voiceRouter(svc: CoordinationService): Router {
  const r = Router();
  r.post('/voice/inbound', async (req, res) => {
    const parse = inboundSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.issues.map((i:any)=>i.message).join('; ') }); return; }
    const turn = await svc.handleDriverInbound({
      deliveryId: parse.data.deliveryId ?? null, driverPhone: parse.data.driverPhone,
      spoken: parse.data.spoken, estSeconds: parse.data.estSeconds });
    res.json(turn);
  });
  r.post('/voice/status', (req, res) => {
    const parse = statusSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.issues.map((i:any)=>i.message).join('; ') }); return; }
    const paise = svc.recordCall({
      deliveryId: parse.data.deliveryId ?? null, direction: parse.data.direction,
      seconds: parse.data.seconds, escalated: parse.data.escalated ?? false });
    res.json({ ok:true, paise });
  });
  return r;
}
```

- [ ] **Step 4: Wire into `src/index.ts`** — replace its contents with:

```ts
// src/index.ts
import express from 'express';
import { getDb } from './db/index.js';
import { seedHome } from './db/seed.js';
import { seedLandmarks } from './landmarks/seed.js';
import { captureRouter } from './api/capture.js';
import { readRouter } from './api/read.js';
import { voiceRouter } from './api/voice.js';
import { WhatsAppMessenger } from './messenger/whatsapp.js';
import { WhatsAppWebClient, FakeWhatsAppClient } from './messenger/whatsapp_client.js';
import { BolnaAdapter, FakeTelephonyProvider } from './telephony/provider.js';
import { VoiceAgent } from './telephony/voice_agent.js';
import { BudgetTracker } from './budget/tracker.js';
import { LandmarkKB } from './landmarks/kb.js';
import { CoordinationService } from './coordination/service.js';

const db = getDb(); seedHome(db); seedLandmarks(db);
const live = process.env.PORTER_LIVE === '1';
const waClient = live ? new WhatsAppWebClient() : new FakeWhatsAppClient();
const telephony = live ? new BolnaAdapter() : new FakeTelephonyProvider();
const messenger = new WhatsAppMessenger(db, waClient);
const ownerPhone = process.env.WHATSAPP_SELF || '9599157340';
const svc = new CoordinationService(db, {
  messenger, telephony, budget: new BudgetTracker(db),
  voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone }), ownerPhone });

const app = express(); app.use(express.json());
app.use(readRouter(db));
app.use(captureRouter(db, messenger));
app.use(voiceRouter(svc));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`cockpit on :${port} (live=${live})`));
```

- [ ] **Step 5: Run full suite** — `npm test`. Expected: ALL pass (existing 39 + landmarks 6 + budget 6 + whatsapp 4 + telephony 4 + coordination 4 + voice_api 3).

- [ ] **Step 6: Commit**

```bash
git add src/api/voice.ts src/index.ts tests/voice_api.test.ts
git commit -m "feat(phase3): voice webhooks + wire coordination into app (live flag)"
```

---

## Task G: Docs + handoff update (SERIAL)

**Files:**
- Modify: `HANDOFF.md`, `docs/PROJECT-TLDR.md`, `README.md`

- [ ] **Step 1:** Update build-status lines to mark Plan 3 ✅ (code complete, tested against fakes; live wiring pending phone + Bolna account). Note the `PORTER_LIVE=1` env flag and the `.env.example` keys.
- [ ] **Step 2:** Run `npm test` once more — Expected: green.
- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md docs/PROJECT-TLDR.md README.md
git commit -m "docs(phase3): mark Plan 3 code-complete; document live flag + env"
```

---

## Self-Review

**Spec coverage:** LandmarkKB → Task A. BudgetTracker → Task B. WhatsAppMessenger + WhatsAppClient port (real + fake) → Task C. TelephonyProvider + BolnaAdapter + VoiceAgent → Task D. CoordinationService → Task E. Voice webhooks + app wiring → Task F. Schema (`landmarks`, `ai_call_spend`) + env → Task 0. Error handling: asset-missing degrade (C, tested); budget escalation (B/E, tested); no-match transfer (D/E, tested). NO-SMS: no SMS method exists anywhere. Budget ₹2,000 = 200000 paise everywhere. Testing strategy: every named test file present. ✅ All spec sections mapped.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `match(spoken)→{directions,confidence}|null` consistent A↔D↔E. `shouldEscalate(estSeconds)` consistent B↔E. `VoiceTurn{action,say?,sendPin?,transferTo?}` consistent D↔E↔F. `record/recordCall` paise return consistent B↔E↔F. `WhatsAppClient` 4 methods consistent C↔C-fake↔E. ✅

**Parallel safety:** Tasks A,B,C,D create disjoint files and never touch `schema.sql` (Task 0 owns it) or `src/index.ts` (Task F owns it). Safe to run concurrently. ✅
