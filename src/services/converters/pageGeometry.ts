import type { ImageToPdfOptions, PageFormat } from '../../types/conversion';

// Page sizes in PDF points (1 pt = 1/72 inch).
export const PAGE_SIZES_PT: Record<PageFormat, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  a5: [419.53, 595.28],
  a3: [841.89, 1190.55],
};

export const MM_TO_PT = 2.834645669; // 1 mm in PDF points

interface PageGeometry {
  pageW: number;
  pageH: number;
  marginPt: number;
}

export function pageGeometry(opts: ImageToPdfOptions): PageGeometry {
  const format = opts.pageFormat ?? 'a4';
  let [w, h] = PAGE_SIZES_PT[format];
  if (opts.orientation === 'landscape') {
    [w, h] = [h, w];
  }
  const marginPt = (opts.marginMm ?? 10) * MM_TO_PT;
  return { pageW: w, pageH: h, marginPt };
}

interface Slot { x: number; y: number; w: number; h: number; }

// Lays out 1 / 2 / 4 image slots on a page with consistent margins. pdf-lib
// uses bottom-left origin, so all y-coordinates count up from the bottom edge.
export function slotRects(pageW: number, pageH: number, margin: number, n: 1 | 2 | 4): Slot[] {
  if (n === 1) {
    return [{
      x: margin,
      y: margin,
      w: pageW - 2 * margin,
      h: pageH - 2 * margin,
    }];
  }
  if (n === 2) {
    const h = (pageH - 3 * margin) / 2;
    const w = pageW - 2 * margin;
    return [
      { x: margin, y: margin * 2 + h, w, h },
      { x: margin, y: margin, w, h },
    ];
  }
  const w = (pageW - 3 * margin) / 2;
  const h = (pageH - 3 * margin) / 2;
  return [
    { x: margin, y: margin * 2 + h, w, h },
    { x: margin * 2 + w, y: margin * 2 + h, w, h },
    { x: margin, y: margin, w, h },
    { x: margin * 2 + w, y: margin, w, h },
  ];
}
