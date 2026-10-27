// Screen 5: Objekt-Ebene über der Karte (Canvas 2D + Matter.js). Platzhalter bis Meilenstein 5.
import type { App, Scene } from '../types';

export function finale(app: App): Scene {
  const el = document.getElementById('s-finale')!;
  el.querySelector('button')!.onclick = () => app.next();
  return { el, enter() {}, reset() {} };
}
