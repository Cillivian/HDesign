import {
  clamp,
  distanceToSegment,
  polygonAreaSqm,
  projectPointOnSegment,
  roomLabelPoint,
  wallLength,
  type Opening,
  type Point,
  type Room,
  type Wall,
} from '@hdesign/domain';
import { openingIsPassable } from './wall-geometry';

/**
 * First-person walk helpers: 2D wall collision against wall segments with the
 * door / arch / sliding gaps subtracted. All distances in millimetres.
 */

export const PLAYER_RADIUS_MM = 280;
export const EYE_HEIGHT_MM = 1600;
export const WALK_SPEED_MM_S = 1400;
export const RUN_SPEED_MM_S = 2800;

export interface WalkBlock {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thickness: number;
}

export interface WalkPose {
  /** Plan position, mm. */
  x: number;
  y: number;
  /** Camera yaw in radians (rotation around three.js Y). */
  yaw: number;
}

/** Blocking spans of every wall: full wall minus walk-through openings. */
export function walkBlockSegments(walls: Wall[], openings: Opening[]): WalkBlock[] {
  const blocks: WalkBlock[] = [];
  for (const wall of walls) {
    const len = wallLength(wall);
    if (len < 1) continue;
    const ux = (wall.b.x - wall.a.x) / len;
    const uy = (wall.b.y - wall.a.y) / len;
    const at = (distance: number): Point => ({
      x: wall.a.x + ux * distance,
      y: wall.a.y + uy * distance,
    });

    const gaps = openings
      .filter((opening) => opening.wallId === wall.id && openingIsPassable(opening))
      .map((opening) => ({
        start: clamp(opening.offset, 0, len),
        end: clamp(opening.offset + opening.width, 0, len),
      }))
      .filter((gap) => gap.end - gap.start > 1)
      .sort((a, b) => a.start - b.start);

    let cursor = 0;
    for (const gap of gaps) {
      if (gap.start - cursor > 1) {
        const a = at(cursor);
        const b = at(gap.start);
        blocks.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, thickness: wall.thickness });
      }
      cursor = Math.max(cursor, gap.end);
    }
    if (len - cursor > 1) {
      const a = at(cursor);
      const b = at(len);
      blocks.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, thickness: wall.thickness });
    }
  }
  return blocks;
}

/** Circle-vs-thick-segment push-out, iterated a few times for corners. */
export function walkMove(
  current: Point,
  delta: Point,
  blocks: WalkBlock[],
  radius = PLAYER_RADIUS_MM,
): Point {
  let x = current.x + delta.x;
  let y = current.y + delta.y;

  for (let pass = 0; pass < 3; pass += 1) {
    let pushed = false;
    for (const block of blocks) {
      const from = { x: block.ax, y: block.ay };
      const to = { x: block.bx, y: block.by };
      const distance = distanceToSegment({ x, y }, from, to);
      const minDistance = radius + block.thickness / 2;
      if (distance >= minDistance) continue;

      const closest = projectPointOnSegment({ x, y }, from, to).point;
      let nx = x - closest.x;
      let ny = y - closest.y;
      const normalLength = Math.hypot(nx, ny);
      if (normalLength < 0.5) {
        // Centre is on the centreline: push out along the wall normal.
        const segmentLength = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        nx = -(to.y - from.y) / segmentLength;
        ny = (to.x - from.x) / segmentLength;
      } else {
        nx /= normalLength;
        ny /= normalLength;
      }
      const push = minDistance - distance + 0.5;
      x += nx * push;
      y += ny * push;
      pushed = true;
    }
    if (!pushed) break;
  }

  return { x, y };
}

/** Convert camera yaw + WASD input into a plan-space delta (mm) for `dt` seconds. */
export function walkDelta(
  yaw: number,
  forward: number,
  strafe: number,
  run: boolean,
  dt: number,
): Point {
  const speed = run ? RUN_SPEED_MM_S : WALK_SPEED_MM_S;
  // Callers clamp dt per frame; keeping this pure makes the maths testable.
  const step = speed * dt;
  // Camera looks down -z at yaw 0; forward = (-sin yaw, -cos yaw) in plan (x, z=y).
  const fx = -Math.sin(yaw);
  const fy = -Math.cos(yaw);
  // Right vector = (cos yaw, -sin yaw).
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  return {
    x: (fx * forward + rx * strafe) * step,
    y: (fy * forward + ry * strafe) * step,
  };
}

/** Camera yaw so that the first-person camera looks from `from` toward `to`. */
export function cameraYawToward(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.atan2(-dx, -dy);
}

/** Distance from `from` along a yaw direction until it hits a collision block. */
export function sightlineClearance(from: Point, yaw: number, blocks: WalkBlock[]): number {
  const dx = -Math.sin(yaw);
  const dy = -Math.cos(yaw);
  let best = Number.POSITIVE_INFINITY;
  for (const block of blocks) {
    const sx = block.bx - block.ax;
    const sy = block.by - block.ay;
    const denominator = dx * sy - dy * sx;
    if (Math.abs(denominator) < 1e-6) continue;
    const t = ((block.ax - from.x) * sy - (block.ay - from.y) * sx) / denominator;
    const u = ((block.ax - from.x) * dy - (block.ay - from.y) * dx) / denominator;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best === Number.POSITIVE_INFINITY ? 20_000 : best;
}

/** Start inside the largest room, looking down the most open direction. */
export function walkStart(rooms: Room[], blocks: WalkBlock[] = []): WalkPose {
  if (rooms.length === 0) return { x: 0, y: 0, yaw: 0 };
  let largest = rooms[0]!;
  for (const room of rooms) {
    if (polygonAreaSqm(room.polygon) > polygonAreaSqm(largest.polygon)) largest = room;
  }
  const from = roomLabelPoint(largest);

  if (blocks.length > 0) {
    let bestYaw = 0;
    let bestClearance = -1;
    for (let step = 0; step < 16; step += 1) {
      const yaw = (step / 16) * Math.PI * 2;
      const clearance = sightlineClearance(from, yaw, blocks);
      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestYaw = yaw;
      }
    }
    return { x: from.x, y: from.y, yaw: bestYaw };
  }

  // Fallback: look toward the farthest polygon corner so the first view spans the room.
  let to: Point = from;
  let best = 0;
  for (const vertex of largest.polygon) {
    const distance = Math.hypot(vertex.x - from.x, vertex.y - from.y);
    if (distance > best) {
      best = distance;
      to = vertex;
    }
  }
  const yaw = best > 200 ? cameraYawToward(from, to) : 0;
  return { x: from.x, y: from.y, yaw };
}
