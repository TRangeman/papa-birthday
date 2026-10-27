// Screen 5: Objekt-Ebene über der Karte. Canvas 2D zeichnet, Matter.js rechnet.
// Ansicht von oben: keine Schwerkraft, Luftreibung; der Finger ist ein unsichtbarer runder Körper.
import Matter from 'matter-js';
import { bump } from '../audio/sfx';
import type { App, Scene } from '../types';

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

const SIZE = 1 / 6; // Durchmesser relativ zur Breite
const MAX_COUNT = 40;
const FINGER_R = 26;
const WALL = 200;
const LAUNCH_MS = 700; // fliegen raus, werden kurz größer und "landen"
const STEP_MS = 1000 / 60;
const TIDY_AFTER_MS = 20000;
// Anteil freier Kartenfläche, ab dem "Aufräumen" erscheint. Die Karte ist fast bildschirmbreit,
// weggeschobene Objekte stauen sich also an ihren Rändern: mehr als ca. 60 % frei ist kaum erreichbar.
const TIDY_FREE = 0.6;
const TIDY_GAIN = 0.1; // … und mindestens so viel mehr als direkt nach der Landung (dort ca. 50 %)
const FPS_CHECK_MS = 2000;
const MIN_FPS = 40;
const REDUCE_TO = 15;
const FADE_MS = 300;
const BUMP_GAP_MS = 60;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Kollisionsgruppen
const WALLS = 0x1;
const ITEMS = 0x2;
const FINGER = 0x4;

interface Item {
  body: Matter.Body;
  gone?: number; // Zeitpunkt, ab dem es wegschrumpft
}

// Einmal vorzeichnen, pro Frame nur noch kopieren: Grundkörper (dreht sich mit),
// Licht (dreht sich nicht mit, damit der Glanz oben links bleibt) und weicher Schatten
function sprites(r: number, dpr: number, color: string, seam: string) {
  const make = (size: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(size * dpr);
    const c = cv.getContext('2d')!;
    c.scale(dpr, dpr);
    draw(c);
    return cv;
  };
  const disc = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.arc(r, r, r, 0, Math.PI * 2);
  };

  const base = make(r * 2, (c) => {
    disc(c);
    c.fillStyle = color;
    c.fill();
    c.save();
    c.clip();
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
      c.fillRect(r + Math.cos(a) * d, r + Math.sin(a) * d, 1.2, 1.2);
    }
    c.strokeStyle = seam;
    c.lineWidth = r * 0.12;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(-0.25 * r, r, 0.95 * r, -0.9, 0.9);
    c.stroke();
    c.beginPath();
    c.arc(2.25 * r, r, 0.95 * r, Math.PI - 0.9, Math.PI + 0.9);
    c.stroke();
    c.restore();
  });

  const light = make(r * 2, (c) => {
    const g = c.createRadialGradient(r * 0.65, r * 0.6, r * 0.05, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.75, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    disc(c);
    c.fillStyle = g;
    c.fill();
  });

  const shadowR = r * 1.25;
  const shadow = make(shadowR * 2, (c) => {
    const g = c.createRadialGradient(shadowR, shadowR, 0, shadowR, shadowR, shadowR);
    g.addColorStop(0, 'rgba(46,36,32,0.35)');
    g.addColorStop(0.6, 'rgba(46,36,32,0.15)');
    g.addColorStop(1, 'rgba(46,36,32,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, shadowR * 2, shadowR * 2);
  });

  return { base, light, shadow, shadowR };
}

// Beim Rausfliegen: klein → größer als normal (kommt auf einen zu) → normal (gelandet)
function launchScale(t: number) {
  if (t >= LAUNCH_MS) return 1;
  const half = LAUNCH_MS / 2;
  if (t < half) return 0.5 + 0.85 * (t / half);
  const k = (t - half) / half;
  return 1.35 - 0.35 * (1 - (1 - k) ** 2);
}

export function finale(app: App): Scene {
  const el = document.getElementById('s-card')!;
  const canvas = el.querySelector<HTMLCanvasElement>('.layer')!;
  const tidyBtn = el.querySelector<HTMLButtonElement>('.tidy')!;
  const card = el.querySelector<HTMLElement>('.card')!;
  const ctx = canvas.getContext('2d')!;
  const { color, seam, count } = app.content.item;

  let engine: Matter.Engine | undefined;
  let items: Item[] = [];
  let walls: Matter.Body[] = [];
  let finger: Matter.Body | undefined;
  let art: ReturnType<typeof sprites>;
  let w = 0;
  let h = 0;
  let r = 0;
  let raf = 0;
  let start = 0;
  let last = 0;
  let acc = 0;
  let frames = 0;
  let landed = false;
  let fpsChecked = false;
  let tidying = false;
  let lastBump = 0;
  let lastCover = 0;
  let freeAtLanding = 0;

  const outside = (b: Matter.Body) =>
    b.position.x < -2 * r || b.position.x > w + 2 * r || b.position.y < -2 * r || b.position.y > h + 2 * r;

  function stop() {
    cancelAnimationFrame(raf);
    if (engine) {
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    }
    engine = undefined;
    finger = undefined;
    items = [];
    walls = [];
  }

  function launch() {
    w = el.clientWidth;
    h = el.clientHeight;
    const dpr = Math.min(2, devicePixelRatio);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    r = (w * SIZE) / 2;
    art = sprites(r, dpr, color, seam);

    engine = Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: true });
    const wallOpts = { isStatic: true, collisionFilter: { category: WALLS } };
    walls = [
      Bodies.rectangle(w / 2, -WALL / 2, w + 2 * WALL, WALL, wallOpts),
      Bodies.rectangle(w / 2, h + WALL / 2, w + 2 * WALL, WALL, wallOpts),
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h + 2 * WALL, wallOpts),
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + 2 * WALL, wallOpts),
    ];

    // Start in der Kartenmitte, damit die Karte möglichst zugedeckt wird
    const a = card.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    const cx = a.left - b.left + a.width / 2;
    const cy = a.top - b.top + a.height / 2;
    const n = Math.min(count, MAX_COUNT);
    items = Array.from({ length: n }, (_, i) => {
      const body = Bodies.circle(cx + (Math.random() - 0.5) * 10, cy + (Math.random() - 0.5) * 10, r, {
        frictionAir: 0.045,
        friction: 0.05,
        restitution: 0.6,
        collisionFilter: { category: ITEMS, mask: WALLS }, // beim Rausfliegen nur die Wände
      });
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 2 + Math.random() * 5.5;
      Body.setVelocity(body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
      Body.setAngle(body, Math.random() * Math.PI * 2);
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.3);
      return { body };
    });
    Composite.add(engine.world, [...walls, ...items.map((it) => it.body)]);

    // Leises "Tock" bei Zusammenstößen, gedrosselt
    Events.on(engine, 'collisionStart', (e) => {
      const now = performance.now();
      if (now - lastBump < BUMP_GAP_MS) return;
      for (const { bodyA: a, bodyB: b } of e.pairs) {
        if (a.collisionFilter.category !== ITEMS || b.collisionFilter.category !== ITEMS) continue;
        const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
        if (speed < 1.5) continue;
        lastBump = now;
        bump(Math.min(1, speed / 8));
        break;
      }
    });

    start = last = performance.now();
    acc = frames = lastCover = freeAtLanding = 0;
    landed = fpsChecked = tidying = false;
    raf = requestAnimationFrame(frame);
  }

  function draw(now: number, t: number) {
    ctx.clearRect(0, 0, w, h);
    const s = launchScale(t);
    const { base, light, shadow, shadowR } = art;
    const lift = r * 0.15 + Math.max(0, s - 1) * r * 1.2; // höher = Schatten weiter weg
    for (const pass of ['shadow', 'body']) {
      for (const it of items) {
        const k = it.gone ? Math.max(0, 1 - (now - it.gone) / FADE_MS) : 1;
        const sc = s * k;
        if (sc <= 0) continue;
        const { x, y } = it.body.position;
        if (pass === 'shadow') {
          const sr = shadowR * sc;
          ctx.drawImage(shadow, x - sr + lift * 0.6, y - sr + lift, sr * 2, sr * 2);
        } else {
          const rr = r * sc;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(it.body.angle);
          ctx.drawImage(base, -rr, -rr, rr * 2, rr * 2);
          ctx.restore();
          ctx.drawImage(light, x - rr, y - rr, rr * 2, rr * 2);
        }
      }
    }
  }

  // Anteil der Kartenfläche, der nicht verdeckt ist (Punktraster)
  function freeShare() {
    const a = card.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    let free = 0;
    const cols = 10;
    const rows = 14;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const px = a.left - b.left + ((i + 0.5) / cols) * a.width;
        const py = a.top - b.top + ((j + 0.5) / rows) * a.height;
        if (!items.some((it) => (it.body.position.x - px) ** 2 + (it.body.position.y - py) ** 2 < r * r)) free++;
      }
    }
    return free / (cols * rows);
  }

  function frame(now: number) {
    if (!engine) return;
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= STEP_MS) {
      Engine.update(engine, STEP_MS);
      acc -= STEP_MS;
    }
    const t = now - start;

    if (!landed && t > LAUNCH_MS * 0.7) {
      landed = true;
      for (const it of items) it.body.collisionFilter.mask = WALLS | ITEMS | FINGER;
    }

    draw(now, t);
    frames++;

    // Selbsttest: zu langsam → ein paar Objekte schrumpfen weg
    if (!fpsChecked && t >= FPS_CHECK_MS) {
      fpsChecked = true;
      if (frames / (t / 1000) < MIN_FPS) {
        for (const it of items.slice(REDUCE_TO)) {
          it.gone = now;
          it.body.collisionFilter.mask = 0;
        }
      }
    }
    items = items.filter((it) => {
      if (!it.gone || now - it.gone < FADE_MS) return true;
      Composite.remove(engine!.world, it.body);
      return false;
    });

    if (!tidying && tidyBtn.hidden && t > LAUNCH_MS * 2 && now - lastCover > 500) {
      lastCover = now;
      const free = freeShare();
      if (!freeAtLanding) freeAtLanding = free;
      if (t >= TIDY_AFTER_MS || free >= Math.max(TIDY_FREE, freeAtLanding + TIDY_GAIN)) tidyBtn.hidden = false;
    }

    if (tidying && items.every((it) => outside(it.body))) return finish();
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    stop();
    canvas.hidden = true;
    el.classList.remove('covered');
    app.next();
  }

  // Finger: unsichtbarer statischer Körper, der dem Touch-Punkt folgt
  const at = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  // Schlafende Objekte reagieren nicht auf einen verschobenen statischen Körper, also in der Nähe wecken
  const wake = (p: { x: number; y: number }) => {
    const reach = (r + FINGER_R + 20) ** 2;
    for (const it of items) {
      if (it.body.isSleeping && (it.body.position.x - p.x) ** 2 + (it.body.position.y - p.y) ** 2 < reach) {
        Sleeping.set(it.body, false);
      }
    }
  };
  const release = () => {
    if (engine && finger) Composite.remove(engine.world, finger);
    finger = undefined;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!engine || tidying) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    const p = at(e);
    finger = Bodies.circle(p.x, p.y, FINGER_R, { isStatic: true, collisionFilter: { category: FINGER, mask: ITEMS } });
    Composite.add(engine.world, finger);
    wake(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!engine || !finger) return;
    const p = at(e);
    Body.setPosition(finger, p);
    wake(p);
  });
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // Aufräumen: Wände weg, alles fliegt nach außen aus dem Bild
  tidyBtn.onclick = () => {
    if (!engine || tidying) return;
    tidying = true;
    tidyBtn.hidden = true;
    release();
    Composite.remove(engine.world, walls);
    for (const it of items) {
      const b = it.body;
      Sleeping.set(b, false);
      b.collisionFilter.mask = 0;
      b.frictionAir = 0.01;
      const dx = b.position.x - w / 2;
      const dy = b.position.y - h / 2;
      const d = Math.hypot(dx, dy) || 1;
      Body.setVelocity(b, {
        x: (dx / d) * 14 + (Math.random() - 0.5) * 3,
        y: (dy / d) * 14 + (Math.random() - 0.5) * 3,
      });
    }
  };

  return {
    el,
    enter() {
      if (REDUCED) return app.next();
      el.classList.add('covered');
      canvas.hidden = false;
      tidyBtn.hidden = true;
      launch();
    },
    reset() {
      stop();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.hidden = true;
      tidyBtn.hidden = true;
      el.classList.remove('covered');
    },
  };
}
