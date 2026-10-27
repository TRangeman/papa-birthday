// Erzeugte Effekte, keine Dateien
import { audio, fxOut } from './player';

let noise: AudioBuffer | undefined;

function noiseBuffer(c: AudioContext) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// Kerze aus: kurzes, weiches Rauschen, das nach unten wegrutscht
export function puff() {
  const c = audio();
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.8, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  src.connect(filter).connect(env).connect(fxOut());
  src.start(t);
  src.stop(t + 0.5);
}
