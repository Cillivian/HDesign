import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFurnitureItem,
  createOpening,
  createRoom,
  createWall,
  distanceToSegment,
  pointInPolygon,
  polygonAreaSqm,
  MEP_KINDS,
  type FurnitureItem,
  type MepDevice,
  type OpeningKind,
  type Point,
  type Project,
  type RoomType,
  type Wall,
} from '@hdesign/domain';
import { getFurnitureSku } from '@hdesign/catalog';
import { generateLayout, generateMep, type LayoutResult, type MepResult } from '../src';

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

interface RoomSpec {
  id?: string;
  type: RoomType;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door?: { side: 'top' | 'bottom' | 'left' | 'right'; offset: number; width: number };
  window?: { side: 'top' | 'bottom' | 'left' | 'right'; offset: number; width: number; sill?: number };
  furniture?: FurnitureItem[];
}

const WALL = 200;

function buildProject(specs: RoomSpec[], name = '自动布置测试'): Project {
  const project = createEmptyProject(name);
  const walls: Wall[] = [];
  const openings: Project['openings'] = [];
  specs.forEach((spec, index) => {
    const roomId = spec.id ?? `room-${index}`;
    const half = WALL / 2;
    const top = createWall({ x: spec.x - half, y: spec.y - half }, { x: spec.x + spec.w + half, y: spec.y - half }, { id: `${roomId}-top`, thickness: WALL });
    const bottom = createWall({ x: spec.x - half, y: spec.y + spec.h + half }, { x: spec.x + spec.w + half, y: spec.y + spec.h + half }, { id: `${roomId}-bottom`, thickness: WALL });
    const left = createWall({ x: spec.x - half, y: spec.y - half }, { x: spec.x - half, y: spec.y + spec.h + half }, { id: `${roomId}-left`, thickness: WALL });
    const right = createWall({ x: spec.x + spec.w + half, y: spec.y - half }, { x: spec.x + spec.w + half, y: spec.y + spec.h + half }, { id: `${roomId}-right`, thickness: WALL });
    walls.push(top, bottom, left, right);
    project.rooms.push(
      createRoom(
        [
          { x: spec.x, y: spec.y },
          { x: spec.x + spec.w, y: spec.y },
          { x: spec.x + spec.w, y: spec.y + spec.h },
          { x: spec.x, y: spec.y + spec.h },
        ],
        {
          id: roomId,
          type: spec.type,
          name: spec.name ?? spec.type,
          floorMaterialId: 'floor-oak',
          wallMaterialId: 'wall-latex-warm',
        },
      ),
    );
    const addOpening = (
      side: 'top' | 'bottom' | 'left' | 'right',
      kind: OpeningKind,
      offset: number,
      width: number,
      extras: { sill?: number } = {},
    ) => {
      const wall = side === 'top' ? top : side === 'bottom' ? bottom : side === 'left' ? left : right;
      openings.push(createOpening(wall, kind, offset, width, extras));
    };
    if (spec.door) addOpening(spec.door.side, 'door', spec.door.offset, spec.door.width);
    if (spec.window) addOpening(spec.window.side, 'window', spec.window.offset, spec.window.width, { sill: spec.window.sill });
    for (const item of spec.furniture ?? []) project.furniture.push({ ...item, roomId });
  });
  project.walls = walls;
  project.openings = openings;
  return project;
}

function furn(
  skuId: string,
  x: number,
  y: number,
  overrides: Partial<FurnitureItem> = {},
): FurnitureItem {
  const sku = getFurnitureSku(skuId)!;
  return createFurnitureItem({
    skuId,
    name: sku.name,
    x,
    y,
    w: sku.w,
    d: sku.d,
    h: sku.h,
    rotation: 0,
    color: sku.color,
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */
/* Independent geometry checks (do not reuse autolayout internals)    */
/* ------------------------------------------------------------------ */

function corners(item: FurnitureItem): Point[] {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = item.w / 2;
  const hd = item.d / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((point) => ({
    x: item.x + point.x * cos - point.y * sin,
    y: item.y + point.x * sin + point.y * cos,
  }));
}

function axes(item: FurnitureItem): Point[] {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ];
}

function overlaps(a: FurnitureItem, b: FurnitureItem): boolean {
  const axesAB = [...axes(a), ...axes(b)];
  const cornersA = corners(a);
  const cornersB = corners(b);
  for (const axis of axesAB) {
    const project = (points: Point[]) => {
      let min = Infinity;
      let max = -Infinity;
      for (const point of points) {
        const value = point.x * axis.x + point.y * axis.y;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return [min, max] as const;
    };
    const [minA, maxA] = project(cornersA);
    const [minB, maxB] = project(cornersB);
    if (maxA <= minB + 0.5 || maxB <= minA + 0.5) return false;
  }
  return true;
}

function insideRoom(item: FurnitureItem, polygon: Point[]): boolean {
  for (const corner of corners(item)) if (!pointInPolygon(corner, polygon)) return false;
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.2, 0.5, 0.8]) {
      const rad = (item.rotation * Math.PI) / 180;
      const lx = (fx - 0.5) * item.w;
      const ly = (fy - 0.5) * item.d;
      const point = {
        x: item.x + lx * Math.cos(rad) - ly * Math.sin(rad),
        y: item.y + lx * Math.sin(rad) + ly * Math.cos(rad),
      };
      if (!pointInPolygon(point, polygon)) return false;
    }
  }
  return true;
}

function distanceToWallFace(item: FurnitureItem, polygon: Point[]): number {
  let best = Infinity;
  for (const corner of corners(item)) {
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      best = Math.min(best, distanceToSegment(corner, a, b));
    }
  }
  return best;
}

function circleAgainstItem(item: FurnitureItem, center: Point, radius: number): boolean {
  const rad = (-item.rotation * Math.PI) / 180;
  const dx = center.x - item.x;
  const dy = center.y - item.y;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  const clampX = Math.max(-item.w / 2, Math.min(item.w / 2, localX));
  const clampY = Math.max(-item.d / 2, Math.min(item.d / 2, localY));
  return Math.hypot(localX - clampX, localY - clampY) < radius;
}

function isExempt(item: FurnitureItem): boolean {
  return getFurnitureSku(item.skuId)?.collisionExempt === true;
}

function doorHinges(project: Project): Array<{ center: Point; radius: number }> {
  const wallById = new Map(project.walls.map((wall) => [wall.id, wall]));
  const result: Array<{ center: Point; radius: number }> = [];
  for (const opening of project.openings) {
    if (opening.kind !== 'door') continue;
    const wall = wallById.get(opening.wallId);
    if (!wall) continue;
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
    const pointAt = (offset: number) => {
      const t = Math.max(0, Math.min(1, offset / length));
      return { x: wall.a.x + (wall.b.x - wall.a.x) * t, y: wall.a.y + (wall.b.y - wall.a.y) * t };
    };
    const hingeOffset = opening.swing.hinge === 'start' ? opening.offset : opening.offset + opening.width;
    result.push({ center: pointAt(hingeOffset), radius: opening.width });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Layout tests                                                       */
/* ------------------------------------------------------------------ */

function livingProject(): Project {
  return buildProject([
    {
      id: 'room-living',
      type: 'living',
      name: '客厅',
      x: 200,
      y: 200,
      w: 5000,
      h: 3800,
      door: { side: 'bottom', offset: 600, width: 900 },
      window: { side: 'top', offset: 1200, width: 1800 },
    },
  ]);
}

describe('generateLayout', () => {
  it('is deterministic for the same project and seed', () => {
    const project = livingProject();
    const first = generateLayout(project, { styleId: 'modern-minimal', mode: 'replace', seed: 42 });
    const second = generateLayout(project, { styleId: 'modern-minimal', mode: 'replace', seed: 42 });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.furniture.length).toBeGreaterThan(0);
  });

  it('places a living room programme without overlap, outside walls or door swing', () => {
    const project = livingProject();
    const result = generateLayout(project, { styleId: 'modern-minimal', mode: 'replace' });
    const room = project.rooms[0]!;
    expect(result.furniture.length).toBeGreaterThanOrEqual(4);
    checkResult(project, result, room.polygon);
    const skus = new Set(result.furniture.map((item) => item.skuId));
    expect(skus.has('sofa-3') || skus.has('sofa-2') || skus.has('sofa-module')).toBe(true);
    expect(skus.has('coffee-table') || skus.has('coffee-table-round')).toBe(true);
  });

  it('furnishes a bedroom with bed, nightstands and wardrobe', () => {
    const project = buildProject([
      {
        id: 'room-bed',
        type: 'master-bedroom',
        name: '主卧',
        x: 200,
        y: 200,
        w: 4000,
        h: 3600,
        door: { side: 'bottom', offset: 300, width: 900 },
        window: { side: 'top', offset: 800, width: 1500 },
      },
    ]);
    const result = generateLayout(project, { styleId: 'cream', mode: 'replace' });
    checkResult(project, result, project.rooms[0]!.polygon);
    const skus = result.furniture.map((item) => item.skuId);
    expect(skus.some((id) => id.startsWith('bed'))).toBe(true);
    expect(skus.filter((id) => id === 'nightstand').length).toBeGreaterThanOrEqual(1);
    expect(skus.some((id) => id.startsWith('wardrobe'))).toBe(true);
  });

  it('puts kitchen counters and fridge against walls', () => {
    const project = buildProject([
      {
        id: 'room-kitchen',
        type: 'kitchen',
        name: '厨房',
        x: 200,
        y: 200,
        w: 3600,
        h: 3000,
        door: { side: 'bottom', offset: 400, width: 800 },
        window: { side: 'top', offset: 900, width: 1200 },
      },
    ]);
    const result = generateLayout(project, { styleId: 'modern-minimal', mode: 'replace' });
    checkResult(project, result, project.rooms[0]!.polygon);
    const polygon = project.rooms[0]!.polygon;
    for (const skuId of ['kitchen-counter', 'fridge']) {
      const item = result.furniture.find((entry) => entry.skuId === skuId);
      expect(item, skuId).toBeDefined();
      expect(distanceToWallFace(item!, polygon)).toBeLessThan(120);
    }
  });

  it('supports roomIds filtering and replace semantics', () => {
    const project = buildProject([
      { id: 'room-a', type: 'living', x: 200, y: 200, w: 4600, h: 3400, door: { side: 'bottom', offset: 400, width: 900 } },
      { id: 'room-b', type: 'master-bedroom', x: 5200, y: 200, w: 4000, h: 3400, door: { side: 'bottom', offset: 400, width: 900 } },
    ]);
    const result = generateLayout(project, {
      styleId: 'modern-minimal',
      mode: 'replace',
      roomIds: ['room-b'],
    });
    expect(result.furniture.length).toBeGreaterThan(0);
    expect(result.furniture.every((item) => item.roomId === 'room-b')).toBe(true);
  });

  it('avoids existing furniture in fill-empty mode', () => {
    const project = livingProject();
    const blocker = getFurnitureSku('sofa-3')!;
    project.furniture.push(furn('sofa-3', 2700, 2500, { rotation: 0 }));
    expect(blocker.w).toBeGreaterThan(0);
    const result = generateLayout(project, { styleId: 'modern-minimal', mode: 'fill-empty' });
    for (const item of result.furniture) {
      if (isExempt(item)) continue;
      for (const existing of project.furniture) {
        if (isExempt(existing)) continue;
        expect(overlaps(item, existing), `${item.skuId} overlaps existing ${existing.skuId}`).toBe(false);
      }
    }
  });

  it('reports diagnostics for unfittable tiny rooms', () => {
    const project = buildProject([
      { id: 'room-tiny', type: 'living', x: 200, y: 200, w: 1200, h: 1000, door: { side: 'bottom', offset: 200, width: 700 } },
    ]);
    const result = generateLayout(project, { styleId: 'modern-minimal', mode: 'replace' });
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.furniture.length).toBe(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

function checkResult(project: Project, result: LayoutResult, polygon: Point[]): void {
  const roomById = new Map(project.rooms.map((room) => [room.id, room]));
  for (const item of result.furniture) {
    const room = item.roomId ? roomById.get(item.roomId) : undefined;
    expect(room, `furniture ${item.id} has no room`).toBeDefined();
    expect(insideRoom(item, room!.polygon), `${item.skuId} outside room`).toBe(true);
    expect(item.w).toBeGreaterThan(0);
    expect(item.id.length).toBeGreaterThan(0);
  }
  for (let i = 0; i < result.furniture.length; i += 1) {
    for (let j = i + 1; j < result.furniture.length; j += 1) {
      const a = result.furniture[i]!;
      const b = result.furniture[j]!;
      if (a.roomId !== b.roomId) continue;
      if (isExempt(a) || isExempt(b)) continue;
      expect(overlaps(a, b), `${a.skuId} overlaps ${b.skuId}`).toBe(false);
    }
  }
  for (const door of doorHinges(project)) {
    for (const item of result.furniture) {
      if (isExempt(item)) continue;
      expect(
        circleAgainstItem(item, door.center, door.radius),
        `${item.skuId} blocks door swing`,
      ).toBe(false);
    }
  }
  void polygon;
  void polygonAreaSqm;
}

/* ------------------------------------------------------------------ */
/* MEP tests                                                          */
/* ------------------------------------------------------------------ */

function mepProject(): Project {
  const kitchenFurniture = [
    furn('kitchen-counter', 1800, 4700, { roomId: 'room-kitchen', rotation: 0, w: 2400, d: 600 }),
    furn('fridge', 3000, 6900, { roomId: 'room-kitchen', w: 700, d: 650, h: 1800 }),
    furn('sink', 1200, 4740, { roomId: 'room-kitchen', rotation: 0 }),
    furn('stove', 2400, 4740, { roomId: 'room-kitchen', rotation: 0 }),
    furn('range-hood', 2400, 4600, { roomId: 'room-kitchen', rotation: 0 }),
  ];
  const bathFurniture = [
    furn('shower', 5000, 4800, { roomId: 'room-bath' }),
    furn('toilet', 6500, 4800, { roomId: 'room-bath' }),
    furn('vanity', 5800, 6800, { roomId: 'room-bath', rotation: 0 }),
    furn('water-heater', 5000, 4600, { roomId: 'room-bath' }),
  ];
  const bedroomFurniture = [
    furn('bed-double', 7600, 1700, { roomId: 'room-bed' }),
    furn('nightstand', 6700, 1000, { roomId: 'room-bed' }),
    furn('nightstand', 8500, 1000, { roomId: 'room-bed' }),
    furn('wardrobe', 8500, 3700, { roomId: 'room-bed', rotation: 0 }),
  ];
  const project = buildProject([
    {
      id: 'room-living',
      type: 'living',
      name: '客厅',
      x: 200,
      y: 200,
      w: 5200,
      h: 3800,
      door: { side: 'left', offset: 2200, width: 900 },
      window: { side: 'top', offset: 1500, width: 2000 },
      furniture: [furn('sofa-3', 2700, 900, { roomId: 'room-living' }), furn('tv-cabinet', 2700, 3400, { roomId: 'room-living' })],
    },
    {
      id: 'room-bed',
      type: 'master-bedroom',
      name: '主卧',
      x: 5600,
      y: 200,
      w: 4000,
      h: 3800,
      door: { side: 'bottom', offset: 300, width: 900 },
      window: { side: 'top', offset: 1200, width: 1500 },
      furniture: bedroomFurniture,
    },
    {
      id: 'room-kitchen',
      type: 'kitchen',
      name: '厨房',
      x: 200,
      y: 4400,
      w: 3600,
      h: 3000,
      door: { side: 'right', offset: 1200, width: 800 },
      window: { side: 'top', offset: 1200, width: 1200 },
      furniture: kitchenFurniture,
    },
    {
      id: 'room-bath',
      type: 'bath',
      name: '卫生间',
      x: 4600,
      y: 4400,
      w: 2400,
      h: 2800,
      door: { side: 'left', offset: 1000, width: 700 },
      window: { side: 'bottom', offset: 600, width: 600, sill: 1500 },
      furniture: bathFurniture,
    },
  ]);
  project.mep.circuits = [
    { id: 'circuit-lighting', name: '照明', wire: '1.5', amp: 10, color: '#C98A1C', deviceIds: [] },
    { id: 'circuit-general', name: '普通插座', wire: '2.5', amp: 16, color: '#B57A12', deviceIds: [] },
    { id: 'circuit-kitchen', name: '厨房', wire: '4', amp: 20, color: '#C4442B', deviceIds: [] },
    { id: 'circuit-ac', name: '空调', wire: '4', amp: 20, color: '#2E6FA3', deviceIds: [] },
    { id: 'circuit-bath', name: '卫浴', wire: '4', amp: 20, color: '#2F6B57', deviceIds: [] },
  ];
  return project;
}

function devicesFor(result: MepResult, roomId: string): MepDevice[] {
  return result.devices.filter((device) => device.roomId === roomId);
}

describe('generateMep', () => {
  it('is deterministic', () => {
    const project = mepProject();
    const first = generateMep(project, { mode: 'replace' });
    const second = generateMep(project, { mode: 'replace' });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.devices.length).toBeGreaterThan(0);
  });

  it('places every device inside its room polygon', () => {
    const project = mepProject();
    const result = generateMep(project, { mode: 'replace' });
    for (const device of result.devices) {
      const room = project.rooms.find((entry) => entry.id === device.roomId);
      expect(room, `device ${device.id} without room`).toBeDefined();
      expect(pointInPolygon({ x: device.x, y: device.y }, room!.polygon), `${device.kind} outside room`).toBe(true);
      expect(MEP_KINDS as readonly string[]).toContain(device.kind);
    }
  });

  it('kitchen: counter sockets at 1100, fridge/hood dedicated, water points and drain', () => {
    const result = generateMep(mepProject(), { mode: 'replace' });
    const devices = devicesFor(result, 'room-kitchen');
    const sockets = devices.filter((device) => device.kind === 'socket');
    expect(sockets.length).toBeGreaterThanOrEqual(4);
    expect(sockets.every((device) => device.height === 1100)).toBe(true);
    const dedicated = devices.filter((device) => device.kind === 'socket-16a');
    expect(dedicated.some((device) => device.height === 300)).toBe(true);
    expect(dedicated.some((device) => device.height === 2200)).toBe(true);
    expect(devices.find((device) => device.kind === 'water-cold')?.height).toBe(500);
    expect(devices.find((device) => device.kind === 'water-hot')?.height).toBe(500);
    expect(devices.find((device) => device.kind === 'drain')?.height).toBe(300);
    expect(devices.find((device) => device.kind === 'floor-drain')?.height).toBe(0);
    expect(devices.find((device) => device.kind === 'gas')?.height).toBe(1100);
    expect(devices.find((device) => device.kind === 'switch')?.height).toBe(1300);
    expect(devices.find((device) => device.kind === 'light')?.height).toBe(2800);
    expect(sockets[0]?.circuitId).toBe('circuit-kitchen');
  });

  it('bath: waterproof sockets, water points and floor drain', () => {
    const result = generateMep(mepProject(), { mode: 'replace' });
    const devices = devicesFor(result, 'room-bath');
    const socket = devices.find((device) => device.kind === 'socket');
    expect(socket?.height).toBe(1300);
    expect(socket?.waterproof).toBe(true);
    expect(devices.find((device) => device.kind === 'socket-16a')?.height).toBe(1800);
    expect(devices.find((device) => device.kind === 'water-cold')?.height).toBe(500);
    expect(devices.find((device) => device.kind === 'water-hot')?.height).toBe(500);
    expect(devices.find((device) => device.kind === 'floor-drain')?.height).toBe(0);
    expect(devices.find((device) => device.kind === 'switch')?.height).toBe(1300);
    expect(devices.find((device) => device.kind === 'light')?.height).toBe(2800);
  });

  it('bedroom: bedside sockets at 700 and AC at 2200', () => {
    const result = generateMep(mepProject(), { mode: 'replace' });
    const devices = devicesFor(result, 'room-bed');
    const bedside = devices.filter((device) => device.kind === 'socket' && device.height === 700);
    expect(bedside.length).toBeGreaterThanOrEqual(2);
    expect(devices.find((device) => device.kind === 'ac')?.height).toBe(2200);
    const lightSwitch = devices.find(
      (device) => device.kind === 'switch' || device.kind === 'switch-double',
    );
    expect(lightSwitch?.height).toBe(1300);
    expect(devices.find((device) => device.kind === 'light')?.height).toBe(2800);
    expect(devices.find((device) => device.kind === 'ac')?.circuitId).toBe('circuit-ac');
  });

  it('living: TV wall sockets, AC and lighting circuits', () => {
    const result = generateMep(mepProject(), { mode: 'replace' });
    const devices = devicesFor(result, 'room-living');
    expect(devices.filter((device) => device.kind === 'socket').length).toBeGreaterThanOrEqual(3);
    expect(devices.filter((device) => device.kind === 'socket').every((device) => device.height === 300)).toBe(true);
    expect(devices.find((device) => device.kind === 'weak-current')?.height).toBe(300);
    expect(devices.find((device) => device.kind === 'ac')?.height).toBe(2200);
    expect(devices.find((device) => device.kind === 'switch-double')?.height).toBe(1300);
    expect(
      devices.filter((device) => device.kind !== 'weak-current').every((device) => device.circuitId !== undefined),
    ).toBe(true);
    expect(devices.filter((device) => device.circuitId === 'circuit-lighting').length).toBeGreaterThan(0);
  });

  it('fill mode skips kinds already present in a room', () => {
    const project = mepProject();
    const existing = generateMep(project, { mode: 'replace' }).devices.slice(0, 3);
    project.mep.devices = existing;
    const fill = generateMep(project, { mode: 'fill' });
    for (const device of fill.devices) {
      const sameKind = existing.filter(
        (entry) => entry.roomId === device.roomId && entry.kind === device.kind,
      );
      expect(sameKind.length).toBe(0);
    }
  });
});
