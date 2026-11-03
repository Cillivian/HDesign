import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { parseRaster } from '../src/index';
import type { RasterImage } from '../src/index';

describe('scratch: real pdf raster', () => {
  it('parses and dumps the draft', () => {
    const meta = JSON.parse(readFileSync('/tmp/pdfref/page2400.json', 'utf8')) as {
      width: number;
      height: number;
    };
    const data = new Uint8ClampedArray(readFileSync('/tmp/pdfref/page2400.rgba'));
    const raster: RasterImage = { width: meta.width, height: meta.height, data };
    const result = parseRaster(raster, {});
    writeFileSync('/tmp/pdfref/draft-local.json', JSON.stringify(result.draft, null, 2));
    writeFileSync(
      '/tmp/pdfref/debug.json',
      JSON.stringify({ ...result.debug, polylines: result.debug.polylines.slice(0, 400) }, null, 2),
    );
  }, 240_000);
});
