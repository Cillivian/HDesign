import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { binarize, horizontalRuns, otsuThreshold, removeSmallComponents, toGrayscale, verticalRuns } from '../src/raster';
import { estimateStrokeThickness, hollowBands, wallTuning } from '../src/walls';
import type { RasterImage } from '../src/index';

const REF = '/Users/cillivian/Documents/HDesign/fixtures/reference/cad-plan-2400.png';
function readPng(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}
describe('scratch hollow2', () => {
  it('dumps bands near L wall and bottom wall', () => {
    const raster = readPng(REF);
    const gray = toGrayscale(raster);
    const threshold = Math.max(35, Math.min(225, Math.round(otsuThreshold(gray))));
    let ink = binarize(gray, threshold, false);
    ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
    const v = verticalRuns(ink); const h = horizontalRuns(ink);
    const diagonal = Math.hypot(raster.width, raster.height);
    const thickness = estimateStrokeThickness(v, h, Math.max(28, Math.round(diagonal * 0.02)));
    const tuning = wallTuning(raster.width, raster.height, {});
    tuning.typicalThickness = thickness.median;
    tuning.minThickness = Math.max(2, thickness.low);
    tuning.maxThickness = Math.max(6, thickness.high);
    const bands = hollowBands(ink, v, h, tuning, thickness);
    console.log('total', bands.length);
    console.log('H near 898:', JSON.stringify(bands.filter(b => b.orientation==='h' && b.pos>860 && b.pos<960).map(b=>[Math.round(b.pos),b.start,b.end,b.thickness])));
    console.log('V near 426:', JSON.stringify(bands.filter(b => b.orientation==='v' && b.pos>380 && b.pos<470).map(b=>[Math.round(b.pos),b.start,b.end,b.thickness])));
    console.log('H near 1195:', JSON.stringify(bands.filter(b => b.orientation==='h' && b.pos>1150 && b.pos<1260).map(b=>[Math.round(b.pos),b.start,b.end,b.thickness])));
    console.log('V near 2060:', JSON.stringify(bands.filter(b => b.orientation==='v' && b.pos>2000 && b.pos<2100).map(b=>[Math.round(b.pos),b.start,b.end,b.thickness])));
  }, 120_000);
});
