import {
  createMepDevice,
  distance,
  distanceToPolygonEdge,
  MEP_META,
  polygonAreaSqm,
  roomLabelPoint,
  wallLength,
  type FurnitureItem,
  type MepDevice,
  type MepKind,
  type Opening,
  type Point,
  type Project,
  type Room,
  type RoomType,
  type Wall,
} from '@hdesign/domain';
import type { MepOptions, MepResult } from './types';
import { roomEdges, type RoomEdge } from './geometry';

/* ------------------------------------------------------------------ */
/* Rule model                                                         */
/* ------------------------------------------------------------------ */

type DeviceSource =
  | 'door'
  | 'window'
  | 'item'
  | 'center'
  | 'corner'
  | 'perimeter'
  | 'counter'
  | 'bedside';

interface MepRule {
  kind: MepKind;
  count: number;
  source: DeviceSource;
  /** Lower-case sku id prefixes used to locate a host furniture item. */
  itemPrefixes?: string[];
  /** Explicit mounting height (defaults to MEP_META.defaultHeight). */
  height?: number;
  note?: string;
  waterproof?: boolean;
}

export const MEP_CIRCUIT_IDS = {
  lighting: 'circuit-lighting',
  general: 'circuit-general',
  kitchen: 'circuit-kitchen',
  ac: 'circuit-ac',
  bath: 'circuit-bath',
  floorHeat: 'circuit-floorheat',
} as const;

/** Circuit id a device kind belongs to for a given room type. */
export function circuitIdFor(kind: MepKind, roomType: RoomType): string | undefined {
  switch (kind) {
    case 'light':
    case 'light-spot':
    case 'switch':
    case 'switch-double':
      return MEP_CIRCUIT_IDS.lighting;
    case 'ac':
      return MEP_CIRCUIT_IDS.ac;
    case 'floor-heat':
      return MEP_CIRCUIT_IDS.floorHeat;
    case 'socket':
    case 'socket-16a':
      if (roomType === 'kitchen') return MEP_CIRCUIT_IDS.kitchen;
      if (roomType === 'bath') return MEP_CIRCUIT_IDS.bath;
      return MEP_CIRCUIT_IDS.general;
    default:
      return undefined;
  }
}

/** Reference rule table; also used by the panel to explain counts. */
export function mepRulesForRoom(roomType: RoomType, areaSqm: number): MepRule[] {
  switch (roomType) {
    case 'living':
      return [
        { kind: 'light', count: 1, source: 'center', note: '客厅主灯' },
        { kind: 'light-spot', count: areaSqm >= 18 ? 4 : 2, source: 'perimeter', note: '氛围筒灯' },
        { kind: 'switch-double', count: 1, source: 'door', height: 1300, note: '门口双控' },
        { kind: 'socket', count: 2, source: 'item', itemPrefixes: ['tv-cabinet', 'tv'], note: '电视墙插座' },
        { kind: 'socket', count: 2, source: 'perimeter', note: '沙发两侧备用' },
        { kind: 'weak-current', count: 1, source: 'item', itemPrefixes: ['tv-cabinet', 'tv'], note: '电视弱电' },
        { kind: 'ac', count: 1, source: 'window', height: 2200, note: '空调插座' },
      ];
    case 'master-bedroom':
      return [
        { kind: 'light', count: 1, source: 'center' },
        ...(areaSqm >= 15 ? [{ kind: 'light-spot' as const, count: 2, source: 'perimeter' as const }] : []),
        { kind: 'switch-double', count: 1, source: 'door', height: 1300, note: '门口双控' },
        { kind: 'socket', count: 2, source: 'bedside', height: 700, note: '床头两侧插座' },
        { kind: 'socket', count: 1, source: 'perimeter', note: '备用插座' },
        { kind: 'weak-current', count: 1, source: 'perimeter', height: 300, note: '网络点位' },
        { kind: 'ac', count: 1, source: 'window', height: 2200 },
      ];
    case 'bedroom':
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'light-spot', count: areaSqm >= 10 ? 2 : 1, source: 'perimeter' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 2, source: 'bedside', height: 700, note: '床头插座' },
        { kind: 'socket', count: 1, source: 'perimeter' },
        { kind: 'ac', count: 1, source: 'window', height: 2200 },
      ];
    case 'kids-room':
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'light-spot', count: 2, source: 'perimeter' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 2, source: 'perimeter', note: '学习桌插座' },
        { kind: 'ac', count: 1, source: 'window', height: 2200 },
      ];
    case 'dining':
      return [
        { kind: 'light', count: 1, source: 'center', note: '餐桌吊灯位' },
        { kind: 'light-spot', count: 2, source: 'perimeter' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 2, source: 'perimeter', note: '餐边柜插座' },
      ];
    case 'kitchen':
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'light-spot', count: 2, source: 'perimeter' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 4, source: 'counter', height: 1100, itemPrefixes: ['kitchen-counter'], note: '台面插座 1100' },
        { kind: 'socket-16a', count: 1, source: 'item', itemPrefixes: ['fridge'], height: 300, note: '冰箱专线' },
        { kind: 'socket-16a', count: 1, source: 'item', itemPrefixes: ['range-hood'], height: 2200, note: '油烟机专线' },
        { kind: 'water-cold', count: 1, source: 'item', itemPrefixes: ['sink'], height: 500, note: '冷水给水' },
        { kind: 'water-hot', count: 1, source: 'item', itemPrefixes: ['sink'], height: 500, note: '热水给水' },
        { kind: 'drain', count: 1, source: 'item', itemPrefixes: ['sink'], height: 300, note: '水槽排水' },
        { kind: 'gas', count: 1, source: 'item', itemPrefixes: ['stove', 'cooktop'], height: 1100, note: '燃气热水器/灶具' },
        { kind: 'floor-drain', count: 1, source: 'corner', height: 0, note: '厨房地漏' },
      ];
    case 'bath':
      return [
        { kind: 'light', count: 1, source: 'center', note: '防水主灯' },
        { kind: 'light-spot', count: 2, source: 'perimeter', note: '镜前筒灯' },
        { kind: 'switch', count: 1, source: 'door', height: 1300, waterproof: true, note: '防水开关' },
        { kind: 'socket', count: 1, source: 'item', itemPrefixes: ['vanity'], height: 1300, waterproof: true, note: '防水插座 1300' },
        { kind: 'socket-16a', count: 1, source: 'item', itemPrefixes: ['water-heater'], height: 1800, waterproof: true, note: '热水器专线' },
        { kind: 'water-cold', count: 1, source: 'item', itemPrefixes: ['vanity', 'shower'], height: 500 },
        { kind: 'water-hot', count: 1, source: 'item', itemPrefixes: ['vanity', 'shower'], height: 500 },
        { kind: 'drain', count: 1, source: 'item', itemPrefixes: ['shower', 'vanity'], height: 300 },
        { kind: 'floor-drain', count: 1, source: 'corner', height: 0, note: '淋浴区地漏' },
      ];
    case 'balcony':
      return [
        { kind: 'light', count: 1, source: 'center', waterproof: true },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket-16a', count: 1, source: 'item', itemPrefixes: ['washing-machine', 'dryer'], height: 300, waterproof: true, note: '洗衣机专线' },
        { kind: 'socket', count: 1, source: 'perimeter', waterproof: true },
        { kind: 'water-cold', count: 1, source: 'item', itemPrefixes: ['washing-machine'], height: 500 },
        { kind: 'drain', count: 1, source: 'item', itemPrefixes: ['washing-machine'], height: 300 },
        { kind: 'floor-drain', count: 1, source: 'corner', height: 0 },
      ];
    case 'entry':
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 1, source: 'perimeter' },
      ];
    case 'study':
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'light-spot', count: 2, source: 'perimeter' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 3, source: 'item', itemPrefixes: ['desk'], note: '书桌插座' },
        { kind: 'weak-current', count: 1, source: 'item', itemPrefixes: ['desk'], height: 300, note: '网络点位' },
        { kind: 'ac', count: 1, source: 'window', height: 2200 },
      ];
    case 'corridor':
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 1, source: 'perimeter' },
      ];
    default:
      return [
        { kind: 'light', count: 1, source: 'center' },
        { kind: 'switch', count: 1, source: 'door', height: 1300 },
        { kind: 'socket', count: 2, source: 'perimeter' },
      ];
  }
}

/* ------------------------------------------------------------------ */
/* Room context                                                       */
/* ------------------------------------------------------------------ */

interface OpeningOnRoom {
  kind: Opening['kind'];
  width: number;
  center: Point;
  a: Point;
  b: Point;
  hinge?: Point;
  thickness: number;
}

interface MepContext {
  room: Room;
  roomType: RoomType;
  areaSqm: number;
  edges: RoomEdge[];
  doors: OpeningOnRoom[];
  windows: OpeningOnRoom[];
  items: FurnitureItem[];
  center: Point;
}

function wallPointAt(wall: Wall, offsetFromStart: number): Point {
  const length = wallLength(wall) || 1;
  const t = Math.max(0, Math.min(1, offsetFromStart / length));
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

function buildContext(project: Project, room: Room, roomType: RoomType): MepContext {
  const edges = roomEdges(room);
  const wallById = new Map(project.walls.map((wall) => [wall.id, wall]));
  const doors: OpeningOnRoom[] = [];
  const windows: OpeningOnRoom[] = [];
  for (const opening of project.openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) continue;
    const center = wallPointAt(wall, opening.offset + opening.width / 2);
    if (distanceToPolygonEdge(center, room.polygon) > wall.thickness / 2 + 220) continue;
    const info: OpeningOnRoom = {
      kind: opening.kind,
      width: opening.width,
      center,
      a: wallPointAt(wall, opening.offset),
      b: wallPointAt(wall, opening.offset + opening.width),
      thickness: wall.thickness,
    };
    if (opening.kind === 'door') info.hinge = opening.swing.hinge === 'start' ? info.a : info.b;
    if (opening.kind === 'window') windows.push(info);
    else doors.push(info);
  }
  return {
    room,
    roomType,
    areaSqm: polygonAreaSqm(room.polygon),
    edges,
    doors,
    windows,
    items: project.furniture.filter((item) => item.roomId === room.id),
    center: roomLabelPoint(room),
  };
}

/* ------------------------------------------------------------------ */
/* Placement helpers                                                  */
/* ------------------------------------------------------------------ */

function onEdge(edge: RoomEdge, t: number, inset = 35): Point {
  const clamped = Math.max(0.02, Math.min(0.98, t));
  return {
    x: edge.a.x + (edge.b.x - edge.a.x) * clamped + edge.normal.x * inset,
    y: edge.a.y + (edge.b.y - edge.a.y) * clamped + edge.normal.y * inset,
  };
}

function nearestEdge(ctx: MepContext, point: Point): { edge: RoomEdge; t: number } {
  let best: { edge: RoomEdge; t: number } | undefined;
  let bestDistance = Infinity;
  for (const edge of ctx.edges) {
    const dx = edge.b.x - edge.a.x;
    const dy = edge.b.y - edge.a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const rawT = ((point.x - edge.a.x) * dx + (point.y - edge.a.y) * dy) / lengthSq;
    const t = Math.max(0, Math.min(1, rawT));
    const projected = { x: edge.a.x + dx * t, y: edge.a.y + dy * t };
    const d = distance(point, projected);
    if (d < bestDistance) {
      bestDistance = d;
      best = { edge, t };
    }
  }
  return best ?? { edge: ctx.edges[0]!, t: 0.5 };
}

function perimeterPoint(ctx: MepContext, fraction: number): Point {
  const edges = ctx.edges;
  const total = edges.reduce((sum, edge) => sum + edge.length, 0);
  if (total <= 0) return ctx.center;
  let target = ((fraction % 1) + 1) % 1 * total;
  for (const edge of edges) {
    if (target <= edge.length) {
      return onEdge(edge, target / edge.length);
    }
    target -= edge.length;
  }
  return onEdge(edges[edges.length - 1]!, 0.5);
}

function findItem(ctx: MepContext, prefixes: string[] | undefined): FurnitureItem | undefined {
  if (!prefixes || prefixes.length === 0) return undefined;
  return ctx.items.find((item) =>
    prefixes.some((prefix) => item.skuId.toLowerCase().startsWith(prefix)),
  );
}

function nearDoor(ctx: MepContext): Point {
  const door = ctx.doors[0];
  if (!door) return onEdge(ctx.edges[0]!, 0.5);
  const dx = door.b.x - door.a.x;
  const dy = door.b.y - door.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / length, y: dy / length };
  const candidates = [
    { x: door.a.x - dir.x * 200, y: door.a.y - dir.y * 200 },
    { x: door.b.x + dir.x * 200, y: door.b.y + dir.y * 200 },
  ];
  const chosen = candidates[0]!;
  const { edge, t } = nearestEdge(ctx, chosen);
  const offset = Math.abs(t - 0.5) < 0.05 ? 0.06 : 0;
  return onEdge(edge, Math.max(0.04, Math.min(0.96, t + offset)));
}

function nearWindow(ctx: MepContext): Point {
  const window = ctx.windows[0];
  const target = window?.center ?? ctx.center;
  const { edge, t } = nearestEdge(ctx, target);
  return onEdge(edge, t);
}

function aroundItem(
  ctx: MepContext,
  item: FurnitureItem | undefined,
  count: number,
  spread = 0.8,
): Point[] {
  const fallbackBase = item ? nearestEdge(ctx, { x: item.x, y: item.y }) : { edge: ctx.edges[0]!, t: 0.5 };
  const halfWidth = item ? item.w / 2 : 400;
  const positions: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const fraction = count === 1 ? 0.5 : 0.5 + ((index + 0.5) / count - 0.5) * spread;
    const lateral = item
      ? ((index + 0.5) / count - 0.5) * halfWidth * 1.6
      : 0;
    const edgeDir = {
      x: Math.cos(fallbackBase.edge.angle),
      y: Math.sin(fallbackBase.edge.angle),
    };
    const target = item
      ? { x: item.x + edgeDir.x * lateral, y: item.y + edgeDir.y * lateral }
      : fallbackBase.edge.mid;
    const snapped = nearestEdge(ctx, target);
    positions.push(onEdge(snapped.edge, snapped.t));
    void fraction;
  }
  return positions;
}

function bedsidePositions(ctx: MepContext, bed: FurnitureItem | undefined): Point[] {
  if (!bed) return aroundItem(ctx, undefined, 2);
  const base = nearestEdge(ctx, { x: bed.x, y: bed.y });
  const edgeDir = { x: Math.cos(base.edge.angle), y: Math.sin(base.edge.angle) };
  const offset = bed.w / 2 + 150;
  return [
    onEdge(nearestEdge(ctx, { x: bed.x - edgeDir.x * offset, y: bed.y - edgeDir.y * offset }).edge,
      nearestEdge(ctx, { x: bed.x - edgeDir.x * offset, y: bed.y - edgeDir.y * offset }).t),
    onEdge(nearestEdge(ctx, { x: bed.x + edgeDir.x * offset, y: bed.y + edgeDir.y * offset }).edge,
      nearestEdge(ctx, { x: bed.x + edgeDir.x * offset, y: bed.y + edgeDir.y * offset }).t),
  ];
}

function cornerPoint(ctx: MepContext): Point {
  const vertex = ctx.room.polygon[0]!;
  const direction = { x: ctx.center.x - vertex.x, y: ctx.center.y - vertex.y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  return {
    x: vertex.x + (direction.x / length) * 260,
    y: vertex.y + (direction.y / length) * 260,
  };
}

/** Position(s) for one rule; falls back to the perimeter when the host is missing. */
function positionsForRule(ctx: MepContext, rule: MepRule, diagnostics: string[]): Point[] {
  switch (rule.source) {
    case 'center':
      return [{ ...ctx.center }];
    case 'corner':
      return [cornerPoint(ctx)];
    case 'door': {
      if (ctx.doors.length === 0) {
        diagnostics.push(`「${ctx.room.name}」未找到门洞，开关按墙面中点布置。`);
        return [onEdge(ctx.edges[0]!, 0.5)];
      }
      return [nearDoor(ctx)];
    }
    case 'window': {
      if (ctx.windows.length === 0) {
        const { edge, t } = nearestEdge(ctx, ctx.center);
        diagnostics.push(`「${ctx.room.name}」未找到窗洞，${MEP_META[rule.kind].label}按内墙布置。`);
        return [onEdge(edge, t)];
      }
      return [nearWindow(ctx)];
    }
    case 'item': {
      const item = findItem(ctx, rule.itemPrefixes);
      if (!item && rule.itemPrefixes) {
        diagnostics.push(
          `「${ctx.room.name}」未找到${rule.itemPrefixes[0]}家具，${MEP_META[rule.kind].label}按墙面默认位置布置。`,
        );
      }
      return aroundItem(ctx, item, rule.count);
    }
    case 'counter': {
      const counter = findItem(ctx, rule.itemPrefixes);
      if (!counter) {
        diagnostics.push(`「${ctx.room.name}」未找到橱柜，台面插座按墙面均布。`);
        return aroundItem(ctx, undefined, rule.count, 1.2);
      }
      return aroundItem(ctx, counter, rule.count, 0.9);
    }
    case 'bedside': {
      const bed = findItem(ctx, ['bed-double', 'bed-king', 'bed-single', 'kids-bed', 'bed-tatami']);
      if (!bed) {
        diagnostics.push(`「${ctx.room.name}」未找到床，床头插座按墙面均布。`);
        return aroundItem(ctx, undefined, Math.max(2, rule.count));
      }
      return bedsidePositions(ctx, bed);
    }
    case 'perimeter':
    default: {
      const positions: Point[] = [];
      for (let index = 0; index < rule.count; index += 1) {
        positions.push(perimeterPoint(ctx, (index + 0.5) / rule.count));
      }
      return positions;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

export function generateMep(project: Project, options: MepOptions = {}): MepResult {
  const diagnostics: string[] = [];
  const mode = options.mode ?? 'replace';
  const targets =
    project.rooms.length > 0 ? project.rooms : [];
  if (targets.length === 0) {
    return { devices: [], diagnostics: ['方案中没有房间，无法生成水电点位。'] };
  }
  const devices: MepDevice[] = [];
  const circuitIds = new Set(project.mep.circuits.map((circuit) => circuit.id));
  let seq = 0;

  for (const room of targets) {
    const roomType = project.style ? inferRoomType(project, room) : room.type;
    if (room.polygon.length < 3) {
      diagnostics.push(`房间「${room.name}」轮廓无效，已跳过水电点位。`);
      continue;
    }
    const ctx = buildContext(project, room, roomType);
    const areaSqm = ctx.areaSqm;
    if (areaSqm < 1) {
      diagnostics.push(`房间「${room.name}」面积过小，已跳过水电点位。`);
      continue;
    }
    const existingKinds = new Set(
      project.mep.devices.filter((device) => device.roomId === room.id).map((device) => device.kind),
    );
    const rules = [...mepRulesForRoom(roomType, areaSqm)];
    // Brief-requested extra devices (deduped against the base rules).
    if (options.brief) {
      for (const entry of options.brief.mep) {
        if (entry.roomId && entry.roomId !== room.id) continue;
        if (!entry.roomId) {
          const roomBrief = options.brief.rooms.find(
            (candidate) => candidate.roomId === room.id || candidate.type === roomType,
          );
          if (!roomBrief && options.brief.rooms.length > 0) continue;
        }
        for (const kind of entry.kinds) {
          if (rules.some((rule) => rule.kind === kind)) continue;
          rules.push({ kind, count: 1, source: 'perimeter', note: entry.note });
        }
      }
    }
    const roomDevices: MepDevice[] = [];
    for (const rule of rules) {
      if (mode === 'fill' && existingKinds.has(rule.kind)) continue;
      const positions = positionsForRule(ctx, rule, diagnostics);
      for (const position of positions.slice(0, Math.max(0, rule.count))) {
        const height = rule.height ?? MEP_META[rule.kind].defaultHeight;
        const circuitId = circuitIdFor(rule.kind, roomType);
        const meta = MEP_META[rule.kind];
        // Keep devices a little apart when two rules target the same wall point.
        const clash = roomDevices.some(
          (device) => distance({ x: device.x, y: device.y }, position) < 180,
        );
        let adjusted = position;
        if (clash) {
          // Shift along the wall instead of into the room so the point stays inside.
          const snapped = nearestEdge(ctx, position);
          const edgeDirection = {
            x: Math.cos(snapped.edge.angle),
            y: Math.sin(snapped.edge.angle),
          };
          const target = {
            x: position.x + edgeDirection.x * 260,
            y: position.y + edgeDirection.y * 260,
          };
          const shifted = nearestEdge(ctx, target);
          adjusted = onEdge(shifted.edge, shifted.t);
        }
        const device = createMepDevice({
          kind: rule.kind,
          x: Math.round(adjusted.x),
          y: Math.round(adjusted.y),
          roomId: room.id,
          height,
          circuitId: circuitId && circuitIds.has(circuitId) ? circuitId : undefined,
          note: rule.note ?? '',
          meta: {
            source: 'auto',
            rationale: `按「${room.name}」${meta.label}规则生成`,
          },
        });
        device.id = `mep-${sanitize(room.id)}-${rule.kind}-${seq}`;
        seq += 1;
        const waterproof = rule.waterproof ?? meta.waterproof;
        device.waterproof = waterproof || roomType === 'bath' || roomType === 'balcony';
        if (circuitId && !circuitIds.has(circuitId)) {
          diagnostics.push(`方案缺少回路「${circuitId}」，${meta.label}未关联回路。`);
        }
        roomDevices.push(device);
      }
    }
    if (roomDevices.length === 0) {
      diagnostics.push(`房间「${room.name}」未生成新的水电点位（可能已存在同类点位）。`);
    }
    devices.push(...roomDevices);
  }

  if (devices.length === 0 && diagnostics.length === 0) {
    diagnostics.push('没有生成任何水电点位。');
  }
  return { devices, diagnostics };
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60);
}

function inferRoomType(project: Project, room: Room): RoomType {
  return project.rooms.find((candidate) => candidate.id === room.id)?.type ?? room.type;
}
