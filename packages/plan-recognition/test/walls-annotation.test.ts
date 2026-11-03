import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { estimateStrokeThickness, parseRaster } from '../src/index';
import type { RasterImage } from '../src/index';

/**
 * Regression coverage for the real CAD drawing in `fixtures/reference`.
 *
 * The drawing mixes filled wall poché with dimension chains, dot-dash axis
 * lines, hatch strips, furniture and text. The historical bug: every thin line
 * passed the wall filter, so the reference produced 181 "walls" of 3 px and a
 * bogus scale. These assertions pin the fixed behaviour:
 *  - only real poché bands become walls (thickness ~one wall thick, never 1-2 px);
 *  - the wall network covers the building envelope and nothing outside it;
 *  - the dimension-chain and axis strips are never emitted as walls;
 *  - the wall network is closed enough to segment the labelled rooms.
 */

const REFERENCE_PATH = fileURLToPath(
  new URL('../../../fixtures/reference/cad-plan-2400.png', import.meta.url),
);

function readReference(): RasterImage {
  const png = PNG.sync.read(readFileSync(REFERENCE_PATH));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

describe('reference CAD plan wall extraction', () => {
  const result = parseRaster(readReference(), {});
  const { draft, debug } = result;
  const walls = draft.walls;
  const thicknesses = walls.map((wall) => wall.thicknessPx);
  const xs = walls.flatMap((wall) => [wall.a.x, wall.b.x]);
  const ys = walls.flatMap((wall) => [wall.a.y, wall.b.y]);
  const isVertical = (index: number): boolean => {
    const wall = walls[index]!;
    return Math.abs(wall.a.x - wall.b.x) < 1;
  };

  it('finds the real wall bands, not thin annotation strokes', () => {
    // 14 keeps the count honest (the prototype found 14 structural chunks and
    // nothing else); 40 is the sanity ceiling for this drawing.
    expect(walls.length).toBeGreaterThanOrEqual(14);
    expect(walls.length).toBeLessThanOrEqual(40);

    // Wall poché is ~28-34 px at this resolution; annotation ink is 1-2 px.
    // A naive median collapses to 3 px, which is exactly the user-reported bug.
    const medianThickness = median(thicknesses);
    expect(medianThickness).toBeGreaterThanOrEqual(24);
    expect(medianThickness).toBeLessThanOrEqual(40);
    expect(Math.min(...thicknesses)).toBeGreaterThan(8);
    expect(debug.medianThicknessPx).toBeGreaterThanOrEqual(24);

    expect(draft.openings.length).toBeGreaterThan(0);
    expect(draft.openings.length).toBeLessThanOrEqual(40);
  });

  it('closes the room network (the drawing labels 8 rooms)', () => {
    expect(draft.rooms.length).toBeGreaterThanOrEqual(6);
  });

  it('covers the building envelope and nothing outside it', () => {
    // Left wall centerline x~253-278, right wall x~2045-2072, top wall
    // y~206-231, bottom/annex y~1393-1431. One wall thickness of tolerance.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(205);
    expect(Math.min(...xs)).toBeLessThanOrEqual(320);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(2005);
    expect(Math.max(...xs)).toBeLessThanOrEqual(2105);

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(165);
    expect(Math.min(...ys)).toBeLessThanOrEqual(290);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(1360);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1460);

    // No wall centerline may sit outside the actual building envelope. The
    // dimension chains (y=83, y=1546/1582) and axis strips (x~156/194,
    // x~2187/2224) live outside it and were the source of the false positives.
    for (const wall of walls) {
      expect(wall.a.x).toBeGreaterThanOrEqual(235);
      expect(wall.b.x).toBeGreaterThanOrEqual(235);
      expect(wall.a.x).toBeLessThanOrEqual(2090);
      expect(wall.b.x).toBeLessThanOrEqual(2090);
      expect(wall.a.y).toBeGreaterThanOrEqual(185);
      expect(wall.b.y).toBeGreaterThanOrEqual(185);
      expect(wall.a.y).toBeLessThanOrEqual(1455);
      expect(wall.b.y).toBeLessThanOrEqual(1455);
    }
  });

  it('never turns the dimension/axis strips into walls', () => {
    for (let index = 0; index < walls.length; index += 1) {
      const wall = walls[index]!;
      if (isVertical(index)) {
        // Thick vertical strips left of the drawing (x~156/194) and right of it
        // (x~2187/2224) are axis labels / dimension chain leaders.
        expect(wall.a.x < 140 || wall.a.x > 215).toBe(true);
        expect(wall.a.x < 2160 || wall.a.x > 2245).toBe(true);
        expect(wall.a.x > 235 && wall.a.x < 2090).toBe(true);
      } else {
        // Top/bottom dimension chain lines.
        expect(wall.a.y < 55 || wall.a.y > 105).toBe(true);
        expect(wall.a.y < 1515 || wall.a.y > 1600).toBe(true);
        expect(wall.a.y > 185 && wall.a.y < 1455).toBe(true);
      }
    }
  });

  it('stays within the import budget', () => {
    expect(debug.timingsMs.total).toBeLessThan(5000);
  });
});

/* ------------------------------------------------------------------ */
/* estimateStrokeThickness unit tests                                 */
/* ------------------------------------------------------------------ */

const LONG_RUN = 28;
const WIDTH = 200;
const HEIGHT = 120;

function emptyRuns(): { vertical: Int32Array; horizontal: Int32Array } {
  return {
    vertical: new Int32Array(WIDTH * HEIGHT),
    horizontal: new Int32Array(WIDTH * HEIGHT),
  };
}

/** Fills full-width horizontal strokes of the given thickness spans. */
function addHorizontalStrokes(
  runs: { vertical: Int32Array; horizontal: Int32Array },
  rows: number[],
  thickness: number,
): void {
  for (const row of rows) {
    for (let offset = 0; offset < thickness; offset += 1) {
      const y = row + offset;
      if (y < 0 || y >= HEIGHT) continue;
      for (let x = 0; x < WIDTH; x += 1) {
        const index = y * WIDTH + x;
        runs.vertical[index] = thickness;
        runs.horizontal[index] = WIDTH;
      }
    }
  }
}

/** Fills full-height vertical strokes of the given pixel width at columns. */
function addVerticalStrokes(
  runs: { vertical: Int32Array; horizontal: Int32Array },
  columns: number[],
  thickness: number,
): void {
  for (const column of columns) {
    for (let offset = 0; offset < thickness; offset += 1) {
      const x = column + offset;
      if (x < 0 || x >= WIDTH) continue;
      for (let y = 0; y < HEIGHT; y += 1) {
        const index = y * WIDTH + x;
        runs.vertical[index] = HEIGHT;
        runs.horizontal[index] = thickness;
      }
    }
  }
}

describe('estimateStrokeThickness', () => {
  it('picks the thick wall band even when 1-2 px lines dominate the ink', () => {
    const runs = emptyRuns();
    // ~60 thin horizontal annotation lines (1-2 px thick), far more numerous
    // in area than the wall band.
    const thinRows: number[] = [];
    for (let row = 0; row < HEIGHT; row += 2) thinRows.push(row);
    addHorizontalStrokes(runs, thinRows, 1);
    // Thin vertical axis/extension lines.
    addVerticalStrokes(runs, [10, 40, 80, 120, 160, 190], 2);
    // The wall: one 30 px thick poché band.
    addHorizontalStrokes(runs, [55], 30);

    const thickness = estimateStrokeThickness(runs.vertical, runs.horizontal, LONG_RUN);

    expect(thickness.median).toBeGreaterThanOrEqual(28);
    expect(thickness.median).toBeLessThanOrEqual(32);
    expect(thickness.low).toBeGreaterThanOrEqual(8);
    expect(thickness.high).toBeGreaterThan(thickness.median);
    expect(thickness.clustered).toBe(true);
  });

  it('falls back to a usable band for low-resolution or hollow-line drawings', () => {
    const empty = estimateStrokeThickness(
      new Int32Array(0),
      new Int32Array(0),
      LONG_RUN,
    );
    expect(empty.median).toBeGreaterThanOrEqual(2);
    expect(empty.low).toBeGreaterThanOrEqual(2);
    expect(empty.high).toBeGreaterThan(empty.low);
    expect(empty.clustered).toBe(false);

    // A handful of thick samples (below the 8-sample cluster threshold) still
    // yields a usable low/high band instead of a degenerate one.
    const runs = emptyRuns();
    const samples: Array<[number, number]> = [
      [0, 40],
      [1, 40],
      [2, 40],
      [50, 60],
      [51, 60],
    ];
    for (const [x, y] of samples) {
      runs.vertical[y * WIDTH + x] = 12;
      runs.horizontal[y * WIDTH + x] = 200;
    }
    const sparse = estimateStrokeThickness(runs.vertical, runs.horizontal, LONG_RUN);
    expect(sparse.median).toBeGreaterThanOrEqual(4);
    expect(sparse.median).toBeLessThanOrEqual(20);
    expect(sparse.low).toBeGreaterThanOrEqual(2);
    expect(sparse.high).toBeGreaterThan(sparse.low);
    expect(sparse.clustered).toBe(false);
  });
});
