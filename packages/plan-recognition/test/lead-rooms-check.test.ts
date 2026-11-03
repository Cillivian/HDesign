import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { parseRaster } from '../src/index';
import type { RasterImage } from '../src/index';
import { polygonCentroid, polygonAreaSqm } from '@hdesign/domain';

describe('lead rooms check', () => {
  it('prints local rooms on the reference drawing', () => {
    const png = PNG.sync.read(readFileSync('../../fixtures/reference/cad-plan-2400.png'));
    const raster: RasterImage = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
    const { draft } = parseRaster(raster, {});
    const mm = draft.scale.mmPerPx;
    console.log('scale', JSON.stringify(draft.scale), 'walls', draft.walls.length, 'rooms', draft.rooms.length);
    for (const room of draft.rooms) {
      const c = polygonCentroid(room.polygon);
      const area = polygonAreaSqm(room.polygon.map((p) => ({ x: p.x * mm, y: p.y * mm })));
      console.log('room', room.label ?? '?', 'area', area.toFixed(1), 'centroid', Math.round(c.x), Math.round(c.y), 'pts', room.polygon.length, 'conf', room.confidence);
    }
  }, 240_000);
});
