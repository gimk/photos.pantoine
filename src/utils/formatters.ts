import type { Exif } from "../lib/photos";

// Format date helper
export const formatDate = (date: Date | string | null) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// "June 2026"
export const formatMonthYear = (date: Date | null) => {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
};

// 0.004 -> "1/250s", 2 -> "2s"
export const formatExposure = (seconds: number | null) => {
  if (!seconds) return "";
  if (seconds >= 1) return `${Number(seconds.toFixed(1))}s`;
  return `1/${Math.round(1 / seconds)}s`;
};

// 2.8 -> "f/2.8"
export const formatAperture = (fNumber: number | null) => {
  if (!fNumber) return "";
  return `f/${Number(fNumber.toFixed(1))}`;
};

// Avoid "Sony ILCE-7M4" becoming "SONY Sony ILCE-7M4" when the model already contains the make
export const formatCamera = (make: string | null, model: string | null) => {
  if (!model) return make ?? "";
  if (!make || model.toLowerCase().startsWith(make.split(" ")[0].toLowerCase())) {
    return model;
  }
  return `${make} ${model}`;
};

// "Sony ILCE-7M4 · 35mm · f/2.8 · 1/250s · ISO 100"
export const formatExifLine = (exif: Exif) =>
  [
    formatCamera(exif.make, exif.model),
    exif.focalLength ? `${Math.round(exif.focalLength)}mm` : "",
    formatAperture(exif.fNumber),
    formatExposure(exif.exposureTime),
    exif.iso ? `ISO ${exif.iso}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
