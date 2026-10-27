// Zustandsmaschine: Laden → Geschenk → Kuchen → Generator → Explosion → Finale → Karte (→ Replay: zurück zu Geschenk)
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/caveat/400.css';
import './styles/base.css';
import './styles/gift.css';
import './styles/cake.css';
import './styles/generator.css';
import './styles/finale.css';
import './styles/card.css';
import { importKey, keepKey, loadPack, readKey } from './crypto';
import type { App, Content, MediaData, Pack } from './types';
import { gift } from './screens/gift';
import { cake } from './screens/cake';
import { generator } from './screens/generator';
import { burst } from './screens/burst';
import { finale } from './screens/finale';
import { card } from './screens/card';

function show(el: HTMLElement) {
  for (const s of document.querySelectorAll<HTMLElement>('.scene')) s.hidden = s !== el;
}

// Bildschirm bleibt während der Show an; nach dem Zurückkehren in den Tab neu anfordern
let wakeLock: WakeLockSentinel | null = null;
async function stayAwake() {
  if (document.visibilityState !== 'visible' || (wakeLock && !wakeLock.released)) return;
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {}
}

function start(core: Pack<Content>, media: Promise<Pack<MediaData>>) {
  document.addEventListener('pointerdown', stayAwake);
  document.addEventListener('visibilitychange', stayAwake);

  let current = 0;
  const app: App = {
    content: core.data,
    core,
    media,
    next: () => go(current + 1),
    replay() {
      for (const s of scenes) s.reset();
      go(0);
    },
  };
  const scenes = [gift, cake, generator, burst, finale, card].map((f) => f(app));

  function go(i: number) {
    current = i;
    show(scenes[i].el);
    scenes[i].enter();
  }

  go(0);
}

async function boot() {
  try {
    const k = readKey();
    if (!k) throw new Error('no key');
    const key = await importKey(k);
    const core = await loadPack<Content>('core.bin', key);
    keepKey(k);
    const media = loadPack<MediaData>('media.bin', key);
    media.catch(() => {}); // Generator bleibt dann bei "Lade Erinnerungen …"
    start(core, media);
  } catch {
    show(document.getElementById('s-err')!);
  }
}

boot();
