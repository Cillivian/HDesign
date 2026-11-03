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
describe('scratch col', () => {
  it('dumps ink runs column 413/438', () => {
    const raster = readPng(REF);
    const gray = toGrayscale(raster);
    const threshold = Math.max(35, Math.min(225, Math.round(otsuThreshold(gray))));
    let ink = binarize(gray, threshold, false);
    ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
    const v = verticalRuns(ink); const h = horizontalRuns(ink);
    console.log('threshold', threshold);
    for (const x of [413, 421, 429, 437, 438]) {
      const runs: Array<[number,number,number,number]> = [];
      let y = 850;
      while (y < 1200) {
        if (!ink.data[y*2400+x]) { y++; continue; }
        let e = y;
        while (e+1 < 1696 && ink.data[(e+1)*2400+x]) e++;
        runs.push([y, e, e-y+1, 0]);
        y = e+1;
      }
      const withH = runs.map(r => {
        const hh = h[r[0]*2400+x]!;
        return [r[0], r[1], r[2], hh];
      });
      console.log('col', x, JSON.stringify(withH.slice(0,8)));
      if (x === 437) {
        const samples: number[] = [];
        for (let y = 883; y <= 1420; y += 59) samples.push(h[y*2400+x]!);
        console.log('SAMPLES437', JSON.stringify(samples));
        const all: number[] = [];
        for (let y = 883; y <= 1420; y += 10) all.push(h[y*2400+x]!);
        console.log('ALL437', JSON.stringify(all));
      }
      void v;
    }
  }, 120_000);
});
