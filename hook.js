'use strict';

const { MIND_TERM_URL: url, MIND_TERM_ID: id, MIND_TERM_KEY: key } = process.env;
const event = process.argv[2];

if (!url || !id || !key) process.exit(0);

let input = '';
if (process.versions.electron) {
  try {
    input = require('fs').readFileSync(0, 'utf8');
  } catch {}
  setImmediate(tell);
} else {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', tell);
  setTimeout(tell, 2000);
}

let told = false;
async function tell() {
  if (told) return;
  told = true;
  let h = {};
  try {
    h = JSON.parse(input);
  } catch {}
  const body = { id, key, event, prompt: h.prompt, message: h.message, type: h.notification_type, text: h.last_assistant_message };
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) });
  } catch {}
  process.exit(0);
}
