import type { ImageMetadata } from "astro";
import exifr from "exifr";
import path from "node:path";
import { dominantColor, extractColor } from "./color";

// Content model: one folder per series in src/photos/, holding JPEGs and an optional series.json.
// See README.md for the series.json format. `npm run photos` writes each series.json with every
// field left empty, and an empty field ("" or null) means the default.

export interface Exif {
  make: string | null;
  model: string | null;
  lens: string | null;
  focalLength: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  iso: number | null;
}

export interface Photo {
  id: string;
  file: string;
  src: ImageMetadata;
  alt: string;
  caption: string | null;
  color: string;
  width: number;
  height: number;
  takenAt: Date | null;
  exif: Exif;
  seriesSlug: string;
  indexInSeries: number;
}

export interface Series {
  slug: string;
  title: string;
  subtitle: string | null;
  // When the series was shot: the earliest photo's EXIF date
  date: Date | null;
  // The tint most present across its photos' colours: the viewer's background takes it
  color: string;
  cover: Photo;
  photos: Photo[];
}

interface SeriesConfig {
  title?: string | null;
  subtitle?: string | null;
  date?: string | null; // "YYYY-MM", only used when no photo in the series has an EXIF date
  cover?: string | null;
  order?: number | null;
  color?: string | null; // "#rrggbb", replaces the colour picked from the photos
  photos?: Record<string, { alt?: string | null; caption?: string | null }>;
}

const imageModules = import.meta.glob<{ default: ImageMetadata }>(
  "/src/photos/*/*.{jpg,jpeg,JPG,JPEG}",
  { eager: true },
);
const configModules = import.meta.glob<{ default: SeriesConfig }>(
  "/src/photos/*/series.json",
  { eager: true },
);

// Only the fields shown on the site are read. GPS is deliberately never read.
const EXIF_FIELDS = [
  "Make",
  "Model",
  "LensModel",
  "FocalLength",
  "FNumber",
  "ExposureTime",
  "ISO",
  "DateTimeOriginal",
];

async function readExif(filePath: string) {
  try {
    return (await exifr.parse(filePath, { pick: EXIF_FIELDS, gps: false })) ?? {};
  } catch (e) {
    console.warn(`[photos] Could not read EXIF from ${filePath}`);
    return {};
  }
}

const cleanString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const cleanNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function parseConfigColor(value: string | null, slug: string) {
  if (!value) return null;
  if (!/^#([0-9a-f]{3}){1,2}$/i.test(value)) {
    console.warn(`[photos] Ignoring color "${value}" in ${slug}/series.json, expected "#rrggbb"`);
    return null;
  }
  return value;
}

function parseConfigDate(value: string | null, slug: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    console.warn(`[photos] Ignoring date "${value}" in ${slug}/series.json, expected "YYYY-MM"`);
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

const titleFromSlug = (slug: string) =>
  slug
    .replace(/^\d{4}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

async function loadSeries(): Promise<Series[]> {
  // Group image modules by their series folder
  const filesBySeries = new Map<string, string[]>();
  for (const key of Object.keys(imageModules)) {
    const slug = key.split("/").at(-2)!;
    if (!filesBySeries.has(slug)) filesBySeries.set(slug, []);
    filesBySeries.get(slug)!.push(key);
  }

  const series = await Promise.all(
    [...filesBySeries.entries()].map(async ([slug, keys]) => {
      const config = configModules[`/src/photos/${slug}/series.json`]?.default ?? {};
      const title = cleanString(config.title) ?? titleFromSlug(slug);
      const coverFile = cleanString(config.cover);

      const photos: Photo[] = await Promise.all(
        keys.map(async (key) => {
          const file = key.split("/").at(-1)!;
          const filePath = path.join(process.cwd(), key);
          const src = imageModules[key].default;
          // Astro publishes the untouched original (with all its metadata) as soon as any property
          // of `src` is read. Read dimensions from the hidden `clone` instead, like getImage() does.
          const { width, height } = (src as ImageMetadata & { clone: ImageMetadata }).clone;
          const [exif, color] = await Promise.all([
            readExif(filePath),
            extractColor(filePath),
          ]);
          const photoConfig = config.photos?.[file] ?? {};

          return {
            id: `${slug}/${file}`,
            file,
            src,
            alt: cleanString(photoConfig.alt) ?? `${title}, photograph by Antoine Pouligny`,
            caption: cleanString(photoConfig.caption),
            color,
            width,
            height,
            takenAt: exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null,
            exif: {
              make: cleanString(exif.Make),
              model: cleanString(exif.Model),
              lens: cleanString(exif.LensModel),
              focalLength: cleanNumber(exif.FocalLength),
              fNumber: cleanNumber(exif.FNumber),
              exposureTime: cleanNumber(exif.ExposureTime),
              iso: cleanNumber(exif.ISO),
            },
            seriesSlug: slug,
            indexInSeries: 0,
          };
        }),
      );

      // A file named "cover" comes first; then chronological, falling back to filename
      const isCover = (p: Photo) => path.parse(p.file).name.toLowerCase() === "cover";
      photos.sort((a, b) => {
        if (isCover(a) !== isCover(b)) return isCover(a) ? -1 : 1;
        if (a.takenAt && b.takenAt) return a.takenAt.getTime() - b.takenAt.getTime();
        return a.file.localeCompare(b.file, undefined, { numeric: true });
      });
      photos.forEach((photo, i) => (photo.indexInSeries = i));

      const cover = photos.find((p) => p.file === coverFile) ?? photos[0];
      if (coverFile && cover.file !== coverFile) {
        console.warn(`[photos] Cover "${coverFile}" not found in ${slug}, using ${cover.file}`);
      }

      const timestamps = photos.flatMap((p) => (p.takenAt ? [p.takenAt.getTime()] : []));
      const date = timestamps.length
        ? new Date(Math.min(...timestamps))
        : parseConfigDate(cleanString(config.date), slug);

      return {
        slug,
        title,
        subtitle: cleanString(config.subtitle),
        date,
        color:
          parseConfigColor(cleanString(config.color), slug) ??
          dominantColor(photos.map((p) => p.color)),
        cover,
        photos,
        order: cleanNumber(config.order) ?? undefined,
      };
    }),
  );

  // Explicit order first, then most recently shot first, then alphabetical
  series.sort((a, b) => {
    if (a.order !== undefined || b.order !== undefined) {
      return (a.order ?? Infinity) - (b.order ?? Infinity);
    }
    const byDate = (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
    return byDate || a.slug.localeCompare(b.slug);
  });

  return series.map(({ order, ...s }) => s);
}

let cache: Promise<Series[]> | null = null;

export function getSeries() {
  cache ??= loadSeries();
  return cache;
}
