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
function intersectIntervals(a: Array<{start:number;end:number}>, b: Array<{start:number;end:number}>) {
  const out: Array<{start:number;end:number}> = [];
  let i=0,j=0;
  while (i<a.length && j<b.length) {
    const x=a[i]!, y=b[j]!;
    const s=Math.max(x.start,y.start), e=Math.min(x.end,y.end);
    if (e-s+1>=4) out.push({start:s,end:e});
    if (x.end<y.end) i++; else j++;
  }
  return out;
}
describe('scratch long lines', () => {
  it('finds L-wall band candidate', () => {
    const raster = readPng(REF);
    const gray = toGrayscale(raster);
    const threshold = Math.max(35, Math.min(225, Math.round(otsuThreshold(gray))));
    let ink = binarize(gray, threshold, false);
    ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
    const v = verticalRuns(ink); const h = horizontalRuns(ink);
    const pieces = extractLongLines(ink, h, v, 'h', 27, 11);
    const lines = mergeLinePieces(pieces, 1.5, 10);
    const idx = lines.findIndex(l => l.pos >= 880 && l.pos <= 890);
    console.log('merged lines near 885:', JSON.stringify(lines.slice(idx-1, idx+6).map(l => ({pos:Math.round(l.pos*10)/10, n:l.intervals.length, iv:l.intervals.slice(0,3)}))));
    let first = 0;
    while (first < lines.length) {
      let last = first;
      while (last + 1 < lines.length && lines[last+1]!.pos - lines[last]!.pos <= 10) last++;
      if (first <= idx && idx <= last) {
        console.log('group', first, last, 'positions', lines.slice(first,last+1).map(l=>Math.round(l.pos*10)/10).join(','));
        // sliding from idx
        for (let from = first; from <= last-1; from++) {
          let common = lines[from]!.intervals;
          const firstPos = lines[from]!.pos;
          for (let to=from+1; to<=last; to++) {
            const extent = lines[to]!.pos - firstPos;
            if (extent > 42) break;
            common = intersectIntervals(common, lines[to]!.intervals);
            if (common.length===0) break;
            if (extent < 19) continue;
            const score = common.reduce((s,i)=>s+(i.end-i.start+1),0);
            if (score >= 32) console.log('cand from', from, 'to', to, 'extent', extent, 'count', to-from+1, 'pos', (firstPos+lines[to]!.pos)/2, 'score', score, JSON.stringify(common));
          }
        }
        break;
      }
      first = last+1;
    }
  }, 120_000);
});
