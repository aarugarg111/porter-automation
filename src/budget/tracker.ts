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
