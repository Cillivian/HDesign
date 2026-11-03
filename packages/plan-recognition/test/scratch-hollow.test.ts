import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { binarize, horizontalRuns, otsuThreshold, removeSmallComponents, toGrayscale, verticalRuns } from '../src/raster';
import { hollowBands, estimateStrokeThickness, wallTuning } from '../src/walls';
import type { RasterImage } from '../src/index';
import { PLANS, rasterFor } from './helpers';

function readPng(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function analyze(name: string, raster: RasterImage) {
  const gray = toGrayscale(raster);
  const threshold = otsuThreshold(gray);
  // replicate parse.ts preprocessing
  let ink = binarize(gray, Math.max(35, Math.min(225, Math.round(threshold))), false);
  ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
  const v = verticalRuns(ink);
  const h = horizontalRuns(ink);
  const diagonal = Math.hypot(raster.width, raster.height);
  const thickness = estimateStrokeThickness(v, h, Math.max(28, Math.round(diagonal * 0.02)));
  const tuning = wallTuning(raster.width, raster.height, {});
  tuning.typicalThickness = thickness.median;
  tuning.minThickness = Math.max(2, thickness.low);
  tuning.maxThickness = Math.max(6, thickness.high);
  const bands = hollowBands(ink, v, h, tuning, thickness);
  console.log(name, 'thickness', JSON.stringify(thickness), 'hollow count', bands.length);
  const sorted = bands
    .map((b) => ({ o: b.orientation, pos: Math.round(b.pos), s: b.start, e: b.end, t: b.thickness, len: b.end - b.start }))
    .sort((a, b) => b.len - a.len);
  console.log(JSON.stringify(sorted.slice(0, 50)));
}

describe('scratch hollow bands', () => {
  it('dumps reference hollow bands', () => {
    analyze('reference', readPng('/Users/cillivian/Documents/HDesign/fixtures/reference/cad-plan-2400.png'));
  }, 120_000);
  it('dumps plan-b hollow bands', () => {
    const { raster } = rasterFor('plan-b');
    analyze('plan-b', raster);
  }, 120_000);
  it('dumps plan-a hollow bands', () => {
    const { raster } = rasterFor('plan-a');
    analyze('plan-a', raster);
  }, 120_000);
  void PLANS;
});
