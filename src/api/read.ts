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
