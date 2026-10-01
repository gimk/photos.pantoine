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
