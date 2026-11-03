import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import {
  binarize,
  horizontalRuns,
  otsuThreshold,
  toGrayscale,
  verticalRuns,
} from '../src/raster';
import { estimateStrokeThickness, extractWalls } from '../src/walls';

describe('scratch: wall extraction debug', () => {
  it('prints tuning and bands around the top wall', () => {
    const png = JSON.parse(readFileSync('/tmp/pdfref/page2400.json', 'utf8')) as {
      width: number;
      height: number;
    };
    const raster = {
      width: png.width,
      height: png.height,
      data: new Uint8ClampedArray(readFileSync('/tmp/pdfref/page2400.rgba')),
    };
    const gray = toGrayscale(raster);
    const threshold = otsuThreshold(gray);
    const ink = binarize(gray, threshold, false);
    const v = verticalRuns(ink);
    const h = horizontalRuns(ink);
    const diagonal = Math.hypot(raster.width, raster.height);
    const thick = estimateStrokeThickness(v, h, Math.max(28, Math.round(diagonal * 0.02)));
    console.log('thickness', JSON.stringify(thick));
    const extraction = extractWalls(ink, v, h);
    console.log(
      'walls',
      extraction.walls.length,
      'bands',
      extraction.bands.length,
      'medianThickness',
      extraction.medianThicknessPx,
    );
    // Bands in the top wall area (y < 140) and right wall area (x > 1900)
    console.log(
      'top bands',
      JSON.stringify(
        extraction.bands
          .filter((band) => Math.min(band.a.y, band.b.y) < 140)
          .slice(0, 20)
          .map((band) => [band.a.x, band.a.y, band.b.x, band.b.y]),
      ),
    );
    console.log(
      'right bands',
      JSON.stringify(
        extraction.bands
          .filter((band) => Math.max(band.a.x, band.b.x) > 1900)
          .slice(0, 20)
          .map((band) => [band.a.x, band.a.y, band.b.x, band.b.y]),
      ),
    );
    // Raw run stats in the top wall band
    const rows: Array<[number, number]> = [];
    for (let y = 60; y < 130; y += 2) {
      let count = 0;
      for (let x = 200; x < 2000; x += 1) {
        const index = y * raster.width + x;
        if (ink.data[index] && h[index]! > 100 && v[index]! >= 20) count += 1;
      }
      rows.push([y, count]);
    }
    console.log('top wall mask pixels per row', JSON.stringify(rows));
  }, 240_000);
});
