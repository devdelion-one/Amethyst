import { discordAsk } from './discord.ts';
import { crystal } from './crystal.ts';
import { DOCS } from './docs-data.ts';

const $ = <T extends Element = HTMLElement>(q: string, el: ParentNode = document): T | null => el.querySelector<T>(q);
const $$ = <T extends Element = HTMLElement>(q: string, el: ParentNode = document): T[] => [...el.querySelectorAll<T>(q)];

if ((window as unknown as { amethyst?: { desktop?: boolean } }).amethyst?.desktop) {
  const go = $('#site-go');
  if (go) go.hidden = false;
  $('#site-privacy')?.remove();
  $('#site-download-link')?.remove();
}

discordAsk();
for (const a of $$('.site-dl')) a.addEventListener('click', () => navigator.sendBeacon('/hit?e=download'));

const root = document.documentElement;
const themeBtns = $$<HTMLButtonElement>('[data-theme-set]');
const applyTheme = (name: string) => {
  root.setAttribute('data-theme', name);
  for (const b of themeBtns) b.setAttribute('aria-pressed', String(b.dataset.themeSet === name));
};
try {
  const saved = localStorage.getItem('amethyst-site-theme');
  if (saved && themeBtns.some((b) => b.dataset.themeSet === saved)) applyTheme(saved);
} catch {}
for (const btn of themeBtns) {
  btn.addEventListener('click', () => {
    const next = btn.dataset.themeSet || 'ink';
    applyTheme(next);
    try {
      localStorage.setItem('amethyst-site-theme', next);
    } catch {}
  });
}

const sheetTabs = $$<HTMLButtonElement>('.sheet-tab');
const sheetPanes = $$<HTMLElement>('[data-pane]');
function openSheetTab(name: string) {
  for (const t of sheetTabs) t.setAttribute('aria-selected', String(t.dataset.sheet === name));
  for (const p of sheetPanes) p.classList.toggle('inactive', p.dataset.pane !== name);
}
for (const t of sheetTabs) t.addEventListener('click', () => openSheetTab(t.dataset.sheet || 'inside'));

const shotTiles = $$<HTMLButtonElement>('.tile.has-shot');
const lightbox = $<HTMLDialogElement>('#lightbox');
const lbImg = $<HTMLImageElement>('#lb-img');
const lbTitle = $('#lb-title');
const lbCap = $('#lb-cap');
const lbCount = $('#lb-count');
let currentShot = 0;
let loadSeq = 0;

function openShot(index: number) {
  if (!lightbox || !lbImg || !lbTitle || !lbCap || !lbCount || !shotTiles.length) return;
  currentShot = (index + shotTiles.length) % shotTiles.length;
  const tile = shotTiles[currentShot];
  const seq = ++loadSeq;
  const src = tile.dataset.shot || '';
  lbTitle.textContent = tile.dataset.title || '';
  lbCap.textContent = tile.dataset.cap || '';
  lbCount.textContent = `${String(currentShot + 1).padStart(2, '0')} / ${String(shotTiles.length).padStart(2, '0')}`;
  lbImg.classList.add('loading');
  lbImg.removeAttribute('src');
  if (!lightbox.open) lightbox.showModal();
  const preload = new Image();
  preload.onload = () => {
    if (seq !== loadSeq) return;
    lbImg.src = src;
    lbImg.alt = `${tile.dataset.title || ''} in Amethyst`;
    lbImg.classList.remove('loading');
  };
  preload.src = src;
}

function closeShot() {
  loadSeq++;
  lightbox?.close();
  if (lbImg) {
    lbImg.classList.add('loading');
    lbImg.removeAttribute('src');
  }
}

shotTiles.forEach((tile, i) => tile.addEventListener('click', () => openShot(i)));
$('#lb-prev')?.addEventListener('click', () => openShot(currentShot - 1));
$('#lb-next')?.addEventListener('click', () => openShot(currentShot + 1));
$('#lb-close')?.addEventListener('click', closeShot);
lightbox?.addEventListener('click', (e) => {
  if (e.target === lightbox) closeShot();
});
lightbox?.addEventListener('cancel', () => {
  loadSeq++;
  if (lbImg) {
    lbImg.classList.add('loading');
    lbImg.removeAttribute('src');
  }
});
lightbox?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') openShot(currentShot - 1);
  else if (e.key === 'ArrowRight') openShot(currentShot + 1);
});

const docTiles = $$<HTMLButtonElement>('.doc-tile[data-doc]');
const docModal = $<HTMLDialogElement>('#doc-modal');
const docTitle = $('#doc-title');
const docBody = $('#doc-body');
const docCount = $('#doc-count');
let currentDoc = 0;

function openDoc(index: number) {
  if (!docModal || !docTitle || !docBody || !docCount || !docTiles.length) return;
  currentDoc = (index + docTiles.length) % docTiles.length;
  const id = docTiles[currentDoc].dataset.doc || '';
  const doc = DOCS[id];
  if (!doc) return;
  docTitle.textContent = doc.title;
  docBody.innerHTML = doc.html;
  docBody.scrollTop = 0;
  docCount.textContent = `${String(currentDoc + 1).padStart(2, '0')} / ${String(docTiles.length).padStart(2, '0')}`;
  if (!docModal.open) docModal.showModal();
}

docTiles.forEach((tile, i) => tile.addEventListener('click', () => openDoc(i)));
$('#doc-prev')?.addEventListener('click', () => openDoc(currentDoc - 1));
$('#doc-next')?.addEventListener('click', () => openDoc(currentDoc + 1));
$('#doc-close')?.addEventListener('click', () => docModal?.close());
docModal?.addEventListener('click', (e) => {
  if (e.target === docModal) docModal.close();
});
docModal?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') openDoc(currentDoc - 1);
  else if (e.key === 'ArrowRight') openDoc(currentDoc + 1);
});

const heroCanvas = $<HTMLCanvasElement>('#hero-crystal');
if (heroCanvas) crystal(heroCanvas, { palette: 'purple', work: true });
