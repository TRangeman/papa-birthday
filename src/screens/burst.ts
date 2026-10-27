// Screen 4: Explosion. Läuft noch auf dem Generator-Screen: Der Ladebalken bläht sich auf und platzt,
// Konfetti fliegt (eigenes Canvas über allem), und im selben Moment geht es weiter zum Finale.
import { plopp } from '../audio/sfx';
import type { App, Scene } from '../types';

const INFLATE_MS = 350;
const CONFETTI_COUNT = 120;
const CONFETTI_MS = 2500;
const FADE_MS = 500;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function confetti(x: number, y: number): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const dpr = Math.min(2, devicePixelRatio);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const root = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--lime', '--petrol', '--surface'].map((v) => root.getPropertyValue(v).trim());
  const parts = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5; // vor allem nach oben
    const speed = 6 + Math.random() * 10;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.4,
      flip: Math.random() * 6,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      color: colors[i % colors.length],
      round: Math.random() < 0.3,
    };
  });

  const start = performance.now();
  let last = start;
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
  const frame = (now: number) => {
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    const life = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.min(1, (CONFETTI_MS - life) / FADE_MS);
    const drag = 0.985 ** dt;
    for (const p of parts) {
      p.vx *= drag;
      p.vy = p.vy * drag + 0.25 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.flip += 0.15 * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip)); // Flattern
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (life < CONFETTI_MS) raf = requestAnimationFrame(frame);
    else stop();
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

export function burst(app: App): Scene {
  const el = document.getElementById('s-gen')!;
  const meter = el.querySelector<HTMLElement>('.meter')!;
  let timer = 0;
  let stopConfetti: (() => void) | undefined;

  return {
    el,
    enter() {
      if (REDUCED) return app.next();
      meter.animate([{ transform: 'none' }, { transform: 'scale(1.12, 2.4)' }], {
        duration: INFLATE_MS,
        easing: 'cubic-bezier(.5, 0, .9, .6)',
        fill: 'forwards',
      });
      timer = window.setTimeout(() => {
        meter.animate(
          [
            { transform: 'scale(1.12, 2.4)', opacity: 1 },
            { transform: 'scale(1.6, 3)', opacity: 0 },
          ],
          { duration: 90, fill: 'forwards' },
        );
        plopp();
        navigator.vibrate?.([40, 60, 40]);
        const r = meter.getBoundingClientRect();
        stopConfetti = confetti(r.left + r.width / 2, r.top + r.height / 2);
        app.next();
      }, INFLATE_MS);
    },
    reset() {
      clearTimeout(timer);
      stopConfetti?.();
      for (const a of meter.getAnimations()) a.cancel();
    },
  };
}
