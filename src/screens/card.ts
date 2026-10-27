// Screen 6: Karte befüllen, Nochmal von vorn. Ticket-Optik und Buttons folgen in Meilenstein 6.
import type { App, Content, Scene } from '../types';

export function card(app: App): Scene {
  const el = document.getElementById('s-card')!;
  const c = app.content.card;
  for (const f of el.querySelectorAll<HTMLElement>('[data-c]')) {
    f.textContent = c[f.dataset.c as keyof Content['card']] ?? '';
  }

  // Unterschrift: Datei aus core.bin, sonst Handschrift-Font
  const sign = el.querySelector('.sign')!;
  const src = app.core.url('sig');
  sign.replaceChildren(src ? Object.assign(new Image(), { src, alt: app.content.from }) : `— ${app.content.from}`);

  el.querySelector<HTMLElement>('.again')!.onclick = () => app.replay();
  return { el, enter() {}, reset() {} };
}
