// Client-side state for the single-page gallery.
//
// State lives on <body> as data attributes, and site.css shows/hides everything from them:
//   data-view="feed|index"  the page underneath
//   data-zoom               the full-screen viewer is open
//   data-about              the About overlay is open
//
// The URL hash mirrors the state so views can be shared and the back button works:
//   (none) -> index (home), #feed -> feed, #<series-slug>/<n> -> viewer on photo n (1-based)

import { containedRect, contentBox, fly, painted, reducedMotion } from "./fly";
import { placeholderImage } from "../utils/placeholder";

interface GalleryPhoto {
  slug: string;
  index: number;
  count: number;
  title: string;
  date: string;
  caption: string | null;
  exif: string;
  alt: string;
  color: string;
  tint: string; // the collection's colour
  width: number;
  height: number;
  src: string;
  srcset: string;
}

type View = "feed" | "index";

const body = document.body;
const photos: GalleryPhoto[] = JSON.parse(
  document.getElementById("gallery-data")?.textContent || "[]",
);

const zoomEl = document.querySelector<HTMLElement>(".zoom")!;
const aboutEl = document.querySelector<HTMLElement>(".about")!;
const stage = document.querySelector<HTMLElement>("[data-zoom-stage]")!;
const zoomImg = document.querySelector<HTMLImageElement>("[data-zoom-img]")!;
const cursor = document.querySelector<HTMLElement>("[data-zoom-cursor]")!;
const exifButton = document.querySelector<HTMLElement>("[data-zoom-exif-btn]")!;
const zoomFields = {
  count: document.querySelector<HTMLElement>("[data-zoom-count]")!,
  title: document.querySelector<HTMLElement>("[data-zoom-title]")!,
  date: document.querySelector<HTMLElement>("[data-zoom-date]")!,
  caption: document.querySelector<HTMLElement>("[data-zoom-caption]")!,
  exif: document.querySelector<HTMLElement>("[data-zoom-exif]")!,
};

// Top-left collection label: the hovered index thumbnail, or the photo open in the viewer
const collectionTitle = document.querySelector<HTMLElement>("[data-collection-title]")!;
const collectionDate = document.querySelector<HTMLElement>("[data-collection-date]")!;
function setCollectionLabel(title: string, date: string) {
  collectionTitle.textContent = title;
  collectionDate.textContent = date;
}

let view: View = "index";
let current = -1; // index in `photos` shown in the viewer, -1 when closed
let openedFromPage = false; // true when the viewer was opened by a click, so Close can go back
const scrollByView: Record<View, number> = { feed: 0, index: 0 };

// ---------------------------------------------------------------------------
// Routing

function parseHash(hash: string): { view: View; photo: number } {
  const value = decodeURIComponent(hash.replace(/^#/, ""));
  if (value === "feed") return { view: "feed", photo: -1 };

  const match = value.match(/^(.+)\/(\d+)$/);
  if (match) {
    const photo = photos.findIndex(
      (p) => p.slug === match[1] && p.index === Number(match[2]) - 1,
    );
    if (photo !== -1) return { view, photo };
  }
  return { view: "index", photo: -1 };
}

const urlForView = (v: View) => (v === "feed" ? "#feed" : location.pathname);

const hashFor = (photoIndex: number) =>
  photoIndex === -1
    ? urlForView(view)
    : `#${photos[photoIndex].slug}/${photos[photoIndex].index + 1}`;

function navigate(url: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", url);
  render();
}

function render() {
  const state = parseHash(location.hash);
  setView(state.view);
  if (state.photo === -1) closeZoom();
  else showPhoto(state.photo);
}

// ---------------------------------------------------------------------------
// Views

function setView(next: View) {
  if (next === view) return;
  scrollByView[view] = window.scrollY;
  view = next;
  body.dataset.view = next;
  window.scrollTo(0, scrollByView[next]);
  updateThemeColor();
}

// Phones: the browser's toolbar follows the background, black on the index, white on the feed,
// and in the viewer the page's background with the collection's tint, mixed as site.css mixes it
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
function updateThemeColor() {
  if (!themeColor) return;
  const bg = getComputedStyle(body).getPropertyValue("--bg").trim();
  if (current === -1) {
    themeColor.content = bg;
    return;
  }
  const amount = parseFloat(getComputedStyle(zoomEl).getPropertyValue("--tint-amount")) / 100;
  const [tint, base] = [photos[current].tint, bg].map(rgbOf);
  themeColor.content = `rgb(${tint.map((c, i) => Math.round(c * amount + base[i] * (1 - amount))).join(" ")})`;
}

// #rgb or #rrggbb to [r, g, b]
function rgbOf(hex: string) {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function setAbout(open: boolean) {
  body.toggleAttribute("data-about", open);
  aboutEl.setAttribute("aria-hidden", String(!open));
}

// ---------------------------------------------------------------------------
// Viewer

function showPhoto(i: number) {
  const photo = photos[i];
  if (!photo) return;

  const opening = current === -1;
  if (opening) {
    body.removeAttribute("data-hover");
    body.toggleAttribute("data-zoom", true);
    zoomEl.setAttribute("aria-hidden", "false");
    // Undo a swipe-to-close, left in place so the viewer faded out as it was
    zoomImg.style.transform = "";
    zoomEl.classList.remove("is-settling");
    zoomEl.style.removeProperty("--swipe");
  }

  if (i !== current) {
    current = i;
    zoomImg.classList.remove("is-loaded", "is-slow");
    zoomImg.onload = photoLoaded;
    zoomEl.classList.remove("is-exif");
    exifButton.setAttribute("aria-expanded", "false");
    zoomImg.alt = photo.alt;
    zoomImg.sizes = "100vw";
    zoomImg.srcset = photo.srcset;
    zoomImg.src = photo.src;
    zoomImg.dataset.color = photo.color;
    if (zoomImg.complete) {
      zoomImg.classList.add("is-loaded");
      showPlaceholder(null);
    } else showPlaceholder(photo);
    // Browsing eases the tint from one collection's to the next; opening the viewer starts
    // straight on the photo's, not on the colour it was last closed with
    if (opening) zoomEl.classList.add("is-opening");
    zoomEl.style.setProperty("--tint", photo.tint);
    if (opening) {
      getComputedStyle(zoomEl).getPropertyValue("--tint"); // apply it before the class goes
      zoomEl.classList.remove("is-opening");
    }
    updateThemeColor();
  }

  zoomFields.count.textContent = `${photo.index + 1} / ${photo.count}`;
  zoomFields.title.textContent = photo.title;
  zoomFields.date.textContent = photo.date;
  setCollectionLabel(photo.title, photo.date);
  zoomFields.caption.textContent = photo.caption ?? "";
  zoomFields.exif.textContent = photo.exif;

  preload(neighbour(i, 1));
  preload(neighbour(i, -1));
}

// A photo that takes a while to load shows its colour in its place meanwhile (see .zoom__stage
// in site.css), then comes in out of a blur over it. Only after PLACEHOLDER_DELAY: most photos
// (preloaded neighbours) are drawn within a frame or two, and showing the colour straight away
// would flash it, in the new photo's shape. The colour is dropped once the photo is in, so it
// can't show as a fringe round the photo or behind it during a swipe.
const PLACEHOLDER_DELAY = 200; // ms
let placeholderTimer = 0;

function showPlaceholder(photo: GalleryPhoto | null) {
  clearTimeout(placeholderTimer);
  stage.style.removeProperty("--placeholder");
  if (!photo) return;
  placeholderTimer = window.setTimeout(() => {
    stage.style.setProperty("--placeholder", placeholderImage(photo.color, photo.width, photo.height));
    zoomImg.classList.add("is-slow");
  }, PLACEHOLDER_DELAY);
}

async function photoLoaded() {
  clearTimeout(placeholderTimer);
  const shown = current;
  zoomImg.classList.add("is-loaded");
  await painted();
  await Promise.all(zoomImg.getAnimations().map((a) => a.finished.catch(() => {})));
  if (current === shown) stage.style.removeProperty("--placeholder");
}

function closeZoom() {
  if (current === -1) return;
  const photo = photos[current];
  current = -1;
  openedFromPage = false;
  flyOut(photo); // measures the viewer, so before it starts fading out
  body.removeAttribute("data-zoom");
  zoomEl.setAttribute("aria-hidden", "true");
  updateThemeColor();
}

// ---------------------------------------------------------------------------
// Open / close animations: the photo flies between its thumbnail or cover and the viewer

const ratioOf = (photo: GalleryPhoto) => photo.width / photo.height;
// The viewer image fills the stage and draws the photo contained in it (object-fit: contain)
const viewerRect = (photo: GalleryPhoto) => containedRect(contentBox(stage), ratioOf(photo));

let flightCopy: HTMLImageElement | null = null;
function endFlight() {
  flightCopy?.remove();
  flightCopy = null;
  zoomImg.classList.remove("is-hidden");
}

const loaded = (img: HTMLImageElement) =>
  img.complete && img.naturalWidth
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });

// The clicked thumbnail / cover flies and grows to the centre. The small image does the flying;
// the full-size one replaces it once downloaded.
async function flyIn(source: HTMLImageElement, photo: GalleryPhoto) {
  if (reducedMotion()) return;
  endFlight();
  showPlaceholder(null); // the thumbnail itself flies in and stands in for the photo
  const from = containedRect(source.getBoundingClientRect(), ratioOf(photo));
  zoomImg.classList.add("is-hidden");
  const copy = await fly(source.currentSrc || source.src, from, viewerRect(photo), () => {
    source.style.visibility = "hidden";
  });
  flightCopy = copy;
  source.style.visibility = "";

  // Show the full-size photo under the landed copy (no fade), and only remove the copy once
  // the photo has been painted, so there's never a frame with neither
  await loaded(zoomImg);
  await zoomImg.decode().catch(() => {});
  if (flightCopy !== copy) return;
  zoomImg.style.transition = "none";
  zoomImg.classList.add("is-loaded");
  zoomImg.classList.remove("is-hidden");
  await painted();
  zoomImg.style.transition = "";
  if (flightCopy === copy) endFlight();
}

// Closing: the photo flies back into its thumbnail (index) or cover (feed), scrolling it into view
// first if needed. Without a matching image on the page, the viewer just fades out.
let closeFrom = { x: 0, y: 0 }; // where a swipe-to-close left the photo, relative to its place
let swipeHidden: HTMLImageElement | null = null; // its page image, hidden during that swipe

// The photo's thumbnail (index) or cover (feed) on the page under the viewer, if it has one
function pageImage(photo: GalleryPhoto) {
  const href = `#${photo.slug}/${photo.index + 1}`;
  const link = [...document.querySelectorAll<HTMLAnchorElement>(`.${view} a[href^="#"]`)].find(
    (a) => a.getAttribute("href") === href,
  );
  return link?.querySelector("img") ?? null;
}

function flyOut(photo: GalleryPhoto) {
  const offset = closeFrom;
  closeFrom = { x: 0, y: 0 };
  // Hidden by a swipe-to-close: the flight below shows it again once landed
  const hidden = swipeHidden;
  swipeHidden = null;
  endFlight();
  if (reducedMotion() || !zoomImg.naturalWidth) {
    if (hidden) hidden.style.visibility = "";
    return;
  }

  const target = pageImage(photo);
  if (!target) return;

  const box = target.getBoundingClientRect();
  if (box.bottom < 0 || box.top > window.innerHeight) target.scrollIntoView({ block: "center" });

  const from = viewerRect(photo);
  from.left += offset.x;
  from.top += offset.y;
  const to = containedRect(target.getBoundingClientRect(), ratioOf(photo));
  // Pinned to the page: if it's scrolled during the flight, the copy follows its thumbnail
  fly(
    zoomImg.currentSrc || zoomImg.src,
    from,
    to,
    () => {
      zoomImg.classList.add("is-hidden");
      target.style.visibility = "hidden";
    },
    true,
  ).then(async (copy) => {
    // The thumbnail reappears under the landed copy first, then the copy goes
    target.style.visibility = "";
    await painted();
    copy.remove();
    if (current === -1) zoomImg.classList.remove("is-hidden");
  });
}

// Neighbour of photo i within its own series, looping: past the last photo comes back to
// the first. `photos` holds each series contiguously, so the series starts at i - index.
function neighbour(i: number, delta: number) {
  const { index, count } = photos[i];
  return i - index + ((index + delta + count) % count);
}

function step(delta: number) {
  if (current === -1) return;
  navigate(hashFor(neighbour(current, delta)), true);
}

function exitZoom() {
  if (openedFromPage) history.back();
  else navigate(hashFor(-1), true);
}

const preloaded = new Set<number>();
function preload(i: number) {
  if (preloaded.has(i)) return;
  preloaded.add(i);
  const img = new Image();
  img.sizes = "100vw";
  img.srcset = photos[i].srcset;
  img.src = photos[i].src;
}

// ---------------------------------------------------------------------------
// Events

// In-page links (covers, thumbnails, nav) go through navigate() instead of a hash jump
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  const exifBtn = target.closest<HTMLElement>("[data-zoom-exif-btn]");
  if (exifBtn) {
    const open = zoomEl.classList.toggle("is-exif");
    exifBtn.setAttribute("aria-expanded", String(open));
    return;
  }

  const navButton = target.closest<HTMLElement>("[data-nav]");
  if (navButton) {
    e.preventDefault();
    const action = navButton.dataset.nav;
    if (action === "about") setAbout(!body.hasAttribute("data-about"));
    else if (action === "close") {
      if (body.hasAttribute("data-about")) setAbout(false);
      else exitZoom();
    } else {
      setAbout(false);
      navigate(urlForView(action as View));
    }
    return;
  }

  // About's palette: a square closes About and opens its photo over the page. With a photo
  // already open, it takes that photo's place in the history, so one Close is always enough.
  const swatch = target.closest<HTMLAnchorElement>(".about__swatch");
  if (swatch) {
    e.preventDefault();
    setAbout(false);
    const replace = current !== -1;
    navigate(swatch.getAttribute("href")!, replace);
    if (!replace) openedFromPage = true;
    return;
  }

  const link = target.closest<HTMLAnchorElement>('a[href^="#"]');
  if (link && (link.closest(".feed") || link.closest(".index"))) {
    e.preventDefault();
    navigate(link.getAttribute("href")!);
    openedFromPage = true;
    const source = link.querySelector("img");
    if (source && current !== -1) flyIn(source, photos[current]);
  }
});

window.addEventListener("popstate", render);

// iOS Safari only applies :active (the press effect on touch screens, see site.css) on pages
// that listen for touches
document.addEventListener("touchstart", () => {}, { passive: true });

// Feed and index images show their colour in their place while they load (placeholder.ts).
// Dropped once loaded, so it can't show as a fringe around the photo's antialiased edges.
const dropPlaceholder = (img: HTMLImageElement) => img.style.removeProperty("background");
document.addEventListener(
  "load",
  (e) => {
    if (e.target instanceof HTMLImageElement && e.target.closest(".feed, .index")) dropPlaceholder(e.target);
  },
  true, // load doesn't bubble
);
document.querySelectorAll<HTMLImageElement>(".feed img, .index img").forEach((img) => {
  if (img.complete && img.naturalWidth) dropPlaceholder(img);
});

// No dragging images or links out of the page (CSS covers Chrome/Safari; this covers Firefox)
document.addEventListener("dragstart", (e) => e.preventDefault());

// Index: the top-left count shows the collection of the thumbnail under the pointer
document.addEventListener("pointerover", (e) => {
  const thumb = (e.target as HTMLElement).closest<HTMLElement>(".index__thumb");
  if (!thumb || current !== -1) return;
  setCollectionLabel(thumb.dataset.collection ?? "", thumb.dataset.collectionDate ?? "");
  body.toggleAttribute("data-hover", true);
});
document.addEventListener("pointerout", (e) => {
  const from = (e.target as HTMLElement).closest(".index__thumb");
  const to = (e.relatedTarget as HTMLElement | null)?.closest(".index__thumb");
  if (from && !to) body.removeAttribute("data-hover");
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Escape") {
    if (body.hasAttribute("data-about")) setAbout(false);
    else if (current !== -1) exitZoom();
    else if (view === "feed") navigate(urlForView("index"));
  } else if (current !== -1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    e.preventDefault();
    step(e.key === "ArrowRight" ? 1 : -1);
  } else if (e.key.toLowerCase() === "i" && current === -1) {
    setAbout(false);
    navigate(urlForView(view === "index" ? "feed" : "index"));
  }
});

// Above or below the photo closes the viewer; elsewhere, the left or right half goes back or forward
type StageAction = "Close" | "Prev" | "Next";
function stageAction(e: MouseEvent): StageAction {
  const img = current === -1 ? null : viewerRect(photos[current]);
  if (img && (e.clientY < img.top || e.clientY > img.top + img.height)) return "Close";
  return e.clientX < window.innerWidth / 2 ? "Prev" : "Next";
}

stage.addEventListener("click", (e) => {
  const action = stageAction(e);
  if (action === "Close") exitZoom();
  else step(action === "Prev" ? -1 : 1);
});

// Custom cursor label ("Prev" / "Next" / "Close") that follows the pointer (fine pointers only, see site.css)
stage.addEventListener("pointermove", (e) => {
  cursor.textContent = stageAction(e);
  // Second translate centres the label on the pointer
  cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
  cursor.classList.add("is-visible");
});
stage.addEventListener("pointerleave", () => cursor.classList.remove("is-visible"));

// Touch screens: the photo follows the finger. Let go far or fast enough and a sideways swipe
// slides to the previous / next photo, an up or down one closes the viewer (the photo flies
// back from where it was dropped). Otherwise it eases back into place.
const SWIPE_DISTANCE = 60; // px
const FLICK_SPEED = 0.4; // px/ms, so a short fast flick counts too
const SWIPE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
let swipe: { x: number; y: number; time: number; axis: "x" | "y" | null; dx: number; dy: number } | null =
  null;
let sliding = false;

stage.addEventListener(
  "touchstart",
  (e) => {
    zoomEl.classList.remove("is-settling");
    const t = e.touches[0];
    swipe =
      e.touches.length === 1 && !sliding
        ? { x: t.clientX, y: t.clientY, time: e.timeStamp, axis: null, dx: 0, dy: 0 }
        : null;
  },
  { passive: true },
);

stage.addEventListener(
  "touchmove",
  (e) => {
    if (!swipe) return;
    if (e.touches.length > 1) return settleSwipe(); // a pinch: leave it to the browser
    const dx = e.touches[0].clientX - swipe.x;
    const dy = e.touches[0].clientY - swipe.y;
    if (!swipe.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      swipe.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      // Closing clears the background to the page: hide the photo's own thumbnail there, which
      // the photo will fly back into, so it isn't seen twice
      if (swipe.axis === "y") {
        swipeHidden = pageImage(photos[current]);
        if (swipeHidden) swipeHidden.style.visibility = "hidden";
      }
    }
    e.preventDefault();
    swipe.dx = dx;
    swipe.dy = dy;
    if (swipe.axis === "x") {
      const delta = dx < 0 ? 1 : -1;
      showPeek(delta);
      zoomImg.style.transform = `translateX(${dx}px)`;
      peek.style.transform = `translateX(${dx + peekOffset(delta)}px)`;
    } else {
      zoomImg.style.transform = `translateY(${dy}px)`;
      zoomEl.style.setProperty("--swipe", String(Math.min(1, Math.abs(dy) / 300)));
    }
  },
  { passive: false },
);

stage.addEventListener("touchend", (e) => {
  const s = swipe;
  swipe = null;
  if (!s?.axis) return; // a tap: the click handler steps or closes
  e.preventDefault(); // no click after a swipe
  const distance = s.axis === "x" ? s.dx : s.dy;
  const speed = Math.abs(distance) / (e.timeStamp - s.time);
  const far = Math.abs(distance) > SWIPE_DISTANCE || (Math.abs(distance) > 20 && speed > FLICK_SPEED);
  if (!far) settleSwipe();
  else if (s.axis === "x") slide(distance < 0 ? 1 : -1);
  else {
    closeFrom = { x: 0, y: s.dy };
    exitZoom();
  }
});
stage.addEventListener("touchcancel", () => {
  swipe = null;
  settleSwipe();
});

// The neighbour in the swipe's direction waits just off the side of the photo, PEEK_GAP away,
// and moves with it
const peek = document.querySelector<HTMLImageElement>("[data-zoom-peek]")!;
const PEEK_GAP = 24; // px
const peekOffset = (delta: number) => delta * (contentBox(stage).width + PEEK_GAP);
let peekDelta = 0; // the neighbour shown: 1 next, -1 previous, 0 none

function showPeek(delta: 1 | -1) {
  if (delta === peekDelta) return;
  peekDelta = delta;
  const photo = photos[neighbour(current, delta)];
  // Shown once loaded, so a direction change never flashes the other neighbour
  peek.classList.remove("is-active");
  peek.onload = () => peek.classList.add("is-active");
  peek.alt = photo.alt;
  peek.sizes = "100vw"; // as the viewer image, so the swap after the slide hits the cache
  peek.srcset = photo.srcset;
  peek.src = photo.src;
  if (peek.complete && peek.naturalWidth) peek.classList.add("is-active");
}

function hidePeek() {
  peekDelta = 0;
  peek.onload = null;
  peek.classList.remove("is-active");
  peek.style.transform = "";
}

// Animates `el` from where it is to `to`
function ease(el: HTMLElement, to: string, duration: number) {
  const from = el.style.transform || "none";
  el.style.transform = to === "none" ? "" : to;
  return el
    .animate([{ transform: from }, { transform: to }], { duration, easing: SWIPE_EASE })
    .finished.catch(() => {});
}

async function settleSwipe() {
  swipe = null;
  sliding = true;
  if (swipeHidden) swipeHidden.style.visibility = "";
  swipeHidden = null;
  zoomEl.classList.add("is-settling");
  zoomEl.style.removeProperty("--swipe");
  await Promise.all([
    ease(zoomImg, "none", 300),
    peekDelta ? ease(peek, `translateX(${peekOffset(peekDelta)}px)`, 300) : null,
  ]);
  hidePeek();
  sliding = false;
}

// The photo and its neighbour carry on the way they were going, until the neighbour is in place
async function slide(delta: 1 | -1) {
  sliding = true;
  await Promise.all([
    ease(zoomImg, `translateX(${-peekOffset(delta)}px)`, 300),
    ease(peek, "none", 300),
  ]);

  // The neighbour now covers the viewer image: switch that to the new photo underneath (no fade),
  // and drop the neighbour once it's painted, so there's never a frame with neither
  zoomImg.classList.add("is-hidden");
  zoomImg.style.transform = "";
  step(delta);
  await loaded(zoomImg);
  await zoomImg.decode().catch(() => {});
  zoomImg.style.transition = "none";
  zoomImg.classList.add("is-loaded");
  zoomImg.classList.remove("is-hidden");
  await painted();
  zoomImg.style.transition = "";
  hidePeek();
  sliding = false;
}

// Index, hidden extra: dragging the marquee scrubs it by hand and changes the number of
// columns, fewer to the right (bigger photos), more to the left. Not saved: a reload or a
// double-click goes back to the stylesheet's columns.
const marquee = document.querySelector<HTMLElement>(".marquee")!;
const marqueeTrack = marquee.querySelector<HTMLElement>(".marquee__track")!;
const indexEl = document.querySelector<HTMLElement>(".index")!;
const COLUMN_STEP = 40; // px of drag per column
let drag: { x: number; columns: number; time: number; anim: Animation | undefined } | null = null;
let stylesheetGrid = { columns: 6, gap: 32 };

marquee.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || view !== "index" || current !== -1 || body.hasAttribute("data-about")) return;
  const anim = marqueeTrack.getAnimations()[0]; // none with reduced motion
  anim?.pause();
  const grid = getComputedStyle(indexEl);
  const columns = grid.gridTemplateColumns.split(" ").length;
  // Not changed by hand yet: what the stylesheet gives at this screen width
  if (!indexEl.style.gridTemplateColumns) stylesheetGrid = { columns, gap: parseFloat(grid.columnGap) };
  drag = {
    x: e.clientX,
    columns,
    time: Number(anim?.currentTime ?? 0),
    anim,
  };
  marquee.setPointerCapture(e.pointerId);
  marquee.classList.add("is-dragging");
});

marquee.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  // The animation moves the track by half its width (one copy) per cycle, so a drag of dx px
  // is dx / halfWidth of a cycle; wrapping keeps the loop seamless
  const anim = drag.anim;
  const duration = Number(anim?.effect?.getTiming().duration);
  if (anim && duration) {
    const t = drag.time - (dx / (marqueeTrack.offsetWidth / 2)) * duration;
    anim.currentTime = ((t % duration) + duration) % duration;
  }
  const columns = Math.min(12, Math.max(3, drag.columns - Math.round(dx / COLUMN_STEP)));
  indexEl.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  // The spacing scales with the columns, like a zoom: half as many columns, twice the gap
  indexEl.style.gap = `${Math.round((stylesheetGrid.gap * stylesheetGrid.columns) / columns)}px`;
});

function endDrag() {
  if (!drag) return;
  drag.anim?.play();
  drag = null;
  marquee.classList.remove("is-dragging");
}
marquee.addEventListener("pointerup", endDrag);
marquee.addEventListener("pointercancel", endDrag);
// Double-click: back to the stylesheet's columns and spacing
marquee.addEventListener("dblclick", () => {
  indexEl.style.removeProperty("grid-template-columns");
  indexEl.style.removeProperty("gap");
});

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
render();
