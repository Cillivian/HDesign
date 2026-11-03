import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PNG } from 'pngjs';
import { parseRaster } from '../src/index';
import type { RasterImage } from '../src/index';
import { PLANS, rasterFor, tokensFor } from './helpers';

function readPng(path: string): RasterImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

const REF = '/Users/cillivian/Documents/HDesign/fixtures/reference/cad-plan-2400.png';

function summarize(name: string, result: ReturnType<typeof parseRaster>): Record<string, unknown> {
  const { draft, debug } = result;
  const thicknesses = draft.walls.map((wall: any) => wall.thicknessPx).sort((a: number, b: number) => a - b);
  const pick = (q: number) => thicknesses[Math.min(thicknesses.length - 1, Math.floor(q * thicknesses.length))] ?? 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const wall of draft.walls) {
    xs.push(wall.a.x, wall.b.x);
    ys.push(wall.a.y, wall.b.y);
  }
  return {
    name,
    walls: draft.walls.length,
    rooms: draft.rooms.length,
    openings: draft.openings.length,
    thicknessMin: thicknesses[0] ?? 0,
    thicknessMedian: pick(0.5),
    thicknessMax: thicknesses[thicknesses.length - 1] ?? 0,
    medianThickness: debug.medianThicknessPx,
    src: debug.scale.source,
    mmPerPx: debug.scale.mmPerPx,
    bbox: xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null,
    notes: debug.notes,
    stages: debug.stages,
    timing: debug.timingsMs,
  };
}

describe('scratch: cv metrics', () => {
  it('reference + synthetic metrics', () => {
    const raster = readPng(REF);
    const ref = parseRaster(raster, {});
    const summary: Record<string, unknown> = { reference: summarize('reference', ref) };
    for (const plan of PLANS as any[]) {
      const { raster: planRaster, expected } = rasterFor(plan.id);
      const result = parseRaster(planRaster, { ocr: tokensFor(expected) });
      summary[plan.id] = summarize(plan.id, result);
      summary[`${plan.id}-expected`] = {
        walls: expected.wallCount,
        rooms: expected.roomCount,
        openings: expected.openingCount,
      };
    }
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync('/tmp/cv-metrics.json', JSON.stringify(summary, null, 2));

    // Dump reference walls sorted by length for inspection.
    const walls = ref.draft.walls
      .map((wall: any, index: number) => ({
        index,
        len: Math.round(Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)),
        t: wall.thicknessPx,
        a: [wall.a.x, wall.a.y],
        b: [wall.b.x, wall.b.y],
        conf: wall.confidence,
      }))
      .sort((a: any, b: any) => b.len - a.len);
    console.log('REF WALLS', JSON.stringify(walls, null, 0));
    writeFileSync('/tmp/cv-ref-walls.json', JSON.stringify(walls, null, 2));
    const rooms = ref.draft.rooms.map((room: any) => ({
      label: room.label,
      area: room.polygon.length,
      first: room.polygon[0],
    }));
    console.log('REF ROOMS', JSON.stringify(rooms));
    writeFileSync('/tmp/cv-ref-debug.json', JSON.stringify({ ...ref.debug, polylines: ref.debug.polylines.slice(0, 600) }, null, 2));
  }, 240_000);
});
