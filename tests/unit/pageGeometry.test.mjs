import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageGeometry, slotRects, PAGE_SIZES_PT, MM_TO_PT } from '../unit-build/pageGeometry.js';

describe('pageGeometry', () => {
  it('defaults to A4 portrait with 10mm margins', () => {
    const g = pageGeometry({});
    assert.equal(g.pageW, PAGE_SIZES_PT.a4[0]);
    assert.equal(g.pageH, PAGE_SIZES_PT.a4[1]);
    assert.ok(Math.abs(g.marginPt - 10 * MM_TO_PT) < 1e-6);
  });

  it('swaps dimensions in landscape', () => {
    const g = pageGeometry({ pageFormat: 'a4', orientation: 'landscape' });
    assert.equal(g.pageW, PAGE_SIZES_PT.a4[1]);
    assert.equal(g.pageH, PAGE_SIZES_PT.a4[0]);
  });

  it('respects custom margin in mm', () => {
    const g = pageGeometry({ marginMm: 20 });
    assert.ok(Math.abs(g.marginPt - 20 * MM_TO_PT) < 1e-6);
  });

  it('supports all four page formats', () => {
    for (const fmt of ['a4', 'letter', 'a5', 'a3']) {
      const g = pageGeometry({ pageFormat: fmt });
      const [w, h] = PAGE_SIZES_PT[fmt];
      assert.equal(g.pageW, w);
      assert.equal(g.pageH, h);
    }
  });

  it('zero margin yields a marginPt of 0', () => {
    const g = pageGeometry({ marginMm: 0 });
    assert.equal(g.marginPt, 0);
  });
});

describe('slotRects', () => {
  it('emits 1 slot filling the page minus margins for n=1', () => {
    const slots = slotRects(500, 700, 10, 1);
    assert.equal(slots.length, 1);
    assert.deepEqual(slots[0], { x: 10, y: 10, w: 480, h: 680 });
  });

  it('emits 2 stacked slots for n=2', () => {
    const slots = slotRects(500, 700, 10, 2);
    assert.equal(slots.length, 2);
    // 700 page - 3*10 margins = 670; / 2 = 335 each
    assert.equal(slots[0].h, 335);
    assert.equal(slots[1].h, 335);
    // top slot y = margin*2 + h = 20 + 335 = 355
    assert.equal(slots[0].y, 355);
    // bottom slot y = margin = 10
    assert.equal(slots[1].y, 10);
    // Both have full width (page - 2*margin)
    assert.equal(slots[0].w, 480);
    assert.equal(slots[1].w, 480);
  });

  it('emits 4 slots in a 2×2 grid for n=4', () => {
    const slots = slotRects(500, 700, 10, 4);
    assert.equal(slots.length, 4);
    const cellW = (500 - 30) / 2; // 235
    const cellH = (700 - 30) / 2; // 335
    for (const s of slots) {
      assert.equal(s.w, cellW);
      assert.equal(s.h, cellH);
    }
    // Top-left, top-right, bottom-left, bottom-right
    assert.equal(slots[0].x, 10);
    assert.equal(slots[1].x, 10 + cellW + 10);
    assert.equal(slots[2].x, 10);
    assert.equal(slots[3].x, 10 + cellW + 10);
    // Top row higher than bottom row
    assert.ok(slots[0].y > slots[2].y);
  });

  it('slots stay inside the page rectangle', () => {
    for (const n of [1, 2, 4]) {
      for (const slot of slotRects(500, 700, 10, n)) {
        assert.ok(slot.x >= 0 && slot.x + slot.w <= 500);
        assert.ok(slot.y >= 0 && slot.y + slot.h <= 700);
        assert.ok(slot.w > 0 && slot.h > 0);
      }
    }
  });
});
