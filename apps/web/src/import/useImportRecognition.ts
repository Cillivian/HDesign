import { useCallback, useEffect, useRef, useState } from 'react';
import {
  median,
  parseDimensionText,
  type OcrToken,
  type ParseDebug,
  type ParseDraft,
  type RasterImage,
} from '@hdesign/plan-recognition';
import type { AiParseLocalHints, ParseWall } from '@hdesign/domain';
import { ImportError, errorMessage } from './errors';
import { runLocalParse } from './recognition-client';
import { rasterToDataUrl } from './raster';
import { isOcrAvailable, recognizeText } from '../services/ocr';
import { enhanceWithVision, getVisionStatus, overviewFactorFor } from '../services/ai-parse';
import {
  emptyStages,
  type RecognitionState,
  type ScaleState,
  type SourceInfo,
  type StageId,
  type StageState,
} from './types';

type StagePatch = Partial<StageState> & { id: StageId };

/** Keep the hint payload small: the prompt only needs a representative sample. */
const MAX_LOCAL_HINT_DIMENSIONS = 80;

export interface UseImportRecognition {
  stages: StageState[];
  busy: boolean;
  error: { message: string; hint?: string } | null;
  recognition: RecognitionState | null;
  visionConfigured: boolean | null;
  start: (source: SourceInfo) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  clearError: () => void;
}

function updateStage(stages: StageState[], patch: StagePatch): StageState[] {
  return stages.map((stage) => (stage.id === patch.id ? { ...stage, ...patch } : stage));
}

function messageFor(error: unknown): { message: string; hint?: string } {
  if (error instanceof ImportError) return { message: error.message, hint: error.hint };
  return errorMessage(error);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Local CV hints for the vision prompt (overview frame)              */
/* ------------------------------------------------------------------ */

/**
 * Dominant wall thickness in raster px. `debug.medianThicknessPx` is the thick-band
 * mode measured over the whole sheet; trust it only when the emitted walls agree
 * with it, otherwise the draft's own median is the better description of the walls.
 */
function localWallThicknessPx(
  walls: ParseWall[],
  debug: Pick<ParseDebug, 'medianThicknessPx'> | null | undefined,
): number {
  const draftThicknesses = walls
    .map((wall) => wall.thicknessPx)
    .filter((value) => Number.isFinite(value) && value > 0);
  const draftMedian = median(draftThicknesses);
  const bandMedian = debug?.medianThicknessPx;
  if (!Number.isFinite(bandMedian) || !bandMedian || bandMedian <= 0) return draftMedian;
  if (draftMedian <= 0) return bandMedian;
  const ratio = bandMedian / draftMedian;
  return ratio >= 0.5 && ratio <= 2 ? bandMedian : draftMedian;
}

/** Bounding box of the local wall centerlines, expanded by half the thickest wall band. */
function localWallEnvelope(
  walls: ParseWall[],
): { x: number; y: number; w: number; h: number } | null {
  if (walls.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let halfThickness = 0;
  for (const wall of walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x);
    minY = Math.min(minY, wall.a.y, wall.b.y);
    maxX = Math.max(maxX, wall.a.x, wall.b.x);
    maxY = Math.max(maxY, wall.a.y, wall.b.y);
    const thickness = Number.isFinite(wall.thicknessPx) ? wall.thicknessPx : 0;
    halfThickness = Math.max(halfThickness, thickness / 2);
  }
  const w = maxX - minX + halfThickness * 2;
  const h = maxY - minY + halfThickness * 2;
  if (!(w > 0) || !(h > 0)) return null;
  return { x: minX - halfThickness, y: minY - halfThickness, w, h };
}

/** OCR dimension annotations mapped from raster px to overview px. */
function localDimensionHints(
  tokens: OcrToken[],
  factor: number,
): AiParseLocalHints['dimensions'] {
  const result: AiParseLocalHints['dimensions'] = [];
  for (const token of tokens) {
    if (result.length >= MAX_LOCAL_HINT_DIMENSIONS) break;
    const text = token.text.trim();
    if (!text) continue;
    const item = parseDimensionText(text).items[0];
    if (!item || !Number.isFinite(item.valueMm)) continue;
    // Residential dimensions are 100 mm…100 m; anything else is a room-number or
    // furniture label that happened to contain digits.
    if (item.valueMm < 100 || item.valueMm > 100_000) continue;
    result.push({
      text: text.slice(0, 60),
      valueMm: item.valueMm,
      x: round2(token.x / factor),
      y: round2(token.y / factor),
    });
  }
  return result;
}

/**
 * Builds the `hints.local` payload from the real local CV pass: dominant wall
 * thickness, wall count, building envelope and OCR dimension anchors, all in the
 * overview frame the model sees. Returns `undefined` when the local pass found no
 * walls, so the prompt is never fed misleading measurements.
 */
export function buildLocalVisionHints(
  draft: ParseDraft,
  debug: Pick<ParseDebug, 'medianThicknessPx'> | null | undefined,
  tokens: OcrToken[],
  factor: number,
): AiParseLocalHints | undefined {
  if (draft.walls.length === 0) return undefined;
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const hints: AiParseLocalHints = {
    wallCount: draft.walls.length,
    dimensions: localDimensionHints(tokens, safeFactor),
  };
  const thicknessPx = localWallThicknessPx(draft.walls, debug);
  if (thicknessPx > 0) hints.wallThicknessPx = round2(thicknessPx / safeFactor);
  const envelope = localWallEnvelope(draft.walls);
  if (envelope) {
    hints.envelope = {
      x: round2(envelope.x / safeFactor),
      y: round2(envelope.y / safeFactor),
      w: round2(envelope.w / safeFactor),
      h: round2(envelope.h / safeFactor),
    };
  }
  return hints;
}

export function useImportRecognition(): UseImportRecognition {
  const [stages, setStages] = useState<StageState[]>(emptyStages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [recognition, setRecognition] = useState<RecognitionState | null>(null);
  const [visionConfigured, setVisionConfigured] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void getVisionStatus()
      .then((status) => {
        if (mountedRef.current) setVisionConfigured(status.configured);
      })
      .catch(() => {
        if (mountedRef.current) setVisionConfigured(false);
      });
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStages(emptyStages());
    setBusy(false);
    setError(null);
    setRecognition(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const start = useCallback(async (source: SourceInfo) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setRecognition(null);
    setBusy(true);
    setStages(emptyStages());

    const report = (patch: StagePatch): void => {
      if (!mountedRef.current || controller.signal.aborted) return;
      setStages((current) => updateStage(current, patch));
    };

    try {
      report({
        id: 'rasterize',
        status: 'done',
        progress: 1,
        detail: `${source.raster.width}×${source.raster.height} px${source.pageIndex !== undefined ? ` · 第 ${source.pageIndex + 1} 页` : ''}`,
      });

      /* 1. First CV pass: binarise + deskew + geometry. */
      report({ id: 'cv', status: 'running', progress: 0.05, detail: '检测墙线与房间' });
      const first = await runLocalParse(
        source.raster,
        {},
        {
          signal: controller.signal,
          onProgress: (progress) => {
            report({
              id: 'cv',
              status: 'running',
              progress: Math.min(0.96, 0.05 + progress.progress * 0.9),
              detail: progress.label,
            });
          },
        },
      );
      report({
        id: 'cv',
        status: 'done',
        progress: 1,
        detail: `${first.draft.walls.length} 段墙 · ${first.draft.rooms.length} 个房间`,
      });

      /* 2. Optional OCR on the deskewed raster. */
      let tokens: OcrToken[] = [];
      let ocrAvailable = false;
      let ocrReason: string | undefined;
      if (await isOcrAvailable()) {
        report({ id: 'ocr', status: 'running', progress: 0.05, detail: '加载语言包' });
        const ocr = await recognizeText(first.raster, {
          signal: controller.signal,
          onProgress: (label, progress) =>
            report({ id: 'ocr', status: 'running', progress, detail: label }),
        });
        tokens = ocr.tokens;
        ocrAvailable = ocr.available;
        ocrReason = ocr.reason;
        report({
          id: 'ocr',
          status: ocr.available ? 'done' : 'skipped',
          progress: 1,
          detail: ocr.available ? `${tokens.length} 个文字块` : ocr.reason,
        });
      } else {
        report({
          id: 'ocr',
          status: 'skipped',
          progress: 1,
          detail: '未安装 OCR 语言包，可继续识别或用两点校准比例',
        });
        ocrReason = 'OCR 语言包未安装（pnpm setup:ocr 可启用）';
      }

      if (controller.signal.aborted) throw new DOMException('已取消', 'AbortError');

      /* 3. Second CV pass with OCR hints (scale/labels); skip when OCR gave nothing. */
      let parseResult = first;
      if (tokens.length > 0) {
        report({ id: 'cv', status: 'running', progress: 0.2, detail: '结合尺寸文字复核' });
        parseResult = await runLocalParse(
          first.raster,
          { ocr: tokens, skipDeskew: true },
          {
            signal: controller.signal,
            onProgress: (progress) =>
              report({
                id: 'cv',
                status: 'running',
                progress: Math.min(0.98, 0.2 + progress.progress * 0.78),
                detail: progress.label,
              }),
          },
        );
        report({
          id: 'cv',
          status: 'done',
          progress: 1,
          detail: `${parseResult.draft.walls.length} 段墙 · ${parseResult.draft.rooms.length} 个房间`,
        });
      }

      /* 4. Optional DeepSeek vision enhancement. */
      report({ id: 'vision', status: 'running', progress: 0.1, detail: '检查视觉服务' });
      // Local measurements are forwarded in the overview frame the model sees, so the
      // prompt can calibrate against real wall poché and OCR dimension text instead of
      // guessing the scale from the image width.
      const localHints = buildLocalVisionHints(
        parseResult.draft,
        parseResult.debug,
        tokens,
        overviewFactorFor(parseResult.raster),
      );
      const vision = await enhanceWithVision(parseResult.draft, parseResult.raster, {
        signal: controller.signal,
        hints: {
          scaleMmPerPx:
            parseResult.draft.scale.source === 'assumed' ? undefined : parseResult.draft.scale.mmPerPx,
          local: localHints,
        },
        onProgress: (label, progress) =>
          report({ id: 'vision', status: 'running', progress, detail: label }),
      });
      if (vision.available) {
        setVisionConfigured(true);
        report({
          id: 'vision',
          status: 'done',
          progress: 1,
          detail: `${vision.model ?? 'DeepSeek'} · 已补充门窗与标注`,
        });
      } else {
        setVisionConfigured(false);
        report({ id: 'vision', status: 'skipped', progress: 1, detail: vision.reason });
      }

      if (!mountedRef.current || controller.signal.aborted) return;

      const dataUrl = rasterToDataUrl(parseResult.raster, 'image/jpeg', 0.94);
      setRecognition({
        source,
        raster: parseResult.raster,
        dataUrl,
        draft: vision.draft,
        debug: parseResult.debug,
        ocr: { available: ocrAvailable, tokenCount: tokens.length, reason: ocrReason },
        vision: {
          available: vision.available,
          model: vision.model,
          reason: vision.reason,
          mock: vision.mock,
        },
      });
      setBusy(false);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        if (mountedRef.current) setBusy(false);
        return;
      }
      if (!mountedRef.current) return;
      const message = messageFor(cause);
      setError(message);
      setBusy(false);
      setStages((current) =>
        current.map((stage) =>
          stage.status === 'running' ? { ...stage, status: 'error', detail: message.message } : stage,
        ),
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return {
    stages,
    busy,
    error,
    recognition,
    visionConfigured,
    start,
    cancel,
    reset,
    clearError,
  };
}

export function scaleStateFromDraft(draft: ParseDraft): ScaleState {
  const source = draft.scale.source;
  return {
    mmPerPx: draft.scale.mmPerPx,
    source: source === 'calibration' ? 'calibration' : source === 'ai' ? 'ai' : source,
  };
}

/** Recomputes the draft scale after the user calibrated two points. */
export function applyCalibration(
  draft: ParseDraft,
  points: { a: { x: number; y: number }; b: { x: number; y: number }; mm: number },
): ScaleState {
  const distancePx = Math.hypot(points.b.x - points.a.x, points.b.y - points.a.y);
  const mmPerPx = points.mm / Math.max(1, distancePx);
  void draft;
  return {
    mmPerPx: Math.round(mmPerPx * 1000) / 1000,
    source: 'calibration',
    measurement: { a: points.a, b: points.b, distancePx, mm: points.mm },
  };
}

export function rasterDataUrl(raster: RasterImage): string {
  return rasterToDataUrl(raster, 'image/jpeg', 0.92);
}
