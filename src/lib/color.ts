import Vibrant from "node-vibrant";
import sharp from "sharp";

const FALLBACK_COLOR = "#000000";

// Extract the most impactful colour of a local image.
// The image is downscaled with sharp first so node-vibrant doesn't have to decode full-size originals.
export async function extractColor(filePath: string): Promise<string> {
  try {
    const thumbnail = await sharp(filePath)
      .resize(200, 200, { fit: "inside" })
      .jpeg()
      .toBuffer();

    const palette = await Vibrant.from(thumbnail).getPalette();

    return (
      palette.Vibrant?.getHex() ||
      palette.DarkVibrant?.getHex() ||
      palette.Muted?.getHex() ||
      palette.LightVibrant?.getHex() ||
      palette.DarkMuted?.getHex() ||
      FALLBACK_COLOR
    );
  } catch (e) {
    console.warn(
      `[photos] Failed to extract colour for ${filePath}: ${e instanceof Error ? e.message : "Unknown error"}`,
    );
    return FALLBACK_COLOR;
  }
}
