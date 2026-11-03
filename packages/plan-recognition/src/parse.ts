import type { ParseDraft, ParseLabel, ParseOpening, ParseRoom, ParseWall } from '@hdesign/domain';
import type {
  DebugPolyline,
  OcrToken,
  ParseDebug,
  ParseRasterOptions,
  ParseRasterResult,
  RasterImage,
  ScaleEstimate,
} from './types';
import {
  binarize,
  detectInverted,
  horizontalRuns,
  otsuThreshold,
  removeSmallComponents,
  rotateGray,
  rotateRaster,
  toGrayscale,
  verticalRuns,
} from './raster';
import { estimateSkewDeg } from './hough';
import { extractWalls } from './walls';
import { buildWallMask, segmentRooms, assignRoomLabels, looksLikeRoomName } from './rooms';
import { estimateScaleFromDimensions, parseDimensionText } from './dimensions';

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Full local recognition pipeline: grayscale -> Otsu/invert -> deskew -> wall bands ->
 * collinear merge + opening gaps -> orthogonalise/snap -> room free-space polygons ->
 * OCR dimension/label mapping -> scale estimation -> ParseDraft.
 *
 * Pure function over RGBA pixels; safe inside a Web Worker.
 */
export function parseRaster(
  image: RasterImage,
  options: ParseRasterOptions = {},
): ParseRasterResult {
  const timingsMs: Record<string, number> = {};
  const stages: string[] = [];
  const notes: string[] = [];
  const started = now();
  const report = (stage: string, progress: number, label: string): void => {
    options.onProgress?.({ stage, progress, label });
  };
  report('binarize', 0.05, '读取像素并二值化');

  /* 1. Grayscale + binarisation ------------------------------------ */
  let mark = now();
  const gray = toGrayscale(image);
  const threshold = clamp(Math.round(otsuThreshold(gray)), 35, 225);
  const inverted = detectInverted(gray, threshold);
  let ink = binarize(gray, threshold, inverted);
  timingsMs.binarize = Math.round(now() - mark);
  stages.push(inverted ? '灰度化 → 反色检测（深色底） → 二值化' : '灰度化 → 背景检测 → 二值化');
  report('binarize', 0.12, '二值化完成');

  /* 2. Deskew ------------------------------------------------------ */
  mark = now();
  const maxSkew = options.maxSkewDeg ?? 3;
  const measuredSkew = options.skipDeskew ? 0 : estimateSkewDeg(gray, Math.max(3, maxSkew));
  report('deskew', 0.2, '检测图纸倾斜');
  let skewDeg = 0;
  let raster: RasterImage = image;
  if (Math.abs(measuredSkew) >= 0.15 && Math.abs(measuredSkew) <= maxSkew) {
    skewDeg = measuredSkew;
    const workingGray = rotateGray(gray, -measuredSkew);
    raster = rotateRaster(image, -measuredSkew);
    ink = binarize(workingGray, threshold, inverted);
    stages.push(`倾斜 ${measuredSkew.toFixed(2)}° 已校正`);
    notes.push(`图纸倾斜 ${measuredSkew.toFixed(2)}°，已自动校正`);
  } else if (Math.abs(measuredSkew) > maxSkew) {
    notes.push(`检测到 ${measuredSkew.toFixed(1)}° 倾斜，超出自动校正范围（≤${maxSkew}°），请手动校准`);
  } else {
    raster = {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    };
  }
  timingsMs.deskew = Math.round(now() - mark);
  report('deskew', 0.28, skewDeg ? `已校正 ${skewDeg.toFixed(2)}°` : '无需校正');

  /* 3. Clean + wall extraction ------------------------------------- */
  mark = now();
  ink = removeSmallComponents(ink, Math.max(4, Math.round(ink.width * ink.height * 0.000002)));
  const vertical = verticalRuns(ink);
  const horizontal = horizontalRuns(ink);
  const extraction = extractWalls(ink, vertical, horizontal, {
    minWallLengthPx: options.minWallLengthPx,
    bridgeGapPx: options.bridgeGapPx,
  });
  timingsMs.walls = Math.round(now() - mark);
  stages.push(`墙体提取：${extraction.walls.length} 段（含共线合并与端点正交吸附）`);
  report('walls', 0.55, `提取到 ${extraction.walls.length} 段墙体`);

  /* 4. Rooms ------------------------------------------------------- */
  mark = now();
  const wallMask = buildWallMask(extraction, ink.width, ink.height);
  const segmentation = segmentRooms(wallMask, {
    minAreaPx: Math.max(
      300,
      Math.round(ink.width * ink.height * 0.0009),
    ),
  });
  const tokens = options.ocr ?? [];
  const labeledRooms = assignRoomLabels(segmentation.rooms, tokens);
  timingsMs.rooms = Math.round(now() - mark);
  stages.push(`房间分割：${labeledRooms.length} 个封闭房间`);
  report('rooms', 0.72, `识别到 ${labeledRooms.length} 个房间`);

  /* 5. OCR labels + dimensions + scale ----------------------------- */
  mark = now();
  const scale: ScaleEstimate = estimateScaleFromDimensions(
    extraction.walls,
    tokens,
    ink.width,
    ink.height,
    {
      known: options.scale,
      assumedMmPerPx: options.assumedMmPerPx ?? 10,
      openings: extraction.openings,
    },
  );
  const labels: ParseLabel[] = [];
  const dimensions: ParseDraft['dimensions'] = [];
  for (const token of tokens) {
    if (!token.text.trim()) continue;
    const parsed = parseDimensionText(token.text);
    if (parsed.items.length > 0) {
      for (const item of parsed.items) {
        dimensions.push({
          text: token.text.trim(),
          valueMm: item.valueMm,
          at: { x: token.x, y: token.y },
          confidence: clamp(token.confidence ?? 0.6, 0, 1),
        });
      }
      continue;
    }
    if (looksLikeRoomName(token.text)) {
      labels.push({
        text: token.text.trim(),
        at: { x: token.x, y: token.y },
        confidence: clamp(token.confidence ?? 0.6, 0, 1),
      });
    }
  }
  timingsMs.ocr = Math.round(now() - mark);
  report('scale', 0.85, '估算比例尺');
  if (scale.source === 'ocr') {
    stages.push(`比例估算：${scale.mmPerPx.toFixed(2)} mm/px（${scale.samples.length} 处尺寸标注，置信度 ${(scale.confidence * 100).toFixed(0)}%）`);
  } else if (scale.source === 'calibration') {
    stages.push(`比例：两点校准 ${scale.mmPerPx.toFixed(2)} mm/px`);
  } else {
    stages.push(`比例：未找到尺寸标注，暂按 ${scale.mmPerPx.toFixed(2)} mm/px 假定`);
    notes.push('未识别到可靠的尺寸标注，比例暂为假定值，请在审核步骤做两点校准');
  }

  report('assemble', 0.92, '整理识别结果');
  /* 6. Assemble draft --------------------------------------------- */
  mark = now();
  const walls: ParseWall[] = extraction.walls.map((wall, index) => ({
    id: `wall-${index + 1}`,
    a: { x: round2(wall.a.x), y: round2(wall.a.y) },
    b: { x: round2(wall.b.x), y: round2(wall.b.y) },
    thicknessPx: clamp(Math.round(wall.thicknessPx), 1, 200),
    confidence: clamp(wall.confidence, 0, 1),
  }));

  const openings: ParseOpening[] = extraction.openings
    .filter((opening) => Boolean(extraction.walls[opening.wallIndex]))
    .map((opening) => ({
      kind: opening.kind,
      center: { x: round2(opening.center.x), y: round2(opening.center.y) },
      widthPx: Math.max(2, Math.round(opening.widthPx)),
      confidence: clamp(opening.confidence, 0, 1),
    }));

  const rooms: ParseRoom[] = labeledRooms.map((room) => ({
    label: room.label,
    polygon: room.polygon.map((point) => ({ x: round2(point.x), y: round2(point.y) })),
    confidence: clamp(room.confidence, 0, 1),
  }));

  const wallConfidence =
    walls.length > 0 ? walls.reduce((sum, wall) => sum + wall.confidence, 0) / walls.length : 0;
  const roomConfidence =
    rooms.length > 0 ? rooms.reduce((sum, room) => sum + room.confidence, 0) / rooms.length : 0;
  const labelConfidence = labels.length > 0 ? labels.length / 12 : 0;
  const overall = clamp(
    0.45 * wallConfidence + 0.35 * roomConfidence + 0.2 * Math.min(1, labelConfidence),
    0,
    1,
  );

  const diagnostics = [...notes];
  diagnostics.push(`本地识别：${walls.length} 段墙 · ${openings.length} 处门窗 · ${rooms.length} 个房间`);
  if (extraction.openings.length > 0) {
    const doors = extraction.openings.filter((opening) => opening.kind === 'door').length;
    diagnostics.push(`门窗来自墙体断口：${doors} 门 / ${extraction.openings.length - doors} 窗`);
  }
  if (rooms.length === 0) {
    diagnostics.push('未识别到封闭房间，可手工描图或使用视觉模型补充');
  }

  const draft: ParseDraft = {
    image: { width: raster.width, height: raster.height },
    walls,
    openings,
    rooms,
    labels,
    dimensions,
    scale: { mmPerPx: round2(scale.mmPerPx), source: scale.source },
    confidence: {
      overall: round3(overall),
      walls: round3(wallConfidence),
      rooms: round3(roomConfidence),
      labels: round3(labelConfidence),
    },
    diagnostics,
  };

  /* 7. Debug overlay ---------------------------------------------- */
  const polylines: DebugPolyline[] = [];
  for (const band of extraction.bands) {
    polylines.push({ kind: 'wall-band', points: [band.a, band.b] });
  }
  for (const wall of walls) {
    polylines.push({
      kind: 'wall',
      points: [wall.a, wall.b],
      confidence: wall.confidence,
      thicknessPx: wall.thicknessPx,
    });
  }
  for (const opening of extraction.openings) {
    const wall = extraction.walls[opening.wallIndex];
    if (!wall) continue;
    const horizontal = Math.abs(wall.b.x - wall.a.x) >= Math.abs(wall.b.y - wall.a.y);
    const half = opening.widthPx / 2;
    polylines.push({
      kind: 'gap',
      points: horizontal
        ? [
            { x: opening.center.x - half, y: opening.center.y },
            { x: opening.center.x + half, y: opening.center.y },
          ]
        : [
            { x: opening.center.x, y: opening.center.y - half },
            { x: opening.center.x, y: opening.center.y + half },
          ],
      confidence: opening.confidence,
      label: opening.kind,
    });
  }
  for (const room of rooms) {
    polylines.push({ kind: 'room', points: room.polygon, confidence: room.confidence, label: room.label });
  }
  for (const label of labels) {
    polylines.push({ kind: 'label', points: [label.at], label: label.text, confidence: label.confidence });
  }
  for (const dimension of dimensions) {
    polylines.push({
      kind: 'dimension',
      points: [dimension.at],
      label: dimension.text,
      confidence: dimension.confidence,
    });
  }

  const debug: ParseDebug = {
    width: raster.width,
    height: raster.height,
    inverted,
    threshold,
    skewDeg: round2(skewDeg),
    deskewed: Math.abs(skewDeg) > 0,
    medianThicknessPx: extraction.medianThicknessPx,
    wallPixels: extraction.wallPixels,
    inkRatio: round3(extraction.wallPixels / (ink.width * ink.height)),
    timingsMs: { ...timingsMs, total: Math.round(now() - started) },
    stages,
    polylines: options.debug === false ? [] : polylines,
    scale,
    notes: diagnostics,
  };

  timingsMs.assemble = Math.round(now() - mark);
  debug.timingsMs = { ...timingsMs, total: Math.round(now() - started) };
  return { draft, raster, skewDeg: round2(skewDeg), debug };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Convenience helper for the UI: turns the worker result back into a plain draft. */
export function isParseDraftLike(value: unknown): value is ParseDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ParseDraft>;
  return Boolean(candidate.image && Array.isArray(candidate.walls));
}

/** Parses OCR tokens that only contain a single dimension, exposed for the calibration UI. */
export function parseDimensionValue(text: string): number | undefined {
  const parsed = parseDimensionText(text);
  return parsed.items[0]?.valueMm;
}

export type { OcrToken };
