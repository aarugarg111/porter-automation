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
