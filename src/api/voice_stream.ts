// src/api/voice_stream.ts
// Inbound call entry point for the REAL-TIME voice agent: instead of an IVR (<Say>/<Gather>), connect
// the call's live audio to our Media Streams WebSocket (<Connect><Stream>). The conversation happens
// in src/telephony/media_stream.ts. We pass From + CallSid through as <Parameter>s so the stream can
// log/link the call (Twilio's `start` event carries callSid but not the caller's number).
import { Router, urlencoded } from 'express';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c]!));

export function voiceStreamRouter(wsPath = '/media-stream'): Router {
  const r = Router();
  r.post('/voice/twilio-inbound', urlencoded({ extended: false }), (req, res) => {
    const host = req.get('host') || '';
    const from = esc(String(req.body?.From ?? ''));
    const callSid = esc(String(req.body?.CallSid ?? ''));
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response>` +
      `<Connect><Stream url="wss://${esc(host)}${wsPath}">` +
        `<Parameter name="from" value="${from}"/>` +
        `<Parameter name="callSid" value="${callSid}"/>` +
      `</Stream></Connect></Response>`;
    res.type('text/xml').send(xml);
  });
  return r;
}
