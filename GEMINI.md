# GEMINI.md - Photos.pantoine.com

This project is a personal photography portfolio website built with Astro. Its layout is modelled on zanvargek.com: a black index of every image (the home page), a white feed of series covers, and a full-screen viewer.

## Project Overview

- **Framework**: [Astro](https://astro.build/) (Static Site Generation)
- **Styling**: Vanilla CSS (`src/styles/site.css`)
- **Interactions**: Client-side TypeScript (`src/scripts/site.ts`)
- **Data Source**: JPEGs in `src/photos/<series>/`, with an optional `series.json` per folder (see README.md). They're 3000px web masters made by `npm run photos` (`scripts/optimize-photos.mjs`) from full-size camera files in the git-ignored `originals/` folder.
- **Metadata**: `exifr` reads camera, lens and exposure data from the original files at build time. GPS is never read.
- **Color Extraction**: `node-vibrant` extracts each photo's most populous palette swatch at build time. It's used as the loading placeholder, the viewer's background tint, the phone toolbar (which follows the background) and the About palette.
- **Architecture**:
    - A single page (`src/pages/index.astro`). Views are driven by attributes on `<body>`: `data-view="feed|index"`, `data-zoom` and `data-about`.
    - The index (all photos) is the home page. The URL hash mirrors the state: `#feed` for the series feed, or `#<series-slug>/<n>` for the viewer.
    - The viewer loops within a series: after the last photo it goes back to the first.
    - The viewer's full-size image URLs and metadata are embedded as JSON in `#gallery-data`. They're only fetched when a photo is opened.

## Building and Running

- **Development**: `npm run dev` - Starts the Astro dev server.
- **Build**: `npm run build` - Generates a static site in the `dist/` directory.
- **Preview**: `npm run preview` - Previews the built site locally.
- **Deployment**: Automatically deployed via GitHub Actions on push to `master` (see `.github/workflows/deploy.yml`).

## Development Conventions

- **Component-Driven**: UI is broken into Astro components (`src/components/`).
- **TypeScript**: Used for both build-time scripts and client-side interactions.
- **Originals stay private**: Never read properties of an imported `ImageMetadata` directly (e.g. `src.width`). Astro then publishes the untouched original with all its metadata. Read from `src.clone`, or pass it to `<Image>`/`getImage()`.
- **Performance**: Covers and thumbnails use responsive WebP `srcset`s, and only the first cover loads eagerly. The viewer preloads the neighbouring photos.

## Key Files

- `src/lib/photos.ts`: Loads series and photos, reads EXIF, sorts.
- `src/lib/color.ts`: Colour extraction.
- `src/pages/index.astro`: Page shell and the viewer's data.
- `src/components/`: `Nav`, `Feed`, `IndexGrid`, `Zoom`, `About`.
- `src/scripts/site.ts`: View switching, hash routing, viewer, keyboard and swipe.
- `src/utils/formatters.ts`: EXIF and date formatting.
