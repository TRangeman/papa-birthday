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

// Bildwechsel im Generator: weiches "Tock" wie ein Holzklötzchen
export function tick(volume = 1) {
  const c = audio();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(280, t + 0.05);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.35 * volume, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(filter).connect(env).connect(fxOut());
  osc.start(t);
  osc.stop(t + 0.1);
}

// Explosion: "Plopp" wie ein Korken, Ton schnellt nach oben, dazu ein kurzer Knack
export function plopp(volume = 1) {
  const c = audio();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.06);
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.7 * volume, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(env).connect(fxOut());
  osc.start(t);
  osc.stop(t + 0.2);

  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1500;
  const click = c.createGain();
  click.gain.setValueAtTime(0.4 * volume, t);
  click.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(band).connect(click).connect(fxOut());
  src.start(t);
  src.stop(t + 0.06);
}

// Zusammenstoß im Finale: gedämpftes, tiefes "Tock", Lautstärke nach Aufprall
export function bump(volume: number) {
  const c = audio();
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.04);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.3 * volume, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(filter).connect(env).connect(fxOut());
  osc.start(t);
  osc.stop(t + 0.09);
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
