// Screen 2: Kuchen mit Kerze. Der Song startet sofort, der Puste-Hinweis kommt währenddessen.
// Er läuft weiter, bis das Mikrofon zuhört oder die Kerze per Tippen/Wischen ausgeht.
import { decode, play, type Track } from '../audio/player';
import { renderMusicbox } from '../audio/musicbox';
import { puff } from '../audio/sfx';
import { listen, micSupported } from '../audio/mic';
import type { App, Scene } from '../types';

const DEBUG = new URLSearchParams(location.search).has('debug');
const WISH_AFTER_MS = 0;
const HINT_AFTER_MS = 8000;
const HIT_PAD = 36; // Trefferfläche um Kerze und Flamme, in px

const TEXT = {
  hint: 'oder tipp auf die Kerze',
  denied: 'Kein Problem – tipp einfach auf die Kerze 👆',
  silent: 'Klappt nicht? Einfach tippen 👆',
  listening: 'Ich höre … jetzt kräftig pusten! 🌬️',
};

type State = 'song' | 'wish' | 'out';

function floaties(host: Element) {
  const colors = ['var(--accent)', 'var(--petrol)', 'var(--surface)', 'var(--paper)'];
  const shapes = ['', 'ring', 'star'];
  for (let i = 0; i < 14; i++) {
    const f = document.createElement('i');
    f.className = `floaty ${shapes[i % 3]}`;
    const r = (min: number, max: number) => min + Math.random() * (max - min);
    f.style.cssText = `--x:${r(2, 92)}%;--y:${r(2, 92)}%;--s:${r(8, 20)}px;--c:${colors[i % 4]};--d:${r(3, 6)}s;--delay:${-r(0, 6)}s;--dx:${r(-14, 14)}px`;
    host.append(f);
  }
}

export function cake(app: App): Scene {
  const el = document.getElementById('s-cake')!;
  const $ = <T extends Element>(sel: string) => el.querySelector<T>(sel)!;
  const tilt = $<SVGGElement>('.flame-tilt');
  const glow = $<SVGCircleElement>('.glow');
  const candle = $<SVGRectElement>('.candle');
  const flame = $<SVGGElement>('.flame');
  const smoke = $<SVGGElement>('.smoke');
  const wish = $<HTMLElement>('.wish');
  const wishText = $<HTMLElement>('.wish-text');
  const wishHint = $<HTMLElement>('.wish-hint');
  const micBtn = $<HTMLButtonElement>('.mic-btn');
  const debug = $<HTMLElement>('.mic-debug');

  $('.title').textContent = app.content.cake.title;
  floaties($('.floaties'));

  // Song schon beim Start vorbereiten: MP3 aus core.bin, sonst Spieluhr
  const songBuffer = (app.core.has('a1') ? decode(app.core.url('a1')!) : Promise.reject()).catch(renderMusicbox);

  let state: State = 'song';
  let run = 0; // schützt vor verspäteten Callbacks nach einem Replay
  let song: Track | undefined;
  let stopMic: (() => void) | undefined;
  let timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  function showWish() {
    if (state !== 'song') return;
    state = 'wish';
    wish.hidden = false;
    micBtn.hidden = !micSupported();
  }

  function hint(text: string) {
    wishHint.textContent = text;
    wishHint.classList.add('strong');
  }

  function hitCandle(x: number, y: number) {
    const a = candle.getBoundingClientRect();
    const b = flame.getBoundingClientRect();
    return (
      x > Math.min(a.left, b.left) - HIT_PAD &&
      x < Math.max(a.right, b.right) + HIT_PAD &&
      y > b.top - HIT_PAD &&
      y < a.bottom + HIT_PAD / 2
    );
  }

  function blowSmoke() {
    for (let i = 0; i < 5; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(120 + (Math.random() - 0.5) * 6));
      c.setAttribute('cy', '66');
      c.setAttribute('r', String(5 + Math.random() * 4));
      smoke.append(c);
      const dx = (Math.random() - 0.5) * 30;
      c.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 0.7 },
          { transform: `translate(${dx}px, -${70 + Math.random() * 30}px) scale(2.4)`, opacity: 0 },
        ],
        { duration: 1300, delay: i * 90, easing: 'ease-out', fill: 'both' },
      ).onfinish = () => c.remove();
    }
  }

  function blowOut() {
    if (state === 'out') return;
    state = 'out';
    stopMic?.();
    song?.stop(0.8);
    for (const t of timers) clearTimeout(t);
    timers = [];

    tilt.style.transform = '';
    tilt.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.2, .1)' }], {
      duration: 220,
      easing: 'ease-in',
      fill: 'forwards',
    });
    glow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    blowSmoke();
    puff();
    navigator.vibrate?.(80);
    wish.hidden = true;
    debug.hidden = true;
    later(2200, app.next);
  }

  // Tippen oder Wischen über die Kerze geht jederzeit
  el.addEventListener('pointerdown', (e) => {
    if (hitCandle(e.clientX, e.clientY)) blowOut();
  });
  el.addEventListener('pointermove', (e) => {
    if ((e.pointerType !== 'mouse' || e.buttons) && hitCandle(e.clientX, e.clientY)) blowOut();
  });

  micBtn.onclick = async () => {
    const myRun = run;
    micBtn.disabled = true;
    song?.stop(0.4); // sonst hört das Mikrofon die Musik
    try {
      const stop = await listen(
        (l) => {
          tilt.style.transform = `rotate(${-30 * l.strength}deg) scaleY(${1 - 0.3 * l.strength})`;
          if (DEBUG) {
            debug.hidden = false;
            debug.textContent = `Pegel   ${l.db.toFixed(1)} dB\nBasis   ${l.base.toFixed(1)} dB\nSchwelle ${l.threshold.toFixed(1)} dB\nGehalten ${l.held.toFixed(0)} ms\n${'█'.repeat(Math.round(l.strength * 20)).padEnd(20, '░')}`;
          }
        },
        blowOut,
      );
      if (myRun !== run || state === 'out') return stop();
      stopMic = stop;
      micBtn.hidden = true;
      wishText.textContent = TEXT.listening;
      later(HINT_AFTER_MS, () => hint(TEXT.silent));
    } catch {
      if (myRun !== run) return;
      micBtn.hidden = true;
      hint(TEXT.denied);
    }
  };

  function reset() {
    run++;
    state = 'song';
    song?.stop(0.1);
    song = undefined;
    stopMic?.();
    stopMic = undefined;
    for (const t of timers) clearTimeout(t);
    timers = [];
    for (const a of [...tilt.getAnimations(), ...glow.getAnimations()]) a.cancel();
    tilt.style.transform = '';
    smoke.replaceChildren();
    wish.hidden = true;
    wishText.textContent = 'Wünsch dir was … und puste die Kerze aus! 🎤';
    wishHint.textContent = TEXT.hint;
    wishHint.classList.remove('strong');
    micBtn.disabled = false;
    debug.hidden = true;
  }

  return {
    el,
    enter() {
      reset();
      const myRun = run;
      later(WISH_AFTER_MS, showWish);
      songBuffer.then((buffer) => {
        if (myRun !== run || state === 'out') return;
        song = play(buffer);
        // Falls der Song kürzer ist als die Wartezeit
        song.ended.then(() => {
          if (myRun === run) showWish();
        });
      });
    },
    reset,
  };
}
