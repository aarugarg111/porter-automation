// Stage 1 live-WhatsApp helper: connects whatsapp-web.js to the Porter phone, shows a scannable
// QR in the terminal, and (optionally) sends a test message. The login session is saved by
// LocalAuth under .wwebjs_auth/ using the SAME clientId the server uses (WHATSAPP_SELF), so after
// you scan once, `PORTER_LIVE=1 npx tsx src/index.ts` reuses it with no re-scan.
//
//   npm run wa:login                 # just log in (scan the QR)
//   npm run wa:login -- 919876543210 # log in, then send a test WhatsApp to that number
//
// One-time install (heavy — pulls Chromium): npm i whatsapp-web.js qrcode-terminal

const clientId = process.env.WHATSAPP_SELF || 'porter';
const testNumber = process.argv[2]; // optional: digits only, with country code (e.g. 91XXXXXXXXXX)

async function main() {
  let wweb: any, qrcode: any;
  try {
    wweb = await import('whatsapp-web.js');
    qrcode = (await import('qrcode-terminal')).default;
  } catch {
    console.error('\n❌ Missing packages. Install them first (one time):\n   npm i whatsapp-web.js qrcode-terminal\n');
    process.exit(1);
  }
  const { Client, LocalAuth } = wweb.default ?? wweb;

  console.log(`\n🔌 Connecting WhatsApp session "${clientId}" … (this opens a headless Chromium)`);
  const client = new Client({ authStrategy: new LocalAuth({ clientId }) });

  client.on('qr', (qr: string) => {
    console.log('\n📲 Scan this QR from the Porter phone:  WhatsApp → Settings → Linked Devices → Link a device\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('✅ Authenticated — session is being saved.'));
  client.on('auth_failure', (m: string) => { console.error('❌ Auth failed:', m); process.exit(1); });

  client.on('ready', async () => {
    console.log('\n🎉 WhatsApp is READY. Session saved under .wwebjs_auth/ — the server will reuse it.');
    if (testNumber) {
      const jid = `${testNumber.replace(/\D/g, '')}@c.us`;
      try {
        await client.sendMessage(jid, 'Porter Cockpit ✅ live WhatsApp test — agar yeh mila to bot kaam kar raha hai.');
        console.log(`📤 Test message sent to ${testNumber}.`);
      } catch (e) {
        console.error('⚠️  Could not send test message:', (e as Error).message);
      }
    }
    console.log('\nDone. Press Ctrl+C to exit (the saved session stays).');
  });

  await client.initialize();
}

main().catch((e) => { console.error(e); process.exit(1); });
