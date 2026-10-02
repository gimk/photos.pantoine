# photos.pantoine.com

This is my personal photography portfolio website.

## Tech Used

- **Framework**: [Astro](https://astro.build/)
- **Languages**: TypeScript, HTML, CSS
- **Font**: [Fraunces](https://fonts.google.com/specimen/Fraunces) (variable weight and optical size), self-hosted via Fontsource
- **Photo data**: EXIF read from the JPEGs at build time with [`exifr`](https://github.com/MikeKovarik/exifr)
- **Photo colour**: each photo's colour picked at build time with [`node-vibrant`](https://github.com/Vibrant-Colors/node-vibrant) (see [Colour](#colour))

## Colour

Each photo gets one colour at build time: the most widespread swatch of its palette, as picked by `node-vibrant` (`src/lib/color.ts`). It's used in a few quiet places:

- **Loading placeholder**: until a photo loads, its colour fills its place, in its shape. In the viewer, this only happens if the photo takes more than 200ms, and the photo then comes in out of a blur.
- **Viewer background**: the viewer's black or white takes an 8% tint of the open photo's collection's colour, easing from one collection's to the next. A collection's colour is the hue most present among its photos' colours (photos with a close hue count together, near-greys count as one), given the same saturation and lightness for every collection so only the hue sets them apart; a mostly grey collection gets a plain grey. Set `color` in its `series.json` to choose it yourself.
- **Phone toolbar**: the browser's toolbar follows the background: black on the index, white on the feed, tinted in the viewer.
- **About palette**: every photo as a dot of its colour, in the collections' order. Clicking one opens its photo.

To change the tint, edit `--tint-amount` on `.zoom` in `src/styles/site.css`.

## Adding photos

1. Put the full-size camera JPEGs in `originals/<collection>/`. This folder is git-ignored, so originals are never committed. It's a drop folder: `npm run photos` **permanently deletes** each original once its web master is written (keep your camera files backed up elsewhere). Add `--keep` to leave them in place: `node scripts/optimize-photos.mjs --keep`.
2. Run `npm run photos`. It writes a web master of each photo to `src/photos/<collection>/`: 3000px on the long edge (the largest size the site shows), JPEG quality 86, with the camera data and colour profile kept. Photos already converted are skipped. Run `node scripts/optimize-photos.mjs --force` to redo them all. The script never deletes anything in `src/photos/`, since `originals/` only exists on the machine where you add photos. To rename or remove a collection or a photo, rename or delete it in `src/photos/` (and in `originals/` if you keep the originals there).
3. Commit `src/photos/`.

Each collection is a folder in `src/photos/`, holding the web masters and a `series.json`. `npm run photos` creates it with every field left empty, so it shows everything you can edit, and on later runs adds new photos to it and drops the ones you've deleted from the folder, without touching what you've filled in for the others:

```
originals/                 src/photos/
  guadeloupe-2025/           guadeloupe-2025/
    DSC01234.jpg  ─────────►   DSC01234.jpg
    DSC01240.jpg               DSC01240.jpg
                               series.json
```

```json
{
  "//": "Empty fields use the default, see README.md. To choose the cover, name a photo cover.jpg.",
  "title": "Guadeloupe",
  "subtitle": "Deshaies",
  "date": "",
  "order": 1,
  "color": "#2e5061",
  "photos": {
    "DSC01234.jpg": { "alt": "Benches under flowering trees", "caption": "Optional caption" }
  }
}
```

Every field is optional, and an empty one (`""` or `null`) means the default:

- `title` defaults to the folder name (a leading `2025-` is dropped).
- A series is dated by its earliest photo (month and year, e.g. "June 2026"), from the EXIF. If none of its photos has a date, set `"date": "2026-06"`.
- Series with an `order` come first; the rest are sorted most recently shot first.
- `color` (`"#rrggbb"`) sets the collection's tint in the viewer, instead of the one picked from its photos (see [Colour](#colour)).
- Each photo's `alt` defaults to "<title>, photograph by Antoine Pouligny"; `caption` defaults to none.
- Photos within a series are sorted by the date they were taken, then by filename. A photo named `cover` (any extension) always comes first and is the series' cover; without one, the first photo is.
- The `"//"` line is only a reminder; the site ignores it.

If you edit photos before adding them, export **with metadata included**, so the camera, lens and exposure settings can be shown. At build time, Astro generates the resized WebP versions from the web masters. It strips all metadata from them and never publishes the masters themselves, so GPS data in your files doesn't end up on the site.

## Running

```bash
npm install
npm run dev
```

Pushing to `master` builds and deploys to GitHub Pages.
