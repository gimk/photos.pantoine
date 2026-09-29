# photos.pantoine.com

This is my personal photography portfolio website.

## Tech Used

- **Framework**: [Astro](https://astro.build/)
- **Languages**: TypeScript, HTML, CSS
- **Font**: [Fraunces](https://fonts.google.com/specimen/Fraunces) (variable weight and optical size), self-hosted via Fontsource
- **Photo data**: EXIF read from the JPEGs at build time with [`exifr`](https://github.com/MikeKovarik/exifr)

## Adding photos

1. Put the full-size camera JPEGs in `originals/<collection>/`. This folder is git-ignored, so originals are never committed. It's a drop folder: `npm run photos` **permanently deletes** each original once its web master is written (keep your camera files backed up elsewhere). Add `--keep` to leave them in place: `node scripts/optimize-photos.mjs --keep`.
2. Run `npm run photos`. It writes a web master of each photo to `src/photos/<collection>/`: 3000px on the long edge (the largest size the site shows), JPEG quality 86, with the camera data and colour profile kept. Photos already converted are skipped. Run `node scripts/optimize-photos.mjs --force` to redo them all. The script never deletes anything in `src/photos/`, since `originals/` only exists on the machine where you add photos. To rename or remove a collection or a photo, rename or delete it in `src/photos/` (and in `originals/` if you keep the originals there).
3. Commit `src/photos/`.

Each collection is a folder in `src/photos/`, holding the web masters and an optional `series.json` (add it there by hand):

```
originals/                 src/photos/
  guadeloupe-2025/           guadeloupe-2025/
    DSC01234.jpg  ─────────►   DSC01234.jpg
    DSC01240.jpg               DSC01240.jpg
                               series.json
```

```json
{
  "title": "Guadeloupe",
  "subtitle": "Deshaies",
  "cover": "DSC01234.jpg",
  "order": 1,
  "photos": {
    "DSC01234.jpg": { "alt": "Benches under flowering trees", "caption": "Optional caption" }
  }
}
```

Every field is optional:

- `title` defaults to the folder name (a leading `2025-` is dropped).
- A series is dated by its earliest photo (month and year, e.g. "June 2026"), from the EXIF. If none of its photos has a date, set `"date": "2026-06"`.
- `cover` defaults to the first photo.
- Series with an `order` come first; the rest are sorted most recently shot first.
- Photos within a series are sorted by the date they were taken, then by filename. A photo named `cover` (any extension) always comes first.

If you edit photos before adding them, export **with metadata included**, so the camera, lens and exposure settings can be shown. At build time, Astro generates the resized WebP versions from the web masters. It strips all metadata from them and never publishes the masters themselves, so GPS data in your files doesn't end up on the site.

## Running

```bash
npm install
npm run dev
```

Pushing to `master` builds and deploys to GitHub Pages.
