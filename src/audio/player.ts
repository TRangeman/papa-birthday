// Ein AudioContext für alles: Musik aus den Paketen, Spieluhr, Effekte, Mikrofon.
// Feste Lautstärke, Musik etwas leiser als die Effekte.
const MUSIC_VOLUME = 0.6;
const SFX_VOLUME = 0.9;

let ctx: AudioContext | undefined;
let musicBus: GainNode;
let sfxBus: GainNode;

export function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_VOLUME;
    sfxBus.connect(ctx.destination);
  }
  return ctx;
}

// Verlässt man den Browser, pausiert aller Ton; beim Zurückkommen läuft er an derselben Stelle weiter
let pausedByHide = false;
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) {
    pausedByHide = ctx.state === 'running';
    ctx.suspend();
  } else if (pausedByHide) {
    pausedByHide = false;
    ctx.resume();
  }
});

// Muss direkt in einem Tipp-Handler laufen, sonst bleibt der Ton gesperrt
export function unlock() {
  audio().resume();
}

export function fxOut(): GainNode {
  audio();
  return sfxBus;
}

export async function decode(url: string): Promise<AudioBuffer> {
  const data = await (await fetch(url)).arrayBuffer();
  return audio().decodeAudioData(data);
}

export interface Track {
  ended: Promise<void>;
  stop(fadeSec?: number): void;
}

export function play(buffer: AudioBuffer, fadeInSec = 0): Track {
  const c = audio();
  const gain = c.createGain();
  gain.connect(musicBus);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  if (fadeInSec) {
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(1, c.currentTime + fadeInSec);
  }
  src.start();

  let stopped = false;
  return {
    ended: new Promise((resolve) => (src.onended = () => resolve())),
    stop(fadeSec = 0.6) {
      if (stopped) return;
      stopped = true;
      const now = c.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeSec);
      src.stop(now + fadeSec + 0.05);
    },
  };
}
