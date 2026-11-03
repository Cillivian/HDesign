import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { binarize, horizontalRuns, otsuThreshold, removeSmallComponents, toGrayscale, verticalRuns } from '../src/raster';
import type { RasterImage } from '../src/index';

const REF = '/Users/cillivian/Documents/HDesign/fixtures/reference/cad-plan-2400.png';
function readPng(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}
describe('scratch row 205', () => {
  it('dumps runs', () => {
    const raster = readPng(REF);
    const gray = toGrayscale(raster);
    const threshold = Math.max(35, Math.min(225, Math.round(otsuThreshold(gray))));
    let ink = binarize(gray, threshold, false);
    ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
    const v = verticalRuns(ink); const h = horizontalRuns(ink);
    console.log('threshold', threshold);
    for (const y of [204, 205, 206, 207]) {
      const runs: Array<[number, number, number, number]> = [];
      let x = 0;
      while (x < 2400) {
        const idx = y * 2400 + x;
        if (!ink.data[idx]) { x++; continue; }
        let e = x;
        while (e + 1 < 2400 && ink.data[y*2400+e+1]) e++;
        runs.push([x, e, h[y*2400+x]!, v[y*2400+x]!]);
        x = e + 1;
      }
      console.log('row', y, JSON.stringify(runs.filter(r => r[1] > 200).slice(0, 12)));
    }
  }, 120_000);
});
