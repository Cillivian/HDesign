import { describe, expect, it } from 'vitest';
import { createMepDevice, createRoom, createWall } from '@hdesign/domain';
import { buildMepMarkers, buildMepRuns, mepMarker } from './mep-geometry';
import { wallYaw } from './wall-geometry';

const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 200, id: 'wall-a' });
const room = createRoom(
  [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ],
  { id: 'room-a', name: '客厅' },
);

describe('mepMarker', () => {
  it('places wall devices on the wall centreline at their height', () => {
    const device = createMepDevice({
      kind: 'socket',
      x: 2000,
      y: 0,
      wallId: wall.id,
      t: 0.5,
      height: 300,
      roomId: room.id,
    });
    const marker = mepMarker(device, [wall], [room]);
    expect(marker.wallMounted).toBe(true);
    expect(marker.position[0]).toBeCloseTo(2, 6);
    expect(marker.position[2]).toBeCloseTo(0, 6);
    expect(marker.position[1]).toBeCloseTo(0.3, 6);
    expect(marker.yaw).toBeCloseTo(wallYaw(wall), 6);
    expect(marker.group).toBe('electric');
  });

  it('lays floor drains on the floor plane', () => {
    const device = createMepDevice({ kind: 'floor-drain', x: 1500, y: 1200, height: 0 });
    const marker = mepMarker(device, [], []);
    expect(marker.floorMounted).toBe(true);
    expect(marker.position[1]).toBeLessThan(0.05);
    expect(marker.group).toBe('water');
  });

  it('keeps free-standing devices at their plan position and height', () => {
    const device = createMepDevice({ kind: 'light', x: 1000, y: 2000, height: 2800 });
    const marker = mepMarker(device, [], []);
    expect(marker.wallMounted).toBe(false);
    expect(marker.position[0]).toBeCloseTo(1, 6);
    expect(marker.position[1]).toBeCloseTo(2.8, 6);
    expect(marker.position[2]).toBeCloseTo(2, 6);
  });

  it('builds one marker per device', () => {
    const devices = [
      createMepDevice({ kind: 'socket', x: 100, y: 100, roomId: room.id }),
      createMepDevice({ kind: 'water-cold', x: 200, y: 200, roomId: room.id }),
    ];
    expect(buildMepMarkers(devices, [wall], [room])).toHaveLength(2);
  });
});

describe('buildMepRuns', () => {
  it('groups electric devices per room into a single ceiling trunk with risers', () => {
    const devices = [
      createMepDevice({ kind: 'socket', x: 300, y: 200, height: 300, roomId: room.id, circuitId: 'c1' }),
      createMepDevice({ kind: 'socket-16a', x: 1800, y: 200, height: 2200, roomId: room.id, circuitId: 'c1' }),
      createMepDevice({ kind: 'switch', x: 3000, y: 200, height: 1300, roomId: room.id, circuitId: 'c1' }),
    ];
    const runs = buildMepRuns(devices, [room]);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.group).toBe('electric');
    expect(run.deviceIds).toHaveLength(3);
    // 3 trunk points at ceiling height + 3 risers (2 points each).
    expect(run.points).toHaveLength(3 + 6);
    expect(run.points[0]![1]).toBeCloseTo(2.4, 6);
    expect(run.points.some((point) => Math.abs(point[1] - 0.3) < 0.01)).toBe(true);
  });

  it('supports a custom electric trunk height (dollhouse cut)', () => {
    const devices = [
      createMepDevice({ kind: 'socket', x: 300, y: 200, height: 300, roomId: room.id }),
      createMepDevice({ kind: 'socket', x: 1800, y: 200, height: 300, roomId: room.id }),
    ];
    const runs = buildMepRuns(devices, [room], { electricTrunkMm: 1000 });
    expect(runs[0]!.points[0]![1]).toBeCloseTo(1, 6);
  });

  it('groups water devices per room at the floor trunk height', () => {
    const devices = [
      createMepDevice({ kind: 'water-cold', x: 1000, y: 1000, height: 500, roomId: room.id }),
      createMepDevice({ kind: 'drain', x: 2000, y: 1000, height: 300, roomId: room.id }),
      createMepDevice({ kind: 'floor-drain', x: 2000, y: 2000, height: 0, roomId: room.id }),
    ];
    const runs = buildMepRuns(devices, [room]);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.group).toBe('water');
    expect(run.points[0]![1]).toBeCloseTo(0.12, 6);
    expect(run.deviceIds).toHaveLength(3);
  });

  it('keeps rooms (and circuits) in separate runs', () => {
    const otherRoom = createRoom(
      [
        { x: 5000, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 1000 },
        { x: 5000, y: 1000 },
      ],
      { id: 'room-b', name: '次卧' },
    );
    const devices = [
      createMepDevice({ kind: 'socket', x: 100, y: 100, roomId: room.id }),
      createMepDevice({ kind: 'socket', x: 5500, y: 500, roomId: otherRoom.id }),
      createMepDevice({ kind: 'socket', x: 3000, y: 2000, roomId: room.id, circuitId: 'c2' }),
    ];
    const runs = buildMepRuns(devices, [room, otherRoom]);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const electricRuns = runs.filter((run) => run.group === 'electric');
    expect(electricRuns.length).toBeGreaterThanOrEqual(2);
  });
});
