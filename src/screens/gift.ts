// Screen 1: Geschenk antippen. Der Tipp schaltet den Ton frei, der Deckel springt auf, weiter zum Kuchen.
import { unlock } from '../audio/player';
import type { App, Scene } from '../types';

const OPEN_MS = 550;

export function gift(app: App): Scene {
  const el = document.getElementById('s-gift')!;
  const lid = el.querySelector<SVGGElement>('.gift-lid')!;
  const box = el.querySelector<SVGGElement>('.gift-box')!;
  el.querySelector('.who')!.textContent = `Für ${app.content.name}`;

  let opened = false;
  let timer = 0;

  el.onclick = () => {
    if (opened) return;
    opened = true;
    unlock();
    el.classList.add('open');
    lid.animate(
      [{ transform: 'none' }, { transform: 'translate(24px, -120px) rotate(28deg)', opacity: 0 }],
      { duration: 650, easing: 'cubic-bezier(.3, 1.3, .6, 1)', fill: 'forwards' },
    );
    box.animate([{ transform: 'none' }, { transform: 'scale(1.08, .9)' }, { transform: 'none' }], {
      duration: 300,
      easing: 'ease-out',
    });
    timer = window.setTimeout(app.next, OPEN_MS);
  };

  return {
    el,
    enter() {},
    reset() {
      opened = false;
      clearTimeout(timer);
      el.classList.remove('open');
      for (const a of [...lid.getAnimations(), ...box.getAnimations()]) a.cancel();
    },
  };
}
