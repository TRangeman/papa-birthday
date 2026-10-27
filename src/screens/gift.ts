// Screen 1: Geschenk antippen (schaltet den Ton frei). Platzhalter bis Meilenstein 3.
import type { App, Scene } from '../types';

export function gift(app: App): Scene {
  const el = document.getElementById('s-gift')!;
  el.querySelector('.who')!.textContent = `Für ${app.content.name}`;
  el.querySelector('button')!.onclick = () => app.next();
  return { el, enter() {}, reset() {} };
}
