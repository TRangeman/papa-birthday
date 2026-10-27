// Screen 5: Objekt-Ebene über der Karte. Canvas 2D zeichnet, Matter.js rechnet.
// Ansicht von oben: keine Schwerkraft, Luftreibung; der Finger ist ein unsichtbarer runder Körper.
// Unten steht ein Korb: Was in seine Öffnung geschoben wird, fällt hinein. Sind alle drin, ist die Karte frei.
import Matter from 'matter-js';
import { bump, plopp } from '../audio/sfx';
import type { App, Scene } from '../types';

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

const SIZE = 1 / 6; // Durchmesser relativ zur Breite
const MAX_COUNT = 40;
const FINGER_R = 46;
const WALL = 200;
const LAUNCH_MS = 700; // fliegen raus, werden kurz größer und "landen"
const STEP_MS = 1000 / 60;
const TIDY_AFTER_MS = 20000;
// Anteil freier Kartenfläche, ab dem "Aufräumen" erscheint. Die Karte ist fast bildschirmbreit,
// weggeschobene Objekte stauen sich also an ihren Rändern: mehr als ca. 60 % frei ist kaum erreichbar.
const TIDY_FREE = 0.6;
const TIDY_GAIN = 0.1; // … und mindestens so viel mehr als direkt nach der Landung (dort ca. 50 %)
const TIDY_STAGGER_MS = 110; // beim Aufräumen rollt eins nach dem anderen in den Korb
const TIDY_SPEED = 10;
const FPS_CHECK_MS = 2000;
const MIN_FPS = 40;
const REDUCE_TO = 15;
const FADE_MS = 300;
const DROP_MS = 380; // Fall-Animation in den Korb
const WOBBLE_MS = 600;
const DONE_FADE_MS = 450; // Korb blendet aus, wenn alles drin ist
const BUMP_GAP_MS = 60;
const PEEK_SLOTS = [0, -0.28, 0.28, -0.14, 0.14, -0.38, 0.38]; // Objekte, die oben aus dem Korb gucken
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Kollisionsgruppen
const WALLS = 0x1;
const ITEMS = 0x2;
const FINGER = 0x4;

interface Item {
  body: Matter.Body;
  gone?: number; // Zeitpunkt, ab dem es wegschrumpft (Selbsttest)
}

interface Drop {
  x: number;
  y: number;
  angle: number;
  at: number;
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
  const root = getComputedStyle(document.documentElement);
  const petrol = root.getPropertyValue('--petrol').trim();
  const paper = root.getPropertyValue('--paper').trim();
  const ink = root.getPropertyValue('--ink').trim();

  let engine: Matter.Engine | undefined;
  let items: Item[] = [];
  let drops: Drop[] = [];
  let finger: Matter.Body | undefined;
  let art: ReturnType<typeof sprites>;
  let w = 0;
  let h = 0;
  let r = 0;
  // Korb: Mitte, Breite, Höhe, Oberkante (Rand)
  let bx = 0;
  let bw = 0;
  let bh = 0;
  let rimY = 0;
  let caught = 0;
  let wobbleAt = -Infinity;
  let doneAt = 0;
  let raf = 0;
  let start = 0;
  let last = 0;
  let acc = 0;
  let frames = 0;
  let landed = false;
  let fpsChecked = false;
  let tidyAt = 0;
  let lastBump = 0;
  let lastCover = 0;
  let freeAtLanding = 0;

  const inBasket = (x: number, y: number) => Math.abs(x - bx) < bw * 0.45 && y > rimY - r * 0.4 && y < rimY + bh;

  function stop() {
    cancelAnimationFrame(raf);
    if (engine) {
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    }
    engine = undefined;
    finger = undefined;
    items = [];
    drops = [];
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

    bw = Math.min(w * 0.42, 180);
    bh = bw * 0.62;
    bx = w / 2;
    rimY = h - 26 - bh;

    engine = Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: true });
    const wallOpts = { isStatic: true, collisionFilter: { category: WALLS } };
    Composite.add(engine.world, [
      Bodies.rectangle(w / 2, -WALL / 2, w + 2 * WALL, WALL, wallOpts),
      Bodies.rectangle(w / 2, h + WALL / 2, w + 2 * WALL, WALL, wallOpts),
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h + 2 * WALL, wallOpts),
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h + 2 * WALL, wallOpts),
    ]);

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
    Composite.add(
      engine.world,
      items.map((it) => it.body),
    );

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
    acc = frames = lastCover = freeAtLanding = caught = tidyAt = doneAt = 0;
    wobbleAt = -Infinity;
    landed = fpsChecked = false;
    raf = requestAnimationFrame(frame);
  }

  function drawItem(x: number, y: number, angle: number, rr: number) {
    const { base, light } = art;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(base, -rr, -rr, rr * 2, rr * 2);
    ctx.restore();
    ctx.drawImage(light, x - rr, y - rr, rr * 2, rr * 2);
  }

  // Korb in Vorderansicht: hinten Innenraum + gefangene Objekte, vorne Drahtgitter, Rand und Zähler
  function drawBasket(now: number) {
    const ry = bw * 0.13;
    const bottom = rimY + bh;
    const half = bw / 2;
    const footHalf = half * 0.82;
    const age = now - wobbleAt;
    const wobble = age < WOBBLE_MS ? 0.06 * Math.sin(age * 0.03) * (1 - age / WOBBLE_MS) : 0;

    ctx.save();
    if (doneAt) ctx.globalAlpha = Math.max(0, 1 - (now - doneAt) / DONE_FADE_MS);
    ctx.translate(bx, bottom);
    ctx.rotate(wobble);
    ctx.translate(-bx, -bottom);

    // Innenraum
    ctx.fillStyle = 'rgba(31,95,107,0.35)';
    ctx.beginPath();
    ctx.ellipse(bx, rimY, half, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gefangene gucken oben heraus, je voller, desto höher
    const total = caught + items.length;
    const fill = total ? caught / total : 0;
    const shown = Math.min(caught, PEEK_SLOTS.length);
    for (let i = 0; i < shown; i++) {
      drawItem(bx + PEEK_SLOTS[i] * bw, rimY + ry * 0.2 - fill * r * 0.5 - (i % 2) * 3, i * 1.7, r * 0.72);
    }

    // Was gerade hineinfällt: zur Korbmitte, schrumpft und sinkt hinter die Vorderseite
    for (const d of drops) {
      const k = Math.min(1, (now - d.at) / DROP_MS);
      const e = k * k;
      drawItem(d.x + (bx - d.x) * e, d.y + (rimY + ry - d.y) * e + e * r * 0.8, d.angle + k * 2, r * (1 - 0.3 * k));
    }

    // Vorderseite: halbdurchsichtiger Korbkörper mit Drahtgitter
    ctx.beginPath();
    ctx.moveTo(bx - half, rimY);
    ctx.lineTo(bx - footHalf, bottom);
    ctx.lineTo(bx + footHalf, bottom);
    ctx.lineTo(bx + half, rimY);
    ctx.ellipse(bx, rimY, half, ry, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = 'rgba(31,95,107,0.22)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = petrol;
    ctx.lineWidth = 2;
    for (let i = 1; i < 7; i++) {
      const top = bx - half + (bw * i) / 7;
      const foot = bx - footHalf + (2 * footHalf * i) / 7;
      ctx.beginPath();
      ctx.moveTo(top, rimY);
      ctx.lineTo(foot, bottom);
      ctx.stroke();
    }
    for (let j = 1; j < 4; j++) {
      const y = rimY + ry + ((bh - ry) * j) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Umriss, Füße und vorderer Rand
    ctx.strokeStyle = petrol;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - half, rimY);
    ctx.lineTo(bx - footHalf, bottom);
    ctx.lineTo(bx + footHalf, bottom);
    ctx.lineTo(bx + half, rimY);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - footHalf + 6, bottom);
    ctx.lineTo(bx - footHalf + 2, bottom + 10);
    ctx.moveTo(bx + footHalf - 6, bottom);
    ctx.lineTo(bx + footHalf - 2, bottom + 10);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(bx, rimY, half, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Zähler
    const label = `${caught} / ${total}`;
    ctx.font = '600 15px Fredoka, system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 18;
    const ty = rimY + bh * 0.58;
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.roundRect(bx - tw / 2, ty - 13, tw, 26, 13);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx, ty + 1);
    ctx.restore();
  }

  function draw(now: number, t: number) {
    ctx.clearRect(0, 0, w, h);
    drawBasket(now);

    const s = launchScale(t);
    const { shadow, shadowR } = art;
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
          drawItem(x, y, it.body.angle, r * sc);
        }
      }
    }

    // Halbtransparenter Kreis unter dem Finger
    if (finger) {
      const { x, y } = finger.position;
      ctx.beginPath();
      ctx.arc(x, y, FINGER_R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251,241,230,0.3)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(46,36,32,0.25)';
      ctx.stroke();
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

  function catchItem(it: Item, now: number) {
    Composite.remove(engine!.world, it.body);
    drops.push({ x: it.body.position.x, y: it.body.position.y, angle: it.body.angle, at: now });
    caught++;
    wobbleAt = now;
    plopp(0.5);
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

    // Aufräumen: die Übrigen rollen nacheinander von selbst in den Korb
    if (tidyAt) {
      items.forEach((it, i) => {
        if (it.gone || now < tidyAt + i * TIDY_STAGGER_MS) return;
        const b = it.body;
        const dx = bx - b.position.x;
        const dy = rimY + bh * 0.3 - b.position.y;
        const d = Math.hypot(dx, dy) || 1;
        Sleeping.set(b, false);
        b.collisionFilter.mask = 0;
        Body.setVelocity(b, { x: (dx / d) * TIDY_SPEED, y: (dy / d) * TIDY_SPEED });
      });
    }

    // Was in der Korböffnung landet, ist gefangen
    if (landed) {
      items = items.filter((it) => {
        if (it.gone || !inBasket(it.body.position.x, it.body.position.y)) return true;
        catchItem(it, now);
        return false;
      });
    }
    drops = drops.filter((d) => now - d.at < DROP_MS);

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

    draw(now, t);
    frames++;

    if (!tidyAt && tidyBtn.hidden && t > LAUNCH_MS * 2 && now - lastCover > 500) {
      lastCover = now;
      const free = freeShare();
      if (!freeAtLanding) freeAtLanding = free;
      if (t >= TIDY_AFTER_MS || free >= Math.max(TIDY_FREE, freeAtLanding + TIDY_GAIN)) tidyBtn.hidden = false;
    }

    // Alles drin: Korb blendet aus, dann ist die Karte frei
    if (landed && !items.length && !drops.length && !doneAt) {
      doneAt = now;
      tidyBtn.hidden = true;
      release();
    }
    if (doneAt && now - doneAt > DONE_FADE_MS) return finish();
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
  function release() {
    if (engine && finger) Composite.remove(engine.world, finger);
    finger = undefined;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!engine || tidyAt || doneAt) return;
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

  tidyBtn.onclick = () => {
    if (!engine || tidyAt) return;
    tidyAt = performance.now();
    tidyBtn.hidden = true;
    release();
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
