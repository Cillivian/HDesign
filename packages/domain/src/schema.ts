import { z } from 'zod';

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point = z.infer<typeof pointSchema>;

export const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type BBox = z.infer<typeof bboxSchema>;

export const entityMetaSchema = z.object({
  source: z.enum(['manual', 'ai', 'import', 'style', 'auto']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().max(2000).optional(),
});
export type EntityMeta = z.infer<typeof entityMetaSchema>;

export const idSchema = z.string().min(1).max(120);

/* ------------------------------------------------------------------ */
/* Layers                                                             */
/* ------------------------------------------------------------------ */

export const LAYER_KINDS = [
  'structure',
  'furniture',
  'mep-water',
  'mep-electric',
  'annotation',
  'dimension',
  'reference',
  'custom',
] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

export const layerKindSchema = z.enum(LAYER_KINDS);

export const LAYER_KIND_LABELS: Record<LayerKind, string> = {
  structure: '结构',
  furniture: '家具',
  'mep-water': '水位图',
  'mep-electric': '电位图',
  annotation: '文字标注',
  dimension: '尺寸',
  reference: '底图',
  custom: '自定义',
};

export const layerSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  kind: layerKindSchema,
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  color: z.string().optional(),
  order: z.number().int().min(0),
});
export type Layer = z.infer<typeof layerSchema>;

export const DEFAULT_LAYER_IDS = {
  structure: 'layer-structure',
  furniture: 'layer-furniture',
  dimension: 'layer-dimension',
  water: 'layer-mep-water',
  electric: 'layer-mep-electric',
  annotation: 'layer-annotation',
  reference: 'layer-reference',
} as const;

/* ------------------------------------------------------------------ */
/* Architecture                                                       */
/* ------------------------------------------------------------------ */

export const WALL_KINDS = ['wall', 'partition', 'low-wall'] as const;
export const wallKindSchema = z.enum(WALL_KINDS);
export type WallKind = (typeof WALL_KINDS)[number];

export const wallSchema = z.object({
  id: idSchema,
  layerId: idSchema.default(DEFAULT_LAYER_IDS.structure),
  a: pointSchema,
  b: pointSchema,
  thickness: z.number().min(50).max(400).default(120),
  height: z.number().min(1000).max(6000).default(2800),
  isLoadBearing: z.boolean().default(false),
  kind: wallKindSchema.default('wall'),
  meta: entityMetaSchema.optional(),
});
export type Wall = z.infer<typeof wallSchema>;

export const OPENING_KINDS = ['door', 'window', 'sliding', 'arch'] as const;
export const openingKindSchema = z.enum(OPENING_KINDS);
export type OpeningKind = (typeof OPENING_KINDS)[number];

export const openingSwingSchema = z.object({
  hinge: z.enum(['start', 'end']).default('start'),
  open: z.enum(['in', 'out']).default('in'),
});

export const openingSchema = z.object({
  id: idSchema,
  layerId: idSchema.default(DEFAULT_LAYER_IDS.structure),
  wallId: idSchema,
  kind: openingKindSchema,
  offset: z.number().min(0),
  width: z.number().min(300).max(6000),
  height: z.number().min(300).max(4000),
  sill: z.number().min(0).max(3000).default(900),
  swing: openingSwingSchema.default({ hinge: 'start', open: 'in' }),
  meta: entityMetaSchema.optional(),
});
export type Opening = z.infer<typeof openingSchema>;

export const ROOM_TYPES = [
  'living',
  'master-bedroom',
  'bedroom',
  'kids-room',
  'dining',
  'kitchen',
  'bath',
  'balcony',
  'entry',
  'study',
  'corridor',
  'other',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export const roomTypeSchema = z.enum(ROOM_TYPES);

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
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
  other: '其他',
};

export const ceilingSchema = z.object({
  type: z.enum(['flat', 'none', 'coffered']).default('flat'),
  height: z.number().min(2000).max(6000).default(2800),
});

export const roomSchema = z.object({
  id: idSchema,
  layerId: idSchema.default(DEFAULT_LAYER_IDS.structure),
  name: z.string().min(1).max(60),
  type: roomTypeSchema.default('other'),
  polygon: z.array(pointSchema).min(3),
  floorMaterialId: z.string().default('floor-oak'),
  wallMaterialId: z.string().default('wall-latex-warm'),
  ceiling: ceilingSchema.default({ type: 'flat', height: 2800 }),
  meta: entityMetaSchema.optional(),
});
export type Room = z.infer<typeof roomSchema>;

/* ------------------------------------------------------------------ */
/* Furniture                                                          */
/* ------------------------------------------------------------------ */

export const furnitureItemSchema = z.object({
  id: idSchema,
  layerId: idSchema.default(DEFAULT_LAYER_IDS.furniture),
  skuId: z.string().min(1),
  name: z.string().min(1).max(80),
  x: z.number(),
  y: z.number(),
  rotation: z.number().min(-360).max(360).default(0),
  w: z.number().min(50).max(8000),
  d: z.number().min(50).max(8000),
  h: z.number().min(10).max(4000).default(800),
  color: z.string().default('#B9A88F'),
  materialId: z.string().optional(),
  flipX: z.boolean().default(false),
  locked: z.boolean().default(false),
  roomId: z.string().optional(),
  meta: entityMetaSchema.optional(),
});
export type FurnitureItem = z.infer<typeof furnitureItemSchema>;

/* ------------------------------------------------------------------ */
/* MEP (water / electric point layout)                                */
/* ------------------------------------------------------------------ */

export const MEP_KINDS = [
  'socket',
  'socket-16a',
  'switch',
  'switch-double',
  'light',
  'light-spot',
  'ac',
  'weak-current',
  'water-cold',
  'water-hot',
  'drain',
  'floor-drain',
  'gas',
  'floor-heat',
] as const;
export type MepKind = (typeof MEP_KINDS)[number];
export const mepKindSchema = z.enum(MEP_KINDS);

export const MEP_GROUPS = ['electric', 'water'] as const;
export type MepGroup = (typeof MEP_GROUPS)[number];

export interface MepKindMeta {
  label: string;
  short: string;
  group: MepGroup;
  defaultHeight: number;
  waterproof: boolean;
  unit: string;
}

export const MEP_META: Record<MepKind, MepKindMeta> = {
  socket: { label: '五孔插座', short: '插座', group: 'electric', defaultHeight: 300, waterproof: false, unit: '个' },
  'socket-16a': { label: '16A 插座', short: '16A', group: 'electric', defaultHeight: 2200, waterproof: false, unit: '个' },
  switch: { label: '单控开关', short: '开关', group: 'electric', defaultHeight: 1300, waterproof: false, unit: '个' },
  'switch-double': { label: '双控开关', short: '双控', group: 'electric', defaultHeight: 1300, waterproof: false, unit: '个' },
  light: { label: '主灯', short: '主灯', group: 'electric', defaultHeight: 2800, waterproof: false, unit: '盏' },
  'light-spot': { label: '筒灯', short: '筒灯', group: 'electric', defaultHeight: 2800, waterproof: false, unit: '盏' },
  ac: { label: '空调插座', short: '空调', group: 'electric', defaultHeight: 2200, waterproof: false, unit: '个' },
  'weak-current': { label: '弱电插座', short: '弱电', group: 'electric', defaultHeight: 300, waterproof: false, unit: '个' },
  'water-cold': { label: '冷水给水', short: '冷水', group: 'water', defaultHeight: 500, waterproof: true, unit: '处' },
  'water-hot': { label: '热水给水', short: '热水', group: 'water', defaultHeight: 500, waterproof: true, unit: '处' },
  drain: { label: '排水口', short: '排水', group: 'water', defaultHeight: 300, waterproof: true, unit: '处' },
  'floor-drain': { label: '地漏', short: '地漏', group: 'water', defaultHeight: 0, waterproof: true, unit: '处' },
  gas: { label: '燃气点位', short: '燃气', group: 'water', defaultHeight: 1100, waterproof: false, unit: '处' },
  'floor-heat': { label: '地暖分水器', short: '地暖', group: 'water', defaultHeight: 300, waterproof: false, unit: '组' },
};

export const mepDeviceSchema = z.object({
  id: idSchema,
  layerId: idSchema,
  kind: mepKindSchema,
  roomId: z.string().optional(),
  wallId: z.string().optional(),
  t: z.number().min(0).max(1).optional(),
  x: z.number(),
  y: z.number(),
  height: z.number().min(0).max(4000),
  circuitId: z.string().optional(),
  waterproof: z.boolean().default(false),
  note: z.string().max(300).default(''),
  meta: entityMetaSchema.optional(),
});
export type MepDevice = z.infer<typeof mepDeviceSchema>;

export const CIRCUIT_WIRES = ['1.5', '2.5', '4', '6'] as const;
export const circuitSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(40),
  wire: z.enum(CIRCUIT_WIRES),
  amp: z.number().min(6).max(63),
  color: z.string().default('#B57A12'),
  deviceIds: z.array(z.string()).default([]),
});
export type Circuit = z.infer<typeof circuitSchema>;

export const mepStateSchema = z.object({
  devices: z.array(mepDeviceSchema).default([]),
  circuits: z.array(circuitSchema).default([]),
});
export type MepState = z.infer<typeof mepStateSchema>;

/* ------------------------------------------------------------------ */
/* Annotations, reference underlay, sheets                            */
/* ------------------------------------------------------------------ */

export const annotationSchema = z.object({
  id: idSchema,
  layerId: idSchema.default(DEFAULT_LAYER_IDS.annotation),
  kind: z.enum(['text', 'dimension', 'leader']),
  points: z.array(pointSchema).min(1),
  text: z.string().max(400).default(''),
  color: z.string().default('#191C1A'),
  fontSize: z.number().min(8).max(96).default(14),
  meta: entityMetaSchema.optional(),
});
export type Annotation = z.infer<typeof annotationSchema>;

export const referenceSchema = z.object({
  assetId: z.string().min(1),
  widthPx: z.number().positive(),
  heightPx: z.number().positive(),
  mmPerPx: z.number().positive().default(10),
  offset: pointSchema.default({ x: 0, y: 0 }),
  rotationDeg: z.number().default(0),
  opacity: z.number().min(0.05).max(1).default(0.55),
  visible: z.boolean().default(true),
  locked: z.boolean().default(true),
  calibrated: z.boolean().default(false),
  calibrationSource: z.enum(['ocr', 'manual', 'ai', 'assumed']).default('assumed'),
});
export type Reference = z.infer<typeof referenceSchema>;

export const SHEET_KINDS = [
  'furniture-plan',
  'floor-plan',
  'ceiling-plan',
  'water-plan',
  'electric-plan',
  'bom',
] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];
export const sheetKindSchema = z.enum(SHEET_KINDS);

export const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  'furniture-plan': '平面布置图',
  'floor-plan': '地面铺装图',
  'ceiling-plan': '天花布置图',
  'water-plan': '水位图',
  'electric-plan': '电位图',
  bom: '物料清单',
};

export const SHEET_SIZES = ['A3', 'A2', 'A4'] as const;
export const SHEET_SCALES = [50, 75, 100, 150, 200] as const;

export const titleBlockSchema = z.object({
  projectName: z.string().default(''),
  sheetNo: z.string().default('A-01'),
  designer: z.string().default(''),
  date: z.string().default(''),
  notes: z.string().default(''),
});
export type TitleBlock = z.infer<typeof titleBlockSchema>;

export const sheetSchema = z.object({
  id: idSchema,
  kind: sheetKindSchema,
  name: z.string().min(1),
  size: z.enum(SHEET_SIZES).default('A3'),
  scale: z.union([z.literal(50), z.literal(75), z.literal(100), z.literal(150), z.literal(200)]).default(100),
  layerIds: z.array(z.string()).default([]),
  titleBlock: titleBlockSchema.default({
    projectName: '',
    sheetNo: 'A-01',
    designer: '',
    date: '',
    notes: '',
  }),
  includeDimensions: z.boolean().default(true),
  notes: z.string().max(500).default(''),
});
export type SheetSpec = z.infer<typeof sheetSchema>;

/* ------------------------------------------------------------------ */
/* Project                                                            */
/* ------------------------------------------------------------------ */

export const projectSettingsSchema = z.object({
  gridSize: z.number().min(10).max(1000).default(100),
  snapEnabled: z.boolean().default(true),
  showGrid: z.boolean().default(true),
  showDimensions: z.boolean().default(true),
  unit: z.literal('mm').default('mm'),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

export const levelSchema = z.object({
  name: z.string().default('1F'),
  height: z.number().min(2000).max(6000).default(2800),
});
export type Level = z.infer<typeof levelSchema>;

export const styleAssignmentSchema = z.object({
  id: z.string().default('modern-minimal'),
  name: z.string().optional(),
  overrides: z.record(z.string(), z.string()).default({}),
  customTokens: z.record(z.string(), z.string()).optional(),
});
export type StyleAssignment = z.infer<typeof styleAssignmentSchema>;

export const materialAssignmentSchema = z.object({
  id: idSchema,
  roomId: z.string().optional(),
  scope: z.enum(['floor', 'wall', 'ceiling', 'joinery', 'countertop']),
  materialId: z.string().min(1),
  meta: entityMetaSchema.optional(),
});
export type MaterialAssignment = z.infer<typeof materialAssignmentSchema>;

export const aiMetaSchema = z.object({
  lastBriefId: z.string().optional(),
  lastBriefLabel: z.string().optional(),
  lastAppliedAt: z.string().optional(),
  lastPatchSummary: z.string().optional(),
  configured: z.boolean().optional(),
});
export type AiMeta = z.infer<typeof aiMetaSchema>;

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  schemaVersion: z.number().int().default(SCHEMA_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: projectSettingsSchema.default({
    gridSize: 100,
    snapEnabled: true,
    showGrid: true,
    showDimensions: true,
    unit: 'mm',
  }),
  level: levelSchema.default({ name: '1F', height: 2800 }),
  layers: z.array(layerSchema).default([]),
  reference: referenceSchema.optional(),
  walls: z.array(wallSchema).default([]),
  openings: z.array(openingSchema).default([]),
  rooms: z.array(roomSchema).default([]),
  furniture: z.array(furnitureItemSchema).default([]),
  annotations: z.array(annotationSchema).default([]),
  mep: mepStateSchema.default({ devices: [], circuits: [] }),
  style: styleAssignmentSchema.default({ id: 'modern-minimal', overrides: {} }),
  materials: z.array(materialAssignmentSchema).default([]),
  sheets: z.array(sheetSchema).default([]),
  aiMeta: aiMetaSchema.default({}),
});
export type Project = z.infer<typeof projectSchema>;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export const WALL_MIN_LENGTH = 100;
export const WALK_CLEARANCE = 600;
export const DOOR_MIN_WIDTH = 600;
export const DOOR_MAX_WIDTH = 1200;

export function isRoomType(value: string): value is RoomType {
  return (ROOM_TYPES as readonly string[]).includes(value);
}

export function isMepKind(value: string): value is MepKind {
  return (MEP_KINDS as readonly string[]).includes(value);
}
