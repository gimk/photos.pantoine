// Shown in a photo's place while it loads: a block of its colour, the photo's shape.
// Images are drawn contained in boxes that don't always match their shape (the index's square
// frames, the viewer), so a plain background-color would fill the whole box. An SVG with the
// photo's aspect ratio, sized with `contain`, covers exactly where the photo will be drawn.
export function placeholderImage(color: string, width: number, height: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'><rect width='100%' height='100%' fill='${color}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const placeholderStyle = (color: string, width: number, height: number) =>
  `background: ${placeholderImage(color, width, height)} center / contain no-repeat;`;
