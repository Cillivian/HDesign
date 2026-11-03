import { describe, expect, it } from 'vitest';
import { parseRaster } from '../src/index';
import { PLANS, matchWalls, rasterFor, tokensFor } from './helpers';

describe('synthetic plan recognition', () => {
  for (const plan of PLANS as any[]) {
    it(`${plan.id}: walls / rooms / openings / calibrated lengths`, () => {
      const { raster, expected } = rasterFor(plan.id);
      const result = parseRaster(raster, { ocr: tokensFor(expected) });
      const { draft, debug } = result;

      expect(Math.abs(draft.walls.length - expected.wallCount)).toBeLessThanOrEqual(1);
      expect(draft.rooms.length).toBe(expected.roomCount);
      expect(draft.openings.length).toBe(expected.openingCount);
      expect(debug.scale.source).toBe('ocr');
      expect(Math.abs(debug.scale.mmPerPx - expected.mmPerPx) / expected.mmPerPx).toBeLessThanOrEqual(
        0.02,
      );

      const expectedWindows = (plan.walls as any[]).reduce(
        (sum, wall) => sum + (wall.openings ?? []).filter((o: any) => o.kind === 'window').length,
        0,
      );
      const windows = draft.openings.filter((opening) => opening.kind === 'window').length;
      // Window-vs-door classification is heuristic; allow one mismatch.
      expect(Math.abs(windows - expectedWindows)).toBeLessThanOrEqual(1);

      if (plan.rotationDeg) {
        expect(debug.deskewed).toBe(true);
        expect(Math.abs(debug.skewDeg - plan.rotationDeg)).toBeLessThanOrEqual(0.4);
      } else {
        expect(Math.abs(debug.skewDeg)).toBeLessThanOrEqual(0.2);
      }

      const matches = matchWalls(draft.walls, expected, debug.scale.mmPerPx);
      expect(matches.length).toBe(expected.wallCount);
      for (const match of matches) {
        expect(match.midpointErrorMm, `wall ${match.expectedId} midpoint`).toBeLessThanOrEqual(320);
        expect(match.error, `wall ${match.expectedId} length error`).toBeLessThanOrEqual(0.02);
      }

      // Confidence is meaningful, not a constant 1.
      expect(draft.confidence.walls).toBeGreaterThan(0.6);
      expect(draft.confidence.rooms).toBeGreaterThan(0.5);
      expect(draft.confidence.overall).toBeGreaterThan(0.5);
      expect(debug.polylines.length).toBeGreaterThan(0);
      expect(debug.timingsMs.total).toBeGreaterThanOrEqual(0);
    });
  }

  it('two-pass pipeline (deskew once, then re-parse with skipDeskew) keeps geometry', () => {
    const { raster, expected } = rasterFor('plan-c');
    const first = parseRaster(raster, { ocr: tokensFor(expected) });
    const second = parseRaster(first.raster, {
      ocr: tokensFor(expected),
      skipDeskew: true,
    });
    expect(second.debug.skewDeg).toBe(0);
    expect(Math.abs(second.draft.walls.length - expected.wallCount)).toBeLessThanOrEqual(1);
    expect(second.draft.rooms.length).toBe(expected.roomCount);
  });
});
