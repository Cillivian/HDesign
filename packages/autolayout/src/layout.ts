import {
  createFurnitureItem,
  distance,
  distanceToPolygonEdge,
  polygonAreaSqm,
  roomLabelPoint,
  wallLength,
  type FurnitureItem,
  type Opening,
  type Point,
  type Project,
  type Room,
  type RoomType,
  type Wall,
} from '@hdesign/domain';
import {
  getFurnitureSku,
  getStylePreset,
  preferredSku,
  type FurnitureSku,
} from '@hdesign/catalog';
import type { LayoutOptions, LayoutResult } from './types';
import {
  edgePoint,
  edgesByLength,
  hashString,
  mulberry32,
  obbCircleOverlaps,
  obbDistance,
  obbInsidePolygon,
  obbOverlaps,
  rotationFacingWall,
  roomBBoxCenter,
  roomEdges,
  type Obb,
  type RoomEdge,
} from './geometry';
import { slotsForRoom, type SlotSpec } from './templates';

/* ------------------------------------------------------------------ */
/* Internal model                                                     */
/* ------------------------------------------------------------------ */

interface OpeningOnRoom {
  kind: Opening['kind'];
  width: number;
  sill: number;
  center: Point;
  a: Point;
  b: Point;
  /** Door hinge point (undefined for sliding / arch). */
  hinge?: Point;
  /** Wall thickness so edge span checks can be tolerance aware. */
  wallThickness: number;
}

interface RoomContext {
  room: Room;
  roomType: RoomType;
  areaSqm: number;
  edges: RoomEdge[];
  doors: OpeningOnRoom[];
  windows: OpeningOnRoom[];
  allOpenings: OpeningOnRoom[];
  labelPoint: Point;
  bboxCenter: Point;
}

interface PlacedRecord {
  role: string;
  sku: FurnitureSku;
  item: FurnitureItem;
  obb: Obb;
  edge?: RoomEdge;
  facing: Point;
}

interface Obstacle {
  obb: Obb;
  collisionExempt: boolean;
  roomId?: string;
}

interface Candidate {
  item: FurnitureItem;
  obb: Obb;
  edge?: RoomEdge;
  facing: Point;
  score: number;
}

const EPS = 1;

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

export function generateLayout(project: Project, options: LayoutOptions): LayoutResult {
  const diagnostics: string[] = [];
  const mode = options.mode ?? 'replace';
  const seed = options.seed ?? hashString(`${project.id}:${options.styleId}:${mode}`);
  const rng = mulberry32(seed);
  const styleId = options.styleId ?? project.style?.id ?? 'modern-minimal';
  const preset = getStylePreset(styleId);

  const roomTypes: Record<string, RoomType> = {};
  for (const room of project.rooms) {
    roomTypes[room.id] = options.roomTypes?.[room.id] ?? room.type;
  }
  const targetRooms =
    options.roomIds && options.roomIds.length > 0
      ? project.rooms.filter((room) => options.roomIds!.includes(room.id))
      : project.rooms;

  if (targetRooms.length === 0) {
    return { furniture: [], diagnostics: ['没有可布置的房间。'] };
  }

  const generatedRoomIds = new Set(targetRooms.map((room) => room.id));
  const obstacles: Obstacle[] = project.furniture
    .filter((item) => mode === 'fill-empty' || !generatedRoomIds.has(item.roomId ?? ''))
    .map((item) => ({
      obb: { cx: item.x, cy: item.y, w: item.w, d: item.d, rotation: item.rotation },
      collisionExempt: getFurnitureSku(item.skuId)?.collisionExempt ?? false,
      roomId: item.roomId,
    }));

  const result: FurnitureItem[] = [];
  let itemSeq = 0;

  for (const room of targetRooms) {
    const roomType = roomTypes[room.id] ?? 'other';
    if (!room.polygon || room.polygon.length < 3) {
      diagnostics.push(`房间「${room.name}」缺少有效轮廓，已跳过。`);
      continue;
    }
    const areaSqm = polygonAreaSqm(room.polygon);
    if (areaSqm < 1.5) {
      diagnostics.push(`房间「${room.name}」面积过小（${areaSqm.toFixed(1)} ㎡），已跳过布置。`);
      continue;
    }
    const edges = roomEdges(room);
    if (edges.length === 0) {
      diagnostics.push(`房间「${room.name}」没有可用墙面，已跳过。`);
      continue;
    }
    const ctx: RoomContext = {
      room,
      roomType,
      areaSqm,
      edges,
      doors: [],
      windows: [],
      allOpenings: [],
      labelPoint: roomLabelPoint(room),
      bboxCenter: roomBBoxCenter(room),
    };
    collectOpenings(project, ctx);

    const roomObstacles = obstacles.filter(
      (obstacle) => obstacle.roomId === room.id || obstacle.roomId === undefined,
    );
    const existingInRoom = project.furniture.filter((item) => item.roomId === room.id);
    const briefPriority = roomPriority(options, room, roomType);
    const slots = withBriefSlots(
      project,
      room,
      roomType,
      areaSqm,
      slotsForRoom(roomType, areaSqm),
      options,
    );

    const placed: PlacedRecord[] = [];
    for (const slot of slots) {
      if (slot.dedupeCategory && mode === 'fill-empty') {
        const already = existingInRoom.some((item) => categoryOf(item) === slot.category);
        if (already) continue;
      }
      const sku = chooseSku(slot, roomType, styleId, preset?.furniturePreference, options);
      if (!sku) {
        diagnostics.push(`房间「${room.name}」缺少可用家具：${slot.label ?? slot.role}。`);
        continue;
      }
      const placedCount = placeSlot({
        slot,
        sku,
        ctx,
        placed,
        obstacles: roomObstacles,
        rng,
        itemSeq,
        seed,
        briefPriority,
        diagnostics,
      });
      for (const record of placedCount.records) {
        placed.push(record);
        result.push(record.item);
        itemSeq += 1;
      }
      if (placedCount.records.length === 0 && slot.required) {
        diagnostics.push(
          `房间「${room.name}」未能布置${slot.label ?? slot.role}：可用墙面或净距不足（${areaSqm.toFixed(1)} ㎡）。`,
        );
      } else if (placedCount.records.length === 0 && slot.label) {
        diagnostics.push(`房间「${room.name}」${slot.label} 无合适位置，已略过。`);
      }
    }
    if (placed.length === 0 && existingInRoom.length === 0) {
      diagnostics.push(`房间「${room.name}」未生成任何家具，请检查尺寸与门窗关系。`);
    }
  }

  if (result.length === 0 && diagnostics.length === 0) {
    diagnostics.push('当前方案没有可自动布置的空间。');
  }
  return { furniture: result, diagnostics };
}

/* ------------------------------------------------------------------ */
/* Openings                                                           */
/* ------------------------------------------------------------------ */

function collectOpenings(project: Project, ctx: RoomContext): void {
  const wallById = new Map(project.walls.map((wall) => [wall.id, wall]));
  for (const opening of project.openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) continue;
    const info = openingOnRoom(opening, wall, ctx.room, ctx.edges);
    if (!info) continue;
    ctx.allOpenings.push(info);
    if (opening.kind === 'window') ctx.windows.push(info);
    else ctx.doors.push(info);
  }
}

function wallPointAt(wall: Wall, offsetFromStart: number): Point {
  const length = wallLength(wall) || 1;
  const t = Math.max(0, Math.min(1, offsetFromStart / length));
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

function openingOnRoom(
  opening: Opening,
  wall: Wall,
  room: Room,
  edges: RoomEdge[],
): OpeningOnRoom | undefined {
  const center = wallPointAt(wall, opening.offset + opening.width / 2);
  const alongRoom = distanceToPolygonEdge(center, room.polygon);
  const threshold = wall.thickness / 2 + 220;
  if (alongRoom > threshold) return undefined;
  const a = wallPointAt(wall, opening.offset);
  const b = wallPointAt(wall, opening.offset + opening.width);
  const info: OpeningOnRoom = {
    kind: opening.kind,
    width: opening.width,
    sill: opening.sill,
    center,
    a,
    b,
    wallThickness: wall.thickness,
  };
  if (opening.kind === 'door') {
    info.hinge =
      opening.swing.hinge === 'start' ? a : b;
  }
  void edges;
  return info;
}

function doorClearance(info: OpeningOnRoom): { center: Point; radius: number } {
  if (info.hinge) return { center: info.hinge, radius: info.width };
  return { center: info.center, radius: info.width / 2 + 260 };
}

interface Span {
  start: number;
  end: number;
}

/** Parameter range (0..1) the opening occupies on a room edge, if it belongs to it. */
function openingSpanOnEdge(info: OpeningOnRoom, edge: RoomEdge, wallThickness: number): Span | undefined {
  const projection = projectOntoEdge(info.center, edge);
  if (!projection) return undefined;
  if (projection.distance > wallThickness / 2 + 260) return undefined;
  if (projection.t < -0.02 || projection.t > 1.02) return undefined;
  const half = info.width / 2 / edge.length;
  return { start: Math.max(0, projection.t - half), end: Math.min(1, projection.t + half) };
}

function projectOntoEdge(
  point: Point,
  edge: RoomEdge,
): { t: number; point: Point; distance: number } | undefined {
  const dx = edge.b.x - edge.a.x;
  const dy = edge.b.y - edge.a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < EPS) return undefined;
  const rawT = ((point.x - edge.a.x) * dx + (point.y - edge.a.y) * dy) / lengthSq;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = { x: edge.a.x + dx * t, y: edge.a.y + dy * t };
  return { t, point: projected, distance: distance(point, projected) };
}

/* ------------------------------------------------------------------ */
/* SKU selection                                                      */
/* ------------------------------------------------------------------ */

function chooseSku(
  slot: SlotSpec,
  roomType: RoomType,
  styleId: string,
  preference: Record<string, string[]> | undefined,
  options: LayoutOptions,
): FurnitureSku | undefined {
  const brief = options.brief;
  if (brief) {
    const briefPick = brief.furniture.find(
      (entry) =>
        (!entry.roomId || entry.roomId.length === 0) &&
        entry.category === slot.category &&
        entry.skuId,
    );
    if (briefPick?.skuId) {
      const sku = getFurnitureSku(briefPick.skuId);
      if (sku) return sku;
    }
  }
  const candidates: string[] = [
    ...(slot.skuId ? [slot.skuId] : []),
    ...(slot.skuIds ?? []),
    ...((preference?.[slot.category] as string[] | undefined) ?? []),
  ];
  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const sku = getFurnitureSku(id);
    if (!sku) continue;
    if (!sku.roomTypes.includes(roomType)) continue;
    return sku;
  }
  if (styleId && preference?.[slot.category]) {
    const fallback = preferredSku(slot.category, roomType, preference[slot.category]);
    if (fallback) return fallback;
  }
  return preferredSku(slot.category, roomType);
}

function categoryOf(item: FurnitureItem): string {
  return getFurnitureSku(item.skuId)?.category ?? 'decor';
}

/* ------------------------------------------------------------------ */
/* Brief additions                                                    */
/* ------------------------------------------------------------------ */

function roomPriority(options: LayoutOptions, room: Room, roomType: RoomType): number {
  const brief = options.brief;
  if (!brief) return 3;
  const match = brief.rooms.find(
    (candidate) => candidate.roomId === room.id || candidate.type === roomType,
  );
  return match?.priority ?? 3;
}

function withBriefSlots(
  project: Project,
  room: Room,
  roomType: RoomType,
  areaSqm: number,
  base: SlotSpec[],
  options: LayoutOptions,
): SlotSpec[] {
  const brief = options.brief;
  if (!brief) return base;
  const used = new Set(base.map((slot) => slot.category));
  const extra: SlotSpec[] = [];
  for (const entry of brief.furniture) {
    if (entry.roomId && entry.roomId !== room.id) continue;
    if (entry.roomId === undefined) {
      const roomBrief = brief.rooms.find(
        (candidate) => candidate.roomId === room.id || candidate.type === roomType,
      );
      if (!roomBrief && brief.rooms.length > 0) continue;
    }
    const category = entry.category as SlotSpec['category'];
    if (used.has(category)) continue;
    const sku = entry.skuId ? getFurnitureSku(entry.skuId) : undefined;
    const count = Math.min(2, Math.max(1, entry.qty));
    for (let index = 0; index < count; index += 1) {
      extra.push({
        role: `brief-${category}-${extra.length}`,
        category,
        skuId: sku?.id,
        skuIds: sku ? [sku.id] : undefined,
        placement: category === 'table' || category === 'sofa' ? 'center' : 'wall',
        wallPreference: 'any',
        label: entry.note || entry.category,
      });
    }
    used.add(category);
  }
  void project;
  void areaSqm;
  return [...extra, ...base];
}

/* ------------------------------------------------------------------ */
/* Placement                                                          */
/* ------------------------------------------------------------------ */

interface PlaceArgs {
  slot: SlotSpec;
  sku: FurnitureSku;
  ctx: RoomContext;
  placed: PlacedRecord[];
  obstacles: Obstacle[];
  rng: () => number;
  itemSeq: number;
  seed: number;
  /** Brief room priority (1..5, default 3) — denser search for important rooms. */
  briefPriority: number;
  diagnostics: string[];
}

function placeSlot(args: PlaceArgs): { records: PlacedRecord[] } {
  const { slot } = args;
  if (slot.placement === 'wall') {
    const record = pickBest(args, wallCandidates(args));
    return { records: record ? [record] : [] };
  }
  if (slot.placement === 'corner') {
    const record = pickBest(args, cornerCandidates(args));
    return { records: record ? [record] : [] };
  }
  if (slot.placement === 'center') {
    const record = pickBest(args, centerCandidates(args));
    return { records: record ? [record] : [] };
  }
  if (slot.placement === 'front') {
    const record = pickBest(args, frontCandidates(args));
    return { records: record ? [record] : [] };
  }
  if (slot.placement === 'beside') {
    const record = pickBest(args, besideCandidates(args));
    return { records: record ? [record] : [] };
  }
  if (slot.placement === 'around') {
    const records = aroundPlacements(args);
    return { records: records.length > 0 ? records : [] };
  }
  return { records: [] };
}

function pickBest(args: PlaceArgs, candidates: Candidate[]): PlacedRecord | undefined {
  if (candidates.length === 0) return undefined;
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  const best = ordered[0];
  if (!best) return undefined;
  return toRecord(args, best);
}

function toRecord(args: PlaceArgs, candidate: Candidate): PlacedRecord {
  return {
    role: args.slot.role,
    sku: args.sku,
    item: candidate.item,
    obb: candidate.obb,
    edge: candidate.edge,
    facing: candidate.facing,
  };
}

function itemFor(args: PlaceArgs, cx: number, cy: number, rotation: number): FurnitureItem {
  const { slot, sku, ctx, itemSeq } = args;
  const id = sanitizeId(
    `furn-${ctx.room.id}-${slot.role}-${itemSeq}-${Math.round(cx)}-${Math.round(cy)}`,
  );
  const item = createFurnitureItem({
    skuId: sku.id,
    name: sku.name,
    x: Math.round(cx),
    y: Math.round(cy),
    w: sku.w,
    d: sku.d,
    h: sku.h,
    rotation: normalizeRotation(rotation),
    color: sku.color,
    roomId: ctx.room.id,
    meta: {
      source: 'auto',
      rationale: `按「${roomTypeLabel(ctx.roomType)}」模板自动布置${slot.label ? `：${slot.label}` : ''}`,
    },
  });
  item.id = id;
  return item;
}

function sanitizeId(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, '-');
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

function normalizeRotation(rotation: number): number {
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.round(normalized) === 360 ? 0 : Math.round(normalized);
}

function baseFacing(item: FurnitureItem): Point {
  const rad = (item.rotation * Math.PI) / 180;
  // Local +y (front) in world coordinates.
  return { x: -Math.sin(rad), y: Math.cos(rad) };
}

/* ------------------------------------------------------------------ */
/* Validity + shared scoring                                          */
/* ------------------------------------------------------------------ */

interface ValidityArgs {
  obb: Obb;
  sku: FurnitureSku;
  ctx: RoomContext;
  placed: PlacedRecord[];
  obstacles: Obstacle[];
  edge?: RoomEdge;
  allowDoorOverlap?: boolean;
}

function isValidPlacement(args: ValidityArgs): boolean {
  const { obb, sku, ctx } = args;
  if (!obbInsidePolygon(obb, ctx.room.polygon)) return false;
  if (!sku.collisionExempt) {
    for (const record of args.placed) {
      if (record.sku.collisionExempt) continue;
      if (obbOverlaps(obb, record.obb)) return false;
    }
    for (const obstacle of args.obstacles) {
      if (obstacle.collisionExempt) continue;
      if (obbOverlaps(obb, obstacle.obb)) return false;
    }
  }
  if (!args.allowDoorOverlap) {
    for (const door of ctx.doors) {
      const clearance = doorClearance(door);
      if (obbCircleOverlaps(obb, clearance.center, clearance.radius)) return false;
    }
  }
  if (args.edge) {
    // Do not block door openings and (for tall items) windows.
    for (const opening of ctx.doors) {
      const span = openingSpanOnEdge(opening, args.edge, opening.wallThickness);
      if (!span) continue;
      const itemSpan = itemSpanOnEdge(obb, args.edge);
      if (intervalOverlap(span, itemSpan, 0.01) > 0) return false;
    }
    if (sku.h >= 1200) {
      for (const opening of ctx.windows) {
        const span = openingSpanOnEdge(opening, args.edge, opening.wallThickness);
        if (!span) continue;
        const itemSpan = itemSpanOnEdge(obb, args.edge);
        if (intervalOverlap(span, itemSpan, 0.01) > 0 && sku.h > opening.sill) return false;
      }
    }
  }
  return true;
}

function itemSpanOnEdge(obb: Obb, edge: RoomEdge): Span {
  const half = obb.w / 2 / edge.length;
  const projection = projectOntoEdge({ x: obb.cx, y: obb.cy }, edge);
  const t = projection?.t ?? 0;
  return { start: Math.max(0, t - half), end: Math.min(1, t + half) };
}

function intervalOverlap(a: Span, b: Span, tolerance = 0): number {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start) - tolerance;
}

function clearanceScore(obb: Obb, placed: PlacedRecord[], obstacles: Obstacle[]): number {
  let best = Infinity;
  for (const record of placed) {
    if (record.sku.collisionExempt) continue;
    best = Math.min(best, obbDistance(obb, record.obb));
  }
  for (const obstacle of obstacles) {
    if (obstacle.collisionExempt) continue;
    best = Math.min(best, obbDistance(obb, obstacle.obb));
  }
  if (!Number.isFinite(best)) return 6;
  if (best >= 600) return 6 + Math.min(best, 1600) / 400;
  return (best / 600) * 6;
}

function doorDistanceScore(obb: Obb, ctx: RoomContext): number {
  let best = Infinity;
  for (const door of ctx.doors) {
    const clearance = doorClearance(door);
    const d = distance({ x: obb.cx, y: obb.cy }, clearance.center) - clearance.radius;
    best = Math.min(best, d);
  }
  if (!Number.isFinite(best)) return 3;
  return Math.max(-8, Math.min(4, best / 500));
}

function windowScore(edge: RoomEdge, ctx: RoomContext): number {
  for (const window of ctx.windows) {
    const span = openingSpanOnEdge(window, edge, 120);
    if (span) return 6;
  }
  return 0;
}

function wallPreferenceScore(
  args: PlaceArgs,
  edge: RoomEdge,
  t: number,
): number {
  const { slot, placed, ctx } = args;
  let score = 0;
  switch (slot.wallPreference) {
    case 'longest':
      score += (edge.length / 1000) * 4;
      break;
    case 'shortest':
      score -= (edge.length / 1000) * 2;
      break;
    case 'opposite-door': {
      let minDist = Infinity;
      for (const door of ctx.doors) {
        minDist = Math.min(minDist, distance(edge.mid, doorClearance(door).center));
      }
      score += Number.isFinite(minDist) ? Math.min(minDist, 4000) / 1000 : 0;
      break;
    }
    case 'opposite-anchor': {
      const anchor = placed.find((record) => record.role === slot.anchor);
      if (anchor) {
        const dot = edge.normal.x * anchor.facing.x + edge.normal.y * anchor.facing.y;
        score += dot < -0.6 ? 22 : dot > 0.6 ? -16 : 0;
        score += Math.min(distance(edge.mid, { x: anchor.item.x, y: anchor.item.y }), 6000) / 1200;
      }
      break;
    }
    case 'window':
      score += windowScore(edge, ctx);
      break;
    default:
      break;
  }
  if (slot.centerOnWall) {
    score += (0.5 - Math.abs(t - 0.5)) * 60;
  } else {
    score += (0.5 - Math.abs(t - 0.5)) * 8;
  }
  if (slot.tall || args.sku.h >= 1600) {
    score -= Math.max(0, windowScore(edge, ctx)) * 2;
  }
  return score;
}

/* ------------------------------------------------------------------ */
/* Wall candidates                                                    */
/* ------------------------------------------------------------------ */

function wallCandidates(args: PlaceArgs): Candidate[] {
  const { slot, sku, ctx } = args;
  const candidates: Candidate[] = [];
  const baseT = slot.centerOnWall
    ? [0.5, 0.44, 0.56, 0.38, 0.62, 0.3, 0.7, 0.22, 0.78]
    : [0.5, 0.36, 0.64, 0.24, 0.76, 0.14, 0.86, 0.08, 0.92];
  const tValues =
    args.briefPriority >= 4 ? [...baseT, 0.05, 0.95, 0.12, 0.88] : baseT;
  const gap = 10;
  for (const edge of ctx.edges) {
    if (edge.length < sku.w + 80) continue;
    const rotation = rotationFacingWall(edge);
    const facing = edge.normal;
    for (const t of tValues) {
      const wallPoint = edgePoint(edge, t);
      const cx = wallPoint.x + facing.x * (sku.d / 2 + gap);
      const cy = wallPoint.y + facing.y * (sku.d / 2 + gap);
      const obb: Obb = { cx, cy, w: sku.w, d: sku.d, rotation };
      if (
        !isValidPlacement({
          obb,
          sku,
          ctx,
          placed: args.placed,
          obstacles: args.obstacles,
          edge,
        })
      ) {
        continue;
      }
      let score =
        wallPreferenceScore(args, edge, t) +
        clearanceScore(obb, args.placed, args.obstacles) +
        doorDistanceScore(obb, ctx) +
        tieBreak(args, `${edge.mid.x},${edge.mid.y},${t.toFixed(2)}`);
      if (edge.length < sku.w + 300) score -= 2;
      const item = itemFor(args, cx, cy, rotation);
      candidates.push({ item, obb, edge, facing, score });
    }
  }
  return candidates;
}

/* ------------------------------------------------------------------ */
/* Corner candidates                                                  */
/* ------------------------------------------------------------------ */

function cornerCandidates(args: PlaceArgs): Candidate[] {
  const { slot, sku, ctx } = args;
  const candidates: Candidate[] = [];
  const tValues = [0.14, 0.86, 0.26, 0.74];
  for (const edge of ctx.edges) {
    if (edge.length < sku.w + 120) continue;
    const rotation = rotationFacingWall(edge);
    for (const t of tValues) {
      const wallPoint = edgePoint(edge, t);
      const gap = 30;
      const cx = wallPoint.x + edge.normal.x * (sku.d / 2 + gap);
      const cy = wallPoint.y + edge.normal.y * (sku.d / 2 + gap);
      const obb: Obb = { cx, cy, w: sku.w, d: sku.d, rotation };
      if (
        !isValidPlacement({
          obb,
          sku,
          ctx,
          placed: args.placed,
          obstacles: args.obstacles,
          edge,
        })
      ) {
        continue;
      }
      let score =
        clearanceScore(obb, args.placed, args.obstacles) +
        doorDistanceScore(obb, ctx) +
        cornerBonus(obb, ctx) +
        tieBreak(args, `${edge.mid.x},${edge.mid.y},${t.toFixed(2)}`);
      if (slot.side === 'right') score += 1;
      const item = itemFor(args, cx, cy, rotation);
      candidates.push({ item, obb, edge, facing: edge.normal, score });
    }
  }
  return candidates;
}

function cornerBonus(obb: Obb, ctx: RoomContext): number {
  let best = Infinity;
  for (const vertex of ctx.room.polygon) {
    best = Math.min(best, distance({ x: obb.cx, y: obb.cy }, vertex));
  }
  return Number.isFinite(best) ? Math.max(0, 6 - best / 500) : 0;
}

/* ------------------------------------------------------------------ */
/* Center candidates                                                  */
/* ------------------------------------------------------------------ */

function centerCandidates(args: PlaceArgs): Candidate[] {
  const { sku, ctx } = args;
  const candidates: Candidate[] = [];
  const bbox = ctx.room.polygon;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of bbox) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const rotation = width >= height ? 0 : 90;
  const positions: Point[] = [
    ctx.labelPoint,
    ctx.bboxCenter,
    { x: ctx.labelPoint.x, y: ctx.bboxCenter.y },
    { x: ctx.bboxCenter.x, y: ctx.labelPoint.y },
  ];
  for (const position of positions) {
    const obb: Obb = { cx: position.x, cy: position.y, w: sku.w, d: sku.d, rotation };
    if (!isValidPlacement({ obb, sku, ctx, placed: args.placed, obstacles: args.obstacles })) {
      continue;
    }
    const score =
      clearanceScore(obb, args.placed, args.obstacles) +
      doorDistanceScore(obb, ctx) -
      distance(position, ctx.labelPoint) / 800 +
      tieBreak(args, `${position.x},${position.y}`);
    const item = itemFor(args, position.x, position.y, rotation);
    candidates.push({ item, obb, facing: baseFacing(item), score });
  }
  return candidates;
}

/* ------------------------------------------------------------------ */
/* Relative candidates                                                */
/* ------------------------------------------------------------------ */

function anchorRecord(args: PlaceArgs): PlacedRecord | undefined {
  return args.placed.find((record) => record.role === args.slot.anchor);
}

function frontCandidates(args: PlaceArgs): Candidate[] {
  const { slot, sku, ctx } = args;
  const anchor = anchorRecord(args);
  if (!anchor) return [];
  const candidates: Candidate[] = [];
  const facing = anchor.facing;
  const gaps = [slot.gap ?? 300, (slot.gap ?? 300) + 80, (slot.gap ?? 300) - 80, (slot.gap ?? 300) + 180];
  for (const gap of gaps) {
    const offset = sku.collisionExempt
      ? anchor.item.d / 2 + gap
      : anchor.item.d / 2 + gap + sku.d / 2;
    const cx = anchor.item.x + facing.x * offset;
    const cy = anchor.item.y + facing.y * offset;
    const rotation = anchor.item.rotation;
    const obb: Obb = { cx, cy, w: sku.w, d: sku.d, rotation };
    if (!isValidPlacement({ obb, sku, ctx, placed: args.placed, obstacles: args.obstacles })) {
      continue;
    }
    const score =
      clearanceScore(obb, args.placed, args.obstacles) +
      doorDistanceScore(obb, ctx) -
      Math.abs(gap - (slot.gap ?? 300)) / 60 +
      tieBreak(args, `front-${gap}`);
    const item = itemFor(args, cx, cy, rotation);
    candidates.push({ item, obb, facing, score });
  }
  return candidates;
}

function besideCandidates(args: PlaceArgs): Candidate[] {
  const { slot, sku, ctx } = args;
  const anchor = anchorRecord(args);
  if (!anchor) return [];
  const sign = slot.side === 'right' ? 1 : -1;
  const candidates: Candidate[] = [];
  const gap = slot.gap ?? 60;
  if (anchor.edge) {
    const edge = anchor.edge;
    const anchorProjection = projectOntoEdge(
      { x: anchor.item.x, y: anchor.item.y },
      edge,
    );
    const tBase = anchorProjection?.t ?? 0.5;
    const lateral = (anchor.item.w / 2 + gap + sku.w / 2) / edge.length;
    const t = tBase + sign * lateral;
    if (t < 0.02 || t > 0.98) return [];
    const rotation = rotationFacingWall(edge);
    const wallPoint = edgePoint(edge, t);
    const cx = wallPoint.x + edge.normal.x * (sku.d / 2 + 10);
    const cy = wallPoint.y + edge.normal.y * (sku.d / 2 + 10);
    const obb: Obb = { cx, cy, w: sku.w, d: sku.d, rotation };
    if (isValidPlacement({ obb, sku, ctx, placed: args.placed, obstacles: args.obstacles, edge })) {
      const score =
        clearanceScore(obb, args.placed, args.obstacles) +
        doorDistanceScore(obb, ctx) +
        tieBreak(args, `side-${sign}`);
      const item = itemFor(args, cx, cy, rotation);
      candidates.push({ item, obb, edge, facing: edge.normal, score });
    }
    return candidates;
  }
  // Anchor in the room centre: offset sideways along its local x axis.
  const rad = (anchor.item.rotation * Math.PI) / 180;
  const axis = { x: Math.cos(rad), y: Math.sin(rad) };
  const offset = anchor.item.w / 2 + gap + sku.w / 2;
  const cx = anchor.item.x + sign * axis.x * offset;
  const cy = anchor.item.y + sign * axis.y * offset;
  const obb: Obb = { cx, cy, w: sku.w, d: sku.d, rotation: anchor.item.rotation };
  if (isValidPlacement({ obb, sku, ctx, placed: args.placed, obstacles: args.obstacles })) {
    const item = itemFor(args, cx, cy, anchor.item.rotation);
    candidates.push({
      item,
      obb,
      facing: baseFacing(item),
      score: clearanceScore(obb, args.placed, args.obstacles) + tieBreak(args, 'side-centre'),
    });
  }
  return candidates;
}

function aroundPlacements(args: PlaceArgs): PlacedRecord[] {
  const { slot, sku, ctx } = args;
  const anchor = anchorRecord(args);
  if (!anchor) return [];
  const count = Math.max(1, slot.count ?? 4);
  const gap = slot.gap ?? 80;
  const rad = (anchor.item.rotation * Math.PI) / 180;
  const xAxis = { x: Math.cos(rad), y: Math.sin(rad) };
  const yAxis = { x: -Math.sin(rad), y: Math.cos(rad) };
  interface Spot {
    center: Point;
    rotation: number;
    key: string;
  }
  const spots: Spot[] = [];
  if (count === 1) {
    const offset = anchor.item.d / 2 + gap + sku.d / 2;
    spots.push({
      center: {
        x: anchor.item.x + anchor.facing.x * offset,
        y: anchor.item.y + anchor.facing.y * offset,
      },
      rotation: anchor.item.rotation + 180,
      key: 'front',
    });
  } else {
    const lateral = count >= 6 ? anchor.item.w / 4 : 0;
    const depthOffset = anchor.item.d / 2 + gap + sku.d / 2;
    const widthOffset = anchor.item.w / 2 + gap + sku.w / 2;
    const push = (direction: Point, distanceOffset: number, rotation: number, lateralOffset: number, key: string) => {
      const base = {
        x: anchor.item.x + direction.x * distanceOffset,
        y: anchor.item.y + direction.y * distanceOffset,
      };
      spots.push({
        center: { x: base.x + xAxis.x * lateralOffset, y: base.y + xAxis.y * lateralOffset },
        rotation,
        key,
      });
    };
    if (count >= 6) {
      for (const side of [-1, 1]) {
        for (const lateralSign of [-1, 1]) {
          push(yAxis, side * depthOffset, anchor.item.rotation + (side > 0 ? 180 : 0), lateralSign * lateral, `${side}-${lateralSign}`);
        }
      }
    } else {
      push(yAxis, depthOffset, anchor.item.rotation + 180, 0, 'south');
      push(yAxis, -depthOffset, anchor.item.rotation, 0, 'north');
    }
    push(xAxis, widthOffset, anchor.item.rotation + 90, 0, 'east');
    push(xAxis, -widthOffset, anchor.item.rotation - 90, 0, 'west');
  }
  const records: PlacedRecord[] = [];
  for (const spot of spots) {
    const obb: Obb = {
      cx: Math.round(spot.center.x),
      cy: Math.round(spot.center.y),
      w: sku.w,
      d: sku.d,
      rotation: spot.rotation,
    };
    if (!isValidPlacement({ obb, sku, ctx, placed: [...args.placed, ...records], obstacles: args.obstacles })) {
      continue;
    }
    const item = itemFor(args, spot.center.x, spot.center.y, spot.rotation);
    records.push({
      role: `${slot.role}-${spot.key}`,
      sku,
      item,
      obb: { ...obb, cx: item.x, cy: item.y },
      facing: baseFacing(item),
    });
  }
  return records;
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

function tieBreak(args: PlaceArgs, key: string): number {
  const value = (hashString(`${args.seed}:${args.slot.role}:${key}`) % 997) / 9970;
  args.rng();
  return value;
}

function roomTypeLabel(type: RoomType): string {
  const labels: Record<RoomType, string> = {
    living: '客厅',
    'master-bedroom': '主卧',
    bedroom: '次卧',
    'kids-room': '儿童房',
    dining: '餐厅',
    kitchen: '厨房',
    bath: '卫生间',
    balcony: '阳台',
    entry: '玄关',
    study: '书房',
    corridor: '走廊',
    other: '其他空间',
  };
  return labels[type] ?? '空间';
}

/* Re-export helpers used by tests. */
export { roomEdges, edgesByLength };
