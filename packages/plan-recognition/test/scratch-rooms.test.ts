import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { binarize, horizontalRuns, otsuThreshold, removeSmallComponents, toGrayscale, verticalRuns } from '../src/raster';
import { extractWalls } from '../src/walls';
import { buildWallMask, segmentRooms } from '../src/rooms';
import type { RasterImage } from '../src/index';

const REF = '/Users/cillivian/Documents/HDesign/fixtures/reference/cad-plan-2400.png';
function readPng(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}
describe('scratch rooms', () => {
  it('segments reference rooms', () => {
    const raster = readPng(REF);
    const gray = toGrayscale(raster);
    const threshold = Math.max(35, Math.min(225, Math.round(otsuThreshold(gray))));
    let ink = binarize(gray, threshold, false);
    ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
    const v = verticalRuns(ink); const h = horizontalRuns(ink);
    const extraction = extractWalls(ink, v, h);
    const wallMask = buildWallMask(extraction, ink.width, ink.height);
    const segmentation = segmentRooms(wallMask, { minAreaPx: Math.max(300, Math.round(ink.width*ink.height*0.0009)) });
    console.log('walls', extraction.walls.length, 'openings', extraction.openings.length, 'rooms', segmentation.rooms.length);
    console.log('rooms:', JSON.stringify(segmentation.rooms.map(r => ({ area: r.areaPx, c: r.confidence, n: r.polygon.length, p0: r.polygon[0] }))));
    // Render overlay PNG: base image + wall mask red + room polygons green.
    const png = new PNG({ width: ink.width, height: ink.height });
    for (let i = 0; i < ink.width * ink.height; i++) {
      const val = wallMask.data[i] ? 255 : 235;
      png.data[i*4] = wallMask.data[i] ? 255 : 235;
      png.data[i*4+1] = wallMask.data[i] ? 60 : 220;
      png.data[i*4+2] = wallMask.data[i] ? 60 : 220;
      png.data[i*4+3] = 255;
      void val;
    }
    // mark rooms
    for (const room of segmentation.rooms) {
      for (const p of room.polygon) {
        const x = Math.round(p.x), y = Math.round(p.y);
        if (x < 0 || y < 0 || x >= ink.width || y >= ink.height) continue;
        for (let d = -2; d <= 2; d++) {
          const xx = Math.min(ink.width-1, Math.max(0, x+d));
          const yy = Math.min(ink.height-1, Math.max(0, y));
          const idx = (yy*ink.width+xx)*4;
          png.data[idx] = 0; png.data[idx+1] = 120; png.data[idx+2] = 255;
        }
      }
    }
    writeFileSync('/tmp/ref-wallmask.png', PNG.sync.write(png));
    writeFileSync('/tmp/ref-walls-raw.json', JSON.stringify(extraction.walls, null, 1));
  }, 240_000);
});
