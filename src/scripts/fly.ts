// Moves a photo between its thumbnail / cover on the page and its place in the viewer.
// A copy of the image (a fixed-position <img>) is drawn at the destination and animated from the
// start rect with a transform ("FLIP"), so only compositing work happens during the flight.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"; // fast start, soft landing
const DURATION = 650;

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where an image of aspect `ratio` is drawn inside `box` with object-fit: contain. */
export function containedRect(box: Rect, ratio: number): Rect {
  let width = box.width;
  let height = width / ratio;
  if (height > box.height) {
    height = box.height;
    width = height * ratio;
  }
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

/** The content box of `el` (its rect minus padding), in viewport coordinates. */
export function contentBox(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const [top, right, bottom, left] = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
  return { left: r.left + left, top: r.top + top, width: r.width - left - right, height: r.height - top - bottom };
}

/** Resolves on the next-but-one frame, i.e. once what was just changed has been painted. */
export const painted = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * Flies a copy of the image at `src` from `from` to `to`. `onReady` runs once the copy is decoded
 * and drawn at `from`: that's when the caller can hide the original without a blank frame.
 * Resolves with the copy still in place at `to`, so the caller can swap in the real image
 * underneath before calling `remove()` on it.
 */
export async function fly(src: string, from: Rect, to: Rect, onReady: () => void): Promise<HTMLImageElement> {
  const copy = new Image();
  copy.src = src;
  copy.className = "zoom-fly";
  const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  Object.assign(copy.style, {
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    transform: start,
  });
  await copy.decode().catch(() => {});
  document.body.append(copy);
  await painted();
  onReady();

  await copy
    .animate([{ transform: start }, { transform: "none" }], { duration: DURATION, easing: EASE })
    .finished.catch(() => {});
  copy.style.transform = "none";
  return copy;
}
