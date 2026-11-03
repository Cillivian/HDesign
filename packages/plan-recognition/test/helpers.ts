// Test helpers import the shared JS fixture definitions. They live outside the
// package's typecheck scope (vendored plain JS) and are transpiled by vitest.
import {
  PLANS,
  buildExpected,
  findPlan,
} from '../../../fixtures/plans/plan-defs.mjs';
import { buildPlanRaster } from '../../../fixtures/plans/render-plan.mjs';
import type { OcrToken, RasterImage } from '../src/index';

export { PLANS, buildExpected, findPlan, buildPlanRaster };

export function rasterFor(planId: string): { raster: RasterImage; expected: any } {
  const plan = findPlan(planId);
  const raster = buildPlanRaster(plan) as RasterImage;
  const expected = buildExpected(plan);
  return { raster, expected };
}

export function tokensFor(expected: any): OcrToken[] {
  return expected.ocrTokens.map((token: OcrToken) => ({ ...token }));
}

/** Match detected walls to expected walls by midpoint distance in millimetres. */
export function matchWalls(
  detected: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>,
  expected: any,
  mmPerPx: number,
): Array<{
  expectedId: string;
  expectedLengthMm: number;
  detectedLengthMm: number;
  error: number;
  midpointErrorMm: number;
}> {
  const margin = expected.marginPx;
  const toMm = (point: { x: number; y: number }) => ({
    x: (point.x - margin) * mmPerPx,
    y: (point.y - margin) * mmPerPx,
  });
  const matches = [];
  for (const wall of expected.walls) {
    let best = null;
    for (const candidate of detected) {
      const a = toMm(candidate.a);
      const b = toMm(candidate.b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const midpointError = Math.hypot(mid.x - wall.midMm[0], mid.y - wall.midMm[1]);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const score = midpointError + Math.abs(length - wall.lengthMm) * 4;
      if (!best || score < best.score) best = { candidate, midpointError, length, score };
    }
    if (!best) continue;
    matches.push({
      expectedId: wall.id,
      expectedLengthMm: wall.lengthMm,
      detectedLengthMm: best.length,
      error: Math.abs(best.length - wall.lengthMm) / wall.lengthMm,
      midpointErrorMm: best.midpointError,
    });
  }
  return matches;
}
