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
