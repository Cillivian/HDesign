import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import {
  binarize,
  horizontalRuns,
  otsuThreshold,
  toGrayscale,
  verticalRuns,
} from '../src/raster';
import type { RasterImage } from '../src/index';

function analyze(path: string): Record<string, unknown> {
  const meta = JSON.parse(readFileSync('/tmp/pdfref/page2400.json', 'utf8')) as {
    width: number;
    height: number;
  };
  void path;
  const data = new Uint8ClampedArray(readFileSync('/tmp/pdfref/page2400.rgba'));
  const raster: RasterImage = { width: meta.width, height: meta.height, data };
  const gray = toGrayscale(raster);
  const threshold = otsuThreshold(gray);
  const ink = binarize(gray, threshold, false);
  const v = verticalRuns(ink);
  const h = horizontalRuns(ink);
  const bins = new Map<number, number>();
  let sampled = 0;
  for (let i = 0; i < ink.data.length; i += 1) {
    if (!ink.data[i]) continue;
    const a = v[i]!;
    const b = h[i]!;
    const long = Math.max(a, b);
    const short = Math.min(a, b);
    if (long < 28 || short < 2 || short > 120) continue;
    sampled += 1;
    const bucket = Math.min(60, Math.floor(short / 2) * 2);
    bins.set(bucket, (bins.get(bucket) ?? 0) + 1);
  }
  const hist = [...bins.entries()].sort((x, y) => x[0] - y[0]);
  return { threshold, sampled, hist };
}

describe('scratch thickness histogram', () => {
  it('reports long-run short-side distribution', () => {
    const result = analyze('/tmp/pdfref/page2400.png');
    writeFileSync('/tmp/pdfref/hist.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.hist));
  }, 240_000);
});
