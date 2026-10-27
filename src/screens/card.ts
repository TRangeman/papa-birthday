// Screen 6: Karte als Ticket befüllen. Antippen dreht sie um (Rückseite: Kleingedrucktes),
// darunter WhatsApp-/SMS-Button und "Nochmal von vorn".
import type { App, Scene } from '../types';

const TEXT_KEYS = ['head', 'kicker', 'title', 'greeting', 'stub', 'fine'] as const;

// Strichcode aus der Nummer: Balken und Lücken, deterministisch, als CSS-Verlauf
function barcode(seed: string, ink: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 3) + 1;
  const parts: [number, boolean][] = [];
  for (let i = 0; i < 46; i++) parts.push([next(), i % 2 === 0]);
  const total = parts.reduce((sum, [width]) => sum + width, 0);
  let x = 0;
  const stops = parts.map(([width, bar]) => {
    const from = (x / total) * 100;
    x += width;
    return `${bar ? ink : 'transparent'} ${from.toFixed(2)}% ${((x / total) * 100).toFixed(2)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function card(app: App): Scene {
  const el = document.getElementById('s-card')!;
  const ticket = el.querySelector<HTMLElement>('.card')!;
  const hint = el.querySelector<HTMLElement>('.flip-hint')!;
  const actions = el.querySelector<HTMLElement>('.actions')!;
  const c = app.content.card;

  for (const f of el.querySelectorAll<HTMLElement>('[data-c]')) {
    const key = f.dataset.c as (typeof TEXT_KEYS)[number];
    f.textContent = TEXT_KEYS.includes(key) ? c[key] : '';
  }
  for (const s of el.querySelectorAll('.serial')) s.textContent = `Nr. ${c.serial}`;
  el.querySelector('.serial-small')!.textContent = c.serial;
  el.querySelector('.fields')!.replaceChildren(
    ...c.fields.map(({ label, value }) => {
      const div = document.createElement('div');
      div.append(Object.assign(document.createElement('dt'), { textContent: label }));
      div.append(Object.assign(document.createElement('dd'), { textContent: value }));
      return div;
    }),
  );
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  el.querySelector<HTMLElement>('.code')!.style.background = barcode(c.serial, ink);

  // Unterschrift: Datei aus core.bin, sonst Handschrift-Font
  const sign = el.querySelector('.sign')!;
  const src = app.core.url('sig');
  sign.replaceChildren(src ? Object.assign(new Image(), { src, alt: app.content.from }) : `— ${app.content.from}`);

  // WhatsApp: Nummer (international, ohne +) oder wa.me-Link. Direkt über api.whatsapp.com,
  // weil die Weiterleitung von wa.me Emojis im Text kaputt macht.
  const { wa, text } = app.content.contact;
  const msg = encodeURIComponent(text);
  const number = (/^https?:/.test(wa) ? /(?:wa\.me\/|phone=)(\d+)/.exec(wa)?.[1] : wa)?.replace(/\D/g, '');
  el.querySelector<HTMLAnchorElement>('.wa')!.href = `https://api.whatsapp.com/send?phone=${number ?? ''}&text=${msg}`;
  const sms = el.querySelector<HTMLAnchorElement>('.sms')!;
  if (number) sms.href = `sms:+${number}?&body=${msg}`;
  else sms.hidden = true;

  // Umdrehen
  const flip = (to = !ticket.classList.contains('flipped')) => {
    ticket.classList.toggle('flipped', to);
    hint.textContent = to ? 'Vorderseite ↻' : 'Rückseite ↻';
  };
  ticket.onclick = () => flip();
  ticket.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  };

  el.querySelector<HTMLElement>('.again')!.onclick = () => app.replay();

  return {
    el,
    enter() {
      // Karte ist frei: kurz nach vorne ploppen, Buttons einblenden
      ticket.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], {
        duration: 450,
        easing: 'ease-out',
      });
      actions.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], {
        duration: 400,
        delay: 150,
        easing: 'ease-out',
        fill: 'backwards',
      });
    },
    reset() {
      flip(false);
    },
  };
}
