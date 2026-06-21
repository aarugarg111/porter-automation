// src/telephony/twiml.ts
// Builds Twilio TwiML for the conversational inbound driver call. The driver speaks (Twilio does
// Hindi speech-to-text in <Gather input="speech">), we reply with the next leg, and loop. Provider
// = Twilio (no FloBiz infra; cheap; reliable). Decision logic lives in ./guide.ts.
const VOICE = 'Polly.Aditi'; // Amazon Polly Hindi voice (built into Twilio <Say>)
const LANG = 'hi-IN';
const ACTION = '/voice/twilio-inbound';

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

// Make a curated landmark string read cleanly as speech ("Bosch+Havells" → "Bosch aur Havells").
export function forSpeech(directions: string): string {
  return directions.replace(/\s*\+\s*/g, ' aur ').replace(/\s*;\s*/g, '. ').replace(/\s+/g, ' ').trim();
}

function say(text: string): string {
  return `<Say voice="${VOICE}" language="${LANG}">${escapeXml(forSpeech(text))}</Say>`;
}

function response(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${inner}</Response>`;
}

// E.164 for <Dial> (assume India if a bare 10-digit number).
export function e164(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return '+' + d;
  return '+' + (d.length === 10 ? '91' + d : d);
}

// Ask the driver something and listen (speech + the "9 = owner" keypad fallback). On silence Twilio
// follows the <Redirect> back into the webhook with the attempt counter bumped.
export function askTwiml(prompt: string, attempt: number): string {
  const a = `${ACTION}?step=guide&amp;n=${attempt}`;
  const redirect = `${ACTION}?step=guide&amp;n=${attempt + 1}&amp;silent=1`;
  return response(
    `<Gather input="speech dtmf" language="${LANG}" speechTimeout="auto" numDigits="1" action="${a}" method="POST">` +
      say(prompt) +
    `</Gather>` +
    `<Redirect method="POST">${redirect}</Redirect>`,
  );
}

// Capture the driver's real WhatsApp number on the keypad (100% reliable, unlike speech for digits).
// "#" ends entry; silence/skip → straight to voice guidance.
export function askNumberTwiml(prompt: string): string {
  return response(
    `<Gather input="dtmf" numDigits="10" finishOnKey="#" timeout="8" action="${ACTION}?step=number" method="POST">` +
      say(prompt) +
    `</Gather>` +
    `<Redirect method="POST">${ACTION}?step=guide&amp;n=0&amp;silent=1</Redirect>`,
  );
}

// Speak a line, then keep listening (used after a recognised landmark).
export function sayThenAskTwiml(line: string, attempt: number): string {
  return askTwiml(line, attempt);
}

// "Press 9" / stuck: say a line, then connect the driver to the owner.
export function dialOwnerTwiml(line: string, ownerPhone: string): string {
  return response(say(line) + `<Dial>${escapeXml(e164(ownerPhone))}</Dial>`);
}

// Driver has arrived: say the final line and hang up.
export function hangupTwiml(line: string): string {
  return response(say(line) + '<Hangup/>');
}
