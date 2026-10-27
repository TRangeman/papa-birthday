// Screen 2: Kuchen mit Kerze. Platzhalter bis Meilenstein 3.
import type { App, Scene } from '../types';

export function cake(app: App): Scene {
  const el = document.getElementById('s-cake')!;
  el.querySelector('.title')!.textContent = app.content.cake.title;
  el.querySelector('.info')!.textContent = app.core.has('a1') ? 'Musik: Datei' : 'Musik: Spieluhr-Fallback';
  el.querySelector('button')!.onclick = () => app.next();
  return { el, enter() {}, reset() {} };
}
