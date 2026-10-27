// Screen 4: Explosion mit Konfetti (Canvas 2D). Platzhalter bis Meilenstein 5.
import type { App, Scene } from '../types';

export function burst(app: App): Scene {
  const el = document.getElementById('s-burst')!;
  el.querySelector('button')!.onclick = () => app.next();
  return { el, enter() {}, reset() {} };
}
