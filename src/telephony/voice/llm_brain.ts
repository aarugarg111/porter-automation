// src/telephony/voice/llm_brain.ts
// LLM-driven brain — the Cashflohero-style path: a real Hindi conversation grounded in the shop facts
// and the known routes, instead of canned templates. Replies are short (it's a phone call). The model
// ends a reply with [ARRIVED] (he reached the shop) or [CONNECT] (hand to the owner) when appropriate;
// we strip those tags and turn them into actions.
import type { Brain, BrainReply, BrainAction } from './brain.js';
import type { ChatClient, ChatMessage } from './llm.js';
import type { LandmarkKB } from '../../landmarks/kb.js';

const GREETING = 'Haan ji namaste, Aryan Enterprises se. Boliye, abhi kahaan ho?';
const MAX_HISTORY = 14; // system + ~6 turns

function systemPrompt(routes: string): string {
  return [
    'You are "Aryan", a warm, street-smart helper at Aryan Enterprises, a shop in Badarpur, Delhi.',
    'A Porter delivery driver is on the phone, trying to reach the shop to pick up or drop a parcel.',
    'Your ONLY job: guide him to the shop in a natural spoken-Hindi conversation, turn by turn.',
    '',
    'THE SHOP:',
    '- Aryan Enterprises, 446 Bankey Lal Market, opposite the Red Light, Badarpur 110044.',
    '- Right in front of Metro Pillar number 25 on Mathura Road. A "Bosch" + "Havells" board is outside.',
    '- A coconut (nariyal) seller stands right in front. Kishwarna Eye Hospital is next door.',
    '- From Canara Bank it is about 5 shops ahead toward Faridabad.',
    '',
    'ROUTES YOU KNOW (use ONLY these facts — never invent roads or turns):',
    routes,
    '',
    'HOW TO TALK:',
    '- Reply ONLY in simple spoken Hindi (Roman or Devanagari, both fine). Warm and human.',
    '- ONE short reply at a time — 1 to 2 sentences MAX. He is driving; keep it tight.',
    '- First figure out where he is, then give the NEXT step toward Pillar 25 / Canara Bank, then wait.',
    "- If you don't recognise his spot, tell him to come onto Mathura Road toward Canara Bank / Pillar 25, then ask again. NEVER say you can't help.",
    '- Do not repeat the same sentence twice — rephrase or move him forward. Confirm small wins.',
    '',
    'ENDING (put the tag at the very end, nothing after it):',
    '- If he has clearly REACHED the shop (sees the Bosch/Havells board or the coconut seller, or says he arrived): give a short happy line and end with [ARRIVED].',
    '- If he is truly lost after a couple of tries, or asks to talk to a person: say you will connect the owner and end with [CONNECT].',
    '- Otherwise reply normally with no tag.',
  ].join('\n');
}

function parseReply(raw: string): BrainReply {
  let say = (raw || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  let action: BrainAction = 'speak';
  if (/\[ARRIVED\]/i.test(say)) action = 'hangup';
  else if (/\[CONNECT\]/i.test(say)) action = 'transfer';
  say = say.replace(/\[(ARRIVED|CONNECT)\]/gi, '').trim();
  if (!say) say = action === 'hangup' ? 'Bahut badhiya, aa jaiye! Shukriya.'
    : action === 'transfer' ? 'Ek minute, maalik se jod raha hoon.'
    : 'Haan boliye, abhi kahaan ho?';
  return { say, action };
}

export class LlmBrain implements Brain {
  private history: ChatMessage[];
  constructor(private llm: ChatClient, kb: LandmarkKB) {
    this.history = [{ role: 'system', content: systemPrompt(kb.knowledge()) }];
  }

  async greeting(): Promise<string> {
    return GREETING; // fixed opener → instant first audio, no model round-trip
  }

  async onTranscript(text: string): Promise<BrainReply> {
    this.history.push({ role: 'user', content: text });
    if (this.history.length > MAX_HISTORY) this.history = [this.history[0], ...this.history.slice(-(MAX_HISTORY - 1))];
    let raw: string;
    try {
      raw = await this.llm.complete(this.history);
    } catch (e) {
      console.error('[llm-brain]', (e as Error).message);
      return { say: 'Maaf kijiye, awaaz kat gayi. Ek baar phir boliye?', action: 'speak' };
    }
    this.history.push({ role: 'assistant', content: raw });
    return parseReply(raw);
  }
}
