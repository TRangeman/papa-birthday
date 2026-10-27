// Prüft dist/ auf Begriffe, die öffentlich nicht auftauchen dürfen.
// Die Liste steht in private/check-words.txt (ein Begriff pro Zeile), damit sie selbst nichts verrät.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wordsFile = path.join(root, 'private', 'check-words.txt');
const dist = path.join(root, 'dist');

if (!existsSync(wordsFile)) {
  console.error('private/check-words.txt fehlt, Prüfung nicht möglich');
  process.exit(1);
}
const words = (await readFile(wordsFile, 'utf8'))
  .split(/\r?\n/)
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);

const hits = [];
for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || entry.name.endsWith('.bin')) continue;
  const file = path.join(entry.parentPath, entry.name);
  const text = (await readFile(file, 'latin1')).toLowerCase();
  for (const w of words) {
    for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) {
      hits.push(`${path.relative(root, file)}: "${w}" in …${text.slice(Math.max(0, i - 30), i + w.length + 30)}…`);
    }
  }
}

if (hits.length) {
  console.error(`Verräterische Begriffe in dist/ gefunden:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`dist/ geprüft: keine der ${words.length} Begriffe gefunden`);
