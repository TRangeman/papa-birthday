// Puste-Erkennung: Energie in den tiefen Frequenzen, Schwelle relativ zum Grundpegel des Raums.
// Der Ton wird nur lokal analysiert, nichts aufgenommen oder verschickt.
import { audio } from './player';

const LOW_HZ = 500; // Pusten rauscht vor allem unten
const SETTLE_MS = 300; // erste Frames ignorieren, bis der Grundpegel steht
const ABOVE_DB = 22; // so weit über dem Grundpegel zählt es als Pusten
const MIN_DB = -50; // und mindestens so laut
const HOLD_MS = 300; // so lange muss es anhalten
const BASE_RISE = 0.002; // Grundpegel folgt nach unten sofort, nach oben nur sehr langsam

export interface MicLevel {
  db: number;
  base: number;
  threshold: number;
  held: number;
  strength: number; // 0…1, für das Neigen der Flamme
}

export const micSupported = () => !!navigator.mediaDevices?.getUserMedia;

export async function listen(onLevel: (l: MicLevel) => void, onBlow: () => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const c = audio();
  await c.resume();
  const src = c.createMediaStreamSource(stream);
  const analyser = c.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.3;
  src.connect(analyser);

  const bins = new Float32Array(analyser.frequencyBinCount);
  const top = Math.max(2, Math.round(LOW_HZ / (c.sampleRate / analyser.fftSize)));
  const start = performance.now();
  let last = start;
  let base = NaN;
  let held = 0;
  let raf = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    src.disconnect();
    for (const t of stream.getTracks()) t.stop();
  };

  const tick = (now: number) => {
    analyser.getFloatFrequencyData(bins);
    let power = 0;
    for (let i = 1; i < top; i++) power += 10 ** (bins[i] / 10);
    const db = 10 * Math.log10(power / (top - 1) + 1e-12);
    const dt = now - last;
    last = now;

    base = isNaN(base) || db < base ? db : base + (db - base) * BASE_RISE;
    const threshold = Math.max(base + ABOVE_DB, MIN_DB);
    const settled = now - start > SETTLE_MS;
    held = settled && db > threshold ? held + dt : Math.max(0, held - dt / 2);
    const strength = settled ? Math.min(1, Math.max(0, (db - base - 6) / (threshold - base - 6))) : 0;

    onLevel({ db, base, threshold, held, strength });
    if (held >= HOLD_MS) {
      stop();
      onBlow();
    } else {
      raf = requestAnimationFrame(tick);
    }
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
