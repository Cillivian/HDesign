import * as catalogModule from '@hdesign/catalog';
import {
  aiBriefRequestSchema,
  aiBriefResponseSchema,
  aiChatRequestSchema,
  aiConfigSchema,
  aiPatchRequestSchema,
  aiPatchResponseSchema,
  aiProjectSummarySchema,
  aiStyleRequestSchema,
  aiStyleResponseSchema,
  polygonAreaSqm,
  roomBBox,
  wallLength,
  type AiBriefRequest,
  type AiBriefResponse,
  type AiChatRequest,
  type AiConfig,
  type AiPatchRequest,
  type AiPatchResponse,
  type AiProjectSummary,
  type AiStyleResponse,
  type CatalogItemLite,
  type DesignPatch,
  type FurnitureItem,
  type MaterialAssignment,
  type MaterialLite,
  type Project,
  type Room,
  type RoomType,
  type StyleAssignment,
  type StyleLite,
  type StyleTokens,
} from '@hdesign/domain';
import { postJson, streamChat } from './api-client';

/* ------------------------------------------------------------------ */
/* Catalog access adapter                                             */
/*                                                                    */
/* The catalog package is built by workstream B in parallel. These     */
/* helpers read its runtime exports defensively so the AI panel keeps  */
/* working (with an empty catalogue) before/without that package.      */
/* ------------------------------------------------------------------ */

export interface CatalogSku {
  id: string;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  color?: string;
  priceRange?: [number, number];
  styleTags: string[];
  materialSlots: string[];
  roomTypes: RoomType[];
  wallMounted: boolean;
  collisionExempt: boolean;
  symbol?: string;
  builder?: string;
}

export interface CatalogMaterial {
  id: string;
  name: string;
  scope: string;
  color: string;
  pricePerSqm?: number;
  type?: string;
  tags: string[];
}

export interface CatalogStyle {
  id: string;
  name: string;
  description: string;
  tokens: Record<string, string>;
  materials: Partial<Record<string, string>>;
  moodKeywords: string[];
}

type RawRecord = Record<string, unknown>;
const catalogNs = catalogModule as unknown as RawRecord;

function readArray(names: string[]): RawRecord[] {
  for (const name of names) {
    const value = catalogNs[name];
    if (Array.isArray(value)) return value as RawRecord[];
  }
  return [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asRoomTypes(value: unknown): RoomType[] {
  return asStringArray(value) as RoomType[];
}

function toSku(raw: RawRecord): CatalogSku | null {
  const id = asString(raw.id);
  if (!id) return null;
  const range = raw.priceRange;
  const priceRange =
    Array.isArray(range) && range.length === 2 && typeof range[0] === 'number' && typeof range[1] === 'number'
      ? ([range[0], range[1]] as [number, number])
      : undefined;
  return {
    id,
    name: asString(raw.name, id),
    category: asString(raw.category, 'other'),
    w: asNumber(raw.w),
    d: asNumber(raw.d),
    h: asNumber(raw.h),
    color: typeof raw.color === 'string' ? raw.color : undefined,
    priceRange,
    styleTags: asStringArray(raw.styleTags),
    materialSlots: asStringArray(raw.materialSlots),
    roomTypes: asRoomTypes(raw.roomTypes),
    wallMounted: raw.wallMounted === true,
    collisionExempt: raw.collisionExempt === true,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : undefined,
    builder: typeof raw.builder === 'string' ? raw.builder : undefined,
  };
}

function toMaterial(raw: RawRecord): CatalogMaterial | null {
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    name: asString(raw.name, id),
    scope: asString(raw.scope, 'floor'),
    color: asString(raw.color, '#CCCCCC'),
    pricePerSqm: typeof raw.pricePerSqm === 'number' ? raw.pricePerSqm : undefined,
    type: typeof raw.type === 'string' ? raw.type : undefined,
    tags: asStringArray(raw.tags),
  };
}

function toStyle(raw: RawRecord): CatalogStyle | null {
  const id = asString(raw.id);
  if (!id) return null;
  const tokens: Record<string, string> = {};
  if (raw.tokens && typeof raw.tokens === 'object') {
    for (const [key, value] of Object.entries(raw.tokens as RawRecord)) {
      if (typeof value === 'string') tokens[key] = value;
    }
  }
  const materials: Partial<Record<string, string>> = {};
  if (raw.materials && typeof raw.materials === 'object') {
    for (const [key, value] of Object.entries(raw.materials as RawRecord)) {
      if (typeof value === 'string') materials[key] = value;
    }
  }
  return {
    id,
    name: asString(raw.name, id),
    description: asString(raw.description),
    tokens,
    materials,
    moodKeywords: asStringArray(raw.moodKeywords),
  };
}

let skuCache: CatalogSku[] | null = null;
let materialCache: CatalogMaterial[] | null = null;
let styleCache: CatalogStyle[] | null = null;

function readFunction<T>(name: string): T | undefined {
  const value = catalogNs[name];
  return typeof value === 'function' ? (value as T) : undefined;
}

/** Catalog SKUs (empty until workstream B's package exports FURNITURE). */
export function listCatalogSkus(): CatalogSku[] {
  if (skuCache) return skuCache;
  skuCache = readArray(['FURNITURE', 'FURNITURE_SKUS', 'FURNITURE_CATALOG', 'CATALOG'])
    .map(toSku)
    .filter((item): item is CatalogSku => item !== null);
  return skuCache;
}

export function listCatalogMaterials(): CatalogMaterial[] {
  if (materialCache) return materialCache;
  materialCache = readArray(['MATERIALS', 'MATERIAL_DEFS', 'MATERIAL_CATALOG'])
    .map(toMaterial)
    .filter((item): item is CatalogMaterial => item !== null);
  return materialCache;
}

export function listCatalogStyles(): CatalogStyle[] {
  if (styleCache) return styleCache;
  styleCache = readArray(['STYLE_PRESETS', 'STYLES', 'STYLE_CATALOG'])
    .map(toStyle)
    .filter((item): item is CatalogStyle => item !== null);
  return styleCache;
}

export function getCatalogSku(id: string | undefined): CatalogSku | undefined {
  if (!id) return undefined;
  const getSku = readFunction<(skuId: string) => unknown>('getFurnitureSku');
  if (getSku) {
    const found = getSku(id);
    if (found && typeof found === 'object') {
      const normalized = toSku(found as RawRecord);
      if (normalized) return normalized;
    }
  }
  return listCatalogSkus().find((sku) => sku.id === id);
}

export function getCatalogMaterial(id: string | undefined): CatalogMaterial | undefined {
  if (!id) return undefined;
  const getMaterial = readFunction<(materialId: string) => unknown>('getMaterial');
  if (getMaterial) {
    const found = getMaterial(id);
    if (found && typeof found === 'object') {
      const normalized = toMaterial(found as RawRecord);
      if (normalized) return normalized;
    }
  }
  return listCatalogMaterials().find((material) => material.id === id);
}

export function getCatalogStyle(id: string | undefined): CatalogStyle | undefined {
  if (!id) return undefined;
  const getStyle = readFunction<(styleId: string) => unknown>('getStylePreset');
  if (getStyle) {
    const found = getStyle(id);
    if (found && typeof found === 'object') {
      const normalized = toStyle(found as RawRecord);
      if (normalized) return normalized;
    }
  }
  return listCatalogStyles().find((style) => style.id === id);
}

/** Seed styles always exist (docs list 12 presets), even before B's catalogue loads. */
export const KNOWN_STYLE_IDS = [
  'modern-minimal',
  'cream',
  'nordic',
  'japandi',
  'new-chinese',
  'light-luxury',
  'loft',
  'mid-century',
  'wabi-sabi',
  'american-retro',
  'dopamine',
  'mono',
] as const;

export function isKnownStyleId(id: string | undefined): boolean {
  if (!id) return false;
  return Boolean(getCatalogStyle(id)) || (KNOWN_STYLE_IDS as readonly string[]).includes(id);
}

/**
 * Resolve the closest catalogue SKU for a requested id / category / name hint.
 * Prefers an exact id, then same-room-type matches, then name/category similarity.
 */
export function resolveNearestSku(options: {
  skuId?: string;
  category?: string;
  name?: string;
  roomType?: RoomType;
  styleId?: string;
}): CatalogSku | undefined {
  const { skuId, category, name, roomType, styleId } = options;
  const skus = listCatalogSkus();
  if (skuId) {
    const exact = getCatalogSku(skuId);
    if (exact) return exact;
  }
  if (skus.length === 0) return undefined;
  const requestedCategory = (category ?? '').toLowerCase();
  const nameHint = (name ?? '').toLowerCase();
  const roomOk = (sku: CatalogSku) => !roomType || sku.roomTypes.length === 0 || sku.roomTypes.includes(roomType);
  const scored = skus
    .map((sku) => {
      let score = 0;
      if (skuId && sku.id.toLowerCase() === skuId.toLowerCase()) score += 100;
      if (requestedCategory && sku.category.toLowerCase() === requestedCategory) score += 40;
      if (requestedCategory && sku.category.toLowerCase().includes(requestedCategory)) score += 12;
      if (nameHint) {
        if (sku.name.toLowerCase().includes(nameHint)) score += 30;
        if (sku.id.toLowerCase().includes(nameHint)) score += 18;
      }
      if (styleId && sku.styleTags.includes(styleId)) score += 10;
      if (roomType && sku.roomTypes.includes(roomType)) score += 8;
      if (!roomOk(sku)) score -= 25;
      return { sku, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.sku.id.localeCompare(b.sku.id));
  return scored[0]?.sku;
}

/* ------------------------------------------------------------------ */
/* Style application (delegated to @hdesign/catalog when available)   */
/* ------------------------------------------------------------------ */

export interface StyleApplicationResult {
  style: StyleAssignment;
  materials: MaterialAssignment[];
  furniture: FurnitureItem[];
  rooms: Room[];
}

function isStyleApplication(value: unknown): value is StyleApplicationResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.materials) &&
    Array.isArray(record.furniture) &&
    Array.isArray(record.rooms) &&
    Boolean(record.style)
  );
}

/** Catalogue style application (recolours furniture, syncs room materials). */
export function applyCatalogStyle(project: Project, styleId: string): StyleApplicationResult | undefined {
  const apply = readFunction<(value: Project, id: string) => unknown>('applyStyleToProject');
  if (!apply) return undefined;
  const result = apply(project, styleId);
  return isStyleApplication(result) ? result : undefined;
}

/** Catalogue style application from explicit tokens (AI custom styles / reference images). */
export function applyCatalogStyleTokens(
  project: Project,
  tokens: StyleTokens,
  styleId?: string,
): StyleApplicationResult | undefined {
  const apply = readFunction<(value: Project, styleTokens: StyleTokens, id?: string) => unknown>(
    'applyStyleTokensToProject',
  );
  if (!apply) return undefined;
  const result = apply(project, tokens, styleId);
  return isStyleApplication(result) ? result : undefined;
}

/* ------------------------------------------------------------------ */
/* Prompt context builders                                            */
/* ------------------------------------------------------------------ */

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildAiProjectSummary(project: Project): AiProjectSummary {
  const areaSqm = project.rooms.reduce((sum, room) => sum + polygonAreaSqm(room.polygon), 0);
  return aiProjectSummarySchema.parse({
    name: project.name,
    areaSqm: round(areaSqm, 2),
    roomCount: project.rooms.length,
    levelHeight: project.level.height,
    rooms: project.rooms.map((room) => {
      const box = roomBBox(room);
      return {
        id: room.id,
        name: room.name,
        type: room.type,
        areaSqm: round(polygonAreaSqm(room.polygon), 2),
        bbox: { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) },
        ceilingHeight: room.ceiling?.height ?? project.level.height,
      };
    }),
    walls: project.walls.map((wall) => ({
      id: wall.id,
      length: round(wallLength(wall)),
      thickness: wall.thickness,
      isLoadBearing: wall.isLoadBearing,
      openings: project.openings
        .filter((opening) => opening.wallId === wall.id)
        .map((opening) => ({
          kind: opening.kind,
          width: opening.width,
          height: opening.height,
          sill: opening.sill,
        })),
    })),
    furniture: project.furniture.map((item) => ({
      id: item.id,
      skuId: item.skuId,
      name: item.name,
      roomId: item.roomId,
      w: item.w,
      d: item.d,
      h: item.h,
      color: item.color,
      materialId: item.materialId,
    })),
    currentStyleId: project.style.id,
    materials: project.materials,
    sheetKinds: project.sheets.map((sheet) => sheet.kind),
  });
}

const CATEGORY_WORDS: Record<string, string> = {
  沙发: 'sofa',
  床: 'bed',
  衣柜: 'storage',
  书桌: 'table',
  餐桌: 'table',
  椅子: 'chair',
  餐椅: 'chair',
  电视柜: 'storage',
  茶几: 'table',
  灯: 'lighting',
  地毯: 'textile',
  绿植: 'plant',
  冰箱: 'appliance',
  马桶: 'bath',
  淋浴: 'bath',
  浴室柜: 'bath',
  橱柜: 'kitchen',
};

function promptKeywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[\s,，。;；、/|]+/)
    .filter((word) => word.length >= 2);
  return words.slice(0, 12);
}

/**
 * Shortlist of real catalogue SKUs to feed the model. Falls back to simple
 * heuristics when workstream B's `catalogShortlist` is not available yet.
 */
export function buildCatalogShortlist(
  project: Project,
  prompt: string,
  options: { limit?: number; styleId?: string } = {},
): CatalogItemLite[] {
  const limit = options.limit ?? 90;
  const skus = listCatalogSkus();
  if (skus.length === 0) return [];
  const roomTypes = new Set<RoomType>(project.rooms.map((room) => room.type));
  const styleId = options.styleId ?? project.style.id;
  const keywords = promptKeywords(prompt);
  const usedSkus = new Set(project.furniture.map((item) => item.skuId));
  const scored = skus.map((sku) => {
    let score = 0;
    if (sku.roomTypes.some((type) => roomTypes.has(type))) score += 20;
    if (sku.styleTags.includes(styleId)) score += 12;
    if (usedSkus.has(sku.id)) score += 10;
    for (const keyword of keywords) {
      if (sku.name.includes(keyword) || sku.id.includes(keyword)) score += 16;
      const englishCategory = CATEGORY_WORDS[keyword];
      if (englishCategory && sku.category === englishCategory) score += 20;
    }
    return { sku, score };
  });
  scored.sort((a, b) => b.score - a.score || a.sku.id.localeCompare(b.sku.id));
  const chosen = scored.slice(0, limit).map((entry) => entry.sku);
  return chosen.map((sku) => ({
    id: sku.id,
    name: sku.name,
    category: sku.category,
    w: sku.w,
    d: sku.d,
    h: sku.h,
    tags: [...sku.styleTags, ...sku.roomTypes].slice(0, 8),
  }));
}

export function buildStyleLites(): StyleLite[] {
  return listCatalogStyles()
    .map((style) => ({
      id: style.id,
      name: style.name,
      description: style.description,
      tokens: style.tokens,
    }))
    .filter((style) => Object.keys(style.tokens).length > 0);
}

export function buildMaterialLites(): MaterialLite[] {
  return listCatalogMaterials().map((material) => ({
    id: material.id,
    name: material.name,
    scope: material.scope,
    color: material.color,
    pricePerSqm: material.pricePerSqm,
  }));
}

/* ------------------------------------------------------------------ */
/* API calls                                                          */
/* ------------------------------------------------------------------ */

export async function fetchAiConfig(signal?: AbortSignal): Promise<AiConfig> {
  const response = await fetch('/api/ai/config', { signal });
  if (!response.ok) {
    throw new Error(`AI 配置读取失败（HTTP ${response.status}）`);
  }
  return aiConfigSchema.parse(await response.json());
}

export interface BriefRequestOptions {
  userPrompt: string;
  project: Project;
  variantCount?: number;
  referenceImage?: string;
  signal?: AbortSignal;
  locale?: string;
}

export async function requestDesignBrief(options: BriefRequestOptions): Promise<AiBriefResponse> {
  const request: AiBriefRequest = aiBriefRequestSchema.parse({
    userPrompt: options.userPrompt,
    projectSummary: buildAiProjectSummary(options.project),
    catalog: buildCatalogShortlist(options.project, options.userPrompt),
    styles: buildStyleLites(),
    materials: buildMaterialLites(),
    variantCount: options.variantCount ?? 3,
    referenceImage: options.referenceImage,
    locale: options.locale ?? 'zh-CN',
  });
  return postJson('/api/ai/brief', request, {
    schema: aiBriefResponseSchema,
    signal: options.signal,
  });
}

export interface PatchRequestOptions {
  userPrompt: string;
  project: Project;
  selection?: { roomId?: string; itemIds?: string[] };
  signal?: AbortSignal;
  locale?: string;
}

/**
 * AI_MOCK patch fixtures cannot know runtime furniture ids, so they use
 * `REPLACE_WITH_<SKU>_ITEM_ID` placeholders. Resolve them locally against the
 * current project so the demo path is deterministic but still real.
 */
export function resolveMockPatch(patch: DesignPatch, project: Project): DesignPatch {
  const resolve = (token: string | undefined): string | undefined => {
    if (!token || !token.startsWith('REPLACE_WITH_')) return token;
    const match = /^REPLACE_WITH_(.+?)_ITEM_ID$/.exec(token);
    const key = (match?.[1] ?? '').toLowerCase();
    const candidates = project.furniture.filter((item) => {
      const sku = getCatalogSku(item.skuId);
      return (
        item.skuId.toLowerCase().includes(key) ||
        item.name.toLowerCase().includes(key) ||
        Boolean(sku && sku.category.toLowerCase().includes(key))
      );
    });
    const chosen = candidates[0] ?? project.furniture[0];
    return chosen?.id;
  };
  return {
    ...patch,
    ops: patch.ops.map((op) => {
      if (op.op === 'setFurniture' || op.op === 'replaceFurniture' || op.op === 'removeFurniture') {
        return { ...op, itemId: resolve(op.itemId) ?? op.itemId };
      }
      if (op.op === 'nudgeFurniture') {
        return { ...op, itemId: resolve(op.itemId) ?? op.itemId };
      }
      if (op.op === 'addFurniture' && op.near) {
        return { ...op, near: resolve(op.near) };
      }
      return op;
    }),
  };
}

export async function requestDesignPatch(options: PatchRequestOptions): Promise<AiPatchResponse> {
  const request: AiPatchRequest = aiPatchRequestSchema.parse({
    userPrompt: options.userPrompt,
    projectSummary: buildAiProjectSummary(options.project),
    catalog: buildCatalogShortlist(options.project, options.userPrompt, { limit: 120 }),
    selection: options.selection,
    locale: options.locale ?? 'zh-CN',
  });
  const response = await postJson('/api/ai/patch', request, {
    schema: aiPatchResponseSchema,
    signal: options.signal,
  });
  if (response.mock) return { ...response, patch: resolveMockPatch(response.patch, options.project) };
  return response;
}

export async function requestStyleFromImage(options: {
  image: string;
  hint?: string;
  signal?: AbortSignal;
  locale?: string;
}): Promise<AiStyleResponse> {
  const request = aiStyleRequestSchema.parse({
    image: options.image,
    hint: options.hint,
    locale: options.locale ?? 'zh-CN',
  });
  return postJson('/api/ai/style-from-image', request, {
    schema: aiStyleResponseSchema,
    signal: options.signal,
  });
}

export async function streamAiChat(options: {
  messages: AiChatRequest['messages'];
  project?: Project;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
  locale?: string;
}): Promise<string> {
  const request = aiChatRequestSchema.parse({
    messages: options.messages,
    projectSummary: options.project ? buildAiProjectSummary(options.project) : undefined,
    locale: options.locale ?? 'zh-CN',
  });
  return streamChat('/api/ai/chat', request, options.onDelta, options.signal);
}

/* ------------------------------------------------------------------ */
/* Reference image helpers                                            */
/* ------------------------------------------------------------------ */

export interface ReferenceImageData {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('参考图读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('参考图无法解析'));
    image.src = dataUrl;
  });
}

/** Downscale an uploaded reference image to a JPEG data URL (max edge 1600px). */
export async function prepareReferenceImage(file: File, maxEdge = 1600): Promise<ReferenceImageData> {
  if (!file.type.startsWith('image/')) throw new Error('请选择 PNG / JPG / WebP 图片');
  if (file.size > 12 * 1024 * 1024) throw new Error('参考图超过 12MB，请压缩后再试');
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { dataUrl: source, width, height, name: file.name };
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.86),
    width,
    height,
    name: file.name,
  };
}

/** Style tokens -> swatch list for candidate cards. */
export function tokensToSwatches(tokens: Record<string, string> | undefined, limit = 6): string[] {
  if (!tokens) return [];
  return Object.values(tokens)
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .slice(0, limit);
}
