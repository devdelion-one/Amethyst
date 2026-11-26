import { bands, fileManager, hideMenu, ICONS, menuHead, miRow, popMenu, rowIcons } from '../base/controls.ts';
import { EDIT_ICONS } from '../base/editmenu.ts';
import { saveImages } from '../base/textbox.ts';
import { pastedImages } from '../base/chips.ts';
import { gem } from '../base/kinds.ts';
import { imgUrl } from '../base/model.ts';
import { isOff, onPref } from '../base/prefs.ts';
import { COLORS as TINTS } from '../base/theme.ts';
import { setSave, showErr, store, track } from '../base/util.ts';
import { onSize } from '../base/measure.ts';

type Item = { id: string; type: string; x: number; y: number; w: number; h: number; path: string };
type Stroke = { i: string; c: string; w: number; d: number[] };

const GX = 120, GY = 90;
const ZMIN = 0.1, ZMAX = 2;
const MINW = 60;
const THUMB = 160;
const COLORS = ['#1d1f24', '#f4f4f4', '#d0474f', '#e6b450', '#4caf6a', '#3f8fd0', '#8a5cd0'];
const SIZES = [2, 5, 12];
const tintName = (hex: string) => TINTS.find((c) => c.hex === hex)?.name;
const BG0 = TINTS.find((c) => c.name === 'violet')!.hex;
const HEX = /^#[0-9a-f]{6}$/i;
const okBg = (v: unknown): v is string => v === '' || (typeof v === 'string' && HEX.test(v));
const bgCss = (v: string) => (tintName(v) ? `color-mix(in srgb, var(--c-${tintName(v)}) 22%, var(--bg))` : v);
const mine = () => (store.get('padBgs', []) as string[]).filter((v) => HEX.test(v));
const BARS = ['move', 'paint', 'bg'];
const id = () => Math.random().toString(36).slice(2, 9);
const X = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const VIEW = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';
const MOVE = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v13M1.5 8h13M8 1.5L6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2"/></svg>';
const COPY = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5h7v8h-7zM3.5 10.5v-8h7"/></svg>';

export const padBarHtml = () => `<div class="pd-bar" role="toolbar" aria-label="the sketch board"><button data-pd="move" title="Move\nDrag to move the board and the images." data-tip-keys="=esc:move">${MOVE}<span>move</span></button><button data-pd="paint" title="Paint\nPaint on the board.">${gem('scratch')}<span>paint</span></button><button data-pd="bg" title="Background\nThe board's color."><i class="pd-bgc"></i><span>background</span></button></div>`;
export const padBarPic = () => padBarHtml().replace('data-pd="move"', 'data-pd="move" class="on"').replace('<i class="pd-bgc">', '<i class="pd-bgc" style="--c:var(--c-violet)">');

export function createPad(host: HTMLElement, { onChange, onShow }: { onChange?: () => void; onShow?: (rel: string) => void }) {
  let items: Item[] = [], strokes: Stroke[] = [];
  const view = { x: 0, y: 0, z: 1 };
  let needFit = true, tool = 'move', color = COLORS[0], size = SIZES[1], eraser = false, space = false, bg = BG0;
  const els = new Map<string, HTMLElement>();

  host.innerHTML = `
    <div class="pd-world"><svg class="pd-ink" width="1" height="1"></svg></div>
    <p class="pd-empty">paint · paste or drop an image · drag to move around</p>
    ${padBarHtml()}
    <div class="pd-tools pd-paint" hidden>${COLORS.map((c) => `<button class="pd-c" data-pd-color="${c}" style="--c:${c}" aria-label="color"></button>`).join('')}${SIZES.map((s) => `<button class="pd-s" data-pd-size="${s}" aria-label="line width"><i style="--s:${s}px"></i></button>`).join('')}<button data-pd="eraser">eraser</button></div>
    <div class="pd-view" hidden></div>`;
  const q = (s: string) => host.querySelector(s) as HTMLElement;
  const world = q('.pd-world'), ink = q('.pd-ink'), bar = q('.pd-bar'), tools = q('.pd-tools'), empty = q('.pd-empty'), big = q('.pd-view');
  host.tabIndex = -1;

  const changed = () => onChange?.();
  const byId = (i: string) => items.find((n) => n.id === i);
  const toWorld = (cx: number, cy: number) => {
    const r = host.getBoundingClientRect();
    return [view.x + (cx - r.left) / view.z, view.y + (cy - r.top) / view.z];
  };

  function camera() {
    const { x, y, z } = view, k = z < 0.25 ? 4 : 1;
    world.style.transform = `translate(${-x * z}px, ${-y * z}px) scale(${z})`;
    host.style.backgroundSize = `${GX * z * k}px ${GY * z * k}px`;
    host.style.backgroundPosition = `${-x * z}px ${-y * z}px`;
  }
  const pathOf = (s: Stroke) => (s.d.length < 4 ? `M${s.d[0]} ${s.d[1]}l.01 0` : 'M' + s.d.reduce((a, v, i) => a + (i ? (i % 2 ? ' ' : ' L') : '') + v, ''));
  function inkPath(s: Stroke, p = document.createElementNS('http://www.w3.org/2000/svg', 'path')) {
    p.dataset.i = s.i;
    p.setAttribute('d', pathOf(s));
    p.setAttribute('stroke', s.c);
    p.setAttribute('stroke-width', s.w as unknown as string);
    return p;
  }
  function drawInk() {
    const old = new Map([...ink.children as HTMLCollectionOf<SVGPathElement>].map((p) => [p.dataset.i, p]));
    ink.replaceChildren(...strokes.map((s) => inkPath(s, old.get(s.i))));
  }
  function place(n: Item) {
    const e = els.get(n.id);
    if (e) Object.assign(e.style, { left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' });
  }
  function make(n: Item) {
    const e = document.createElement('div');
    e.className = `pd-it pd-${n.type}`;
    e.dataset.id = n.id;
    e.innerHTML = `<img alt="" draggable="false" src="${imgUrl(n.path)}"><button class="pd-copy" data-act="copy" aria-label="copy its path">${COPY}</button><button class="pd-x" data-act="x" aria-label="remove it">${X}</button><i class="pd-rs"></i>`;
    els.set(n.id, e);
    world.append(e);
    place(n);
    return e;
  }
  function draw() {
    for (const [i, e] of els) if (!byId(i)) (e.remove(), els.delete(i));
    for (const n of items) {
      if (!els.has(n.id)) make(n);
      place(n);
    }
    drawInk();
    empty.hidden = !!(items.length || strokes.length) || tool === 'paint';
    q('[data-pd="move"]').classList.toggle('on', tool === 'move');
    q('[data-pd="paint"]').classList.toggle('on', tool === 'paint');
    for (const k of BARS) q(`[data-pd="${k}"]`).hidden = isOff('pad:off', k);
    const tint = tintName(bg);
    host.style.setProperty('--pd-bg', bgCss(bg));
    q('.pd-bgc').style.setProperty('--c', tint ? `var(--c-${tint})` : bg || 'transparent');
    q('[data-pd="eraser"]').classList.toggle('on', eraser);
    q('.pd-paint').hidden = tool !== 'paint';
    for (const b of host.querySelectorAll<HTMLElement>('[data-pd-color]')) b.classList.toggle('on', !eraser && b.dataset.pdColor === color);
    for (const b of host.querySelectorAll<HTMLElement>('[data-pd-size]')) b.classList.toggle('on', Number(b.dataset.pdSize) === size);
    host.classList.toggle('painting', tool === 'paint');
  }
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    needFit = false;
    const all = [...items, ...strokes.flatMap((s) => { const xs = s.d.filter((_, i) => !(i % 2)), ys = s.d.filter((_, i) => i % 2); return [{ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }]; })];
    if (!all.length) Object.assign(view, { x: 0, y: 0, z: 1 });
    else {
      const x0 = Math.min(...all.map((n) => n.x)), y0 = Math.min(...all.map((n) => n.y)), x1 = Math.max(...all.map((n) => n.x + n.w)), y1 = Math.max(...all.map((n) => n.y + n.h));
      const z = Math.min(1, Math.max(ZMIN, Math.min(w / (x1 - x0 + 120), h / (y1 - y0 + 120))));
      Object.assign(view, { z, x: x0 - 60 / z, y: y0 - 60 / z });
    }
    camera();
  }
  onSize(host, { name: 'pad.size', live: true, write: () => needFit && fit() });

  function load(content: string, quiet = false) {
    let d = null as any;
    try {
      d = JSON.parse(content);
    } catch {}
    if (d && !Array.isArray(d.items)) d = null;
    if (d) {
      items = d.items.filter((n: Item) => n.type === 'image' && Number.isFinite(n.x + n.y + n.w + n.h));
      strokes = (d.strokes || []).filter((s: Stroke) => Array.isArray(s.d) && s.d.length >= 2);
      bg = okBg(d.bg) ? d.bg : BG0;
    } else {
      items = [];
      strokes = [];
      bg = BG0;
    }
    if (!quiet) needFit = true;
    draw();
    if (needFit) fit();
  }
  const serialize = () => JSON.stringify({ v: 1, items, strokes, bg });

  function add(n: Omit<Item, 'id'>) {
    items.push({ id: id(), ...n });
    draw();
    changed();
  }
  async function addImages(files: File[], at?: number[]) {
    const paths = await saveImages(files);
    let k = 0;
    for (const path of paths) {
      const im = new Image();
      im.src = imgUrl(path);
      await im.decode().catch(() => {});
      const w = THUMB / view.z, h = (im.naturalWidth ? w * im.naturalHeight / im.naturalWidth : w * 0.75);
      const [px, py] = at || [view.x + host.clientWidth / 2 / view.z - w / 2, view.y + host.clientHeight / 2 / view.z - h / 2];
      add({ type: 'image', x: px + k * 24 / view.z, y: py + k * 24 / view.z, w, h, path });
      k++;
    }
  }
  function remove(i: string) {
    items = items.filter((n) => n.id !== i);
    draw();
  }

  const go = (e: PointerEvent, move: (ev: PointerEvent) => void, end: (ok: boolean, ev: PointerEvent) => void, esc?: () => boolean) => track(e, { move, end, esc });
  function pan(e: PointerEvent) {
    const x0 = e.clientX, y0 = e.clientY, vx = view.x, vy = view.y;
    host.classList.add('panning');
    go(e, (ev) => {
      view.x = vx - (ev.clientX - x0) / view.z;
      view.y = vy - (ev.clientY - y0) / view.z;
      camera();
    }, () => host.classList.remove('panning'));
  }
  function drag(e: PointerEvent, n: Item) {
    const fx = n.x, fy = n.y, x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    items = items.filter((m) => m !== n).concat(n);
    world.append(els.get(n.id)!);
    go(e, (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      n.x = fx + (ev.clientX - x0) / view.z;
      n.y = fy + (ev.clientY - y0) / view.z;
      place(n);
    }, (ok) => {
      if (moved && !ok) {
        Object.assign(n, { x: fx, y: fy });
        place(n);
      } else if (moved) changed();
      else if (ok) look(n);
    }, () => moved);
  }
  function resize(e: PointerEvent, n: Item) {
    const x0 = e.clientX, y0 = e.clientY, w0 = n.w, h0 = n.h;
    go(e, (ev) => {
      n.w = Math.max(MINW, w0 + (ev.clientX - x0) / view.z);
      n.h = n.w * h0 / w0;
      place(n);
    }, (ok) => {
      if (ok) return changed();
      Object.assign(n, { w: w0, h: h0 });
      place(n);
    }, () => true);
  }
  function paint(e: PointerEvent) {
    const start = toWorld(e.clientX, e.clientY).map((v) => Math.round(v * 10) / 10);
    if (eraser) {
      const r = 14 / view.z;
      const wipe = (ev: PointerEvent) => {
        const [x, y] = toWorld(ev.clientX, ev.clientY), kids = [...ink.children], keep: Stroke[] = [];
        strokes.forEach((s, k) => (s.d.some((v, i) => !(i % 2) && Math.hypot(v - x, s.d[i + 1] - y) < r + s.w / 2) ? kids[k]?.remove() : keep.push(s)));
        if (keep.length !== strokes.length) {
          strokes = keep;
          dirty = true;
        }
      };
      let dirty = false;
      wipe(e);
      return go(e, wipe, () => dirty && changed());
    }
    const s = { i: id(), c: color, w: size, d: start };
    strokes.push(s);
    const p = ink.appendChild(inkPath(s));
    let last = [e.clientX, e.clientY];
    go(e, (ev) => {
      if (Math.hypot(ev.clientX - last[0], ev.clientY - last[1]) < 2) return;
      last = [ev.clientX, ev.clientY];
      s.d.push(...toWorld(ev.clientX, ev.clientY).map((v) => Math.round(v * 10) / 10));
      p.setAttribute('d', pathOf(s));
    }, () => changed());
  }

  host.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.pd-bar, .pd-tools, .pd-view')) return;
    const it = (e.target as Element).closest<HTMLElement>('.pd-it'), n = it && byId(it.dataset.id!);
    if (e.button === 1 || (e.button === 0 && space) || (e.button === 2 && !it)) {
      e.preventDefault();
      return pan(e);
    }
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    host.focus();
    if (tool === 'paint') return paint(e);
    if (!n) return pan(e);
    if ((e.target as Element).closest('.pd-rs')) return resize(e, n);
    drag(e, n);
  });
  host.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]'), n = b && byId(b.closest<HTMLElement>('.pd-it')!.dataset.id!);
    if (!n) return;
    if (b!.dataset.act === 'x') {
      remove(n.id);
      changed();
    } else if (b!.dataset.act === 'copy') copy(n);
  });
  host.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if ((e.target as Element).closest('.pd-bar')) return hideMenu(e.clientX, e.clientY, 'pad', { up: true });
    const it = (e.target as Element).closest<HTMLElement>('.pd-image'), n = it && byId(it.dataset.id!);
    if (!n) return;
    const act = (k: string, ic: string, label: string, tip: string, key = '') => miRow(`data-k="${k}"`, ic, label, key, tip), gap = '<div class="sep"></div>';
    popMenu(e.clientX, e.clientY, menuHead(EDIT_ICONS.image, n.path.split('/').pop() || n.path) + bands({ actions:
      act('look', VIEW, 'view large', 'Opens the picture over the board; a click closes it.', 'click') + gap +
      act('copy', COPY, 'copy path', 'Copies where the picture is saved, inside the project.') +
      act('show', ICONS.reveal, `show in ${fileManager()}`, 'Opens the folder that holds the picture, with the picture selected.') + gap +
      act('remove', X, 'remove', 'Takes the picture off the board; the file stays.') }), (b) => {
      const k = b.dataset.k;
      if (k === 'show') onShow?.(n.path);
      else if (k === 'copy') copy(n);
      else if (k === 'look') look(n);
      else if (k === 'remove') (remove(n.id), changed());
    });
  });
  host.addEventListener('wheel', (e) => {
    if ((e.target as Element).closest('.pd-view')) return;
    e.preventDefault();
    const [wx, wy] = toWorld(e.clientX, e.clientY), r = host.getBoundingClientRect();
    view.z = Math.min(ZMAX, Math.max(ZMIN, view.z * Math.exp(-e.deltaY * 0.0015)));
    view.x = wx - (e.clientX - r.left) / view.z;
    view.y = wy - (e.clientY - r.top) / view.z;
    camera();
  }, { passive: false });
  host.addEventListener('keydown', (e) => {
    if (e.code === 'Space') (space = true), host.classList.add('hand'), e.preventDefault();
    else if (e.key === 'Escape' && !big.hidden) (big.hidden = true), e.stopPropagation();
    else if (e.key === 'Escape' && tool === 'paint') (tool = 'move'), draw();
  });
  host.addEventListener('keyup', (e) => e.code === 'Space' && ((space = false), host.classList.remove('hand')));
  host.addEventListener('focusout', () => ((space = false), host.classList.remove('hand')));
  host.addEventListener('paste', (e) => {
    const files = pastedImages(e);
    if (!files.length) return;
    e.preventDefault();
    addImages(files).catch(showErr);
  });
  host.addEventListener('dragover', (e) => [...(e.dataTransfer?.types || [])].includes('Files') && e.preventDefault());
  host.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    addImages(files, toWorld(e.clientX, e.clientY)).catch(showErr);
  });

  const onBar = (e: MouseEvent) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    if (b.dataset.pd === 'move') (tool = 'move'), (eraser = false);
    else if (b.dataset.pd === 'bg') return pickBg(b);
    else if (b.dataset.pdColor) (color = b.dataset.pdColor), (eraser = false);
    else if (b.dataset.pdSize) size = Number(b.dataset.pdSize);
    else if (b.dataset.pd === 'paint') tool = tool === 'paint' ? 'move' : 'paint';
    else if (b.dataset.pd === 'eraser') eraser = !eraser;
    draw();
  };
  for (const el of [bar, tools]) el.addEventListener('click', onBar);
  function pickBg(b: HTMLElement) {
    const r = b.getBoundingClientRect(), was = bg;
    const sw = TINTS.map((c) => `<button class="sw ${c.hex === bg ? 'on' : ''}" data-pd-bg="${c.hex}" aria-label="${c.name}" style="--c:var(--c-${c.name})"></button>`).join('');
    const own = mine().map((v) => `<button class="sw ${v === bg ? 'on' : ''}" data-pd-bg="${v}" data-pd-mine="${v}" title="Your color\nA background color you added. Right-click to remove it." style="--c:${v}"></button>`).join('');
    const set = (v: string) => {
      if (v === bg) return;
      bg = v;
      draw();
      changed();
    };
    popMenu(r.left, r.top - 4, `<div class="row">${sw}</div>${own ? `<div class="row">${own}</div>` : ''}<button class="mi ${bg === '' ? 'on' : ''}" data-pd-bg="">plain</button><label class="mi sc-custom">add a color<input type="color" value="${HEX.test(bg) && !tintName(bg) ? bg : '#000000'}"></label>`, (o) => set(o.dataset.pdBg!), true, (o) => {
      const v = o.dataset.pdMine;
      if (!v) return;
      store.set('padBgs', mine().filter((x) => x !== v));
      o.remove();
    });
    const input = document.querySelector('#colormenu input[type=color]') as HTMLInputElement;
    input.oninput = () => {
      bg = input.value;
      draw();
    };
    input.onchange = () => {
      const v = input.value.toLowerCase();
      store.set('padBgs', [...mine().filter((x) => x !== v), v].slice(-12));
      bg = was;
      set(v);
      pickBg(b);
    };
  }
  onPref('pad:off', () => draw());

  function copy(n: Item) {
    navigator.clipboard.writeText(n.path).then(() => setSave('copied ' + n.path), () => setSave('could not copy', true));
  }
  function look(n: Item) {
    big.innerHTML = `<img alt="" src="${imgUrl(n.path)}">`;
    big.hidden = false;
  }
  big.addEventListener('click', () => (big.hidden = true));

  camera();
  return { load, serialize, focus: () => host.focus() };
}

rowIcons({ 'pad:off:move': () => MOVE, 'pad:off:paint': () => gem('scratch'), 'pad:off:bg': () => '<i class="pd-bgc" style="--c:var(--c-violet)"></i>' });
