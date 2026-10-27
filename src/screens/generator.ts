// Screen 3: Geschenk-Generator. Fotos, unehrlicher Ladebalken und Terminal-Captions, alles an einer Uhr,
// die mit dem Song startet. Vorletzte Caption = 99 %-Hänger mit Glitch, letzte = Ergebnis.
// Der Song läuft danach weiter bis zu seinem Ende; nur ein Replay stoppt ihn.
import { decode, play, type Track } from '../audio/player';
import { tick } from '../audio/sfx';
import type { App, Scene } from '../types';

const LINE_MS = 2800; // Standard-Gewicht einer Caption
const CHECK_MS = 450; // pro Interessen-Häkchen
const MAX_TYPE_MS = 30; // pro Buchstabe, bei knapper Zeit schneller
const CALM_PHOTO_MS = 1300;
const RAPID_PHOTO_MS = 150;
const RAPID_MS = 3000; // Stakkato am Ende
const CALM_TICK_VOLUME = 0.6; // ruhige Bildwechsel leiser als das Stakkato
const GLITCH_MS = 450;
const LAST_LINE_MS = 1300; // so lange steht das Ergebnis vor der Explosion
const KEEP_LINES = 4;
const DECODE_WAIT_MS = 4000; // länger wird nicht auf das Vorab-Dekodieren gewartet
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Unehrlicher Ladebalken bis zur vorletzten Caption: [Zeitanteil, Prozent]
const BAR: [number, number][] = [
  [0, 0], [0.1, 12], [0.18, 13], [0.26, 34], [0.33, 27], [0.42, 46],
  [0.55, 51], [0.64, 72], [0.72, 73], [0.86, 93], [1, 99],
];

interface Prepared {
  urls: string[];
  song?: AudioBuffer;
}

function barAt(x: number) {
  for (let k = 1; k < BAR.length; k++) {
    const [x1, p1] = BAR[k];
    if (x <= x1) {
      const [x0, p0] = BAR[k - 1];
      return p0 + ((p1 - p0) * (x - x0)) / (x1 - x0);
    }
  }
  return 99;
}

export function generator(app: App): Scene {
  const el = document.getElementById('s-gen')!;
  const frame = el.querySelector<HTMLElement>('.frame')!;
  const layers = [...el.querySelectorAll<HTMLImageElement>('.ph')];
  const bar = el.querySelector<HTMLElement>('.bar i')!;
  const pct = el.querySelector<HTMLElement>('.pct')!;
  const term = el.querySelector<HTMLElement>('.term')!;
  const { lines, checks } = app.content.gen;

  // Fotos vorab dekodieren und Song vorbereiten, sobald media.bin da ist
  let prepared: Prepared | undefined;
  const keep: HTMLImageElement[] = []; // hält die dekodierten Bilder im Speicher
  const ready = app.media
    .then(async (m): Promise<Prepared> => {
      const urls = m.data.photos.map((p) => m.url(p)!);
      await Promise.race([
        Promise.all(
          urls.map((src) => {
            const img = Object.assign(new Image(), { src });
            keep.push(img);
            return img.decode().catch(() => {});
          }),
        ),
        new Promise((resolve) => setTimeout(resolve, DECODE_WAIT_MS)),
      ]);
      const song = m.has('a2') ? await decode(m.url('a2')!).catch(() => undefined) : undefined;
      return { urls, song };
    })
    .catch((): Prepared => ({ urls: [] }))
    .then((p) => (prepared = p));

  let run = 0;
  let raf = 0;
  let loading = 0;
  let song: Track | undefined;

  function line(text: string) {
    const div = document.createElement('div');
    div.className = 'line cur';
    div.textContent = text;
    term.append(div);
    while (term.children.length > KEEP_LINES) term.firstElementChild!.remove();
    return div;
  }

  function showLoading() {
    const div = line('');
    let k = 0;
    const draw = () => (div.textContent = `Lade Erinnerungen … ${'█'.repeat(k).padEnd(6, '▒')}`);
    draw();
    loading = window.setInterval(() => {
      k = (k + 1) % 7;
      draw();
    }, 250);
  }

  function start(p: Prepared) {
    clearInterval(loading);
    term.replaceChildren();
    frame.classList.toggle('empty', !p.urls.length);

    const total = app.content.gen.sec * 1000;
    const tGlitch = total - RAPID_MS - GLITCH_MS;
    const tLast = total - LAST_LINE_MS;
    const rapidFrom = REDUCED ? Infinity : total - RAPID_MS;

    // Alle Captions außer der letzten teilen sich die Zeit bis zum Glitch, gewichtet
    const weights = lines.slice(0, -1).map((l) => (l.ms ?? LINE_MS) + (l.checks ? checks.length * CHECK_MS : 0));
    const sum = weights.reduce((a, b) => a + b, 0);
    const starts: number[] = [];
    let acc = 0;
    for (const w of weights) {
      starts.push((acc / sum) * tGlitch);
      acc += w;
    }
    starts.push(tLast);
    const tHang = starts[starts.length - 2] ?? 0;
    const typeMs = lines.map((l, i) => {
      const slot = (starts[i + 1] ?? total) - starts[i] - (l.checks ? checks.length * CHECK_MS : 0);
      return Math.min(MAX_TYPE_MS, (slot * 0.55) / Math.max(1, l.text.length));
    });

    const fullText = (i: number, chars: number, done: number) =>
      lines[i].text.slice(0, chars) + checks.slice(0, done).map((c) => `  ${c} ✓`).join('');

    let lineIdx = -1;
    let lineEl: HTMLElement | undefined;
    let shownText = '';
    let shownPct = -1;
    let photoIdx = -1;
    let front = 0;

    function showPhoto(i: number, rapid: boolean) {
      if (!p.urls.length) return;
      const src = p.urls[i % p.urls.length];
      el.classList.toggle('rapid', rapid);
      if (rapid) {
        layers[front].src = src;
        return;
      }
      const back = 1 - front;
      layers[back].src = src;
      layers[back].classList.add('on');
      layers[front].classList.remove('on');
      front = back;
    }

    song = p.song ? play(p.song, 1) : undefined;
    const t0 = performance.now();

    const frameLoop = (now: number) => {
      const t = now - t0;

      // Captions
      while (lineIdx + 1 < lines.length && t >= starts[lineIdx + 1]) {
        if (lineEl) {
          lineEl.textContent = fullText(lineIdx, Infinity, lines[lineIdx].checks ? checks.length : 0);
          lineEl.classList.remove('cur');
        }
        lineIdx++;
        lineEl = line('');
        shownText = '';
      }
      if (lineEl) {
        const l = lines[lineIdx];
        const dt = t - starts[lineIdx];
        const chars = Math.floor(dt / typeMs[lineIdx]);
        const done = l.checks ? Math.floor((dt - l.text.length * typeMs[lineIdx]) / CHECK_MS) : 0;
        const text = fullText(lineIdx, chars, Math.max(0, Math.min(checks.length, done)));
        if (text !== shownText) lineEl.textContent = shownText = text;
      }

      // Ladebalken
      const value = Math.floor(t >= tLast ? 100 : t >= tHang ? 99 : barAt(t / tHang));
      if (value !== shownPct) {
        shownPct = value;
        bar.style.transform = `scaleX(${value / 100})`;
        pct.textContent = `${value} %`;
      }

      el.classList.toggle('glitch', !REDUCED && t >= tGlitch && t < tGlitch + GLITCH_MS);

      // Fotos: ruhig, am Ende Stakkato
      const idx =
        t < rapidFrom
          ? Math.floor(t / CALM_PHOTO_MS)
          : Math.floor(rapidFrom / CALM_PHOTO_MS) + 1 + Math.floor((t - rapidFrom) / RAPID_PHOTO_MS);
      if (idx !== photoIdx) {
        photoIdx = idx;
        showPhoto(idx, t >= rapidFrom);
        if (idx > 0) tick(t >= rapidFrom ? 1 : CALM_TICK_VOLUME);
      }

      if (t >= total) {
        app.next();
      } else {
        raf = requestAnimationFrame(frameLoop);
      }
    };
    raf = requestAnimationFrame(frameLoop);
  }

  function reset() {
    run++;
    cancelAnimationFrame(raf);
    clearInterval(loading);
    song?.stop(0.1);
    song = undefined;
    term.replaceChildren();
    bar.style.transform = 'scaleX(0)';
    pct.textContent = '0 %';
    for (const l of layers) {
      l.classList.remove('on');
      l.removeAttribute('src');
    }
    el.classList.remove('glitch', 'rapid');
    frame.classList.remove('empty');
  }

  return {
    el,
    enter() {
      reset();
      const myRun = run;
      if (prepared) return start(prepared);
      showLoading();
      ready.then((p) => {
        if (myRun === run) start(p);
      });
    },
    reset,
  };
}
