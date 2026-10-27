// Schlüssel aus dem Link (#k=…) bzw. localStorage, Pakete laden und entschlüsseln (AES-GCM-256)
import type { Pack } from './types';

const STORE = 'k';

export function readKey(): string | null {
  const m = /[#&]k=([\w-]+)/.exec(location.hash);
  if (m) return m[1];
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

// Erst nach erfolgreichem Entschlüsseln: merken (damit Neuladen klappt) und aus der Adresszeile entfernen
export function keepKey(key: string) {
  try {
    localStorage.setItem(STORE, key);
  } catch {}
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

export function importKey(b64url: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}

// Dateiformat: [12 Byte IV][Ciphertext + Tag]
export async function loadPack<T>(name: string, key: CryptoKey): Promise<Pack<T>> {
  const res = await fetch(import.meta.env.BASE_URL + name, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) },
    key,
    new Uint8Array(buf, 12),
  );
  return unpack<T>(plain);
}

// Klartext: [u32 LE Länge][JSON-Kopf { data, files: [name, type, offset, size][] }][Dateien]
function unpack<T>(buf: ArrayBuffer): Pack<T> {
  const len = new DataView(buf).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
  const base = 4 + len;
  const files = new Map<string, Blob>();
  for (const [name, type, offset, size] of head.files as [string, string, number, number][]) {
    files.set(name, new Blob([new Uint8Array(buf, base + offset, size)], { type }));
  }
  const urls = new Map<string, string>();
  return {
    data: head.data,
    has: (name) => files.has(name),
    url(name) {
      let u = urls.get(name);
      const blob = files.get(name);
      if (!u && blob) urls.set(name, (u = URL.createObjectURL(blob)));
      return u;
    },
  };
}
