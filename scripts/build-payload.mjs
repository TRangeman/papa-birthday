// Verarbeitet private/ zu den verschlüsselten Paketen public/core.bin + public/media.bin
// und gibt Link + QR-Code (SVG, PNG) nach private/out/ aus.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import QRCode from 'qrcode';

const SITE = 'https://trangeman.github.io/papa-birthday/';
const DEV = 'http://localhost:5173/papa-birthday/';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const priv = path.join(root, 'private');
const out = path.join(priv, 'out');
const pub = path.join(root, 'public');
const P = (...p) => path.join(priv, ...p);

const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;
const PLACEHOLDER_COLORS = ['#E8593F', '#1F5F6B', '#E2A391', '#2E2420', '#C9743A', '#7A3B2E'];

// Schlüssel wird nur erzeugt, wenn key.txt fehlt. Sonst ändert sich der QR-Code!
async function loadKey() {
  const file = P('key.txt');
  if (!existsSync(file)) {
    const fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    await writeFile(file, fresh + '\n', { flag: 'wx' });
    console.log('Neuer Schlüssel erzeugt: private/key.txt');
  }
  const key = (await readFile(file, 'utf8')).trim();
  if (Buffer.from(key, 'base64url').length !== 32) throw new Error('private/key.txt ist kein gültiger 256-Bit-Schlüssel');
  return key;
}

async function loadContent() {
  if (!existsSync(P('content.json'))) {
    await copyFile(P('content.example.json'), P('content.json'));
    console.log('private/content.json fehlte, aus content.example.json angelegt (Platzhalter!)');
  }
  const content = JSON.parse(await readFile(P('content.json'), 'utf8'));
  for (const k of Object.keys(content)) if (k.startsWith('_')) delete content[k];
  return content;
}

// Ohne echte Fotos: nummerierte Platzhalter in private/out/placeholder-photos/
async function photoFiles() {
  await mkdir(P('photos'), { recursive: true });
  const real = (await readdir(P('photos'))).filter((f) => PHOTO_EXT.test(f));
  if (real.length) return sorted(real).map((f) => P('photos', f));

  const dir = path.join(out, 'placeholder-photos');
  await mkdir(dir, { recursive: true });
  const files = [];
  for (let i = 1; i <= 12; i++) {
    const file = path.join(dir, `platzhalter-${String(i).padStart(2, '0')}.jpg`);
    const bg = PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
      <rect width="100%" height="100%" fill="${bg}"/>
      <circle cx="540" cy="540" r="380" fill="none" stroke="#FBF1E6" stroke-width="16" stroke-dasharray="40 30"/>
      <text x="540" y="540" font-family="sans-serif" font-size="360" font-weight="bold" fill="#FBF1E6"
        text-anchor="middle" dominant-baseline="central">${i}</text>
    </svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(file);
    files.push(file);
  }
  console.log('Keine Fotos in private/photos/, nutze 12 Platzhalter');
  return files;
}

const sorted = (names) => names.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));

// max. 1080 px, nach EXIF gedreht, Metadaten (EXIF/GPS) entfernt (sharp übernimmt sie nur auf Wunsch)
const toWebp = (file) =>
  sharp(file).rotate().resize(1080, 1080, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();

async function optionalFile(name, ...candidates) {
  for (const [file, type] of candidates) {
    if (existsSync(file)) return { name, type, buf: await readFile(file) };
  }
  return null;
}

// Klartext: [u32 LE Länge][JSON-Kopf { data, files: [name, type, offset, size][] }][Dateien]
function pack(data, files) {
  let offset = 0;
  const index = files.map((f) => {
    const entry = [f.name, f.type, offset, f.buf.length];
    offset += f.buf.length;
    return entry;
  });
  const head = Buffer.from(JSON.stringify({ data, files: index }));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(head.length);
  return Buffer.concat([len, head, ...files.map((f) => f.buf)]);
}

// Ausgabe: [12 Byte IV][Ciphertext + Tag], neuer IV bei jedem Build
async function encrypt(plain, keyB64) {
  const key = await crypto.subtle.importKey('raw', Buffer.from(keyB64, 'base64url'), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return Buffer.concat([iv, Buffer.from(ct)]);
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function main() {
  await mkdir(out, { recursive: true });
  await mkdir(pub, { recursive: true });

  const key = await loadKey();
  const content = await loadContent();

  // core.bin: Texte, Unterschrift, Happy Birthday
  const coreFiles = [
    await optionalFile('a1', [P('audio', 'birthday.mp3'), 'audio/mpeg']),
    await optionalFile('sig', [P('signature.svg'), 'image/svg+xml'], [P('signature.png'), 'image/png']),
  ].filter(Boolean);

  // media.bin: Fotos, Generator-Musik
  const photos = await photoFiles();
  const mediaFiles = [];
  for (const [i, file] of photos.entries()) {
    mediaFiles.push({ name: `p${i}`, type: 'image/webp', buf: await toWebp(file) });
  }
  const song = await optionalFile('a2', [P('audio', 'sixtyfour.mp3'), 'audio/mpeg']);
  if (song) mediaFiles.push(song);

  const core = await encrypt(pack(content, coreFiles), key);
  const media = await encrypt(pack({ photos: mediaFiles.filter((f) => f.name.startsWith('p')).map((f) => f.name) }, mediaFiles), key);
  await writeFile(path.join(pub, 'core.bin'), core);
  await writeFile(path.join(pub, 'media.bin'), media);

  const link = `${SITE}#k=${key}`;
  const devLink = `${DEV}#k=${key}`;
  await writeFile(path.join(out, 'link.txt'), `${link}\n\nLokal: ${devLink}\n`);
  await QRCode.toFile(path.join(out, 'qr.png'), link, { width: 1200, margin: 4, errorCorrectionLevel: 'M' });
  await writeFile(path.join(out, 'qr.svg'), await QRCode.toString(link, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' }));

  console.log(`
core.bin   ${kb(core.length)}  (${coreFiles.map((f) => f.name).join(', ') || 'nur Texte'})
media.bin  ${kb(media.length)}  (${photos.length} Fotos${song ? ' + Song' : ', ohne Song'})
Happy Birthday: ${coreFiles.some((f) => f.name === 'a1') ? 'Datei' : 'fehlt → Spieluhr'}
Unterschrift:   ${coreFiles.some((f) => f.name === 'sig') ? 'Datei' : 'fehlt → Handschrift-Font'}

Link:   ${link}
Lokal:  ${devLink}
QR:     private/out/qr.svg, private/out/qr.png`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
