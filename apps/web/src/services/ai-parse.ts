import {
  aiParseRequestSchema,
  aiParseResponseSchema,
  type AiParseLocalHints,
  type AiParseRequest,
  type ParseDraft,
} from '@hdesign/domain';
import { mergeDrafts, type RasterImage } from '@hdesign/plan-recognition';
import { ApiError, fetchHealth, postJson } from './api-client';
import { cropRasterJpegDataUrl, rasterToJpegDataUrl } from '../import/raster';

/**
 * DeepSeek-Vision enhancement for the import pipeline.
 *
 * Images: one overview (<=1600 px long edge) plus up to 4 overlapping crops, all JPEG.
 * Local CV stays primary; the AI draft is merged as hints (openings/labels/missing walls).
 * When AI is not configured this returns the local draft untouched with `available:false`
 * — the wizard never fakes a vision result.
 */

const TILE_LONG_EDGE = 1600;
const OVERVIEW_LONG_EDGE = 1600;
const MAX_TILES = 4;
export const VISION_ENDPOINT = '/api/ai/parse-plan';

/**
 * Overview px per raster px for the vision request's first image. Exported so the
 * import pipeline can express its local CV hints in the overview frame before the
 * images are built (both use the same constant, so they can never disagree).
 */
export function overviewFactorFor(size: { width: number; height: number }): number {
  const longEdge = Math.max(size.width, size.height);
  return Math.max(1, longEdge / OVERVIEW_LONG_EDGE);
}

export interface VisionStatus {
  configured: boolean;
  provider: string;
  model: string;
  visionModel?: string;
  mock: boolean;
}

export async function getVisionStatus(): Promise<VisionStatus> {
  try {
    const health = await fetchHealth();
    return {
      configured: Boolean(health.ai?.configured),
      provider: health.ai?.provider ?? 'deepseek',
      model: health.ai?.model ?? '',
      visionModel: health.ai?.visionModel,
      mock: Boolean(health.ai?.mock),
    };
  } catch {
    return { configured: false, provider: 'unknown', model: '', mock: false };
  }
}

export interface VisionEnhanceOptions {
  hints?: {
    scaleMmPerPx?: number;
    unit?: 'mm' | 'm';
    /**
     * Measurements from the local CV pass, already expressed in the overview
     * frame (see `overviewFactorFor`). Optional and backward compatible: when
     * absent the prompt simply gets no local hints.
     */
    local?: AiParseLocalHints;
  };
  onProgress?: (label: string, progress: number) => void;
  signal?: AbortSignal;
  /** Skip the network call when the caller already knows AI is off. */
  forceDisabled?: boolean;
}

export interface VisionEnhanceResult {
  draft: ParseDraft;
  available: boolean;
  reason?: string;
  model?: string;
  notes: string[];
  mock?: boolean;
}

/**
 * Maps the vision draft from overview pixels back into raster pixels.
 *
 * Dimension values (`valueMm`) are scale-free, but their `span` endpoints are
 * pixel coordinates: they must be multiplied by `factor` exactly like `at`, or
 * span-based calibration would compute a scale in the wrong frame.
 */
export function scaledDraft(
  draft: ParseDraft,
  factor: number,
  width: number,
  height: number,
): ParseDraft {
  if (Math.abs(factor - 1) < 1e-6) {
    return { ...draft, image: { width, height } };
  }
  const point = (value: { x: number; y: number }) => ({
    x: Math.round(value.x * factor * 100) / 100,
    y: Math.round(value.y * factor * 100) / 100,
  });
  return {
    ...draft,
    image: { width, height },
    walls: draft.walls.map((wall) => ({
      ...wall,
      a: point(wall.a),
      b: point(wall.b),
      thicknessPx: Math.max(1, Math.min(200, Math.round(wall.thicknessPx * factor))),
    })),
    openings: draft.openings.map((opening) => ({
      ...opening,
      center: point(opening.center),
      widthPx: Math.max(2, Math.round(opening.widthPx * factor)),
    })),
    rooms: draft.rooms.map((room) => ({ ...room, polygon: room.polygon.map(point) })),
    labels: draft.labels.map((label) => ({ ...label, at: point(label.at) })),
    dimensions: draft.dimensions.map((dimension) => ({
      ...dimension,
      at: point(dimension.at),
      ...(dimension.span
        ? { span: { a: point(dimension.span.a), b: point(dimension.span.b) } }
        : {}),
    })),
    scale: {
      ...draft.scale,
      mmPerPx: Math.max(0.1, Math.round((draft.scale.mmPerPx / factor) * 1000) / 1000),
    },
  };
}

/** Overview + up to 4 overlapping crops, all within the 1600 px JPEG budget. */
export function buildVisionImages(raster: RasterImage): {
  images: AiParseRequest['images'];
  factor: number;
} {
  const factor = overviewFactorFor(raster);
  const overviewWidth = Math.max(1, Math.round(raster.width / factor));
  const overviewHeight = Math.max(1, Math.round(raster.height / factor));
  const overview = rasterToJpegDataUrl(raster, OVERVIEW_LONG_EDGE);
  const images: AiParseRequest['images'] = [
    { dataUrl: overview, width: overviewWidth, height: overviewHeight },
  ];

  const tileWidth = Math.max(80, Math.round(overviewWidth * 0.62));
  const tileHeight = Math.max(80, Math.round(overviewHeight * 0.62));
  const xs = [0, Math.max(0, overviewWidth - tileWidth)];
  const ys = [0, Math.max(0, overviewHeight - tileHeight)];
  let tileCount = 0;
  for (const y of ys) {
    for (const x of xs) {
      if (tileCount >= MAX_TILES) break;
      const box = { x, y, w: Math.min(tileWidth, overviewWidth - x), h: Math.min(tileHeight, overviewHeight - y) };
      const fullBox = {
        x: box.x * factor,
        y: box.y * factor,
        w: box.w * factor,
        h: box.h * factor,
      };
      const crop = cropRasterJpegDataUrl(raster, fullBox, TILE_LONG_EDGE);
      images.push({
        dataUrl: crop.dataUrl,
        width: crop.width,
        height: crop.height,
        tile: { x: box.x, y: box.y, w: box.w, h: box.h },
      });
      tileCount += 1;
    }
  }
  return { images, factor };
}

function disabledResult(local: ParseDraft, reason: string): VisionEnhanceResult {
  return { draft: local, available: false, reason, notes: [reason] };
}

export async function enhanceWithVision(
  local: ParseDraft,
  raster: RasterImage,
  options: VisionEnhanceOptions = {},
): Promise<VisionEnhanceResult> {
  if (options.forceDisabled) {
    return disabledResult(local, '已跳过视觉增强，使用本地识别结果');
  }
  const status = await getVisionStatus();
  if (!status.configured) {
    return disabledResult(
      local,
      '未配置 AI_API_KEY，视觉增强不可用；本地识别与手工描图不受影响',
    );
  }
  try {
    options.onProgress?.('准备识别图片', 0.1);
    const { images, factor } = buildVisionImages(raster);
    const request = aiParseRequestSchema.parse({
      images,
      imageSize: { width: raster.width, height: raster.height },
      locale: 'zh-CN',
      hints: {
        ...(options.hints ?? {}),
        // The images/overview are built here, so the frame ratio is authoritative.
        overviewFactor: factor,
      },
    });
    options.onProgress?.('视觉模型识别中', 0.35);
    const response = await postJson(VISION_ENDPOINT, request, {
      schema: aiParseResponseSchema,
      signal: options.signal,
    });
    options.onProgress?.('合并视觉结果', 0.9);
    const scaled = scaledDraft(response.draft, factor, raster.width, raster.height);
    const merged = mergeDrafts(local, scaled);
    return {
      draft: merged.draft,
      available: true,
      model: response.model,
      notes: merged.notes,
      mock: response.mock,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof ApiError) {
      const reason =
        error.code === 'AI_NOT_CONFIGURED'
          ? '未配置 AI_API_KEY，视觉增强不可用'
          : `视觉增强失败：${error.message}${error.hint ? `（${error.hint}）` : ''}`;
      return disabledResult(local, reason);
    }
    const message = error instanceof Error ? error.message : String(error);
    return disabledResult(local, `视觉增强失败：${message}；已保留本地识别结果`);
  }
}
