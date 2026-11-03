import { z } from 'zod';
import {
  bboxSchema,
  circuitSchema,
  materialAssignmentSchema,
  mepKindSchema,
  pointSchema,
  roomTypeSchema,
  sheetKindSchema,
  styleAssignmentSchema,
} from './schema';

/* ------------------------------------------------------------------ */
/* Prompt context (client -> server)                                  */
/* ------------------------------------------------------------------ */

export const catalogItemLiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  w: z.number(),
  d: z.number(),
  h: z.number(),
  tags: z.array(z.string()).default([]),
});
export type CatalogItemLite = z.infer<typeof catalogItemLiteSchema>;

export const styleLiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  tokens: z.record(z.string(), z.string()),
});
export type StyleLite = z.infer<typeof styleLiteSchema>;

export const materialLiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.string(),
  color: z.string().default('#CCCCCC'),
  pricePerSqm: z.number().optional(),
});
export type MaterialLite = z.infer<typeof materialLiteSchema>;

export const aiRoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: roomTypeSchema,
  areaSqm: z.number(),
  bbox: bboxSchema,
  ceilingHeight: z.number().optional(),
});
export type AiRoomSummary = z.infer<typeof aiRoomSummarySchema>;

export const aiWallSummarySchema = z.object({
  id: z.string(),
  length: z.number(),
  thickness: z.number(),
  isLoadBearing: z.boolean().default(false),
  openings: z
    .array(
      z.object({
        kind: z.string(),
        width: z.number(),
        height: z.number(),
        sill: z.number().default(0),
      }),
    )
    .default([]),
});
export type AiWallSummary = z.infer<typeof aiWallSummarySchema>;

export const aiFurnitureSummarySchema = z.object({
  id: z.string(),
  skuId: z.string(),
  name: z.string(),
  roomId: z.string().optional(),
  w: z.number(),
  d: z.number(),
  h: z.number(),
  color: z.string().default('#CCCCCC'),
  materialId: z.string().optional(),
});
export type AiFurnitureSummary = z.infer<typeof aiFurnitureSummarySchema>;

export const aiProjectSummarySchema = z.object({
  name: z.string().default('未命名方案'),
  areaSqm: z.number().default(0),
  roomCount: z.number().int().default(0),
  levelHeight: z.number().default(2800),
  rooms: z.array(aiRoomSummarySchema).default([]),
  walls: z.array(aiWallSummarySchema).default([]),
  furniture: z.array(aiFurnitureSummarySchema).default([]),
  currentStyleId: z.string().default('modern-minimal'),
  materials: z.array(materialAssignmentSchema).default([]),
  sheetKinds: z.array(sheetKindSchema).default([]),
});
export type AiProjectSummary = z.infer<typeof aiProjectSummarySchema>;

/* ------------------------------------------------------------------ */
/* Design brief                                                       */
/* ------------------------------------------------------------------ */

export const STYLE_TOKEN_KEYS = [
  'wall',
  'wallAccent',
  'ceiling',
  'floor',
  'joinery',
  'metal',
  'fabric',
  'leather',
  'stone',
  'plant',
] as const;
export type StyleTokenKey = (typeof STYLE_TOKEN_KEYS)[number];

export const styleTokensSchema = z.object({
  wall: z.string().optional(),
  wallAccent: z.string().optional(),
  ceiling: z.string().optional(),
  floor: z.string().optional(),
  joinery: z.string().optional(),
  metal: z.string().optional(),
  fabric: z.string().optional(),
  leather: z.string().optional(),
  stone: z.string().optional(),
  plant: z.string().optional(),
});
export type StyleTokens = z.infer<typeof styleTokensSchema>;

export const briefStyleSchema = z.object({
  presetId: z.string().optional(),
  customName: z.string().max(40).optional(),
  tokens: styleTokensSchema.optional(),
  moodKeywords: z.array(z.string()).default([]),
  rationale: z.string().max(1200).default(''),
});

export const briefRoomSchema = z.object({
  roomId: z.string().optional(),
  type: roomTypeSchema,
  program: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(5).default(3),
  notes: z.string().max(500).default(''),
});

export const briefFurnitureSchema = z.object({
  roomId: z.string().optional(),
  skuId: z.string().optional(),
  category: z.string().min(1),
  qty: z.number().int().min(1).max(20).default(1),
  sizeHint: z
    .object({
      w: z.number().positive().optional(),
      d: z.number().positive().optional(),
      h: z.number().positive().optional(),
    })
    .optional(),
  colorToken: z.string().optional(),
  materialToken: z.string().optional(),
  note: z.string().max(300).default(''),
});

export const briefMaterialSchema = z.object({
  scope: z.enum(['floor', 'wall', 'ceiling', 'joinery', 'countertop']),
  roomId: z.string().optional(),
  materialId: z.string().optional(),
  note: z.string().max(300).default(''),
});

export const briefMepSchema = z.object({
  roomId: z.string().optional(),
  kinds: z.array(mepKindSchema).min(1),
  note: z.string().max(300).default(''),
});

export const briefBudgetSchema = z.object({
  targetCny: z.number().min(0).optional(),
  estimateCny: z.number().min(0).optional(),
  level: z.enum(['经济', '舒适', '轻奢']).default('舒适'),
});

export const briefConstraintsSchema = z.object({
  pets: z.boolean().optional(),
  children: z.boolean().optional(),
  elderly: z.boolean().optional(),
  rental: z.boolean().optional(),
  keep: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
});

export const briefQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).default([]),
});

export const designBriefSchema = z.object({
  id: z.string(),
  variantLabel: z.string().min(1).max(30),
  summary: z.string().max(1200),
  style: briefStyleSchema,
  rooms: z.array(briefRoomSchema).default([]),
  furniture: z.array(briefFurnitureSchema).default([]),
  materials: z.array(briefMaterialSchema).default([]),
  mep: z.array(briefMepSchema).default([]),
  budget: briefBudgetSchema.default({ level: '舒适' }),
  constraints: briefConstraintsSchema.default({ keep: [], avoid: [] }),
  questions: z.array(briefQuestionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type DesignBrief = z.infer<typeof designBriefSchema>;

/* ------------------------------------------------------------------ */
/* Design patch (natural-language edits)                              */
/* ------------------------------------------------------------------ */

const opBase = {};

export const designOpSchema = z.discriminatedUnion('op', [
  z.object({ ...opBase, op: z.literal('applyBrief'), brief: designBriefSchema }),
  z.object({
    ...opBase,
    op: z.literal('setStyle'),
    presetId: z.string().optional(),
    customName: z.string().optional(),
    tokens: styleTokensSchema.optional(),
  }),
  z.object({
    ...opBase,
    op: z.literal('setRoomMaterial'),
    roomId: z.string(),
    scope: z.enum(['floor', 'wall', 'ceiling', 'joinery', 'countertop']),
    materialId: z.string(),
  }),
  z.object({
    ...opBase,
    op: z.literal('setRoomType'),
    roomId: z.string(),
    type: roomTypeSchema,
  }),
  z.object({
    ...opBase,
    op: z.literal('setFurniture'),
    itemId: z.string(),
    patch: z.object({
      skuId: z.string().optional(),
      name: z.string().optional(),
      color: z.string().optional(),
      materialId: z.string().optional(),
      w: z.number().min(50).max(8000).optional(),
      d: z.number().min(50).max(8000).optional(),
      h: z.number().min(10).max(4000).optional(),
      rotation: z.number().min(-360).max(360).optional(),
    }),
  }),
  z.object({
    ...opBase,
    op: z.literal('addFurniture'),
    roomId: z.string(),
    skuId: z.string(),
    qty: z.number().int().min(1).max(10).default(1),
    near: z.string().optional(),
  }),
  z.object({
    ...opBase,
    op: z.literal('replaceFurniture'),
    itemId: z.string(),
    skuId: z.string(),
  }),
  z.object({
    ...opBase,
    op: z.literal('removeFurniture'),
    itemId: z.string(),
  }),
  z.object({
    ...opBase,
    op: z.literal('nudgeFurniture'),
    itemId: z.string(),
    dx: z.number().min(-2000).max(2000).default(0),
    dy: z.number().min(-2000).max(2000).default(0),
    rotDelta: z.number().min(-180).max(180).default(0),
  }),
  z.object({
    ...opBase,
    op: z.literal('regenerateRoom'),
    roomId: z.string(),
    mode: z.enum(['layout', 'mep', 'both']).default('layout'),
  }),
  z.object({
    ...opBase,
    op: z.literal('addMep'),
    roomId: z.string(),
    kinds: z.array(mepKindSchema).min(1),
    count: z.number().int().min(1).max(8).default(1),
  }),
  z.object({
    ...opBase,
    op: z.literal('removeMep'),
    deviceId: z.string(),
  }),
  z.object({
    ...opBase,
    op: z.literal('setCircuits'),
    circuits: z.array(circuitSchema).max(20),
  }),
]);
export type DesignOp = z.infer<typeof designOpSchema>;

export const designPatchSchema = z.object({
  summary: z.string().max(1200),
  rationale: z.string().max(2000).default(''),
  ops: z.array(designOpSchema).max(80).default([]),
  questions: z.array(briefQuestionSchema).default([]),
});
export type DesignPatch = z.infer<typeof designPatchSchema>;

/* ------------------------------------------------------------------ */
/* Plan recognition draft                                             */
/* ------------------------------------------------------------------ */

export const parseWallSchema = z.object({
  id: z.string().optional(),
  a: pointSchema,
  b: pointSchema,
  thicknessPx: z.number().min(1).max(200).default(8),
  confidence: z.number().min(0).max(1).default(0.6),
});
export type ParseWall = z.infer<typeof parseWallSchema>;

export const parseOpeningSchema = z.object({
  kind: z.enum(['door', 'window', 'sliding', 'arch']).default('door'),
  center: pointSchema,
  widthPx: z.number().min(2),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ParseOpening = z.infer<typeof parseOpeningSchema>;

export const parseRoomSchema = z.object({
  label: z.string().optional(),
  polygon: z.array(pointSchema).min(3),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ParseRoom = z.infer<typeof parseRoomSchema>;

export const parseLabelSchema = z.object({
  text: z.string(),
  at: pointSchema,
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ParseLabel = z.infer<typeof parseLabelSchema>;

export const parseDimensionSchema = z.object({
  text: z.string(),
  valueMm: z.number().positive().optional(),
  at: pointSchema,
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ParseDimension = z.infer<typeof parseDimensionSchema>;

export const parseScaleSchema = z.object({
  mmPerPx: z.number().positive(),
  source: z.enum(['ocr', 'calibration', 'ai', 'assumed']),
});
export type ParseScale = z.infer<typeof parseScaleSchema>;

export const parseDraftSchema = z.object({
  image: z.object({ width: z.number().positive(), height: z.number().positive() }),
  walls: z.array(parseWallSchema).default([]),
  openings: z.array(parseOpeningSchema).default([]),
  rooms: z.array(parseRoomSchema).default([]),
  labels: z.array(parseLabelSchema).default([]),
  dimensions: z.array(parseDimensionSchema).default([]),
  scale: parseScaleSchema.default({ mmPerPx: 10, source: 'assumed' }),
  confidence: z
    .object({
      overall: z.number().min(0).max(1).default(0),
      walls: z.number().min(0).max(1).default(0),
      rooms: z.number().min(0).max(1).default(0),
      labels: z.number().min(0).max(1).default(0),
    })
    .default({ overall: 0, walls: 0, rooms: 0, labels: 0 }),
  diagnostics: z.array(z.string()).default([]),
});
export type ParseDraft = z.infer<typeof parseDraftSchema>;

export const parseImageInputSchema = z.object({
  dataUrl: z.string().startsWith('data:image/').max(8_000_000),
  width: z.number().positive(),
  height: z.number().positive(),
  tile: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional(),
});
export type ParseImageInput = z.infer<typeof parseImageInputSchema>;

/* ------------------------------------------------------------------ */
/* API request / response contracts                                   */
/* ------------------------------------------------------------------ */

export const aiUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const aiBriefRequestSchema = z.object({
  userPrompt: z.string().min(2).max(4000),
  projectSummary: aiProjectSummarySchema,
  catalog: z.array(catalogItemLiteSchema).max(300).default([]),
  styles: z.array(styleLiteSchema).max(30).default([]),
  materials: z.array(materialLiteSchema).max(120).default([]),
  variantCount: z.number().int().min(1).max(3).default(3),
  referenceImage: z.string().startsWith('data:image/').max(8_000_000).optional(),
  locale: z.string().default('zh-CN'),
});
export type AiBriefRequest = z.infer<typeof aiBriefRequestSchema>;

export const aiBriefResponseSchema = z.object({
  briefs: z.array(designBriefSchema).min(1).max(3),
  model: z.string().default(''),
  usage: aiUsageSchema.optional(),
  mock: z.boolean().default(false),
});
export type AiBriefResponse = z.infer<typeof aiBriefResponseSchema>;

export const aiPatchRequestSchema = z.object({
  userPrompt: z.string().min(1).max(2000),
  projectSummary: aiProjectSummarySchema,
  catalog: z.array(catalogItemLiteSchema).max(300).default([]),
  selection: z
    .object({
      roomId: z.string().optional(),
      itemIds: z.array(z.string()).default([]),
    })
    .optional(),
  locale: z.string().default('zh-CN'),
});
export type AiPatchRequest = z.infer<typeof aiPatchRequestSchema>;

export const aiPatchResponseSchema = z.object({
  patch: designPatchSchema,
  model: z.string().default(''),
  usage: aiUsageSchema.optional(),
  mock: z.boolean().default(false),
});
export type AiPatchResponse = z.infer<typeof aiPatchResponseSchema>;

export const aiParseRequestSchema = z.object({
  images: z.array(parseImageInputSchema).min(1).max(6),
  imageSize: z.object({ width: z.number().positive(), height: z.number().positive() }),
  locale: z.string().default('zh-CN'),
  hints: z
    .object({
      scaleMmPerPx: z.number().positive().optional(),
      unit: z.enum(['mm', 'm']).optional(),
    })
    .optional(),
});
export type AiParseRequest = z.infer<typeof aiParseRequestSchema>;

export const aiParseResponseSchema = z.object({
  draft: parseDraftSchema,
  model: z.string().default(''),
  usage: aiUsageSchema.optional(),
  mock: z.boolean().default(false),
});
export type AiParseResponse = z.infer<typeof aiParseResponseSchema>;

export const aiStyleRequestSchema = z.object({
  image: z.string().startsWith('data:image/').max(8_000_000),
  hint: z.string().max(500).optional(),
  locale: z.string().default('zh-CN'),
});
export type AiStyleRequest = z.infer<typeof aiStyleRequestSchema>;

export const aiStyleResponseSchema = z.object({
  style: z.object({
    name: z.string().max(40),
    tokens: styleTokensSchema,
    materials: z.array(z.string()).default([]),
    mood: z.string().max(300).default(''),
    rationale: z.string().max(1200).default(''),
  }),
  model: z.string().default(''),
  usage: aiUsageSchema.optional(),
  mock: z.boolean().default(false),
});
export type AiStyleResponse = z.infer<typeof aiStyleResponseSchema>;

export const aiChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
  projectSummary: aiProjectSummarySchema.optional(),
  locale: z.string().default('zh-CN'),
});
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                     */
/* ------------------------------------------------------------------ */

export const aiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    hint: z.string().optional(),
  }),
});
export type AiErrorResponse = z.infer<typeof aiErrorResponseSchema>;

export const aiConfigSchema = z.object({
  configured: z.boolean(),
  provider: z.string(),
  model: z.string(),
  reasoningModel: z.string().optional(),
  visionModel: z.string().optional(),
  mock: z.boolean(),
  limits: z.object({
    maxImages: z.number().int(),
    timeoutMs: z.number().int(),
  }),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

export const styleAssignmentPatchSchema = styleAssignmentSchema.partial();
export type StyleAssignmentPatch = z.infer<typeof styleAssignmentPatchSchema>;
