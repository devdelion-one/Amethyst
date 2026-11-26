const CSS = `.discord-ask { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #413a54; border-radius: 6px; background: #1c1a24; box-shadow: 0 12px 32px rgb(0 0 0 / 0.6); color: #9d99ad; font: 400 12.5px/1.4 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
.discord-ask a { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 14px; border-radius: 4px; background: #5865f2; color: #ffffff; font-weight: 600; font-size: 13px; text-decoration: none; white-space: nowrap; }
.discord-ask a:hover, .discord-ask a:focus-visible { background: #4752c4; text-decoration: none; }`;

let box: HTMLElement | null = null;

const shut = () => {
  box?.remove();
  box = null;
};

const ask = (href: string, x: number, y: number) => {
  shut();
  box = document.createElement('div');
  box.className = 'discord-ask';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Open Discord');
  box.innerHTML = `<span>Opens the Amethyst Discord in a new tab.</span><a href="${href}" target="_blank" rel="noopener">Take me to Discord ↗</a>`;
  document.body.append(box);
  const r = box.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(x - r.width / 2, innerWidth - r.width - 8))}px`;
  box.style.top = `${y + 12 + r.height > innerHeight - 8 ? y - r.height - 12 : y + 12}px`;
  const go = box.querySelector('a')!;
  go.addEventListener('click', () => {
    navigator.sendBeacon('/hit?e=join');
    shut();
  });
  go.focus();
};

export function discordAsk() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="https://discord.gg"]')) {
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      const r = a.getBoundingClientRect();
      const mouse = e.detail > 0;
      ask(a.href, mouse ? e.clientX : r.left + r.width / 2, mouse ? e.clientY : r.bottom);
    });
  }
  addEventListener('pointerdown', (e) => { if (box && !box.contains(e.target as Node)) shut(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
  addEventListener('scroll', shut, { passive: true, capture: true });
  addEventListener('resize', shut);
}
