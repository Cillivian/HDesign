import { describe, it } from 'vitest';
import { parseRaster } from '../src/index';
import { PLANS, rasterFor, tokensFor } from './helpers';

describe('scratch plan walls', () => {
  it('dumps walls', () => {
    for (const plan of PLANS as any[]) {
      const { raster, expected } = rasterFor(plan.id);
      const result = parseRaster(raster, { ocr: tokensFor(expected) });
      const walls = result.draft.walls
        .map((w: any, i: number) => ({ i, len: Math.round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)), t: w.thicknessPx, a: [w.a.x, w.a.y], b: [w.b.x, w.b.y] }))
        .sort((a: any, b: any) => b.len - a.len);
      console.log(plan.id, JSON.stringify(walls));
    }
  }, 120_000);
});
