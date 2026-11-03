import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { binarize, horizontalRuns, otsuThreshold, removeSmallComponents, toGrayscale, verticalRuns } from '../src/raster';
import { extractLongLines, mergeLinePieces } from '../src/walls';
import type { RasterImage } from '../src/index';

const REF = '/Users/cillivian/Documents/HDesign/fixtures/reference/cad-plan-2400.png';
function readPng(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}
describe('scratch v lines', () => {
  it('dumps v lines near L wall', () => {
    const raster = readPng(REF);
    const gray = toGrayscale(raster);
    const threshold = Math.max(35, Math.min(225, Math.round(otsuThreshold(gray))));
    let ink = binarize(gray, threshold, false);
    ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
    const v = verticalRuns(ink); const h = horizontalRuns(ink);
    const pieces = extractLongLines(ink, v, h, 'v', 27, 11);
    console.log('v pieces', pieces.length);
    for (const p of pieces) {
      if (p.pos >= 405 && p.pos <= 445) console.log('PIECE pos', p.pos, 'thin', p.thickness, 's', p.start, 'e', p.end);
    }
    const lines = mergeLinePieces(pieces, 1.5, 10);
    for (const l of lines) {
      if (l.pos >= 405 && l.pos <= 445) console.log('LINE pos', Math.round(l.pos*10)/10, 'thick', l.thickness, 'iv', JSON.stringify(l.intervals.slice(0,4)));
    }
  }, 120_000);
});
