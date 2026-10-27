// Inhalt von core.bin (private/content.json). Die Feldnamen landen im öffentlichen Code, deshalb neutral.
export interface Content {
  name: string;
  from: string;
  cake: { title: string };
  gen: {
    sec: number; // Dauer des Generators, unabhängig von der Songlänge
    lines: { text: string; ms?: number; checks?: boolean }[];
    checks: string[];
  };
  card: {
    head: string;
    serial: string;
    kicker: string;
    title: string;
    fields: { label: string; value: string }[];
    greeting: string;
    stub: string;
    fine: string;
  };
  contact: { wa: string; text: string };
  item: { color: string; seam: string; count: number };
}

// Inhalt von media.bin
export interface MediaData {
  photos: string[];
}

// Entschlüsseltes Paket: JSON-Daten plus eingebettete Dateien
export interface Pack<T> {
  data: T;
  has(name: string): boolean;
  url(name: string): string | undefined;
}

export interface App {
  content: Content;
  core: Pack<Content>;
  media: Promise<Pack<MediaData>>;
  next(): void;
  replay(): void;
}

export interface Scene {
  el: HTMLElement;
  enter(): void;
  reset(): void;
}
