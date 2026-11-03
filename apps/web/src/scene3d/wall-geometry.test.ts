import { describe, expect, it } from 'vitest';
import { createOpening, createWall } from '@hdesign/domain';
import {
  DEFAULT_CUT_HEIGHT,
  effectiveWallHeight,
  openingDetailParts,
  openingIsPassable,
  segmentWall,
  segmentWalls,
  wallYaw,
} from './wall-geometry';

const wall = (overrides = {}) =>
  createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 200, height: 2800, ...overrides });

describe('segmentWall', () => {
  it('extrudes a plain wall as a single solid box', () => {
    const built = segmentWall(wall(), []);
    expect(built.boxes).toHaveLength(1);
    const [part] = built.boxes;
    expect(part!.role).toBe('solid');
    expect(part!.start).toBe(0);
    expect(part!.end).toBe(4000);
    expect(part!.bottom).toBe(0);
    expect(part!.top).toBe(2800);
    expect(part!.thickness).toBe(200);
    expect(part!.cx).toBeCloseTo(2000, 4);
    expect(part!.cy).toBeCloseTo(0, 4);
    expect(part!.yaw).toBeCloseTo(0, 6);
  });

  it('splits a wall around a door into two solids plus a lintel', () => {
    const geometry = wall();
    const door = createOpening(geometry, 'door', 1000, 900, { height: 2100 });
    const built = segmentWall(geometry, [door]);
    const solids = built.boxes.filter((part) => part.role === 'solid');
    const lintels = built.boxes.filter((part) => part.role === 'lintel');
    const sills = built.boxes.filter((part) => part.role === 'sill');

    expect(solids).toHaveLength(2);
    expect(solids.map((part) => [part.start, part.end])).toEqual([
      [0, 1000],
      [1900, 4000],
    ]);
    expect(sills).toHaveLength(0);
    expect(lintels).toHaveLength(1);
    expect(lintels[0]!.bottom).toBe(2100);
    expect(lintels[0]!.top).toBe(2800);
    expect(built.frames).toHaveLength(1);
    expect(built.frames[0]!.width).toBe(900);
  });

  it('adds sill and lintel boxes around a window', () => {
    const geometry = wall();
    const window = createOpening(geometry, 'window', 600, 1500, { sill: 900, height: 1500 });
    const built = segmentWall(geometry, [window]);
    const sills = built.boxes.filter((part) => part.role === 'sill');
    const lintels = built.boxes.filter((part) => part.role === 'lintel');
    expect(sills).toHaveLength(1);
    expect(sills[0]!.bottom).toBe(0);
    expect(sills[0]!.top).toBe(900);
    expect(lintels).toHaveLength(1);
    expect(lintels[0]!.bottom).toBe(2400);
    expect(lintels[0]!.top).toBe(2800);
  });

  it('clips geometry at the dollhouse cut height', () => {
    const geometry = wall();
    const window = createOpening(geometry, 'window', 600, 1500, { sill: 900, height: 1500 });
    const built = segmentWall(geometry, [window], { cutHeight: DEFAULT_CUT_HEIGHT });
    for (const part of built.boxes) {
      expect(part.top).toBeLessThanOrEqual(DEFAULT_CUT_HEIGHT);
      expect(part.top - part.bottom).toBeGreaterThan(0);
    }
    expect(built.boxes.some((part) => part.role === 'lintel')).toBe(false);
    expect(built.frames[0]!.top).toBe(DEFAULT_CUT_HEIGHT);
    expect(built.frames[0]!.bottom).toBe(900);
  });

  it('keeps the wall watertight when openings overlap or overflow', () => {
    const geometry = wall();
    const openings = [
      createOpening(geometry, 'window', 3000, 2000, { sill: 900 }),
      createOpening(geometry, 'window', 3500, 1500, { sill: 900 }),
      createOpening(geometry, 'door', 3900, 900),
    ];
    const built = segmentWall(geometry, openings);
    for (const part of built.boxes) {
      expect(part.start).toBeGreaterThanOrEqual(0);
      expect(part.end).toBeLessThanOrEqual(4000);
      expect(part.end).toBeGreaterThan(part.start);
      expect(part.top).toBeGreaterThan(part.bottom);
    }
    // Solid spans never overlap.
    const solids = built.boxes.filter((part) => part.role === 'solid').sort((a, b) => a.start - b.start);
    for (let index = 1; index < solids.length; index += 1) {
      expect(solids[index]!.start).toBeGreaterThanOrEqual(solids[index - 1]!.end);
    }
  });

  it('propagates load-bearing/thickness and caps low walls', () => {
    const geometry = wall({ isLoadBearing: true, kind: 'low-wall', height: 2600 });
    expect(effectiveWallHeight(geometry)).toBe(1100);
    const built = segmentWall(geometry, []);
    expect(built.boxes[0]!.isLoadBearing).toBe(true);
    expect(built.boxes[0]!.wallKind).toBe('low-wall');
    expect(built.boxes[0]!.top).toBe(1100);
  });

  it('computes the three.js yaw so local +x follows the wall', () => {
    const horizontal = wall();
    expect(wallYaw(horizontal)).toBeCloseTo(0, 6);
    const vertical = createWall({ x: 0, y: 0 }, { x: 0, y: 4000 });
    expect(wallYaw(vertical)).toBeCloseTo(-Math.PI / 2, 6);
    // Opposite direction mirrors the yaw.
    const reversed = createWall({ x: 4000, y: 0 }, { x: 0, y: 0 });
    expect(wallYaw(reversed)).toBeCloseTo(-Math.PI, 6);
  });

  it('segments every wall and skips openings that belong to others', () => {
    const a = wall();
    const b = createWall({ x: 0, y: 3000 }, { x: 4000, y: 3000 });
    const openings = [createOpening(a, 'door', 800, 900), createOpening(b, 'door', 2000, 900)];
    const built = segmentWalls([a, b], openings);
    expect(built.frames).toHaveLength(2);
    expect(built.boxes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('openingDetailParts', () => {
  it('fills a door with a leaf and trim', () => {
    const geometry = wall();
    const door = createOpening(geometry, 'door', 1000, 900, { height: 2100 });
    const built = segmentWall(geometry, [door]);
    const parts = openingDetailParts(built.frames[0]!);
    const leaf = parts.find((part) => part.role === 'leaf');
    expect(leaf).toBeDefined();
    expect(leaf!.width).toBeLessThan(900);
    expect(leaf!.height).toBeGreaterThan(1500);
    // Doors render ajar so the walk-through opening matches the collision gap.
    expect(leaf!.offsetZ).not.toBe(0);
    expect(leaf!.rotationY).not.toBe(0);
    expect(parts.filter((part) => part.role === 'frame').length).toBe(3);
  });

  it('adds glass and a mullion to windows but not to arches', () => {
    const geometry = wall();
    const window = createOpening(geometry, 'window', 500, 1600, { sill: 900 });
    const windowParts = openingDetailParts(segmentWall(geometry, [window]).frames[0]!);
    expect(windowParts.some((part) => part.role === 'glass')).toBe(true);
    expect(windowParts.some((part) => part.role === 'mullion')).toBe(true);

    const arch = createOpening(geometry, 'arch', 500, 1600);
    const archParts = openingDetailParts(segmentWall(geometry, [arch]).frames[0]!);
    expect(archParts.some((part) => part.role === 'leaf')).toBe(false);
    expect(archParts.some((part) => part.role === 'glass')).toBe(false);
    expect(archParts.some((part) => part.role === 'frame')).toBe(true);
  });

  it('marks doors/arches/sliding as walk-through but not windows', () => {
    const geometry = wall();
    expect(openingIsPassable(createOpening(geometry, 'door', 0, 900))).toBe(true);
    expect(openingIsPassable(createOpening(geometry, 'sliding', 0, 900))).toBe(true);
    expect(openingIsPassable(createOpening(geometry, 'arch', 0, 900))).toBe(true);
    expect(openingIsPassable(createOpening(geometry, 'window', 0, 900, { sill: 900 }))).toBe(false);
  });
});
