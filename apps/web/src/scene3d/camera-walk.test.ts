import { describe, expect, it } from 'vitest';
import { createRoom, createWall, pointInPolygon } from '@hdesign/domain';
import { focusPose, orbitPose, roomFocusPose, sceneBounds } from './camera';
import { daylightFactor, lightingState, sunColor, sunPosition } from './lighting';
import {
  PLAYER_RADIUS_MM,
  RUN_SPEED_MM_S,
  WALK_SPEED_MM_S,
  cameraYawToward,
  walkBlockSegments,
  sightlineClearance,
  walkDelta,
  walkMove,
  walkStart,
} from './walk';
import { createOpening } from '@hdesign/domain';

const walls = [
  createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 240, isLoadBearing: true, id: 'top' }),
  createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { thickness: 240, id: 'right' }),
  createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { thickness: 240, id: 'bottom' }),
  createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { thickness: 240, id: 'left' }),
];

const rooms = [
  createRoom(
    [
      { x: 120, y: 120 },
      { x: 3880, y: 120 },
      { x: 3880, y: 2880 },
      { x: 120, y: 2880 },
    ],
    { id: 'room-living', name: '客厅', type: 'living' },
  ),
  createRoom(
    [
      { x: 5000, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 1000 },
      { x: 5000, y: 1000 },
    ],
    { id: 'room-small', name: '储物间' },
  ),
];

describe('sceneBounds', () => {
  it('wraps walls, rooms and furniture', () => {
    const bounds = sceneBounds(walls, rooms, []);
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(6000);
    expect(bounds.maxY).toBe(3000);
    expect(bounds.center.x).toBeCloseTo(3000, 6);
    expect(bounds.spanMm).toBe(6000);
  });

  it('has a fallback for empty projects', () => {
    const bounds = sceneBounds([], [], []);
    expect(bounds.widthMm).toBeGreaterThan(0);
    expect(bounds.depthMm).toBeGreaterThan(0);
  });
});

describe('camera poses', () => {
  const bounds = sceneBounds(walls, rooms, []);

  it('places the top view above the centre looking down', () => {
    const pose = orbitPose('top', bounds);
    expect(pose.position[0]).toBeCloseTo(3, 6);
    expect(pose.position[2]).toBeCloseTo(1.5, 2);
    expect(pose.position[1]).toBeGreaterThan(6);
    expect(pose.target[0]).toBeCloseTo(3, 6);
    expect(pose.target[1]).toBe(0);
  });

  it('keeps the bird view higher than the corner view and the top view highest', () => {
    const top = orbitPose('top', bounds);
    const bird = orbitPose('bird', bounds);
    const corner = orbitPose('corner', bounds);
    expect(top.position[1]).toBeGreaterThan(bird.position[1]);
    expect(bird.position[1]).toBeGreaterThan(corner.position[1]);
    for (const pose of [top, bird, corner]) {
      expect(pose.position.every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  it('moves closer when focusing a smaller radius', () => {
    const wide = focusPose({ x: 1000, y: 1000 }, 3000);
    const tight = focusPose({ x: 1000, y: 1000 }, 500);
    const wideDistance = Math.hypot(wide.position[0] - wide.target[0], wide.position[2] - wide.target[2]);
    const tightDistance = Math.hypot(tight.position[0] - tight.target[0], tight.position[2] - tight.target[2]);
    expect(tightDistance).toBeLessThan(wideDistance);
    expect(tight.target[1]).toBeGreaterThan(0);
  });

  it('focuses a room on its label point', () => {
    const pose = roomFocusPose(rooms[0]!);
    expect(pose.target[0]).toBeCloseTo(2, 1);
    expect(pose.target[2]).toBeCloseTo(1.5, 1);
    expect(pose.position.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe('lighting', () => {
  const bounds = sceneBounds(walls, rooms, []);

  it('peaks at noon and is dark at the edges of the day', () => {
    expect(daylightFactor(7)).toBeCloseTo(0, 6);
    expect(daylightFactor(18)).toBeCloseTo(0, 6);
    expect(daylightFactor(12.5)).toBeCloseTo(1, 2);
  });

  it('puts the sun in the east at dawn, highest at noon and west at dusk', () => {
    const dawn = sunPosition(7, bounds);
    const noon = sunPosition(12.5, bounds);
    const dusk = sunPosition(18, bounds);
    expect(dawn[0]).toBeGreaterThan(noon[0]);
    expect(dusk[0]).toBeLessThan(noon[0]);
    expect(noon[1]).toBeGreaterThan(dawn[1]);
    expect(noon[1]).toBeGreaterThan(dusk[1]);
  });

  it('switches to warm interior light at night', () => {
    const day = lightingState(12, false);
    const night = lightingState(12, true);
    expect(day.sunIntensity).toBeGreaterThan(1);
    expect(night.sunIntensity).toBe(0);
    expect(night.interiorIntensity).toBeGreaterThan(day.interiorIntensity);
    expect(sunColor(7)).toMatch(/^#/);
  });
});

describe('walk collision helpers', () => {
  it('subtracts walk-through openings from the collision walls', () => {
    const bottom = walls[2]!;
    const door = createOpening(bottom, 'door', 1400, 1000, { height: 2100 });
    const blocks = walkBlockSegments(walls, [door]);
    // 4 walls, one of them split in two by the door.
    expect(blocks.length).toBe(5);
    const doorGapBlocks = blocks.filter(
      (block) => Math.abs(block.ay - 3000) < 1 && Math.abs(block.by - 3000) < 1,
    );
    expect(doorGapBlocks).toHaveLength(2);
    const gapCovered = doorGapBlocks.some((block) => {
      const minX = Math.min(block.ax, block.bx);
      const maxX = Math.max(block.ax, block.bx);
      return minX < 2600 && maxX > 1600;
    });
    expect(gapCovered).toBe(false);
  });

  it('does not subtract windows', () => {
    const bottom = walls[2]!;
    const window = createOpening(bottom, 'window', 1400, 1000, { sill: 900 });
    const blocks = walkBlockSegments(walls, [window]);
    expect(blocks).toHaveLength(4);
  });

  it('pushes the player out of a wall while walking in small frames', () => {
    const blocks = walkBlockSegments(walls, []);
    let position = { x: 1000, y: 1000 };
    for (let frame = 0; frame < 200; frame += 1) {
      position = walkMove(position, { x: 20, y: 0 }, blocks);
    }
    // Right wall centre is x = 4000; player stops radius + half thickness before it.
    expect(position.x).toBeLessThanOrEqual(4000 - 240 / 2 - PLAYER_RADIUS_MM + 2);
    expect(position.x).toBeGreaterThan(3300);
  });

  it('walks straight through the door gap', () => {
    const bottom = walls[2]!;
    const door = createOpening(bottom, 'door', 1400, 1000, { height: 2100 });
    const blocks = walkBlockSegments(walls, [door]);
    let position = { x: 1900, y: 2400 };
    for (let frame = 0; frame < 80; frame += 1) {
      position = walkMove(position, { x: 0, y: 20 }, blocks);
    }
    expect(position.y).toBeGreaterThan(3000);
  });

  it('keeps movement blocked by a closed part of the same wall', () => {
    const bottom = walls[2]!;
    const door = createOpening(bottom, 'door', 1400, 1000, { height: 2100 });
    const blocks = walkBlockSegments(walls, [door]);
    let position = { x: 500, y: 2400 };
    for (let frame = 0; frame < 80; frame += 1) {
      position = walkMove(position, { x: 0, y: 20 }, blocks);
    }
    expect(position.y).toBeLessThan(3000 - 240 / 2 - PLAYER_RADIUS_MM + 2);
    expect(position.y).toBeGreaterThan(2400);
  });

  it('maps WASD input through camera yaw', () => {
    const forward = walkDelta(0, 1, 0, false, 1);
    expect(forward.x).toBeCloseTo(0, 4);
    expect(forward.y).toBeCloseTo(-WALK_SPEED_MM_S, 4);
    const run = walkDelta(0, 1, 0, true, 1);
    expect(run.y).toBeCloseTo(-RUN_SPEED_MM_S, 4);
    const strafe = walkDelta(0, 0, 1, false, 1);
    expect(strafe.x).toBeCloseTo(WALK_SPEED_MM_S, 4);
  });

  it('orients the camera towards a target point', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 1000, y: 0 };
    const yaw = cameraYawToward(from, to);
    const delta = walkDelta(yaw, 1, 0, false, 0.1);
    expect(delta.x).toBeGreaterThan(0);
    expect(delta.y).toBeCloseTo(0, 2);
  });

  it('starts inside the biggest room', () => {
    const start = walkStart(rooms);
    expect(pointInPolygon({ x: start.x, y: start.y }, rooms[0]!.polygon)).toBe(true);
    expect(Number.isFinite(start.yaw)).toBe(true);
  });

  it('starts facing the most open direction when collision walls are known', () => {
    const blocks = walkBlockSegments(walls, []);
    const start = walkStart(rooms, blocks);
    expect(pointInPolygon({ x: start.x, y: start.y }, rooms[0]!.polygon)).toBe(true);
    const chosen = sightlineClearance({ x: start.x, y: start.y }, start.yaw, blocks);
    for (let step = 0; step < 16; step += 1) {
      const yaw = (step / 16) * Math.PI * 2;
      expect(chosen).toBeGreaterThanOrEqual(
        sightlineClearance({ x: start.x, y: start.y }, yaw, blocks) - 1,
      );
    }
  });
});
