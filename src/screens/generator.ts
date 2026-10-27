// Screen 3: Geschenk-Generator. Platzhalter bis Meilenstein 4, zeigt vorerst nur, dass media.bin ankommt.
import type { App, Scene } from '../types';

export function generator(app: App): Scene {
  const el = document.getElementById('s-gen')!;
  const status = el.querySelector('.status')!;
  const thumbs = el.querySelector('.thumbs')!;
  el.querySelector('button')!.onclick = () => app.next();

  return {
    el,
    enter() {
      status.textContent = 'Lade Erinnerungen …';
      app.media.then((m) => {
        status.textContent = `${m.data.photos.length} Fotos · Musik: ${m.has('a2') ? 'Datei' : 'Ticks'}`;
        thumbs.replaceChildren(
          ...m.data.photos.map((p) => Object.assign(new Image(), { src: m.url(p)!, alt: '' })),
        );
      });
    },
    reset() {
      thumbs.replaceChildren();
    },
  };
}
