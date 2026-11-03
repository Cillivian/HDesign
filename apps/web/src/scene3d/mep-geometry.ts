import {
  MEP_META,
  roomLabelPoint,
  wallLength,
  type MepDevice,
  type MepGroup,
  type MepKind,
  type Point,
  type Room,
  type Wall,
} from '@hdesign/domain';
import { pointAlongWall, wallYaw } from './wall-geometry';

/** MEP markers and pipe / wire runs for the 3D scene. All maths pure. */

export const MM_TO_M = 0.001;
const WATER_TRUNK_MM = 120;
const ELECTRIC_TRUNK_MM = 2400;

export interface MepMarker {
  id: string;
  kind: MepKind;
  group: MepGroup;
  label: string;
  short: string;
  /** World position, metres. */
  position: [number, number, number];
  /** Plate yaw around Y (radians). */
  yaw: number;
  wallMounted: boolean;
  floorMounted: boolean;
}

export interface MepRun {
  key: string;
  group: MepGroup;
  deviceIds: string[];
  /** Polyline vertices in world metres. */
  points: Array<[number, number, number]>;
}

export function isFloorMounted(kind: MepKind): boolean {
  return kind === 'floor-drain' || kind === 'floor-heat';
}

export function mepMarker(device: MepDevice, walls: Wall[], _rooms: Room[]): MepMarker {
  const meta = MEP_META[device.kind];
  const base = {
    id: device.id,
    kind: device.kind,
    group: meta.group,
    label: meta.label,
    short: meta.short,
  };

  if (device.wallId) {
    const wall = walls.find((candidate) => candidate.id === device.wallId);
    if (wall) {
      const t = device.t ?? 0.5;
      const point = pointAlongWall(wall, wallLength(wall) * t);
      return {
        ...base,
        position: [point.x * MM_TO_M, device.height * MM_TO_M, point.y * MM_TO_M],
        yaw: wallYaw(wall),
        wallMounted: true,
        floorMounted: false,
      };
    }
  }

  if (isFloorMounted(device.kind)) {
    return {
      ...base,
      position: [device.x * MM_TO_M, 0.012, device.y * MM_TO_M],
      yaw: 0,
      wallMounted: false,
      floorMounted: true,
    };
  }

  return {
    ...base,
    position: [device.x * MM_TO_M, device.height * MM_TO_M, device.y * MM_TO_M],
    yaw: 0,
    wallMounted: false,
    floorMounted: false,
  };
}

export function buildMepMarkers(devices: MepDevice[], walls: Wall[], rooms: Room[]): MepMarker[] {
  return devices.map((device) => mepMarker(device, walls, rooms));
}

function deviceRoom(device: MepDevice, rooms: Room[]): Room | undefined {
  if (device.roomId) return rooms.find((room) => room.id === device.roomId);
  return undefined;
}

function planPoint(device: MepDevice): Point {
  return { x: device.x, y: device.y };
}

/**
 * Water pipes follow the floor trunk at 120 mm, electric wires follow the
 * ceiling trunk at 2400 mm. Devices are chained per room / circuit in plan order,
 * with a vertical riser at every device.
 */
export interface MepRunOptions {
  waterTrunkMm?: number;
  electricTrunkMm?: number;
}

export function buildMepRuns(
  devices: MepDevice[],
  rooms: Room[] = [],
  options: MepRunOptions = {},
): MepRun[] {
  const waterTrunk = options.waterTrunkMm ?? WATER_TRUNK_MM;
  const electricTrunk = options.electricTrunkMm ?? ELECTRIC_TRUNK_MM;
  const groups = new Map<string, { group: MepGroup; devices: MepDevice[] }>();
  for (const device of devices) {
    const group = MEP_META[device.kind].group;
    // Runs stay inside one room so the overlay reads like a local pipe/wire route;
    // circuit grouping lives in the MEP panel.
    const key = `${group}:${device.roomId ?? 'all'}`;
    const bucket = groups.get(key) ?? { group, devices: [] };
    bucket.devices.push(device);
    groups.set(key, bucket);
  }

  const runs: MepRun[] = [];
  for (const [key, bucketGroup] of groups) {
    const { group } = bucketGroup;
    const bucket = bucketGroup.devices;
    const trunkHeight = group === 'water' ? waterTrunk : electricTrunk;
    // Sort by room label proximity then plan position, so runs are deterministic.
    const room = deviceRoom(bucket[0]!, rooms);
    const anchor = room ? roomLabelPoint(room) : { x: 0, y: 0 };
    const sorted = [...bucket].sort((a, b) => {
      const da = Math.hypot(a.x - anchor.x, a.y - anchor.y);
      const db = Math.hypot(b.x - anchor.x, b.y - anchor.y);
      if (Math.abs(da - db) > 1) return da - db;
      return a.x - b.x || a.y - b.y;
    });

    const points: Array<[number, number, number]> = [];
    for (const device of sorted) {
      const point = planPoint(device);
      points.push([point.x * MM_TO_M, trunkHeight * MM_TO_M, point.y * MM_TO_M]);
    }
    // Vertical risers: append at the end of each run to keep the trunk polyline clean.
    for (const device of sorted) {
      const point = planPoint(device);
      const top = Math.max(trunkHeight, device.height);
      const bottom = Math.min(trunkHeight, device.height);
      if (top - bottom < 50) continue;
      points.push(
        [point.x * MM_TO_M, top * MM_TO_M, point.y * MM_TO_M],
        [point.x * MM_TO_M, bottom * MM_TO_M, point.y * MM_TO_M],
      );
    }

    if (points.length >= 2) {
      runs.push({
        key,
        group,
        deviceIds: sorted.map((device) => device.id),
        points,
      });
    }
  }
  return runs;
}
