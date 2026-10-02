// Turns camera originals into lighter web masters for the site.
//
//   originals/<collection>/*.jpg  (full size, git-ignored)
//     -> src/photos/<collection>/*.jpg  (3000px long edge, quality 86, EXIF kept, committed)
//
// Run with `npm run photos`. Photos already converted are skipped unless the original is newer.
// Add --force to reconvert everything.
//
// originals/ is a drop folder: each original is deleted (permanently, not to the Recycle Bin)
// once its web master is safely written or already up to date, and emptied collection folders
// are removed. Keep your camera files backed up elsewhere. Add --keep to leave originals in place.
// Files the script doesn't handle (anything but JPEGs) are never touched.
//
// It also gives every collection a series.json with each editable field left empty, and adds
// any new photo to it, keeping what's already filled in. Photos no longer in a collection's folder
// are dropped from its series.json.
//
// It never deletes photos in src/photos/: originals/ is local to each
// machine (a fresh clone starts with it empty), so it can't be treated as the full list of photos.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ORIGINALS = "originals";
const OUTPUT = "src/photos";
const LONG_EDGE = 3000; // the largest width the site serves (see src/pages/index.astro)
const QUALITY = 86;

const force = process.argv.includes("--force");
const keep = process.argv.includes("--keep");

// Deletes an original, but only once its web master is on disk and not empty
function removeOriginal(src, dest) {
  if (keep) return false;
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) return false;
  fs.rmSync(src, { maxRetries: 10, retryDelay: 300 });
  return true;
}

// Write to a temp file, then swap it in. Retries briefly because on Windows a running dev
// server can hold the previous version open for a moment.
async function writeReplacing(dest, data) {
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, data);
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, dest);
      return;
    } catch (e) {
      if (attempt >= 10) {
        fs.rmSync(tmp, { force: true });
        throw new Error(`Could not replace ${dest} (is it open elsewhere?): ${e.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
const isJpeg = (file) => /\.jpe?g$/i.test(file);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

let converted = 0;
let skipped = 0;
let removed = 0;
let before = 0;
let after = 0;

if (!fs.existsSync(ORIGINALS)) {
  console.log(`No ${ORIGINALS}/ folder. Put originals in ${ORIGINALS}/<collection>/ and run again.`);
}

for (const collection of fs.existsSync(ORIGINALS) ? fs.readdirSync(ORIGINALS, { withFileTypes: true }) : []) {
  if (!collection.isDirectory()) continue;

  const srcDir = path.join(ORIGINALS, collection.name);
  const destDir = path.join(OUTPUT, collection.name);
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of fs.readdirSync(srcDir).filter(isJpeg)) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);

    if (!force && fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
      skipped++;
      if (removeOriginal(src, dest)) removed++;
      continue;
    }

    const original = fs.readFileSync(src);
    const orientation = (await sharp(original).metadata()).orientation ?? 1;
    let output = await sharp(original)
      .rotate() // bake the EXIF orientation into the pixels
      .resize(LONG_EDGE, LONG_EDGE, { fit: "inside", withoutEnlargement: true })
      .keepMetadata() // camera, lens, exposure, date and colour profile
      .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();

    // Already-small originals (crops, earlier exports) can come out bigger: keep those as they are
    if (output.length >= original.length && orientation === 1) output = original;

    await writeReplacing(dest, output);
    const srcSize = original.length;
    const destSize = output.length;
    before += srcSize;
    after += destSize;
    converted++;
    console.log(`${collection.name}/${file}: ${mb(srcSize)} -> ${mb(destSize)}`);
    if (removeOriginal(src, dest)) removed++;
  }

  if (!keep && fs.readdirSync(srcDir).length === 0) fs.rmdirSync(srcDir);
}

// Every collection gets a series.json listing everything that can be edited, left empty (empty
// means the default, see README.md). An existing one only gains the fields and photos it lacks:
// what's already filled in is kept.
const COMMENT =
  "Empty fields use the default, see README.md. To choose the cover, name a photo cover.jpg.";
const blankSeries = () => ({ "//": COMMENT, title: "", subtitle: "", date: "", order: null, color: "", photos: {} });
const blankPhoto = () => ({ alt: "", caption: "" });
let seriesWritten = 0;

for (const collection of fs.readdirSync(OUTPUT, { withFileTypes: true })) {
  if (!collection.isDirectory()) continue;
  const file = path.join(OUTPUT, collection.name, "series.json");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  let config;
  try {
    config = { ...blankSeries(), ...(existing ? JSON.parse(existing) : {}) };
  } catch (e) {
    console.warn(`${file} isn't valid JSON, left as it is: ${e.message}`);
    continue;
  }
  const photos = fs
    .readdirSync(path.join(OUTPUT, collection.name))
    .filter(isJpeg)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  // Rebuilt from the folder, so photos deleted from it are dropped from series.json too
  const listed = config.photos ?? {};
  const gone = Object.keys(listed).filter((photo) => !photos.includes(photo));
  config.photos = Object.fromEntries(photos.map((photo) => [photo, { ...blankPhoto(), ...listed[photo] }]));
  config["//"] = COMMENT;
  delete config.cover; // replaced by naming a photo cover.jpg

  const json = `${JSON.stringify(config, null, 2)}\n`;
  if (json === existing) continue;
  fs.writeFileSync(file, json);
  seriesWritten++;
  console.log(
    `${collection.name}/series.json ${existing ? "updated" : "created"}` +
      (gone.length ? ` (removed ${gone.join(", ")})` : ""),
  );
}

console.log(
  `\n${converted} converted${converted ? ` (${mb(before)} -> ${mb(after)})` : ""}, ${skipped} already up to date` +
    (keep ? ", originals kept" : `, ${removed} original${removed === 1 ? "" : "s"} removed from ${ORIGINALS}/`) +
    `, ${seriesWritten} series.json written.`,
);
