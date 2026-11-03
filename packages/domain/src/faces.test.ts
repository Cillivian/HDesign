import { describe, expect, it } from 'vitest';
import { detectRoomFaces, findRoomFaceAt, nearestWallDistance, type WallSegment } from './faces';
import { createWall } from './factory';
import { polygonAreaSqm } from './geometry';
import { rectPolygon } from './rooms';

function segments(points: Array<[number, number, number, number]>): WallSegment[] {
  return points.map(([x1, y1, x2, y2]) => ({
    a: { x: x1, y: y1 },
    b: { x: x2, y: y2 },
  }));
}

describe('detectRoomFaces', () => {
  it('detects a single closed rectangular room', () => {
    const walls = segments([
      [0, 0, 4000, 0],
      [4000, 0, 4000, 3000],
      [4000, 3000, 0, 3000],
      [0, 3000, 0, 0],
    ]);
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.areaSqm).toBeCloseTo(12, 5);
    expect(faces[0]!.centroid.x).toBeCloseTo(2000, 5);
    expect(faces[0]!.centroid.y).toBeCloseTo(1500, 5);
    expect(faces[0]!.polygon).toHaveLength(4);
  });

  it('detects the face regardless of wall direction and accepts Wall entities', () => {
    const walls = [
      createWall({ x: 0, y: 0 }, { x: 0, y: 2000 }),
      createWall({ x: 0, y: 2000 }, { x: 3000, y: 2000 }),
      createWall({ x: 3000, y: 2000 }, { x: 3000, y: 0 }),
      createWall({ x: 3000, y: 0 }, { x: 0, y: 0 }),
    ];
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.areaSqm).toBeCloseTo(6, 5);
    // Wound positive (screen-space clockwise) so downstream area math is stable.
    expect(polygonAreaSqm(faces[0]!.polygon)).toBeCloseTo(6, 5);
  });

  it('splits walls at T-junctions and finds both adjoining rooms', () => {
    const walls = segments([
      [0, 0, 8000, 0],
      [8000, 0, 8000, 4000],
      [8000, 4000, 0, 4000],
      [0, 4000, 0, 0],
      // Partition wall only meets the outer rectangle at its endpoints.
      [4000, 0, 4000, 4000],
    ]);
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(2);
    expect(faces.map((face) => Math.round(face.areaSqm))).toEqual([16, 16]);
    expect(faces.some((face) => findRoomFaceAt([face], { x: 2000, y: 2000 }) === face)).toBe(true);
    const left = findRoomFaceAt(faces, { x: 2000, y: 2000 })!;
    const right = findRoomFaceAt(faces, { x: 6000, y: 2000 })!;
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(left).not.toBe(right);
  });

  it('handles an L-shaped room', () => {
    const walls = segments([
      [0, 0, 6000, 0],
      [6000, 0, 6000, 2000],
      [6000, 2000, 2000, 2000],
      [2000, 2000, 2000, 4000],
      [2000, 4000, 0, 4000],
      [0, 4000, 0, 0],
    ]);
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    // 6000x2000 + 2000x2000 = 12 + 4 = 16 sqm
    expect(faces[0]!.areaSqm).toBeCloseTo(16, 5);
  });

  it('ignores dangling and duplicate walls', () => {
    const walls = segments([
      [0, 0, 3000, 0],
      [3000, 0, 3000, 3000],
      [3000, 3000, 0, 3000],
      [0, 3000, 0, 0],
      // dangling stub
      [1500, 0, 1500, 900],
      // duplicate of the bottom wall
      [0, 3000, 3000, 3000],
      // zero-length
      [500, 500, 500, 500],
    ]);
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.areaSqm).toBeCloseTo(9, 5);
  });

  it('returns nothing for an open outline', () => {
    const walls = segments([
      [0, 0, 3000, 0],
      [3000, 0, 3000, 3000],
      [3000, 3000, 0, 3000],
    ]);
    expect(detectRoomFaces(walls)).toEqual([]);
  });

  it('drops faces nested inside a larger face (columns)', () => {
    const walls = segments([
      [0, 0, 6000, 0],
      [6000, 0, 6000, 4000],
      [6000, 4000, 0, 4000],
      [0, 4000, 0, 0],
      // isolated column inside the room
      [2000, 1500, 2600, 1500],
      [2600, 1500, 2600, 2100],
      [2600, 2100, 2000, 2100],
      [2000, 2100, 2000, 1500],
    ]);
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.areaSqm).toBeCloseTo(24, 5);
  });

  it('finds exterior door gaps as bounded faces only when the loop closes', () => {
    // A door gap leaves the outline open, so no face is produced for the outer
    // ring; inner fully-closed rooms are still detected.
    const walls = segments([
      [0, 0, 3000, 0],
      [3000, 0, 3000, 3000],
      [3000, 3000, 0, 3000],
      // gap between (0, 3000) and (0, 0) — outline is open
    ]);
    expect(detectRoomFaces(walls)).toHaveLength(0);
  });

  it('orders faces largest first', () => {
    const walls = segments([
      [0, 0, 10000, 0],
      [10000, 0, 10000, 4000],
      [10000, 4000, 0, 4000],
      [0, 4000, 0, 0],
      [2000, 0, 2000, 4000],
      [6000, 0, 6000, 4000],
    ]);
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(3);
    const areas = faces.map((face) => face.areaSqm);
    expect(areas[0]).toBeCloseTo(16, 5);
    expect(areas[1]).toBeCloseTo(16, 5);
    expect(areas[2]).toBeCloseTo(8, 5);
  });

  it('respects the minimum area option', () => {
    const walls = segments([
      [0, 0, 1000, 0],
      [1000, 0, 1000, 1000],
      [1000, 1000, 0, 1000],
      [0, 1000, 0, 0],
    ]);
    expect(detectRoomFaces(walls)).toHaveLength(1);
    expect(detectRoomFaces(walls, { minAreaSqm: 2 })).toHaveLength(0);
  });

  it('nearestWallDistance measures to the segment centre line', () => {
    const walls = [createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })];
    expect(nearestWallDistance({ x: 500, y: 60 }, walls)).toBeCloseTo(60, 5);
    expect(nearestWallDistance({ x: 1400, y: 0 }, walls)).toBeCloseTo(400, 5);
  });

  it('produces polygons whose points sit on the original wall endpoints', () => {
    const polygon = rectPolygon(120, 120, 4000, 3000);
    const walls = polygon.map((point, index) => ({
      a: point,
      b: polygon[(index + 1) % polygon.length]!,
    }));
    const [face] = detectRoomFaces(walls);
    expect(face).toBeDefined();
    for (const point of face!.polygon) {
      expect(polygon.some((corner) => corner.x === point.x && corner.y === point.y)).toBe(true);
    }
  });
});
