const msg = document.querySelector('#msg') as HTMLElement;
const got = /#pair=([\w-]+)/.exec(location.hash);
if (got) {
  history.replaceState(null, '', '/');
  msg.textContent = '';
  fetch('/api/remote/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: got[1] }) })
    .then(async (r) => (r.ok ? location.replace('/app?phone=1') : (msg.textContent = (await r.json().catch(() => ({}))).error || 'Pairing failed.')))
    .catch(() => (msg.textContent = "Can't reach Amethyst. Is the PC awake and on this Wi-Fi?"));
}
