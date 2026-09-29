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

  if (current === -1) {
    body.removeAttribute("data-hover");
    body.toggleAttribute("data-zoom", true);
    zoomEl.setAttribute("aria-hidden", "false");
  }

  if (i !== current) {
    current = i;
    zoomImg.classList.remove("is-loaded");
    zoomImg.onload = () => zoomImg.classList.add("is-loaded");
    zoomEl.classList.remove("is-exif");
    exifButton.setAttribute("aria-expanded", "false");
    zoomImg.alt = photo.alt;
    zoomImg.sizes = "100vw";
    zoomImg.srcset = photo.srcset;
    zoomImg.src = photo.src;
    zoomImg.dataset.color = photo.color;
    if (zoomImg.complete) zoomImg.classList.add("is-loaded");
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

function closeZoom() {
  if (current === -1) return;
  const photo = photos[current];
  current = -1;
  openedFromPage = false;
  flyOut(photo); // measures the viewer, so before it starts fading out
  body.removeAttribute("data-zoom");
  zoomEl.setAttribute("aria-hidden", "true");
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
function flyOut(photo: GalleryPhoto) {
  endFlight();
  if (reducedMotion() || !zoomImg.naturalWidth) return;

  const href = `#${photo.slug}/${photo.index + 1}`;
  const link = [...document.querySelectorAll<HTMLAnchorElement>(`.${view} a[href^="#"]`)].find(
    (a) => a.getAttribute("href") === href,
  );
  const target = link?.querySelector("img");
  if (!target) return;

  const box = target.getBoundingClientRect();
  if (box.bottom < 0 || box.top > window.innerHeight) target.scrollIntoView({ block: "center" });

  const from = viewerRect(photo);
  const to = containedRect(target.getBoundingClientRect(), ratioOf(photo));
  fly(zoomImg.currentSrc || zoomImg.src, from, to, () => {
    zoomImg.classList.add("is-hidden");
    target.style.visibility = "hidden";
  }).then(async (copy) => {
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

// Horizontal swipe on touch screens
let touchStartX: number | null = null;
stage.addEventListener("touchstart", (e) => (touchStartX = e.touches[0].clientX), {
  passive: true,
});
stage.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(dx) > 50) {
    e.preventDefault(); // don't also fire the click-to-step
    step(dx < 0 ? 1 : -1);
  }
});

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
render();
