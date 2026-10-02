import Vibrant from "node-vibrant";
import sharp from "sharp";

const FALLBACK_COLOR = "#000000";

// Extract the colour that best sums up a local image: its most widespread palette swatch.
// The image is downscaled with sharp first so node-vibrant doesn't have to decode full-size originals.
export async function extractColor(filePath: string): Promise<string> {
  try {
    const thumbnail = await sharp(filePath)
      .resize(200, 200, { fit: "inside" })
      .jpeg()
      .toBuffer();

    const palette = await Vibrant.from(thumbnail).getPalette();

    // The swatch covering the most of the photo: closer to its overall feeling than the
    // "Vibrant" one, which is often a small accent
    const swatches = Object.values(palette).filter((s) => s !== null && s !== undefined);
    swatches.sort((a, b) => b.getPopulation() - a.getPopulation());
    return swatches[0]?.getHex() || FALLBACK_COLOR;
  } catch (e) {
    console.warn(
      `[photos] Failed to extract colour for ${filePath}: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
    return FALLBACK_COLOR;
  }
}

// Near-greys (and near-black or near-white) have no hue to speak of: they're grouped together
const NEUTRAL_SATURATION = 0.08;
// Two colours share a tint when their hues are this close, in degrees
const HUE_SPREAD = 25;
// Every tint is given this saturation and lightness, so only its hue tells collections apart:
// photo colours are often dull, dark or pale, and would all fade to the same near-white or
// near-black at the viewer's few percent
const TINT_SATURATION = 0.55;
const TINT_LIGHTNESS = 0.5;

// The tint most present across a set of photo colours, without re-reading the photos: each colour
// counts the colours that share its tint, and the one with the most wins (ties go to the one most
// central among them, then to the first). Its hue is kept, at an even saturation and lightness;
// a winning near-grey gives a plain mid-grey.
export function dominantColor(colors: string[]): string {
  if (!colors.length) return FALLBACK_COLOR;
  const hsl = colors.map(hslOf);
  const neutral = hsl.map(([, s, l]) => s < NEUTRAL_SATURATION || l < 0.08 || l > 0.92);
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const alike = (i: number, j: number) =>
    neutral[i] || neutral[j] ? neutral[i] && neutral[j] : hueGap(hsl[i][0], hsl[j][0]) <= HUE_SPREAD;

  let best = 0;
  let bestCount = -1;
  let bestSpread = Infinity;
  colors.forEach((_, i) => {
    const group = colors.flatMap((_, j) => (alike(i, j) ? [j] : []));
    const spread = group.reduce((sum, j) => sum + hueGap(hsl[i][0], hsl[j][0]), 0);
    if (group.length > bestCount || (group.length === bestCount && spread < bestSpread)) {
      [best, bestCount, bestSpread] = [i, group.length, spread];
    }
  });
  return neutral[best] ? hexOf(0, 0, TINT_LIGHTNESS) : hexOf(hsl[best][0], TINT_SATURATION, TINT_LIGHTNESS);
}

// [hue 0-360, saturation 0-1, lightness 0-1] to #rrggbb
function hexOf(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// #rrggbb to [hue 0-360, saturation 0-1, lightness 0-1]
function hslOf(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
