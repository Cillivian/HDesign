import { createId } from './ids';
import {
  DEFAULT_LAYER_IDS,
  MEP_META,
  ROOM_TYPE_LABELS,
  SCHEMA_VERSION,
  SHEET_KIND_LABELS,
  type Annotation,
  type Circuit,
  type FurnitureItem,
  type Layer,
  type LayerKind,
  type MepDevice,
  type MepKind,
  type Opening,
  type OpeningKind,
  type Point,
  type Project,
  type Reference,
  type Room,
  type RoomType,
  type SheetKind,
  type SheetSpec,
  type Wall,
  type WallKind,
} from './schema';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createLayer(kind: LayerKind, overrides: Partial<Layer> = {}): Layer {
  return {
    id: overrides.id ?? createId('layer'),
    name: overrides.name ?? kind,
    kind,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    opacity: overrides.opacity ?? 1,
    color: overrides.color,
    order: overrides.order ?? 0,
  };
}

export function createDefaultLayers(): Layer[] {
  return [
    { id: DEFAULT_LAYER_IDS.structure, name: '结构', kind: 'structure', visible: true, locked: false, opacity: 1, order: 1 },
    { id: DEFAULT_LAYER_IDS.furniture, name: '家具', kind: 'furniture', visible: true, locked: false, opacity: 1, order: 2 },
    { id: DEFAULT_LAYER_IDS.dimension, name: '尺寸标注', kind: 'dimension', visible: true, locked: false, opacity: 1, order: 3 },
    { id: DEFAULT_LAYER_IDS.water, name: '水位图', kind: 'mep-water', visible: true, locked: false, opacity: 1, order: 4 },
    { id: DEFAULT_LAYER_IDS.electric, name: '电位图', kind: 'mep-electric', visible: true, locked: false, opacity: 1, order: 5 },
    { id: DEFAULT_LAYER_IDS.annotation, name: '文字标注', kind: 'annotation', visible: true, locked: false, opacity: 1, order: 6 },
  ];
}

export function createReferenceLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: DEFAULT_LAYER_IDS.reference,
    name: '底图',
    kind: 'reference',
    visible: true,
    locked: true,
    opacity: 1,
    order: 0,
    ...overrides,
  };
}

export function createWall(a: Point, b: Point, overrides: Partial<Wall> = {}): Wall {
  return {
    id: overrides.id ?? createId('wall'),
    layerId: overrides.layerId ?? DEFAULT_LAYER_IDS.structure,
    a: { x: a.x, y: a.y },
    b: { x: b.x, y: b.y },
    thickness: overrides.thickness ?? 120,
    height: overrides.height ?? 2800,
    isLoadBearing: overrides.isLoadBearing ?? false,
    kind: (overrides.kind ?? 'wall') as WallKind,
    meta: overrides.meta,
  };
}

export function defaultOpeningHeight(kind: OpeningKind): { height: number; sill: number } {
  switch (kind) {
    case 'door':
      return { height: 2100, sill: 0 };
    case 'window':
      return { height: 1500, sill: 900 };
    case 'sliding':
      return { height: 2400, sill: 0 };
    case 'arch':
      return { height: 2200, sill: 0 };
    default:
      return { height: 2100, sill: 0 };
  }
}

export function createOpening(
  wall: Wall,
  kind: OpeningKind,
  offset: number,
  width: number,
  overrides: Partial<Opening> = {},
): Opening {
  const defaults = defaultOpeningHeight(kind);
  return {
    id: overrides.id ?? createId('opening'),
    layerId: overrides.layerId ?? wall.layerId,
    wallId: wall.id,
    kind,
    offset: Math.max(0, offset),
    width,
    height: overrides.height ?? defaults.height,
    sill: overrides.sill ?? defaults.sill,
    swing: overrides.swing ?? { hinge: 'start', open: 'in' },
    meta: overrides.meta,
  };
}

export function createRoom(polygon: Point[], overrides: Partial<Room> = {}): Room {
  const type: RoomType = overrides.type ?? 'other';
  return {
    id: overrides.id ?? createId('room'),
    layerId: overrides.layerId ?? DEFAULT_LAYER_IDS.structure,
    name: overrides.name ?? ROOM_TYPE_LABELS[type],
    type,
    polygon: polygon.map((p) => ({ x: p.x, y: p.y })),
    floorMaterialId: overrides.floorMaterialId ?? 'floor-oak',
    wallMaterialId: overrides.wallMaterialId ?? 'wall-latex-warm',
    ceiling: overrides.ceiling ?? { type: 'flat', height: 2800 },
    meta: overrides.meta,
  };
}

export function createFurnitureItem(input: {
  skuId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h?: number;
  rotation?: number;
  color?: string;
  materialId?: string;
  roomId?: string;
  layerId?: string;
  meta?: FurnitureItem['meta'];
}): FurnitureItem {
  return {
    id: createId('furn'),
    layerId: input.layerId ?? DEFAULT_LAYER_IDS.furniture,
    skuId: input.skuId,
    name: input.name,
    x: input.x,
    y: input.y,
    rotation: input.rotation ?? 0,
    w: input.w,
    d: input.d,
    h: input.h ?? 800,
    color: input.color ?? '#B9A88F',
    materialId: input.materialId,
    flipX: false,
    locked: false,
    roomId: input.roomId,
    meta: input.meta,
  };
}

export function createMepDevice(input: {
  kind: MepKind;
  x: number;
  y: number;
  roomId?: string;
  wallId?: string;
  t?: number;
  height?: number;
  circuitId?: string;
  note?: string;
  meta?: MepDevice['meta'];
}): MepDevice {
  const meta = MEP_META[input.kind];
  return {
    id: createId('mep'),
    layerId:
      meta.group === 'water' ? DEFAULT_LAYER_IDS.water : DEFAULT_LAYER_IDS.electric,
    kind: input.kind,
    roomId: input.roomId,
    wallId: input.wallId,
    t: input.t,
    x: input.x,
    y: input.y,
    height: input.height ?? meta.defaultHeight,
    circuitId: input.circuitId,
    waterproof: meta.waterproof,
    note: input.note ?? '',
    meta: input.meta,
  };
}

export function createCircuit(overrides: Partial<Circuit> = {}): Circuit {
  return {
    id: overrides.id ?? createId('circuit'),
    name: overrides.name ?? '新回路',
    wire: overrides.wire ?? '2.5',
    amp: overrides.amp ?? 16,
    color: overrides.color ?? '#B57A12',
    deviceIds: overrides.deviceIds ?? [],
  };
}

export function createDefaultCircuits(): Circuit[] {
  return [
    { id: 'circuit-lighting', name: '照明', wire: '1.5', amp: 10, color: '#C98A1C', deviceIds: [] },
    { id: 'circuit-general', name: '普通插座', wire: '2.5', amp: 16, color: '#B57A12', deviceIds: [] },
    { id: 'circuit-kitchen', name: '厨房', wire: '4', amp: 20, color: '#C4442B', deviceIds: [] },
    { id: 'circuit-ac', name: '空调', wire: '4', amp: 20, color: '#2E6FA3', deviceIds: [] },
    { id: 'circuit-bath', name: '卫浴', wire: '4', amp: 20, color: '#2F6B57', deviceIds: [] },
    { id: 'circuit-floorheat', name: '地暖', wire: '6', amp: 32, color: '#8A5A2B', deviceIds: [] },
  ];
}

export function createAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: overrides.id ?? createId('note'),
    layerId: overrides.layerId ?? DEFAULT_LAYER_IDS.annotation,
    kind: overrides.kind ?? 'text',
    points: overrides.points ?? [{ x: 0, y: 0 }],
    text: overrides.text ?? '标注',
    color: overrides.color ?? '#191C1A',
    fontSize: overrides.fontSize ?? 14,
    meta: overrides.meta,
  };
}

export function createReference(input: {
  assetId: string;
  widthPx: number;
  heightPx: number;
  mmPerPx?: number;
  offset?: Point;
  locked?: boolean;
  calibrated?: boolean;
  calibrationSource?: Reference['calibrationSource'];
}): Reference {
  return {
    assetId: input.assetId,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    mmPerPx: input.mmPerPx ?? 10,
    offset: input.offset ?? { x: 0, y: 0 },
    rotationDeg: 0,
    opacity: 0.55,
    visible: true,
    locked: input.locked ?? true,
    calibrated: input.calibrated ?? false,
    calibrationSource: input.calibrationSource ?? 'assumed',
  };
}

const SHEET_LAYERS: Record<SheetKind, string[]> = {
  'furniture-plan': [
    DEFAULT_LAYER_IDS.structure,
    DEFAULT_LAYER_IDS.furniture,
    DEFAULT_LAYER_IDS.dimension,
    DEFAULT_LAYER_IDS.annotation,
  ],
  'floor-plan': [DEFAULT_LAYER_IDS.structure, DEFAULT_LAYER_IDS.dimension],
  'ceiling-plan': [DEFAULT_LAYER_IDS.structure, DEFAULT_LAYER_IDS.electric, DEFAULT_LAYER_IDS.dimension],
  'water-plan': [DEFAULT_LAYER_IDS.structure, DEFAULT_LAYER_IDS.water, DEFAULT_LAYER_IDS.dimension],
  'electric-plan': [DEFAULT_LAYER_IDS.structure, DEFAULT_LAYER_IDS.electric, DEFAULT_LAYER_IDS.dimension],
  bom: [DEFAULT_LAYER_IDS.structure, DEFAULT_LAYER_IDS.furniture],
};

const SHEET_ORDER: SheetKind[] = [
  'furniture-plan',
  'floor-plan',
  'ceiling-plan',
  'water-plan',
  'electric-plan',
  'bom',
];

export function createSheet(kind: SheetKind, overrides: Partial<SheetSpec> = {}): SheetSpec {
  const index = SHEET_ORDER.indexOf(kind);
  const no = `A-${String(index + 1).padStart(2, '0')}`;
  return {
    id: overrides.id ?? `sheet-${kind}`,
    kind,
    name: overrides.name ?? SHEET_KIND_LABELS[kind],
    size: overrides.size ?? 'A3',
    scale: overrides.scale ?? 50,
    layerIds: overrides.layerIds ?? SHEET_LAYERS[kind],
    titleBlock: overrides.titleBlock ?? {
      projectName: '',
      sheetNo: no,
      designer: '',
      date: today(),
      notes: '',
    },
    includeDimensions: overrides.includeDimensions ?? kind !== 'bom',
    notes: overrides.notes ?? '',
  };
}

export function createDefaultSheets(projectName = ''): SheetSpec[] {
  return SHEET_ORDER.map((kind) => {
    const sheet = createSheet(kind);
    sheet.titleBlock = { ...sheet.titleBlock, projectName };
    return sheet;
  });
}

export function createEmptyProject(name = '未命名方案'): Project {
  const now = new Date().toISOString();
  return {
    id: createId('prj'),
    name,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    settings: {
      gridSize: 100,
      snapEnabled: true,
      showGrid: true,
      showDimensions: true,
      unit: 'mm',
    },
    level: { name: '1F', height: 2800 },
    layers: createDefaultLayers(),
    walls: [],
    openings: [],
    rooms: [],
    furniture: [],
    annotations: [],
    mep: { devices: [], circuits: createDefaultCircuits() },
    style: { id: 'modern-minimal', overrides: {} },
    materials: [],
    sheets: createDefaultSheets(name),
    aiMeta: {},
  };
}
