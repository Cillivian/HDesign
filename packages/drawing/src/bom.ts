import {
  MEP_META,
  polygonAreaSqm,
  polygonPerimeter,
  roomLabelPoint,
  type MaterialAssignment,
  type MepGroup,
  type MepKind,
  type Project,
  type Room,
} from '@hdesign/domain';
import { furnitureInfo, materialInfo, mepPointPrice } from './catalog-adapter';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export const BOM_SCOPE_LABELS: Record<BomMaterialLine['scope'], string> = {
  floor: '地面',
  wall: '墙面',
  ceiling: '顶面',
  joinery: '定制',
  countertop: '台面',
};

export interface BomMaterialLine {
  key: string;
  materialId: string;
  name: string;
  scope: 'floor' | 'wall' | 'ceiling' | 'joinery' | 'countertop';
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  wastage: number;
  rooms: string[];
  note: string;
}

export interface BomFurnitureLine {
  key: string;
  skuId: string;
  name: string;
  count: number;
  unit: string;
  unitPrice: number;
  amount: number;
  note: string;
}

export interface BomMepLine {
  key: string;
  kind: MepKind;
  label: string;
  group: MepGroup;
  count: number;
  unit: string;
  unitPrice: number;
  amount: number;
  /** Distinct mounting heights found in the project, e.g. [300, 1300]. */
  heights: number[];
  note: string;
}

export interface CircuitSummary {
  id: string;
  name: string;
  wire: string;
  amp: number;
  color: string;
  deviceCount: number;
}

export interface BomTotals {
  materials: number;
  furniture: number;
  mep: number;
  subtotal: number;
  /** Kept for future tax / contingency handling; deterministic and 0 by default. */
  contingency: number;
  total: number;
}

/** Row edits applied by the sheets panel (never written back into the project schema). */
export interface BomOverrides {
  materials?: Record<string, { quantity?: number; unitPrice?: number }>;
  furniture?: Record<string, { unitPrice?: number; count?: number }>;
  mep?: Record<string, { count?: number; unitPrice?: number }>;
}

export interface BomResult {
  areaSqm: number;
  roomCount: number;
  wallAreaSqm: number;
  deviceCount: number;
  materials: BomMaterialLine[];
  furniture: BomFurnitureLine[];
  mep: BomMepLine[];
  totals: BomTotals;
  circuits: CircuitSummary[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function assignmentFor(
  project: Project,
  roomId: string,
  scope: MaterialAssignment['scope'],
): string | undefined {
  const global = project.materials.find((item) => !item.roomId && item.scope === scope);
  const local = project.materials.find((item) => item.roomId === roomId && item.scope === scope);
  return local?.materialId ?? global?.materialId;
}

function defaultCeilingMaterial(room: Room): string {
  if (room.ceiling.type === 'none') return '';
  if (room.type === 'bath' || room.type === 'kitchen') return 'ceiling-aluminium';
  return 'ceiling-paint';
}

function ceilingFactor(room: Room): number {
  if (room.ceiling.type === 'coffered') return 1.08;
  return 1;
}

/** Sum of opening areas (m²) used to deduct wall finishes. */
function openingAreaSqm(project: Project): number {
  let area = 0;
  for (const opening of project.openings) {
    if (opening.kind === 'arch') continue;
    area += (opening.width * opening.height) / 1_000_000;
  }
  return area;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Device / circuit counts shared with legends and CSV                */
/* ------------------------------------------------------------------ */

export interface MepKindCount {
  kind: MepKind;
  label: string;
  short: string;
  unit: string;
  group: MepGroup;
  count: number;
  heights: number[];
}

export function countMepByKind(project: Project, group?: MepGroup): MepKindCount[] {
  const map = new Map<MepKind, { count: number; heights: Set<number> }>();
  for (const device of project.mep.devices) {
    const meta = MEP_META[device.kind];
    if (group && meta.group !== group) continue;
    const entry = map.get(device.kind) ?? { count: 0, heights: new Set<number>() };
    entry.count += 1;
    entry.heights.add(Math.round(device.height));
    map.set(device.kind, entry);
  }
  const kinds = [...map.keys()].sort((a, b) => {
    const order = Object.keys(MEP_META).indexOf(a) - Object.keys(MEP_META).indexOf(b);
    return order;
  });
  return kinds.map((kind) => {
    const meta = MEP_META[kind];
    return {
      kind,
      label: meta.label,
      short: meta.short,
      unit: meta.unit,
      group: meta.group,
      count: map.get(kind)!.count,
      heights: [...map.get(kind)!.heights].sort((a, b) => a - b),
    };
  });
}

export function summarizeCircuits(project: Project): CircuitSummary[] {
  const counts = new Map<string, number>();
  for (const device of project.mep.devices) {
    if (!device.circuitId) continue;
    counts.set(device.circuitId, (counts.get(device.circuitId) ?? 0) + 1);
  }
  return project.mep.circuits.map((circuit) => ({
    id: circuit.id,
    name: circuit.name,
    wire: circuit.wire,
    amp: circuit.amp,
    color: circuit.color,
    deviceCount: counts.get(circuit.id) ?? 0,
  }));
}

export function unassignedDeviceCount(project: Project): number {
  return project.mep.devices.filter((device) => !device.circuitId).length;
}

/* ------------------------------------------------------------------ */
/* Furniture grouping                                                 */
/* ------------------------------------------------------------------ */

export interface FurnitureCountLine {
  skuId: string;
  name: string;
  count: number;
  price: number;
  hasPrice: boolean;
}

export function countFurniture(project: Project): FurnitureCountLine[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const item of project.furniture) {
    const entry = map.get(item.skuId) ?? { name: item.name, count: 0 };
    entry.count += 1;
    map.set(item.skuId, entry);
  }
  return [...map.entries()]
    .map(([skuId, entry]) => {
      const info = furnitureInfo(skuId, entry.name);
      return { skuId, name: info.name || entry.name, count: entry.count, price: info.price, hasPrice: info.hasPrice };
    })
    .sort((a, b) => b.count - a.count || a.skuId.localeCompare(b.skuId));
}

/* ------------------------------------------------------------------ */
/* BOM computation                                                    */
/* ------------------------------------------------------------------ */

export function computeBom(project: Project, overrides: BomOverrides = {}): BomResult {
  const warnings: string[] = [];
  const rooms = project.rooms;
  const areaSqm = rooms.reduce((sum, room) => sum + polygonAreaSqm(room.polygon), 0);

  /* ---- materials ---- */
  interface MaterialBucket {
    materialId: string;
    scope: BomMaterialLine['scope'];
    quantity: number;
    rooms: Set<string>;
    note: string;
  }
  const buckets = new Map<string, MaterialBucket>();
  const addMaterial = (
    materialId: string,
    scope: BomMaterialLine['scope'],
    quantity: number,
    roomName: string,
    note = '',
  ) => {
    if (!materialId || quantity <= 0) return;
    const key = `${scope}|${materialId}`;
    const bucket = buckets.get(key) ?? { materialId, scope, quantity: 0, rooms: new Set<string>(), note };
    bucket.quantity += quantity;
    bucket.rooms.add(roomName);
    if (note) bucket.note = note;
    buckets.set(key, bucket);
  };

  let rawWallArea = 0;
  const wallRows: Array<{ room: Room; rawArea: number; materialId: string }> = [];
  const wallHeight = project.level.height;
  for (const room of rooms) {
    const roomArea = polygonAreaSqm(room.polygon);
    const floorMaterialId = assignmentFor(project, room.id, 'floor') ?? room.floorMaterialId;
    const wallMaterialId = assignmentFor(project, room.id, 'wall') ?? room.wallMaterialId;
    const ceilingMaterialId = assignmentFor(project, room.id, 'ceiling') ?? defaultCeilingMaterial(room);

    // Floor finish: net room area × material wastage.
    const floorInfo = materialInfo(floorMaterialId);
    addMaterial(floorMaterialId, 'floor', roomArea * floorInfo.wastage, room.name, '含损耗');

    const rawArea = (polygonPerimeter(room.polygon) / 1000) * (wallHeight / 1000);
    rawWallArea += rawArea;
    wallRows.push({ room, rawArea, materialId: wallMaterialId });

    // Ceiling: flat area ×造型系数, per room.
    if (ceilingMaterialId) {
      addMaterial(
        ceilingMaterialId,
        'ceiling',
        roomArea * ceilingFactor(room),
        room.name,
        room.ceiling.type === 'coffered' ? '造型吊顶系数 1.08' : '',
      );
    }
  }

  const openings = openingAreaSqm(project);
  const deduction = rawWallArea > 0 ? Math.min(0.6, openings / rawWallArea) : 0;
  for (const row of wallRows) {
    const wallInfo = materialInfo(row.materialId);
    addMaterial(
      row.materialId,
      'wall',
      row.rawArea * (1 - deduction) * wallInfo.wastage,
      row.room.name,
      deduction > 0 ? `已扣门窗洞口 ${Math.round(deduction * 100)}%` : '',
    );
  }

  // Explicit material assignments without measurable geometry (joinery / countertop).
  for (const assignment of project.materials) {
    if (assignment.scope !== 'joinery' && assignment.scope !== 'countertop') continue;
    addMaterial(assignment.materialId, assignment.scope, 1, assignment.roomId ? roomNameOf(project, assignment.roomId) : '全屋', '按项估算');
  }

  const materials: BomMaterialLine[] = [];
  for (const bucket of buckets.values()) {
    const info = materialInfo(bucket.materialId);
    const key = `${bucket.scope}|${bucket.materialId}`;
    const override = overrides.materials?.[key];
    const quantity =
      override?.quantity !== undefined
        ? Math.max(0, override.quantity)
        : bucket.scope === 'joinery' || bucket.scope === 'countertop'
          ? 1
          : round2(bucket.quantity);
    const unitPrice = Math.max(0, override?.unitPrice ?? info.pricePerSqm ?? 0);
    const unit = bucket.scope === 'joinery' || bucket.scope === 'countertop' ? '项' : '㎡';
    if (info.name.startsWith('未登记材质')) warnings.push(`材质 ${bucket.materialId} 不在材质库中，已按未登记处理`);
    materials.push({
      key,
      materialId: bucket.materialId,
      name: info.name,
      scope: bucket.scope,
      unit,
      quantity: bucket.scope === 'joinery' || bucket.scope === 'countertop' ? 1 : quantity,
      unitPrice: round2(unitPrice),
      amount: round2(quantity * unitPrice),
      wastage: info.wastage,
      rooms: [...bucket.rooms],
      note: bucket.note,
    });
  }
  const scopeOrder: Array<BomMaterialLine['scope']> = ['floor', 'wall', 'ceiling', 'joinery', 'countertop'];
  materials.sort(
    (a, b) => scopeOrder.indexOf(a.scope) - scopeOrder.indexOf(b.scope) || a.name.localeCompare(b.name),
  );

  /* ---- furniture ---- */
  const furniture: BomFurnitureLine[] = countFurniture(project).map((line) => {
    const override = overrides.furniture?.[line.skuId];
    const count = override?.count !== undefined ? Math.max(0, Math.round(override.count)) : line.count;
    const unitPrice = Math.max(0, override?.unitPrice ?? line.price);
    if (!line.hasPrice && override?.unitPrice === undefined) warnings.push(`家具「${line.name}」缺少参考价`);
    return {
      key: `furniture|${line.skuId}`,
      skuId: line.skuId,
      name: line.name,
      count,
      unit: '件',
      unitPrice: round2(unitPrice),
      amount: round2(count * unitPrice),
      note: line.hasPrice ? '' : '待询价',
    };
  });

  /* ---- MEP ---- */
  const mep: BomMepLine[] = countMepByKind(project)
    .map((line) => {
      const override = overrides.mep?.[line.kind];
      const count = override?.count !== undefined ? Math.max(0, Math.round(override.count)) : line.count;
      const unitPrice = Math.max(0, override?.unitPrice ?? mepPointPrice(line.kind));
      return {
        key: `mep|${line.kind}`,
        kind: line.kind,
        label: line.label,
        group: line.group,
        count,
        unit: line.unit,
        unitPrice: round2(unitPrice),
        amount: round2(count * unitPrice),
        heights: line.heights,
        note: '点位综合单价（含人工辅料）',
      };
    })
    .sort((a, b) => (a.group === b.group ? a.kind.localeCompare(b.kind) : a.group === 'electric' ? -1 : 1));

  /* ---- totals ---- */
  const materialTotal = materials.reduce((sum, line) => sum + line.amount, 0);
  const furnitureTotal = furniture.reduce((sum, line) => sum + line.amount, 0);
  const mepTotal = mep.reduce((sum, line) => sum + line.amount, 0);
  const subtotal = materialTotal + furnitureTotal + mepTotal;

  if (rooms.length === 0) warnings.push('项目没有房间，物料清单为空');
  if (project.furniture.length === 0) warnings.push('项目没有家具，清单仅含材质与水电点位');
  if (project.reference && !project.reference.calibrated) {
    warnings.push('底图未校准，面积与数量仅供参考');
  }
  if (project.aiMeta?.lastBriefId) warnings.push('AI 生成方案，数量与价格需人工复核');

  return {
    areaSqm: round2(areaSqm),
    roomCount: rooms.length,
    wallAreaSqm: round2(rawWallArea * (1 - deduction)),
    deviceCount: project.mep.devices.length,
    materials,
    furniture,
    mep,
    totals: {
      materials: round2(materialTotal),
      furniture: round2(furnitureTotal),
      mep: round2(mepTotal),
      subtotal: round2(subtotal),
      contingency: 0,
      total: round2(subtotal),
    },
    circuits: summarizeCircuits(project),
    warnings: uniqueStrings(warnings),
  };
}

function roomNameOf(project: Project, roomId: string): string {
  const room = project.rooms.find((item) => item.id === roomId);
  return room?.name ?? '全屋';
}

/* ------------------------------------------------------------------ */
/* Room finish schedule (floor plan legend)                           */
/* ------------------------------------------------------------------ */

export interface RoomFinishRow {
  roomId: string;
  name: string;
  type: Room['type'];
  areaSqm: number;
  floorMaterialId: string;
  floorMaterialName: string;
  wallMaterialName: string;
  ceilingType: Room['ceiling']['type'];
  ceilingHeight: number;
  labelPoint: { x: number; y: number };
}

export function buildRoomFinishSchedule(project: Project): RoomFinishRow[] {
  return project.rooms.map((room) => {
    const floorMaterialId = assignmentFor(project, room.id, 'floor') ?? room.floorMaterialId;
    const wallMaterialId = assignmentFor(project, room.id, 'wall') ?? room.wallMaterialId;
    return {
      roomId: room.id,
      name: room.name,
      type: room.type,
      areaSqm: round2(polygonAreaSqm(room.polygon)),
      floorMaterialId,
      floorMaterialName: materialInfo(floorMaterialId).name,
      wallMaterialName: materialInfo(wallMaterialId).name,
      ceilingType: room.ceiling.type,
      ceilingHeight: room.ceiling.height,
      labelPoint: roomLabelPoint(room),
    };
  });
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '¥0';
  const rounded = Math.round(value);
  return `¥${rounded.toLocaleString('zh-CN')}`;
}

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
