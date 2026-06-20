# Porter Coordination Cockpit — Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend engine that turns captured Porter app-notifications into tracked deliveries and runs the 5 coordination jobs, fully testable today via a dev simulator (no Porter API, no WhatsApp, no AI).

**Architecture:** Node + TypeScript + Express + built-in `node:sqlite`. A `PorterClient` seam (`notifBridge` now, `real` later) feeds a delivery state machine. Messaging is behind a `Messenger` interface with a logging mock for now; whatsapp-web.js and AI calls are separate plans. A REST API exposes deliveries/ledger to the (separate) React dashboard.

**Tech Stack:** Node 24, TypeScript, Express, `node:sqlite` (built-in — no native build), Vitest, zod.

## Global Constraints
- DB layer uses Node's built-in **`node:sqlite`** (`DatabaseSync`) — never add `better-sqlite3`.
- Node binary lives at `/c/Program Files/nodejs`; `node`/`npm`/`npx` shims are on PATH already.
- Booking is MANUAL; this engine never books. It only ingests notifications + coordinates.
- NO SMS anywhere. Outbound comms go through the `Messenger` interface (WhatsApp/AI in later plans).
- Tracking source = Porter app notifications POSTed to `/capture`. No Porter API calls.
- Porter account + WhatsApp number = `9599157340`.
- HOME location = Aryan Enterprises, lat `28.5000777`, lng `77.3018299`.
- All money in integer paise; display as ₹. All times UTC ISO-8601.
- Status enum: `INTENT, ASSIGNED, REACHED_PICKUP, PICKED_UP, REACHED_AREA, DELIVERED, CANCELLED`.

---

### Task 1: Project scaffold

**Files:**
- Create: `porter-automation/package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`

**Interfaces:**
- Produces: a runnable TS project with `npm test` (vitest) and `npm run dev` (tsx).

- [ ] **Step 1: Init project + git**
```bash
cd porter-automation && git init
npm init -y
npm i express zod
npm i -D typescript tsx vitest @types/express @types/node
```
- [ ] **Step 2: tsconfig.json**
```json
{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
  "strict": true, "esModuleInterop": true, "outDir": "dist", "rootDir": "src" },
  "include": ["src"] }
```
- [ ] **Step 3: package.json scripts + vitest config + .gitignore**
```json
// package.json "scripts":
{ "dev": "tsx src/index.ts", "test": "vitest run", "test:watch": "vitest" }
```
```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```
`.gitignore`: `node_modules/`, `dist/`, `*.sqlite`, `.env`
- [ ] **Step 4: src/index.ts placeholder + verify it runs**
```ts
console.log('cockpit boot');
```
Run: `npm run dev` → Expected: prints `cockpit boot`.
- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "chore: scaffold cockpit core project"
```

---

### Task 2: Database schema

**Files:**
- Create: `src/db/schema.sql`, `src/db/index.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `getDb(path?: string): Database` (better-sqlite3 instance with schema applied).

- [ ] **Step 1: Write failing test**
```ts
// tests/db.test.ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
test('schema has core tables', () => {
  const db = getDb(':memory:');
  const names = db.prepare("select name from sqlite_master where type='table'").all().map((r:any)=>r.name);
  for (const t of ['locations','deliveries','events','capture_inbox']) expect(names).toContain(t);
});
```
- [ ] **Step 2: Run test → FAIL** (`getDb` not found). Run: `npm test`
- [ ] **Step 3: schema.sql + getDb**
```sql
-- src/db/schema.sql
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY, nickname TEXT NOT NULL, relationship TEXT NOT NULL,
  contact_person TEXT, phone TEXT, address TEXT, lat REAL, lng REAL,
  default_direction TEXT, default_vehicle TEXT, default_payer TEXT DEFAULT 'ME',
  landmark_notes TEXT, is_home INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY, direction TEXT NOT NULL,
  pickup_location_id INTEGER, drop_location_id INTEGER, status TEXT NOT NULL DEFAULT 'INTENT',
  porter_order_id TEXT, driver_name TEXT, driver_phone TEXT, amount INTEGER,
  payer TEXT NOT NULL DEFAULT 'ME', payment_status TEXT NOT NULL DEFAULT 'pending',
  expected_minutes INTEGER, started_at TEXT, reached_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, delivery_id INTEGER NOT NULL, status TEXT NOT NULL,
  source TEXT NOT NULL, raw_text TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS capture_inbox (
  id INTEGER PRIMARY KEY, raw_text TEXT NOT NULL, parsed_json TEXT, created_at TEXT NOT NULL);
```
```ts
// src/db/index.ts
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export type DB = DatabaseSync;
export function getDb(path = 'cockpit.sqlite'): DB {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return db;
}
```
> Node 24's built-in `node:sqlite` (no native build). API mirrors better-sqlite3:
> `db.exec()`, `db.prepare(sql).run(obj)/.get()/.all()`, `.run()` returns `{changes,lastInsertRowid}`.
> It prints an ExperimentalWarning to stderr — harmless; do not suppress in tests.
- [ ] **Step 4: Run test → PASS.** Run: `npm test`
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: sqlite schema for cockpit"`

---

### Task 3: Seed HOME + landmark data

**Files:**
- Create: `src/db/seed.ts`
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `getDb`.
- Produces: `seedHome(db): void` inserting the HOME location if absent.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
test('seeds HOME once', () => {
  const db = getDb(':memory:'); seedHome(db); seedHome(db);
  const rows = db.prepare("select * from locations where is_home=1").all();
  expect(rows.length).toBe(1);
  expect((rows[0] as any).lat).toBeCloseTo(28.5000777);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/db/seed.ts
import type { DatabaseSync } from 'node:sqlite';
export function seedHome(db: DatabaseSync) {
  const exists = db.prepare("select 1 from locations where is_home=1").get();
  if (exists) return;
  db.prepare(`insert into locations (nickname,relationship,address,lat,lng,is_home,landmark_notes)
    values (?,?,?,?,?,1,?)`).run('Aryan Enterprises (HOME)','both',
    '446 Bankey Lal Market, opp Red Light, Badarpur, New Delhi 110044',
    28.5000777, 77.3018299,
    'Metro Pillar 25 ke saamne; Canara Bank se Faridabad 5 dukaan; nariyal wale ke saamne; Kishwarna Eye Hospital ke baaju; Bosch+Havells board');
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: seed HOME location + landmarks"`

---

### Task 4: Status state machine (pure logic)

**Files:**
- Create: `src/deliveries/status.ts`
- Test: `tests/status.test.ts`

**Interfaces:**
- Produces: `STATUS_ORDER: Status[]`; `canTransition(from: Status, to: Status): boolean`.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { canTransition } from '../src/deliveries/status.js';
test('valid forward transitions only', () => {
  expect(canTransition('INTENT','ASSIGNED')).toBe(true);
  expect(canTransition('ASSIGNED','DELIVERED')).toBe(true); // forward skips allowed
  expect(canTransition('DELIVERED','ASSIGNED')).toBe(false); // no backward
  expect(canTransition('INTENT','CANCELLED')).toBe(true);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/deliveries/status.ts
export type Status = 'INTENT'|'ASSIGNED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'CANCELLED';
export const STATUS_ORDER: Status[] = ['INTENT','ASSIGNED','REACHED_PICKUP','PICKED_UP','REACHED_AREA','DELIVERED'];
export function canTransition(from: Status, to: Status): boolean {
  if (to === 'CANCELLED') return from !== 'DELIVERED';
  const f = STATUS_ORDER.indexOf(from), t = STATUS_ORDER.indexOf(to);
  return f >= 0 && t > f; // forward-only, skips allowed
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: delivery status state machine"`

---

### Task 5: Notification parsers (table-driven)

**Files:**
- Create: `src/capture/parsers.ts`
- Test: `tests/parsers.test.ts`

**Interfaces:**
- Produces: `parseNotification(text: string): ParsedNotif | null` where
  `ParsedNotif = { type:'ASSIGNED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'RECEIPT', orderId?:string, driverName?:string, driverPhone?:string, amountPaise?:number }`.

> NOTE: regexes below are provisional until the owner supplies 4 real Porter notification samples; the test table is the place to drop those in.

- [ ] **Step 1: Failing test (table-driven, provisional samples)**
```ts
import { test, expect } from 'vitest';
import { parseNotification } from '../src/capture/parsers.js';
const cases: [string, any][] = [
  ['Partner Ramesh (9876543210) assigned to your order PRTR12345',
    { type:'ASSIGNED', orderId:'PRTR12345', driverName:'Ramesh', driverPhone:'9876543210' }],
  ['Your order PRTR12345 has been delivered', { type:'DELIVERED', orderId:'PRTR12345' }],
  ['Trip fare for PRTR12345 is Rs 148', { type:'RECEIPT', orderId:'PRTR12345', amountPaise:14800 }],
];
test.each(cases)('parses %s', (text, expected) => {
  expect(parseNotification(text)).toMatchObject(expected);
});
test('unknown returns null', () => expect(parseNotification('hello')).toBeNull());
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/capture/parsers.ts
export type NotifType = 'ASSIGNED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'RECEIPT';
export interface ParsedNotif { type: NotifType; orderId?: string; driverName?: string; driverPhone?: string; amountPaise?: number; }
const ORDER = /\b(PRTR\w+)\b/i;
export function parseNotification(text: string): ParsedNotif | null {
  const orderId = text.match(ORDER)?.[1];
  const fare = text.match(/Rs\.?\s*(\d+)/i);
  if (fare) return { type:'RECEIPT', orderId, amountPaise: parseInt(fare[1],10)*100 };
  const assigned = text.match(/(?:Partner|Driver)\s+([A-Za-z]+)\s*\((\d{10})\)/i);
  if (assigned) return { type:'ASSIGNED', orderId, driverName: assigned[1], driverPhone: assigned[2] };
  if (/delivered/i.test(text)) return { type:'DELIVERED', orderId };
  if (/reached.*(drop|destination|delivery)/i.test(text)) return { type:'REACHED_AREA', orderId };
  if (/picked up|pickup done/i.test(text)) return { type:'PICKED_UP', orderId };
  if (/reached.*(pickup|shop)/i.test(text)) return { type:'REACHED_PICKUP', orderId };
  return null;
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: porter notification parsers (provisional regexes)"`

---

### Task 6: Locations repo + CSV import

**Files:**
- Create: `src/locations/repo.ts`
- Test: `tests/locations.test.ts`

**Interfaces:**
- Produces: `listLocations(db)`, `getLocation(db,id)`, `createLocation(db, input)`, `importCsv(db, csvText): number`.
  Location row shape matches schema columns.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { createLocation, listLocations } from '../src/locations/repo.js';
test('create + list location', () => {
  const db = getDb(':memory:');
  createLocation(db, { nickname:'Sharma', relationship:'customer', phone:'9990001111', default_payer:'RECEIVER' });
  const all = listLocations(db);
  expect(all.find(l=>l.nickname==='Sharma')?.default_payer).toBe('RECEIVER');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/locations/repo.ts
import type { DatabaseSync } from 'node:sqlite';
export interface LocationInput { nickname:string; relationship:string; contact_person?:string;
  phone?:string; address?:string; lat?:number; lng?:number; default_direction?:string;
  default_vehicle?:string; default_payer?:string; landmark_notes?:string; }
export function createLocation(db: DatabaseSync, i: LocationInput) {
  return db.prepare(`insert into locations
    (nickname,relationship,contact_person,phone,address,lat,lng,default_direction,default_vehicle,default_payer,landmark_notes)
    values (@nickname,@relationship,@contact_person,@phone,@address,@lat,@lng,@default_direction,@default_vehicle,@default_payer,@landmark_notes)`)
    .run({ contact_person:null,phone:null,address:null,lat:null,lng:null,default_direction:null,
      default_vehicle:null,default_payer:'ME',landmark_notes:null, ...i }).lastInsertRowid;
}
export function listLocations(db: DatabaseSync): any[] { return db.prepare('select * from locations').all(); }
export function getLocation(db: DatabaseSync, id:number): any { return db.prepare('select * from locations where id=?').get(id); }
export function importCsv(db: DatabaseSync, csv: string): number {
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = head.split(',');
  let n=0;
  for (const line of rows) { if (!line.trim()) continue;
    const vals = line.split(','); const rec:any = {};
    cols.forEach((c,idx)=> rec[c.trim()] = vals[idx]?.trim() || undefined);
    createLocation(db, { nickname: rec.nickname, relationship: rec.relationship || 'both',
      contact_person: rec.contact_person, phone: rec.phone, address: rec.full_address,
      default_payer: rec.default_payer, landmark_notes: rec.notes }); n++; }
  return n;
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: locations repo + csv import"`

---

### Task 7: Messenger interface + logging mock

**Files:**
- Create: `src/messenger/types.ts`, `src/messenger/mock.ts`
- Test: `tests/messenger.test.ts`

**Interfaces:**
- Produces: `interface Messenger { sendDriverDirections(phone,loc): Promise<void>; confirmReceiver(phone,orderId): Promise<void>; notifyReceiverPayment(phone,amountPaise): Promise<void>; }`
  and `MockMessenger` recording calls in `.sent: {kind,phone,extra}[]`.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { MockMessenger } from '../src/messenger/mock.js';
test('mock records sends', async () => {
  const m = new MockMessenger();
  await m.notifyReceiverPayment('999', 14800);
  expect(m.sent[0]).toMatchObject({ kind:'payment', phone:'999' });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/messenger/types.ts
export interface Messenger {
  sendDriverDirections(phone: string, landmarkNotes: string): Promise<void>;
  confirmReceiver(phone: string, orderId: string): Promise<void>;
  notifyReceiverPayment(phone: string, amountPaise: number): Promise<void>;
}
// src/messenger/mock.ts
import type { Messenger } from './types.js';
export class MockMessenger implements Messenger {
  sent: {kind:string; phone:string; extra?:any}[] = [];
  async sendDriverDirections(phone:string, notes:string){ this.sent.push({kind:'directions',phone,extra:notes}); }
  async confirmReceiver(phone:string, orderId:string){ this.sent.push({kind:'confirm',phone,extra:orderId}); }
  async notifyReceiverPayment(phone:string, amountPaise:number){ this.sent.push({kind:'payment',phone,extra:amountPaise}); }
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: messenger interface + logging mock"`

---

### Task 8: Delivery service (intent + applyEvent + the 5-job hooks)

**Files:**
- Create: `src/deliveries/service.ts`
- Test: `tests/service.test.ts`

**Interfaces:**
- Consumes: `getDb`, `canTransition`, `getLocation`, `Messenger`, `ParsedNotif`.
- Produces:
  - `createIntent(db, { direction, otherLocationId, vehicle?, payer? }): number` (returns delivery id; sets pickup/drop from HOME + direction).
  - `applyParsed(db, msgr, p: ParsedNotif & { deliveryId?: number }): Promise<void>` — updates status/fields, writes event, fires job hooks: ASSIGNED→`sendDriverDirections`; DELIVERED→`confirmReceiver` + (payer==='RECEIVER')`notifyReceiverPayment` & mark settled; RECEIPT→set amount.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
test('SEND intent → assigned messages driver → delivered confirms receiver + payment', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Sharma', relationship:'customer', phone:'999', default_payer:'RECEIVER' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'RECEIVER' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTR1', driverName:'R', driverPhone:'888' });
  await applyParsed(db, m, { deliveryId:id, type:'RECEIPT', orderId:'PRTR1', amountPaise:14800 });
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTR1' });
  const d:any = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.status).toBe('DELIVERED'); expect(d.amount).toBe(14800); expect(d.payment_status).toBe('settled');
  expect(m.sent.map(s=>s.kind)).toEqual(['directions','confirm','payment']);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/deliveries/service.ts
import type { DatabaseSync } from 'node:sqlite';
import { canTransition, type Status } from './status.js';
import { getLocation } from '../locations/repo.js';
import type { Messenger } from '../messenger/types.js';
import type { ParsedNotif } from '../capture/parsers.js';
const now = () => new Date().toISOString();
export function createIntent(db: DatabaseSync,
  i: { direction:'SEND'|'RECEIVE'; otherLocationId:number; vehicle?:string; payer?:'ME'|'RECEIVER' }): number {
  const home:any = db.prepare('select id from locations where is_home=1').get();
  const pickup = i.direction==='SEND' ? home.id : i.otherLocationId;
  const drop   = i.direction==='SEND' ? i.otherLocationId : home.id;
  return db.prepare(`insert into deliveries (direction,pickup_location_id,drop_location_id,status,payer,created_at)
    values (?,?,?,?,?,?)`).run(i.direction,pickup,drop,'INTENT', i.payer||'ME', now()).lastInsertRowid as number;
}
const TYPE_TO_STATUS: Record<string, Status|undefined> = {
  ASSIGNED:'ASSIGNED', REACHED_PICKUP:'REACHED_PICKUP', PICKED_UP:'PICKED_UP',
  REACHED_AREA:'REACHED_AREA', DELIVERED:'DELIVERED' };
export async function applyParsed(db: DatabaseSync, msgr: Messenger, p: ParsedNotif & { deliveryId:number }) {
  const d:any = db.prepare('select * from deliveries where id=?').get(p.deliveryId);
  if (!d) return;
  if (p.type==='RECEIPT' && p.amountPaise!=null) {
    db.prepare('update deliveries set amount=? where id=?').run(p.amountPaise, d.id); return;
  }
  const to = TYPE_TO_STATUS[p.type]; if (!to) return;
  if (!canTransition(d.status, to)) return;
  db.prepare('update deliveries set status=?, driver_name=coalesce(?,driver_name), driver_phone=coalesce(?,driver_phone), porter_order_id=coalesce(?,porter_order_id) where id=?')
    .run(to, p.driverName??null, p.driverPhone??null, p.orderId??null, d.id);
  db.prepare('insert into events (delivery_id,status,source,raw_text,created_at) values (?,?,?,?,?)')
    .run(d.id, to, 'notif', null, now());
  if (to==='ASSIGNED' && p.driverPhone) {
    const pickup = getLocation(db, d.pickup_location_id);
    await msgr.sendDriverDirections(p.driverPhone, pickup?.landmark_notes || '');
  }
  if (to==='DELIVERED') {
    const drop = getLocation(db, d.drop_location_id);
    if (drop?.phone) await msgr.confirmReceiver(drop.phone, d.porter_order_id || '');
    if (d.payer==='RECEIVER' && drop?.phone) {
      await msgr.notifyReceiverPayment(drop.phone, d.amount || 0);
      db.prepare("update deliveries set payment_status='settled' where id=?").run(d.id);
    }
  }
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: delivery service with 5-job hooks"`

---

### Task 9: Capture matcher + endpoint

**Files:**
- Create: `src/capture/matcher.ts`, `src/api/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `parseNotification`, `applyParsed`, deliveries table.
- Produces: `matchDelivery(db, p): number | null` (by porter_order_id, else newest open INTENT/ASSIGNED-stage delivery); `captureRouter(db, msgr): Router` exposing `POST /capture { text }`.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { createIntent } from '../src/deliveries/service.js';
import { matchDelivery } from '../src/capture/matcher.js';
test('matches order to newest open intent then by orderId', () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'S',relationship:'customer'}) as number;
  const id = createIntent(db,{direction:'SEND',otherLocationId:r});
  expect(matchDelivery(db,{type:'ASSIGNED',orderId:'PRTR9'})).toBe(id);
  db.prepare("update deliveries set porter_order_id='PRTR9' where id=?").run(id);
  expect(matchDelivery(db,{type:'DELIVERED',orderId:'PRTR9'})).toBe(id);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/capture/matcher.ts
import type { DatabaseSync } from 'node:sqlite';
import type { ParsedNotif } from './parsers.js';
export function matchDelivery(db: DatabaseSync, p: ParsedNotif): number | null {
  if (p.orderId) {
    const byOrder:any = db.prepare('select id from deliveries where porter_order_id=?').get(p.orderId);
    if (byOrder) return byOrder.id;
  }
  const open:any = db.prepare("select id from deliveries where porter_order_id is null and status in ('INTENT','ASSIGNED') order by created_at desc limit 1").get();
  return open?.id ?? null;
}
```
```ts
// src/api/capture.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';
import { parseNotification } from '../capture/parsers.js';
import { matchDelivery } from '../capture/matcher.js';
import { applyParsed } from '../deliveries/service.js';
export function captureRouter(db: DatabaseSync, msgr: Messenger): Router {
  const r = Router();
  r.post('/capture', async (req, res) => {
    const text = String(req.body?.text ?? '');
    db.prepare('insert into capture_inbox (raw_text,created_at) values (?,?)').run(text, new Date().toISOString());
    const p = parseNotification(text);
    if (!p) return res.json({ ok:true, matched:false, reason:'unparsed' });
    const deliveryId = matchDelivery(db, p);
    if (!deliveryId) return res.json({ ok:true, matched:false, reason:'no-open-delivery' });
    await applyParsed(db, msgr, { ...p, deliveryId });
    res.json({ ok:true, matched:true, deliveryId });
  });
  return r;
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: capture matcher + /capture endpoint"`

---

### Task 10: Diversion check

**Files:**
- Create: `src/tracking/diversion.ts`
- Test: `tests/diversion.test.ts`

**Interfaces:**
- Produces: `isLate(d: { status:string; started_at?:string; expected_minutes?:number }, nowMs:number, threshold=1.5): boolean`.

- [ ] **Step 1: Failing test**
```ts
import { test, expect } from 'vitest';
import { isLate } from '../src/tracking/diversion.js';
test('flags when elapsed exceeds expected*threshold pre-arrival', () => {
  const started = new Date(Date.now()-60*60000).toISOString(); // 60 min ago
  expect(isLate({status:'PICKED_UP', started_at:started, expected_minutes:20}, Date.now())).toBe(true);
  expect(isLate({status:'DELIVERED', started_at:started, expected_minutes:20}, Date.now())).toBe(false);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
// src/tracking/diversion.ts
export function isLate(d: { status:string; started_at?:string; expected_minutes?:number }, nowMs:number, threshold=1.5): boolean {
  if (['DELIVERED','REACHED_AREA','CANCELLED'].includes(d.status)) return false;
  if (!d.started_at || !d.expected_minutes) return false;
  const elapsedMin = (nowMs - Date.parse(d.started_at)) / 60000;
  return elapsedMin > d.expected_minutes * threshold;
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: time-based diversion/late flag"`

---

### Task 11: Read API (deliveries list + detail + ledger)

**Files:**
- Create: `src/api/read.ts`
- Test: `tests/read.test.ts`

**Interfaces:**
- Consumes: deliveries/events tables, `isLate`.
- Produces: `readRouter(db): Router` with `GET /deliveries` (active list w/ `late` flag + payer), `GET /deliveries/:id` (with events), `GET /ledger` (today by payer, totals, pending/settled), `POST /intent { direction, otherLocationId, payer? }`.

- [ ] **Step 1: Failing test (supertest-style via app)**
```ts
import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { readRouter } from '../src/api/read.js';
test('intent then list returns the delivery', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'S',relationship:'customer'}) as number;
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;
  await fetch(`http://localhost:${port}/intent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'SEND',otherLocationId:r})});
  const list = await (await fetch(`http://localhost:${port}/deliveries`)).json();
  expect(list.length).toBe(1); server.close();
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `readRouter` with the four routes; `/deliveries` computes `late` via `isLate(row, Date.now())`; `/intent` calls `createIntent`.
```ts
// src/api/read.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { isLate } from '../tracking/diversion.js';
import { createIntent } from '../deliveries/service.js';
export function readRouter(db: DatabaseSync): Router {
  const r = Router();
  r.post('/intent', (req,res) => {
    const id = createIntent(db, req.body); res.json({ id });
  });
  r.get('/deliveries', (_req,res) => {
    const rows = db.prepare("select * from deliveries where status!='DELIVERED' order by created_at desc").all();
    res.json(rows.map((d:any)=> ({ ...d, late: isLate(d, Date.now()) })));
  });
  r.get('/deliveries/:id', (req,res) => {
    const d = db.prepare('select * from deliveries where id=?').get(req.params.id);
    const events = db.prepare('select * from events where delivery_id=? order by created_at').all(req.params.id);
    res.json({ ...(d as any), events });
  });
  r.get('/ledger', (_req,res) => {
    const today = new Date().toISOString().slice(0,10);
    const rows = db.prepare("select payer,payment_status,coalesce(amount,0) amount from deliveries where created_at like ?").all(today+'%');
    res.json(rows);
  });
  return r;
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat: read API (deliveries, detail, ledger, intent)"`

---

### Task 12: App wiring + dev simulator + end-to-end test

**Files:**
- Modify: `src/index.ts`
- Create: `src/sim/feed.ts`, `scripts/sample-notifications.json`
- Test: `tests/e2e.test.ts`

**Interfaces:**
- Consumes: all routers, `MockMessenger`.
- Produces: an Express app on `PORT` mounting `captureRouter` + `readRouter` with seeded HOME; `feedSequence(baseUrl, deliveryId, samples[])` POSTs notifications to `/capture`.

- [ ] **Step 1: Failing e2e test**
```ts
import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { captureRouter } from '../src/api/capture.js';
import { readRouter } from '../src/api/read.js';
test('intent + notification sequence drives delivery to DELIVERED', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'S',relationship:'customer',phone:'999',default_payer:'RECEIVER'}) as number;
  const app = express(); app.use(express.json());
  app.use(readRouter(db)); app.use(captureRouter(db, new MockMessenger()));
  const server = app.listen(0); const port=(server.address() as any).port; const base=`http://localhost:${port}`;
  const { id } = await (await fetch(`${base}/intent`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'SEND',otherLocationId:r,payer:'RECEIVER'})})).json();
  for (const text of [
    'Partner Ramesh (9876543210) assigned to your order PRTR777',
    'Trip fare for PRTR777 is Rs 148',
    'Your order PRTR777 has been delivered'])
    await fetch(`${base}/capture`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});
  const d:any = await (await fetch(`${base}/deliveries/${id}`)).json();
  expect(d.status).toBe('DELIVERED'); expect(d.amount).toBe(14800); expect(d.payment_status).toBe('settled');
  server.close();
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement src/index.ts wiring + sim/feed.ts**
```ts
// src/index.ts
import express from 'express';
import { getDb } from './db/index.js';
import { seedHome } from './db/seed.js';
import { MockMessenger } from './messenger/mock.js';
import { captureRouter } from './api/capture.js';
import { readRouter } from './api/read.js';
const db = getDb(); seedHome(db);
const app = express(); app.use(express.json());
app.use(readRouter(db)); app.use(captureRouter(db, new MockMessenger()));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`cockpit on :${port}`));
```
- [ ] **Step 4: Run → PASS** (`npm test`), then manual: `npm run dev` and POST a sample to `/capture`.
- [ ] **Step 5: Commit** `git commit -am "feat: wire app + dev simulator + e2e green"`

---

## Self-Review Notes
- Spec coverage: Jobs 1–5 → Tasks 8 (hooks), 10 (diversion), 9/12 (capture→reached), 8 (receiver confirm + payment), 11 (ledger). Data model → Task 2. Seam `notifBridge` = the `/capture` ingest path (Task 9); `real` swaps in later behind the same `applyParsed`. Locations/CSV → Task 6.
- Deferred to later plans (intentionally, not gaps): real whatsapp-web.js `Messenger`, AI call backup, Android notification-listener app, React dashboard UI, Google Directions `expected_minutes` population.
- Parser regexes are provisional pending the owner's 4 real Porter notification samples — Task 5's test table is where they drop in; only that table + `parsers.ts` change.
```
