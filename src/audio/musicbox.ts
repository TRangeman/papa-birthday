// Spieluhr-Fallback für Happy Birthday, falls keine MP3 im Paket ist: offline als AudioBuffer gerendert
const BEAT = 0.58;
const RATE = 44100;

// [MIDI-Ton, Dauer in Schlägen, Basston]
const MELODY: [number, number, number?][] = [
  [67, 0.75], [67, 0.25], [69, 1, 48], [67, 1], [72, 1], [71, 2, 43],
  [67, 0.75], [67, 0.25], [69, 1, 43], [67, 1], [74, 1], [72, 2, 48],
  [67, 0.75], [67, 0.25], [79, 1, 48], [76, 1], [72, 1], [71, 1, 41], [69, 2],
  [77, 0.75], [77, 0.25], [76, 1, 48], [72, 1], [74, 1, 43], [72, 3, 48],
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Gezupfter Glockenton: Grundton + leise Obertöne, kurzer Anschlag, langes Abklingen
function chime(c: OfflineAudioContext, midi: number, at: number, volume: number) {
  const env = c.createGain();
  env.connect(c.destination);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(volume, at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, at + 1.8);
  for (const [mult, level] of [[1, 1], [2, 0.3], [4.2, 0.08]]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.frequency.value = hz(midi) * mult;
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(at);
    osc.stop(at + 1.9);
  }
}

export function renderMusicbox(): Promise<AudioBuffer> {
  const beats = MELODY.reduce((sum, [, d]) => sum + d, 0);
  const c = new OfflineAudioContext(1, Math.ceil((beats * BEAT + 2) * RATE), RATE);
  let t = 0.1;
  for (const [note, dur, bass] of MELODY) {
    chime(c, note, t, 0.35);
    if (bass) chime(c, bass, t, 0.2);
    t += dur * BEAT;
  }
  return c.startRendering();
}
