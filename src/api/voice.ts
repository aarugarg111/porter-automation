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
const confirmReceiverSchema = z.object({
  deliveryId: z.number().nullable().optional(),
  receiverPhone: z.string().min(1),
  orderId: z.string().min(1),
  estSeconds: z.number().optional(),
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
  r.post('/voice/confirm-receiver', async (req, res) => {
    const parse = confirmReceiverSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.issues.map((i:any)=>i.message).join('; ') }); return; }
    const result = await svc.confirmReceiverByCall({
      deliveryId: parse.data.deliveryId ?? null, receiverPhone: parse.data.receiverPhone,
      orderId: parse.data.orderId, estSeconds: parse.data.estSeconds });
    res.json(result);
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
