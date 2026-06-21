// src/api/read.ts
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { isLate } from '../tracking/diversion.js';
import { createIntent } from '../deliveries/service.js';
import { createLocation, listLocations } from '../locations/repo.js';
const intentSchema = z.object({
  direction: z.enum(['SEND','RECEIVE']),
  otherLocationId: z.number(),
  payer: z.enum(['ME','RECEIVER']).optional(),
  vehicle: z.string().optional(),
  expectedMinutes: z.number().positive().optional(),
});
const locationSchema = z.object({
  nickname: z.string().min(1),
  relationship: z.enum(['customer','supplier','both']),
  phone: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  default_direction: z.string().optional(),
  default_vehicle: z.string().optional(),
  default_payer: z.string().optional(),
  landmark_notes: z.string().optional(),
});
export function readRouter(db: DatabaseSync): Router {
  const r = Router();
  r.post('/intent', (req,res) => {
    const parse = intentSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.issues.map((i:any)=>i.message).join('; ') }); return; }
    const id = createIntent(db, parse.data); res.json({ id });
  });
  r.get('/deliveries', (_req,res) => {
    const rows = db.prepare("select * from deliveries where status!='DELIVERED' order by created_at desc").all();
    res.json(rows.map((d:any)=> ({ ...d, late: isLate(d, Date.now()) })));
  });
  // Job 2: open deliveries currently flagged late/diverted (dashboard alert badge).
  r.get('/alerts', (_req,res) => {
    const rows = db.prepare("select * from deliveries where status not in ('DELIVERED','CANCELLED') order by created_at desc").all();
    const late = rows.filter((d:any)=> isLate(d, Date.now()));
    res.json({ count: late.length, late });
  });
  r.get('/deliveries/:id', (req,res) => {
    const d = db.prepare('select * from deliveries where id=?').get(req.params.id);
    const events = db.prepare('select * from events where delivery_id=? order by created_at').all(req.params.id);
    const inbound = db.prepare('select * from inbound_messages where delivery_id=? order by created_at').all(req.params.id);
    const calls = db.prepare('select * from driver_calls where delivery_id=? order by created_at').all(req.params.id);
    res.json({ ...(d as any), events, inbound, calls });
  });
  r.get('/locations', (_req,res) => {
    res.json(listLocations(db));
  });
  r.post('/locations', (req,res) => {
    const parse = locationSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.issues.map((i:any)=>i.message).join('; ') }); return; }
    const id = createLocation(db, parse.data);
    res.json({ id });
  });
  r.get('/ledger', (_req,res) => {
    const today = new Date().toISOString().slice(0,10);
    const rows = db.prepare(
      "select id,payer,payment_method,payment_status,coalesce(amount,0) amount from deliveries " +
      "where created_at like ? or payment_status='pending'").all(today+'%');
    const totals = { count: rows.length,
      pending: rows.filter((x:any)=>x.payment_status==='pending').reduce((s:number,x:any)=>s+x.amount,0),
      settled: rows.filter((x:any)=>x.payment_status==='settled').reduce((s:number,x:any)=>s+x.amount,0) };
    res.json({ rows, totals });
  });
  return r;
}
