// src/telephony/voice/llm_brain.ts
// LLM-driven brain — the Cashflohero-style path: a real Hindi conversation grounded in the shop facts
// and the known routes, instead of canned templates. Replies are short (it's a phone call). The model
// ends a reply with [ARRIVED] (he reached the shop) or [CONNECT] (hand to the owner) when appropriate;
// we strip those tags and turn them into actions.
import type { Brain, BrainReply, BrainAction } from './brain.js';
import { ARRIVED, LOST } from './brain.js';
import type { ChatClient, ChatMessage } from './llm.js';
import type { LandmarkKB } from '../../landmarks/kb.js';
import type { MapsProvider } from '../../maps/google.js';

const GREETING = 'हाँ जी नमस्ते, आर्यन एंटरप्राइज़ेज़ से। बोलिए, अभी कहाँ हो?';
const MAX_HISTORY = 14; // system + ~6 turns

export function systemPrompt(routes: string): string {
  return [
    'You are "Aryan", a warm, street-smart helper at Aryan Enterprises, a shop in Badarpur, Delhi.',
    'A Porter delivery driver is on the phone, trying to reach the shop to pick up or drop a parcel.',
    'Your ONLY job: guide him to the shop in a natural spoken-Hindi conversation, turn by turn.',
    '',
    'THE SHOP (facts Aryan gave — use them, never invent):',
    '- Aryan Enterprises is an ELECTRICAL shop (bijli ki dukaan) on Badarpur Main Road (Mathura Road), Badarpur.',
    '  446 Bankey Lal Market, opposite the Red Light, 110044.',
    '- It is a YELLOW building (peeli building) with a "Bosch" board and a "Havells" board outside.',
    '- It sits just AFTER Muthoot Finance: from Canara Bank, head toward Faridabad about 5 shops — first comes',
    '  Muthoot Finance, and the very NEXT shop is Aryan Enterprises.',
    '- Right in front of Metro Pillar number 25. A coconut (nariyal) seller stands in front; Kishwarna Eye Hospital is next door.',
    '',
    'ROUTES YOU KNOW (use ONLY these facts — never invent roads or turns):',
    routes,
    '',
    'HOW TO TALK (this is a live phone call — talk like a person, not a recording):',
    '- Reply ONLY in pure Devanagari (Hindi) script. Write EVERY word in Devanagari, INCLUDING names and',
    '  places — transliterate them: आर्यन एंटरप्राइज़ेज़, मथुरा रोड, मेट्रो पिलर पच्चीस, कैनरा बैंक, बॉश,',
    '  हैवेल्स, फ़रीदाबाद, बदरपुर बॉर्डर, बैंके लाल मार्केट. NEVER write even one Latin/English letter — the',
    '  phone voice mispronounces Latin badly and the driver cannot understand it.',
    '- CRITICAL: reply in EXACTLY ONE short spoken sentence. Give ONE next step, then STOP and wait.',
    '  Never give two landmarks or the whole route in one reply.',
    '- Your FIRST job is to find out where he is. Drivers usually OPEN with "लोकेशन पे आ गया / पहुँच गया"',
    '  even when they are NOT at the shop yet — do NOT treat that as arrival. Warmly ask exactly where he is,',
    '  naming nearby spots: "अभी आप मुथूट फाइनेंस या कैनरा बैंक के पास खड़े हैं, या कहीं और?" — give NO directions yet.',
    '- Only AFTER you know his spot, give the single NEXT step toward मेट्रो पिलर पच्चीस / कैनरा बैंक, then wait.',
    "- If his words are unclear or garbled, DON'T guess — gently ask him to repeat where he is.",
    '- Do not repeat the same sentence twice — rephrase or move him forward. Confirm small wins. NEVER say you can\'t help.',
    '',
    'ENDING (put the tag at the very end, nothing after it):',
    '- Use [ARRIVED] ONLY when he clearly says he has reached, or can see the shop / the बॉश-हैवेल्स board /',
    '  the नारियल (coconut) seller. Then give ONE short warm line INVITING HIM INSIDE — for example',
    '  "बस आप अंदर आ जाइए, आपका सामान तैयार है!" — and end with [ARRIVED]. NEVER end on his first message,',
    '  and NEVER end on a message you did not clearly understand.',
    '- Use [CONNECT] only if he is genuinely stuck after several turns, or explicitly asks for a person.',
    '- Otherwise reply normally with no tag.',
  ].join('\n');
}

function parseReply(raw: string): BrainReply {
  let say = (raw || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  let action: BrainAction = 'speak';
  if (/\[ARRIVED\]/i.test(say)) action = 'hangup';
  else if (/\[CONNECT\]/i.test(say)) action = 'transfer';
  say = say.replace(/\[(ARRIVED|CONNECT)\]/gi, '').trim();
  if (!say) say = action === 'hangup' ? 'बहुत बढ़िया, बस अंदर आ जाइए! शुक्रिया।'
    : action === 'transfer' ? 'एक मिनट, मालिक से जोड़ रहा हूँ।'
    : 'हाँ बोलिए, अभी कहाँ हो?';
  return { say, action };
}

export class LlmBrain implements Brain {
  private history: ChatMessage[];
  private userTurns = 0;
  constructor(private llm: ChatClient, private kb: LandmarkKB, private maps?: MapsProvider) {
    this.history = [{ role: 'system', content: systemPrompt(kb.knowledge()) }];
  }

  async greeting(): Promise<string> {
    return GREETING; // fixed opener → instant first audio, no model round-trip
  }

  async onTranscript(text: string): Promise<BrainReply> {
    this.userTurns++;
    this.history.push({ role: 'user', content: text });
    if (this.history.length > MAX_HISTORY) this.history = [this.history[0], ...this.history.slice(-(MAX_HISTORY - 1))];
    const msgs = [...this.history, ...(await this.mapGrounding(text))]; // grounding is per-call, not persisted
    let raw: string;
    try {
      raw = await this.llm.complete(msgs);
    } catch (e) {
      console.error('[llm-brain]', (e as Error).message);
      return { say: 'माफ़ कीजिए, आवाज़ कट गई। एक बार फिर बोलिए?', action: 'speak' };
    }
    this.history.push({ role: 'assistant', content: raw });
    return this.corroborate(parseReply(raw), text);
  }

  // For a landmark NOT in Aryan's curated KB, ask the map where it is and hand the model a grounded hint.
  // Curated landmarks win (no API call); fillers / short text are skipped inside the provider.
  private async mapGrounding(text: string): Promise<ChatMessage[]> {
    if (!this.maps) return [];
    const km = this.kb.match(text);
    if (km && km.confidence >= 0.4) return []; // curated knowledge already covers this spot
    try {
      const hit = await this.maps.locate(text);
      if (!hit) return [];
      const step = hit.distM <= 80
        ? 'He is basically AT the shop — tell him to look right beside him for the बॉश-हैवेल्स board / नारियल वाला.'
        : `Give ONE concrete next step toward the shop (मेट्रो पिलर पच्चीस / बैंके लाल मार्केट), which is to his ${hit.dirToShop}.`;
      return [{ role: 'system', content: `MAP DATA (live): the driver appears to be at "${hit.name}" (${hit.address}), about ${hit.distM} m from the shop. ${step}` }];
    } catch (e) { console.error('[llm-brain map]', (e as Error).message); return []; }
  }

  // The model's [ARRIVED]/[CONNECT] is only a SUGGESTION — honour an end-the-call action only when the
  // driver's own words back it up. One mis-heard/echoed transcript must never cut the call. (Real call
  // 2026-06-23: STT mis-heard "hello" as garbage → model emitted [ARRIVED] → call hung up on turn 1.)
  private corroborate(reply: BrainReply, text: string): BrainReply {
    if (reply.action === 'hangup' && !ARRIVED.test(text)) reply.action = 'speak';
    else if (reply.action === 'transfer' && !LOST.test(text) && this.userTurns < 4) reply.action = 'speak';
    return reply;
  }
}
