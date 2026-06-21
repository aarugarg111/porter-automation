// src/api/inbound.ts
import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';
import { handleInboundWhatsApp } from '../capture/inbound.js';

const inboundSchema = z.object({
  from: z.string().min(1),
  body: z.string().optional(),
  mediaKind: z.string().optional(),
  mediaRef: z.string().optional(),
});

// Receives inbound WhatsApp messages (live: from the whatsapp-web.js `message` event; dev: curl).
export function inboundRouter(db: DatabaseSync, msgr: Messenger, ownerPhone: string): Router {
  const r = Router();
  r.post('/whatsapp/inbound', async (req, res) => {
    const parse = inboundSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.issues.map((i:any)=>i.message).join('; ') }); return; }
    const out = await handleInboundWhatsApp(db, msgr, ownerPhone, parse.data);
    res.json({ ok: true, ...out });
  });
  return r;
}
