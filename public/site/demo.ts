export type {};
const $ = <T = any>(s: string): T => document.querySelector(s) as T;
const stage = $('#stage') as HTMLElement, deck = $('#deck'), tabs = $('#tabs'), count = $('#count');
const W = 1280, H = 682, GAP = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 720);
  stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
}
addEventListener('resize', fit);
fit();

const NAMES = ['refactor auth', 'write tests', 'fix the build', 'map the inbox', 'review PR #42', 'docs pass', 'speed up search', 'port to rust', 'tidy css', 'release notes', 'hunt a leak', 'new onboarding', 'split the deck', 'undo everywhere', 'dark theme', 'plan Q3', 'triage bugs', 'a11y sweep', 'cache layer', 'i18n strings'];
const MODELS = ['opus', 'sonnet', 'haiku'];
const LINES = ['reading src/model.js', 'grep "export function"', 'editing 3 files', 'npm run check ✓', 'thinking…', 'running tests', 'writing plan.md', 'diff +42 −7', 'searching the web', 'fixing a typo', 'opening a terminal', 'git commit -m "wip"', 'reviewing changes', 'asking a sub-agent', 'patching routes.ts'];

type Card = { el: HTMLElement; body: HTMLElement; bar: HTMLElement; progress: number; done: boolean };
type Rect = { x: number; y: number; w: number; h: number };
let cards: Card[] = [];
function addCard() {
  const el = document.createElement('div');
  el.className = 'card new';
  el.addEventListener('animationend', () => el.classList.remove('new'), { once: true });
  el.innerHTML = `<div class="hd"><i></i><span>${cards.length + 1} · ${pick(NAMES)}</span><em>${pick(MODELS)}</em></div><div class="bd"></div><div class="bar"></div>`;
  const c: Card = { el, body: el.querySelector('.bd') as HTMLElement, bar: el.querySelector('.bar') as HTMLElement, progress: 0, done: false };
  const r = slotRect(cards.length, cards.length + 1);
  place(c, r);
  deck.append(el);
  cards.push(c);
  return c;
}

function grid(n: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * W) / H / 1.3)));
  return { cols, rows: Math.ceil(n / cols) };
}
function slotRect(i: number, n: number) {
  const { cols, rows } = grid(n);
  const w = (W - GAP * (cols + 1)) / cols, h = (H - GAP * (rows + 1)) / rows;
  return { x: GAP + (i % cols) * (w + GAP), y: GAP + Math.floor(i / cols) * (h + GAP), w, h };
}
function place(c: Card, r: Rect) {
  Object.assign(c.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
function layout(order = cards) {
  order.forEach((c, i) => place(c, slotRect(i, order.length)));
}
function focus(big: Card) {
  const rest = cards.filter((c) => c !== big), bw = W * 0.42;
  place(big, { x: GAP, y: GAP, w: bw - GAP, h: H - GAP * 2 });
  const { cols, rows } = grid(rest.length), rw = W - bw - GAP;
  const w = (rw - GAP * cols) / cols, h = (H - GAP * (rows + 1)) / rows;
  rest.forEach((c, i) => place(c, { x: bw + GAP + (i % cols) * (w + GAP), y: GAP + Math.floor(i / cols) * (h + GAP), w, h }));
}

function addTab(name: string, on: boolean) {
  const t = document.createElement('div');
  t.className = 'tab' + (on ? ' on' : '');
  t.textContent = name;
  for (const x of tabs.children) if (on) x.classList.remove('on');
  tabs.append(t);
}

let streaming = true;
(async function stream() {
  while (true) {
    await sleep(70);
    if (!streaming) continue;
    for (const c of cards) {
      if (c.done || Math.random() > 0.25) continue;
      const p = document.createElement('p');
      p.textContent = '› ' + pick(LINES);
      c.body.append(p);
      if (c.body.children.length > 14) c.body.firstChild!.remove();
      c.progress = Math.min(0.92, c.progress + Math.random() * 0.06);
      c.bar.style.width = c.progress * 100 + '%';
    }
  }
})();

const setCount = (txt: string) => (count.textContent = txt);

function finish(c: Card) {
  c.done = true;
  c.el.classList.add('done');
  c.bar.style.width = '100%';
  const p = document.createElement('p');
  p.textContent = '✓ done';
  c.body.append(p);
}

function burst(n: number) {
  const colors = ['#b18cff', '#a3c99a', '#dcc185', '#8cc4dc', '#e3a0b4', '#faf6ff'];
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div');
    b.className = 'bit';
    b.style.background = pick(colors);
    stage.append(b);
    const a = Math.random() * Math.PI * 2, d = 300 + Math.random() * 700;
    b.animate([{ transform: 'translate(0,0) scale(1.4)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${Math.random() * 720}deg) scale(.3)`, opacity: 0 }], { duration: 900 + Math.random() * 700, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => b.remove();
  }
}

async function shout(txt: string, ms: number) {
  const s = $('#shout');
  s.textContent = txt;
  s.classList.add('on');
  await sleep(ms);
  s.classList.remove('on');
}

async function run() {
  deck.innerHTML = tabs.innerHTML = '';
  cards = [];
  streaming = true;
  $('#end').classList.remove('on');
  addTab('agents', true);
  setCount('0 agents');
  await sleep(700);

  for (let i = 0; i < 50; i++) {
    addCard();
    layout();
    setCount(`${cards.length} agents`);
    await sleep(Math.max(35, 420 - i * 18));
  }
  await shout('50 agents', 900);

  for (let round = 0; round < 3; round++) {
    await sleep(900);
    layout([...cards].sort(() => Math.random() - 0.5));
    await sleep(900);
    focus(pick(cards));
  }
  await sleep(1000);
  layout();
  await sleep(800);

  for (let i = 0; i < cards.length; i++) {
    finish(cards[i]);
    setCount(`${i + 1}/50 done`);
    await sleep(30);
  }
  await sleep(900);

  streaming = false;
  for (const c of cards) Object.assign(c.el.style, { transform: 'scale(.2)', opacity: '0' });
  await sleep(400);
  $('#over').classList.add('on');
  stage.classList.add('shake');
  await sleep(2600);

  $('#over').classList.remove('on');
  stage.classList.remove('shake');
  const f = $('#flash');
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
  burst(160);
  deck.innerHTML = tabs.innerHTML = '';
  cards = [];
  streaming = true;
  const sets = ['agents', 'backend', 'frontend', 'tests', 'docs', 'release', 'research', 'design', 'infra', 'ideas'];
  for (const [i, name] of sets.entries()) {
    addTab(name, true);
    for (let k = 0; k < 12; k++) addCard();
    layout();
    setCount(`${cards.length} agents`);
    if (i === 3) shout('MORE', 700);
    if (i === 7) shout('SO MUCH RUN!!!', 1200);
    await sleep(320);
  }
  await sleep(2400);

  $('#end').classList.add('on');
  await sleep(4000);
}

while (true) await run();
