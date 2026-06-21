// src/telephony/twiml.ts
// Builds Twilio TwiML for the inbound driver call. Deliberately deterministic: we PLAY a known,
// correct Hindi directions script (no live speech recognition → nothing to mis-hear). The shop is
// fixed, so the directions are always right. Provider = Twilio (no FloBiz infra; cheap; reliable).
const VOICE = 'Polly.Aditi'; // Amazon Polly Hindi voice (built into Twilio <Say>)
const LANG = 'hi-IN';

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

// Make the curated landmark string read cleanly as speech ("Bosch+Havells" → "Bosch aur Havells").
export function forSpeech(directions: string): string {
  return directions.replace(/\s*\+\s*/g, ' aur ').replace(/\s*;\s*/g, '. ').replace(/\s+/g, ' ').trim();
}

function say(text: string): string {
  return `<Say voice="${VOICE}" language="${LANG}">${escapeXml(text)}</Say>`;
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

const ACTION = '/voice/twilio-inbound';

// First turn (and the "press 1 to repeat" turn): greet + speak directions, then offer the menu.
export function greetingTwiml(directions: string, driverName?: string): string {
  const hi = driverName ? `Namaste ${driverName}!` : 'Namaste!';
  const spoken = forSpeech(directions);
  const msg = `${hi} Aryan Enterprises ke liye pickup. ${spoken}. Dohraane ke liye ek dabaaiye. Maalik se baat karne ke liye nau dabaaiye.`;
  // Gather one digit; if the caller stays silent, repeat the directions once and hang up gracefully.
  return response(
    `<Gather numDigits="1" action="${ACTION}" method="POST" timeout="6">${say(msg)}</Gather>` +
    say(spoken),
  );
}

// "Press 9": connect the driver to the shop owner.
export function dialOwnerTwiml(ownerPhone: string): string {
  return response(say('Maalik se jod rahe hain. Ek minute.') + `<Dial>${escapeXml(e164(ownerPhone))}</Dial>`);
}
