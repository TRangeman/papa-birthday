# papa-birthday

Kleine Web-App (Vite + TypeScript), die per QR-Code geöffnet wird. Alle Inhalte liegen nur verschlüsselt
online; der Schlüssel steckt im Link hinter `#k=…`.

## Voraussetzungen

- Node.js 22 und npm
- Git mit Zugang zu `github.com/TRangeman/papa-birthday` (Anmeldung über den Git Credential Manager)

Einmalig nach dem Klonen bzw. nach Änderungen an `package.json`:

```bash
npm install
```

## Der Ordner `private/` (nicht im Repo)

| Datei | Zweck |
|---|---|
| `content.json` | Alle Texte, Kontakt, Farben, Song-Ausschnitte. Struktur siehe `content.example.json` |
| `key.txt` | Schlüssel. **Nie löschen oder ändern**, sonst passt der gedruckte QR-Code nicht mehr |
| `photos/` | Fotos (jpg, png, webp), Reihenfolge nach Dateiname |
| `audio/birthday.mp3` | Song für den Kuchen |
| `audio/sixtyfour.mp3` | Song ab dem Generator |
| `signature.png` / `.svg` | Unterschrift (optional, transparent) |
| `check-words.txt` | Begriffe, die nie im öffentlichen Build stehen dürfen (einer pro Zeile) |
| `out/` | Wird erzeugt: `link.txt`, `qr.png`, `qr.svg`, Hörproben der Song-Ausschnitte |

## Inhalte ändern

Nach jeder Änderung in `private/` (Texte, Fotos, Songs, Unterschrift) die verschlüsselten Pakete neu bauen:

```bash
npm run payload
```

Das schreibt `public/core.bin` und `public/media.bin` und gibt Link und QR-Code aus. Ein vorhandener
`key.txt` wird wiederverwendet, der Link bleibt also gleich.

Song-Ausschnitte in `content.json` unter `audio`: `startSec` und `durationSec` in Sekunden. Nur `startSec`
heißt „ab dort bis zum Ende“. Die Dauer des Generators steht in `gen.sec`.

## Lokal testen

Am PC:

```bash
npm run dev
```

Dann den Link „Lokal:“ aus `private/out/link.txt` öffnen (`http://localhost:5173/papa-birthday/#k=…`).
Danach ist der Schlüssel im Browser gespeichert, `http://localhost:5173/papa-birthday/` reicht.

Am Handy (gleiches WLAN, HTTPS wegen Entschlüsselung und Mikrofon):

```bash
npm run dev:phone
```

Die angezeigte **Network**-Adresse am Handy öffnen, `#k=…` aus `link.txt` anhängen und die
Zertifikatswarnung bestätigen („Erweitert“ → „Weiter zu …“).

Mit `?debug` vor dem `#` (z. B. `…/papa-birthday/?debug#k=…`) zeigt die Kuchen-Seite die Mikrofon-Pegel an.
Die Schwellwerte stehen oben in `src/audio/mic.ts`.

## Code speichern

```bash
git add -A
git commit -m "Beschreibung der Änderung"
git push
```

`private/`, `docs/` und `public/*.bin` sind in `.gitignore` und landen nie im Repo.

## Veröffentlichen

```bash
npm run deploy
```

Das baut die Seite, prüft `dist/` auf die Begriffe aus `check-words.txt` (bricht bei einem Treffer ab)
und lädt `dist/` in den Branch `gh-pages` hoch. Nach ein bis zwei Minuten ist die neue Version unter
`https://trangeman.github.io/papa-birthday/` live.

Wichtig: Vorher `npm run payload` laufen lassen, wenn sich etwas in `private/` geändert hat. Deployt
wird immer der aktuelle Stand von `public/*.bin`.

## Wenn etwas hakt

- **`git push` meldet „Authentication failed“**: In einem normalen PowerShell-Fenster pushen, dann öffnet
  sich die GitHub-Anmeldung im Browser.
- **Port 5173 belegt**: Vite nimmt automatisch den nächsten Port (5174 …), im Link entsprechend anpassen.
- **Live-Seite zeigt noch die alte Version**: ein, zwei Minuten warten, dann neu laden.
- **„Diese Karte braucht ihren Schlüssel“**: Link ohne oder mit falschem `#k=…` geöffnet. Link aus
  `private/out/link.txt` nehmen.
