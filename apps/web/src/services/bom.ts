import {
  MEP_META,
  polygonAreaSqm,
  polygonPerimeter,
  distanceToPolygonEdge,
  wallLength,
  type FurnitureItem,
  type MepKind,
  type Point,
  type Project,
  type Room,
  type RoomType,
} from '@hdesign/domain';
import { getCatalogMaterial, getCatalogSku, type CatalogMaterial, type CatalogSku } from './ai-design';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type BomCategory = 'floor' | 'wall' | 'ceiling' | 'skirting' | 'furniture' | 'mep';

export interface BomLine {
  id: string;
  category: BomCategory;
  roomId?: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  /** Fraction, e.g. 0.05 = 5% wastage. */
  wastage: number;
  unitPrice: number;
  total: number;
  unitLow: number;
  unitHigh: number;
  totalLow: number;
  totalHigh: number;
  note: string;
}

export interface BomRoom {
  roomId: string;
  roomName: string;
  roomType: RoomType;
  floorAreaSqm: number;
  floorWastage: number;
  wallGrossAreaSqm: number;
  openingAreaSqm: number;
  wallAreaSqm: number;
  ceilingAreaSqm: number;
  skirtingM: number;
  mepCounts: Partial<Record<MepKind, number>>;
  lines: BomLine[];
  subtotal: number;
  range: [number, number];
}

export interface BomTotals {
  floorAreaSqm: number;
  wallAreaSqm: number;
  ceilingAreaSqm: number;
  skirtingM: number;
  furnitureCount: number;
  mepCount: number;
  subtotal: number;
  range: [number, number];
}

export interface Bom {
  projectName: string;
  generatedAt: string;
  currency: 'CNY';
  rooms: BomRoom[];
  /** Project-wide lines (MEP accessories, unassigned furniture). */
  lines: BomLine[];
  totals: BomTotals;
  notes: string[];
}

export interface BomOptions {
  generatedAt?: string;
  /** Override catalogue lookups (tests / custom catalogues). */
  skus?: CatalogSku[];
  materials?: CatalogMaterial[];
}

/* ------------------------------------------------------------------ */
/* Fallback pricing (used until workstream B's catalogue is available) */
/* ------------------------------------------------------------------ */

interface MaterialFallback {
  name: string;
  type: string;
  price: number;
}

const MATERIAL_FALLBACK: Record<string, MaterialFallback> = {
  'floor-oak': { name: '橡木地板', type: 'wood', price: 180 },
  'floor-oak-walnut': { name: '胡桃木地板', type: 'wood', price: 220 },
  'floor-tile-600': { name: '600 地砖', type: 'tile', price: 120 },
  'floor-tile-anti-slip': { name: '防滑地砖', type: 'tile', price: 110 },
  'floor-marble': { name: '大理石地面', type: 'stone', price: 380 },
  'floor-carpet': { name: '满铺地毯', type: 'carpet', price: 90 },
  'wall-latex-warm': { name: '暖白乳胶漆', type: 'paint', price: 35 },
  'wall-latex-grey': { name: '浅灰乳胶漆', type: 'paint', price: 35 },
  'wall-microcement': { name: '微水泥', type: 'microcement', price: 160 },
  'wall-wood-veneer': { name: '木饰面', type: 'wood', price: 260 },
  'wall-tile-matte': { name: '哑光瓷砖', type: 'tile', price: 130 },
  'ceiling-latex': { name: '白色乳胶漆顶面', type: 'paint', price: 30 },
  'ceiling-latex-white': { name: '白色乳胶漆顶面', type: 'paint', price: 30 },
};

const FURNITURE_PRICE_FALLBACK: Record<string, { name: string; range: [number, number] }> = {
  'sofa-3': { name: '三人沙发', range: [6000, 12000] },
  'sofa-2': { name: '双人沙发', range: [4000, 8000] },
  'coffee-table': { name: '茶几', range: [1200, 3000] },
  'tv-cabinet': { name: '电视柜', range: [2000, 4500] },
  rug: { name: '客厅地毯', range: [1500, 4000] },
  'dining-table': { name: '餐桌', range: [2500, 6000] },
  'dining-chair': { name: '餐椅', range: [400, 900] },
  'floor-lamp': { name: '落地灯', range: [600, 1600] },
  plant: { name: '绿植', range: [150, 600] },
  'bed-double': { name: '双人床', range: [5000, 12000] },
  'bed-single': { name: '单人床', range: [3000, 7000] },
  nightstand: { name: '床头柜', range: [500, 1200] },
  wardrobe: { name: '衣柜', range: [4000, 9000] },
  desk: { name: '书桌', range: [1200, 3500] },
  chair: { name: '书椅', range: [600, 1800] },
  'kitchen-counter': { name: '厨房地柜', range: [4000, 9000] },
  fridge: { name: '冰箱', range: [3000, 8000] },
  shower: { name: '淋浴房', range: [2500, 6000] },
  toilet: { name: '马桶', range: [1200, 3500] },
  vanity: { name: '浴室柜', range: [2000, 5000] },
  bookshelf: { name: '书架', range: [1500, 4000] },
};

const MEP_PRICE: Record<MepKind, [number, number]> = {
  socket: [45, 90],
  'socket-16a': [80, 150],
  switch: [50, 100],
  'switch-double': [80, 150],
  light: [120, 400],
  'light-spot': [60, 160],
  ac: [150, 350],
  'weak-current': [40, 90],
  'water-cold': [200, 500],
  'water-hot': [220, 520],
  drain: [120, 300],
  'floor-drain': [60, 160],
  gas: [150, 400],
  'floor-heat': [800, 1800],
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function midpoint(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

function findMaterial(options: BomOptions, materialId: string): CatalogMaterial | undefined {
  if (options.materials) return options.materials.find((material) => material.id === materialId);
  return getCatalogMaterial(materialId);
}

function materialInfo(options: BomOptions, materialId: string): { name: string; type: string; price: number } {
  const fallback = MATERIAL_FALLBACK[materialId];
  const catalogMaterial = findMaterial(options, materialId);
  if (catalogMaterial) {
    return {
      name: catalogMaterial.name,
      type: catalogMaterial.type ?? fallback?.type ?? 'other',
      price: catalogMaterial.pricePerSqm ?? fallback?.price ?? 120,
    };
  }
  if (fallback) return fallback;
  return { name: materialId, type: 'other', price: 120 };
}

function wastageFor(type: string): number {
  const normalized = type.toLowerCase();
  if (normalized === 'wood' || normalized === 'laminate') return 0.05;
  if (normalized === 'tile' || normalized === 'stone' || normalized === 'vinyl') return 0.08;
  return 0.05;
}

function findSku(options: BomOptions, item: FurnitureItem): CatalogSku | undefined {
  if (options.skus) return options.skus.find((sku) => sku.id === item.skuId);
  return getCatalogSku(item.skuId);
}

function furniturePricing(
  options: BomOptions,
  item: FurnitureItem,
): { name: string; range: [number, number] } {
  const sku = findSku(options, item);
  if (sku && sku.priceRange) return { name: sku.name, range: sku.priceRange };
  const fallback = FURNITURE_PRICE_FALLBACK[item.skuId];
  if (fallback) return fallback;
  return { name: item.name, range: [800, 2000] };
}

function lineFrom(
  input: Omit<BomLine, 'total' | 'totalLow' | 'totalHigh' | 'unitLow' | 'unitHigh' | 'unitPrice'> &
    Partial<Pick<BomLine, 'unitLow' | 'unitHigh' | 'unitPrice'>>,
  range: [number, number],
): BomLine {
  const unitLow = input.unitLow ?? range[0];
  const unitHigh = input.unitHigh ?? range[1];
  const unitPrice = input.unitPrice ?? midpoint([unitLow, unitHigh]);
  const qty = round(input.qty, 2);
  return {
    ...input,
    qty,
    unitPrice: round(unitPrice),
    unitLow: round(unitLow),
    unitHigh: round(unitHigh),
    total: round(qty * unitPrice),
    totalLow: round(qty * unitLow),
    totalHigh: round(qty * unitHigh),
  };
}

/** Openings whose wall centre sits on (or within 300mm of) this room's boundary. */
function adjacentOpenings(project: Project, room: Room) {
  return project.openings.filter((opening) => {
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return false;
    const length = wallLength(wall) || 1;
    const t = Math.min(1, Math.max(0, opening.offset / length));
    const center: Point = {
      x: wall.a.x + (wall.b.x - wall.a.x) * t,
      y: wall.a.y + (wall.b.y - wall.a.y) * t,
    };
    return distanceToPolygonEdge(center, room.polygon) <= 300;
  });
}

function roomCeilingHeight(project: Project, room: Room): number {
  if (room.ceiling?.type === 'none') return 0;
  return room.ceiling?.height ?? project.level.height ?? 2800;
}

function floorArea(room: Room): number {
  return polygonAreaSqm(room.polygon);
}

/* ------------------------------------------------------------------ */
/* Builder                                                            */
/* ------------------------------------------------------------------ */

export function buildBom(project: Project, options: BomOptions = {}): Bom {
  const rooms: BomRoom[] = [];
  const sharedLines: BomLine[] = [];
  const notes: string[] = ['单价为当地市场中位估算，不含人工、主材损耗以外的辅材与税费。'];

  const mappableRooms = project.rooms;
  const unassignedFurniture = project.furniture.filter(
    (item) => !item.roomId || !mappableRooms.some((room) => room.id === item.roomId),
  );


  for (const room of mappableRooms) {
    const lines: BomLine[] = [];
    const area = floorArea(room);
    const height = roomCeilingHeight(project, room);
    const perimeter = polygonPerimeter(room.polygon) / 1000;
    const openings = adjacentOpenings(project, room);
    const openingAreaSqm = openings.reduce(
      (sum, opening) => sum + (opening.width / 1000) * (Math.min(opening.height, height || opening.height) / 1000),
      0,
    );
    const doorWidthM = openings
      .filter((opening) => opening.kind === 'door' || opening.kind === 'sliding')
      .reduce((sum, opening) => sum + opening.width / 1000, 0);

    const floorMaterialId = room.floorMaterialId || 'floor-oak';
    const floorMaterial = materialInfo(options, floorMaterialId);
    const floorWastage = wastageFor(floorMaterial.type);
    lines.push(
      lineFrom(
        {
          id: `bom-${room.id}-floor`,
          category: 'floor',
          roomId: room.id,
          name: floorMaterial.name,
          spec: `${floorMaterialId} · 地面铺装`,
          unit: '㎡',
          qty: area * (1 + floorWastage),
          wastage: floorWastage,
          note: `铺装面积 ${round(area, 2)}㎡ × 损耗 ${(floorWastage * 100).toFixed(0)}%`,
        },
        [floorMaterial.price, floorMaterial.price],
      ),
    );

    const wallMaterialId = room.wallMaterialId || 'wall-latex-warm';
    const wallMaterial = materialInfo(options, wallMaterialId);
    const wallGross = perimeter * (height / 1000);
    const wallNet = Math.max(0, wallGross - openingAreaSqm);
    lines.push(
      lineFrom(
        {
          id: `bom-${room.id}-wall`,
          category: 'wall',
          roomId: room.id,
          name: wallMaterial.name,
          spec: `${wallMaterialId} · 墙面`,
          unit: '㎡',
          qty: wallNet * 1.05,
          wastage: 0.05,
          note: `周长 ${round(perimeter, 2)}m × 净高 ${height}mm − 门窗洞口 ${round(openingAreaSqm, 2)}㎡ = 净面积 ${round(wallNet, 2)}㎡`,
        },
        [wallMaterial.price, wallMaterial.price],
      ),
    );

    if (height > 0) {
      const ceilingMaterial = materialInfo(options, 'ceiling-latex-white');
      lines.push(
        lineFrom(
          {
            id: `bom-${room.id}-ceiling`,
            category: 'ceiling',
            roomId: room.id,
            name: ceilingMaterial.name,
            spec: `${room.ceiling?.type === 'coffered' ? '跌级吊顶' : '平顶'} · 顶面`,
            unit: '㎡',
            qty: area * 1.05,
            wastage: 0.05,
            note: room.ceiling?.type === 'coffered' ? '按展开面积估算' : '按地面面积估算',
          },
          [ceilingMaterial.price, ceilingMaterial.price],
        ),
      );
    }

    const skirtingM = Math.max(0, perimeter - doorWidthM);
    if (skirtingM > 0) {
      lines.push(
        lineFrom(
          {
            id: `bom-${room.id}-skirting`,
            category: 'skirting',
            roomId: room.id,
            name: '踢脚线',
            spec: '成品踢脚线 80mm',
            unit: 'm',
            qty: skirtingM * 1.08,
            wastage: 0.08,
            note: `周长 ${round(perimeter, 2)}m − 门洞 ${round(doorWidthM, 2)}m`,
          },
          [28, 65],
        ),
      );
    }

    const roomFurniture = project.furniture.filter((item) => item.roomId === room.id);
    const groups = new Map<string, { item: FurnitureItem; qty: number }>();
    for (const item of roomFurniture) {
      const existing = groups.get(item.skuId);
      if (existing) existing.qty += 1;
      else groups.set(item.skuId, { item, qty: 1 });
    }
    for (const [skuId, group] of groups) {
      const pricing = furniturePricing(options, group.item);
      lines.push(
        lineFrom(
          {
            id: `bom-${room.id}-fur-${skuId}`,
            category: 'furniture',
            roomId: room.id,
            name: pricing.name,
            spec: `${skuId} · 家具`,
            unit: '件',
            qty: group.qty,
            wastage: 0,
            note: group.item.name === pricing.name ? '' : `图纸内名称：${group.item.name}`,
          },
          pricing.range,
        ),
      );
    }

    // Aggregate MEP points per kind (one BOM line per kind avoids duplicate rows).
    const mepCounts: Partial<Record<MepKind, number>> = {};
    const circuitsByKind = new Map<MepKind, Set<string>>();
    for (const device of project.mep.devices) {
      if (device.roomId !== room.id) continue;
      mepCounts[device.kind] = (mepCounts[device.kind] ?? 0) + 1;
      if (device.circuitId) {
        const set = circuitsByKind.get(device.kind) ?? new Set<string>();
        set.add(device.circuitId);
        circuitsByKind.set(device.kind, set);
      }
    }
    for (const [kind, count] of Object.entries(mepCounts) as Array<[MepKind, number]>) {
      const meta = MEP_META[kind];
      const circuits = [...(circuitsByKind.get(kind) ?? [])];
      lines.push(
        lineFrom(
          {
            id: `bom-${room.id}-mep-${kind}`,
            category: 'mep',
            roomId: room.id,
            name: meta?.label ?? kind,
            spec: `${kind} · 水电点位`,
            unit: meta?.unit ?? '个',
            qty: count,
            wastage: 0,
            note: circuits.length > 0 ? `回路：${circuits.join('、')}` : '',
          },
          MEP_PRICE[kind] ?? [60, 160],
        ),
      );
    }

    const subtotal = round(lines.reduce((sum, line) => sum + line.total, 0));
    const low = round(lines.reduce((sum, line) => sum + line.totalLow, 0));
    const high = round(lines.reduce((sum, line) => sum + line.totalHigh, 0));
    rooms.push({
      roomId: room.id,
      roomName: room.name,
      roomType: room.type,
      floorAreaSqm: round(area),
      floorWastage,
      wallGrossAreaSqm: round(wallGross),
      openingAreaSqm: round(openingAreaSqm),
      wallAreaSqm: round(wallNet),
      ceilingAreaSqm: height > 0 ? round(area) : 0,
      skirtingM: round(skirtingM),
      mepCounts,
      lines,
      subtotal,
      range: [low, high],
    });
  }

  // Unassigned furniture still belongs in the BOM.
  const unassignedGroups = new Map<string, { item: FurnitureItem; qty: number }>();
  for (const item of unassignedFurniture) {
    const existing = unassignedGroups.get(item.skuId);
    if (existing) existing.qty += 1;
    else unassignedGroups.set(item.skuId, { item, qty: 1 });
  }
  for (const [skuId, group] of unassignedGroups) {
    const pricing = furniturePricing(options, group.item);
    sharedLines.push(
      lineFrom(
        {
          id: `bom-unassigned-fur-${skuId}`,
          category: 'furniture',
          name: pricing.name,
          spec: `${skuId} · 未归属房间`,
          unit: '件',
          qty: group.qty,
          wastage: 0,
          note: '',
        },
        pricing.range,
      ),
    );
  }

  // Electric/water accessories derived from point counts.
  const kindCounts = new Map<MepKind, number>();
  for (const device of project.mep.devices) {
    kindCounts.set(device.kind, (kindCounts.get(device.kind) ?? 0) + 1);
  }
  const countOf = (...kinds: MepKind[]) => kinds.reduce((sum, kind) => sum + (kindCounts.get(kind) ?? 0), 0);
  const electricPoints =
    countOf('socket', 'socket-16a', 'switch', 'switch-double', 'ac', 'weak-current', 'light', 'light-spot');
  const waterPoints = countOf('water-cold', 'water-hot', 'drain', 'floor-drain', 'gas');
  if (electricPoints > 0) {
    sharedLines.push(
      lineFrom(
        {
          id: 'bom-acc-panel',
          category: 'mep',
          name: '开关插座面板',
          spec: '面板 + 暗盒',
          unit: '套',
          qty: countOf('socket', 'socket-16a', 'switch', 'switch-double'),
          wastage: 0,
          note: '按点位数量配套',
        },
        [30, 70],
      ),
    );
    sharedLines.push(
      lineFrom(
        {
          id: 'bom-acc-wire',
          category: 'mep',
          name: '电线（2.5mm²）',
          spec: 'PVC 线管 + 电线',
          unit: 'm',
          qty: electricPoints * 6,
          wastage: 0.1,
          note: `按 ${electricPoints} 个电点 × 6m 估算`,
        },
        [4, 9],
      ),
    );
  }
  if (waterPoints > 0) {
    sharedLines.push(
      lineFrom(
        {
          id: 'bom-acc-pipe',
          category: 'mep',
          name: 'PPR 给水管',
          spec: '冷热水管 + 管件',
          unit: 'm',
          qty: countOf('water-cold', 'water-hot') * 5,
          wastage: 0.1,
          note: '按给水点 × 5m 估算',
        },
        [12, 26],
      ),
    );
    sharedLines.push(
      lineFrom(
        {
          id: 'bom-acc-drain',
          category: 'mep',
          name: 'PVC 排水管',
          spec: '排水管 + 弯头',
          unit: 'm',
          qty: countOf('drain', 'floor-drain') * 3,
          wastage: 0.1,
          note: '按排水点 × 3m 估算',
        },
        [18, 38],
      ),
    );
  }
  const allLines = [...rooms.flatMap((room) => room.lines), ...sharedLines];
  const subtotal = round(allLines.reduce((sum, line) => sum + line.total, 0));
  const low = round(allLines.reduce((sum, line) => sum + line.totalLow, 0));
  const high = round(allLines.reduce((sum, line) => sum + line.totalHigh, 0));
  const totals: BomTotals = {
    floorAreaSqm: round(rooms.reduce((sum, room) => sum + room.floorAreaSqm, 0)),
    wallAreaSqm: round(rooms.reduce((sum, room) => sum + room.wallAreaSqm, 0)),
    ceilingAreaSqm: round(rooms.reduce((sum, room) => sum + room.ceilingAreaSqm, 0)),
    skirtingM: round(rooms.reduce((sum, room) => sum + room.skirtingM, 0)),
    furnitureCount: project.furniture.length,
    mepCount: project.mep.devices.length,
    subtotal,
    range: [low, high],
  };

  notes.push('家具价格按目录中位价估算，实际以门店/项目报价为准。');
  if (project.materials.some((material) => !material.roomId)) {
    notes.push('存在全屋材质覆盖，已按房间材质字段展开计算。');
  }

  return {
    projectName: project.name,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    currency: 'CNY',
    rooms,
    lines: sharedLines,
    totals,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function bomToCsv(bom: Bom): string {
  const header = [
    '房间',
    '分类',
    '名称',
    '规格',
    '单位',
    '数量',
    '损耗',
    '单价(元)',
    '小计(元)',
    '区间下限(元)',
    '区间上限(元)',
    '备注',
  ];
  const rows: string[][] = [header];
  const categoryLabel: Record<BomCategory, string> = {
    floor: '地面',
    wall: '墙面',
    ceiling: '顶面',
    skirting: '踢脚线',
    furniture: '家具',
    mep: '水电',
  };
  for (const room of bom.rooms) {
    for (const line of room.lines) {
      rows.push([
        room.roomName,
        categoryLabel[line.category],
        line.name,
        line.spec,
        line.unit,
        String(line.qty),
        line.wastage > 0 ? `${Math.round(line.wastage * 100)}%` : '',
        String(line.unitPrice),
        String(line.total),
        String(line.totalLow),
        String(line.totalHigh),
        line.note,
      ]);
    }
    rows.push([room.roomName, '小计', '', '', '', '', '', '', String(room.subtotal), String(room.range[0]), String(room.range[1]), '']);
  }
  for (const line of bom.lines) {
    rows.push([
      '全屋',
      categoryLabel[line.category],
      line.name,
      line.spec,
      line.unit,
      String(line.qty),
      line.wastage > 0 ? `${Math.round(line.wastage * 100)}%` : '',
      String(line.unitPrice),
      String(line.total),
      String(line.totalLow),
      String(line.totalHigh),
      line.note,
    ]);
  }
  rows.push([
    '全屋',
    '合计',
    '',
    '',
    '',
    '',
    '',
    '',
    String(bom.totals.subtotal),
    String(bom.totals.range[0]),
    String(bom.totals.range[1]),
    `地面 ${bom.totals.floorAreaSqm}㎡ / 墙面 ${bom.totals.wallAreaSqm}㎡`,
  ]);
  // UTF-8 BOM so Excel on Windows opens Chinese correctly.
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function bomDownloadName(bom: Bom): string {
  const safeName = bom.projectName.replace(/[\\/:*?"<>|，、,;；\s]+/g, '-').slice(0, 40) || '方案';
  return `${safeName}-物料清单.csv`;
}
