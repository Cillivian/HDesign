import {
  pointInPolygon,
  polygonCentroid,
  type ParseDimension,
  type ParseDraft,
  type ParseLabel,
  type ParseOpening,
  type ParseRoom,
  type ParseWall,
  type Point,
} from '@hdesign/domain';
import { median } from './raster';

/**
 * Local CV is authoritative for geometry; the vision model contributes openings,
 * labels and missing walls. When local extraction fails (too few walls) the AI
 * geometry is adopted as a fallback instead of discarding both results.
 *
 * Two failure modes are guarded here:
 * - the model re-emitting annotation/dimension lines as thin "walls" — they are
 *   filtered against the local wall thickness band and building envelope;
 * - a wrong scale inferred from the image width — dimension `span`s give a direct
 *   mm/px measurement that can recalibrate an assumed (or clearly wrong) scale.
 */

export interface MergeDraftsOptions {
  /** How strongly AI-only walls are down-weighted when local walls exist (0..1). */
  aiHintWeight?: number;
}

export interface MergeDraftsResult {
  draft: ParseDraft;
  notes: string[];
}

/** A scale estimated directly from `ParseDimension.span` endpoints. */
export interface DimensionSpanScaleEstimate {
  mmPerPx: number;
  /** Number of dimension spans that agreed after outlier rejection. */
  samples: number;
  /** max/min ratio of the accepted samples (1 = perfect agreement). */
  spread: number;
  /** Longest accepted span, px (same frame as the draft image). */
  longestSpanPx: number;
  /**
   * True when the estimate is supported by >= 2 agreeing spans, or by one very long
   * total span (>= 30% of the image long edge). Short isolated spans are not enough.
   */
  trusted: boolean;
}

const MIN_SCALE_MM_PER_PX = 1;
const MAX_SCALE_MM_PER_PX = 120;
/** Tiny dimension stubs are not chains; they cannot own the scale. */
const MIN_SPAN_DIAGONAL_RATIO = 0.03;
/** One total span this long may support the scale on its own (30% of the long edge). */
const MIN_TOTAL_SPAN_LONG_EDGE_RATIO = 0.3;
/** Relative tolerance of the per-dimension ratio cluster. */
const SPAN_CLUSTER_TOLERANCE_RATIO = 0.05;
/** AI-only walls this thin relative to the local band are annotation strokes. */
const ANNOTATION_THIN_RATIO = 0.45;
/** Annotation chains / axis bands sit just outside the local building envelope. */
const ANNOTATION_ENVELOPE_MARGIN_RATIO = 0.04;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(wall: ParseWall): Point {
  return { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
}

function wallAngleDeg(wall: ParseWall): number {
  return (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
}

function angleDifferenceDeg(left: number, right: number): number {
  let difference = Math.abs(left - right) % 180;
  if (difference > 90) difference = 180 - difference;
  return difference;
}

function projectOnSegmentRaw(point: Point, a: Point, b: Point): { t: number; distance: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared < 1e-6) return { t: 0, distance: distance(point, a) };
  const t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared;
  const projected = { x: a.x + abx * t, y: a.y + aby * t };
  return { t, distance: distance(point, projected) };
}

/** True when `candidate` already exists as (part of) `existing`. */
function wallCoveredBy(candidate: ParseWall, existing: ParseWall, tolerance: number): boolean {
  if (angleDifferenceDeg(wallAngleDeg(candidate), wallAngleDeg(existing)) > 20) return false;
  const start = projectOnSegmentRaw(candidate.a, existing.a, existing.b);
  const end = projectOnSegmentRaw(candidate.b, existing.a, existing.b);
  const margin = tolerance / Math.max(1, distance(existing.a, existing.b));
  if (start.distance > tolerance || end.distance > tolerance) return false;
  return (
    start.t >= -margin &&
    start.t <= 1 + margin &&
    end.t >= -margin &&
    end.t <= 1 + margin
  );
}

function wallsOverlap(left: ParseWall, right: ParseWall, tolerance: number): boolean {
  // Perpendicular walls may share a corner; that is not a duplicate.
  if (angleDifferenceDeg(wallAngleDeg(left), wallAngleDeg(right)) > 20) return false;
  const leftMid = midpoint(left);
  const rightMid = midpoint(right);
  if (distance(leftMid, rightMid) <= tolerance) return true;
  const forward = distance(left.a, right.a) <= tolerance && distance(left.b, right.b) <= tolerance;
  const backward = distance(left.a, right.b) <= tolerance && distance(left.b, right.a) <= tolerance;
  if (forward || backward) return true;
  // The vision model often splits one local wall into several collinear pieces.
  return wallCoveredBy(left, right, tolerance) || wallCoveredBy(right, left, tolerance);
}

function openingKey(opening: ParseOpening): string {
  return `${Math.round(opening.center.x / 8)}:${Math.round(opening.center.y / 8)}:${opening.kind}`;
}

function mergeOpenings(local: ParseOpening[], ai: ParseOpening[], tolerance: number): ParseOpening[] {
  const result = [...local];
  const seen = new Set(result.map(openingKey));
  for (const candidate of ai) {
    const key = openingKey(candidate);
    if (seen.has(key)) continue;
    const tooClose = result.some(
      (existing) =>
        distance(existing.center, candidate.center) <=
          Math.max(tolerance, Math.max(existing.widthPx, candidate.widthPx) * 0.7) &&
        Math.abs(existing.widthPx - candidate.widthPx) <= Math.max(24, candidate.widthPx * 0.6),
    );
    if (tooClose) continue;
    seen.add(key);
    result.push({ ...candidate, confidence: clamp01(candidate.confidence * 0.8) });
  }
  return result;
}

function roomCentroid(room: ParseRoom): Point {
  return polygonCentroid(room.polygon);
}

function mergeRooms(local: ParseRoom[], ai: ParseRoom[]): ParseRoom[] {
  if (local.length === 0) {
    return ai.map((room) => ({ ...room, confidence: clamp01(room.confidence * 0.9) }));
  }
  const result = local.map((room) => ({ ...room }));
  for (const candidate of ai) {
    const center = roomCentroid(candidate);
    const containing = result.find((room) => pointInPolygon(center, room.polygon));
    if (containing) {
      if (!containing.label && candidate.label) containing.label = candidate.label;
      containing.confidence = clamp01(containing.confidence + 0.03);
      continue;
    }
    // AI rooms that do not overlap any local room are likely rooms local CV missed.
    const overlaps = result.some((room) => {
      const localCenter = roomCentroid(room);
      return pointInPolygon(localCenter, candidate.polygon);
    });
    if (!overlaps) result.push({ ...candidate, confidence: clamp01(candidate.confidence * 0.7) });
  }
  return result;
}

function mergeLabels(local: ParseLabel[], ai: ParseLabel[]): ParseLabel[] {
  const result = [...local];
  for (const candidate of ai) {
    const duplicate = result.some(
      (existing) =>
        existing.text === candidate.text && distance(existing.at, candidate.at) <= 24,
    );
    if (!duplicate) result.push({ ...candidate, confidence: clamp01(candidate.confidence * 0.85) });
  }
  return result;
}

function mergeDimensions(local: ParseDimension[], ai: ParseDimension[]): ParseDimension[] {
  const result = [...local];
  for (const candidate of ai) {
    const duplicate = result.some(
      (existing) => existing.text === candidate.text && distance(existing.at, candidate.at) <= 20,
    );
    if (!duplicate) result.push({ ...candidate, confidence: clamp01(candidate.confidence * 0.85) });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Annotation-line guard for AI-only walls                            */
/* ------------------------------------------------------------------ */

interface LocalEnvelope {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of local wall centerlines expanded by half the local wall band. */
function localEnvelope(walls: ParseWall[]): LocalEnvelope | null {
  if (walls.length === 0) return null;
  const halfThickness = Math.max(1, median(walls.map((wall) => wall.thicknessPx))) / 2;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const wall of walls) {
    minX = Math.min(minX, wall.a.x, wall.b.x);
    minY = Math.min(minY, wall.a.y, wall.b.y);
    maxX = Math.max(maxX, wall.a.x, wall.b.x);
    maxY = Math.max(maxY, wall.a.y, wall.b.y);
  }
  const x = minX - halfThickness;
  const y = minY - halfThickness;
  const w = maxX - minX + halfThickness * 2;
  const h = maxY - minY + halfThickness * 2;
  if (!(w > 1) || !(h > 1)) return null;
  return { x, y, w, h };
}

/**
 * True when an AI-only wall looks like a dimension chain / axis line rather than a
 * wall: implausibly thin compared with the local wall band, or its midpoint sits
 * outside the local building envelope (annotation chains run around the outside).
 */
function isLikelyAnnotationLine(
  candidate: ParseWall,
  minThicknessPx: number,
  envelope: LocalEnvelope,
  margin: number,
): boolean {
  if (Number.isFinite(candidate.thicknessPx) && candidate.thicknessPx < minThicknessPx) {
    return true;
  }
  const center = midpoint(candidate);
  return (
    center.x < envelope.x - margin ||
    center.x > envelope.x + envelope.w + margin ||
    center.y < envelope.y - margin ||
    center.y > envelope.y + envelope.h + margin
  );
}

/* ------------------------------------------------------------------ */
/* Scale from dimension spans                                          */
/* ------------------------------------------------------------------ */

interface RatioSample {
  /** valueMm / |span| for this dimension. */
  ratio: number;
  /** Span length in px; longer chains measure the scale more reliably. */
  spanPx: number;
}

/**
 * Weighted median: longer spans carry more weight, so coarse/noisy short segments
 * cannot drag the center. `value`/`weight` keep it generic for the MAD pass.
 */
function weightedMedian<T>(entries: T[], value: (entry: T) => number, weight: (entry: T) => number): number {
  const sorted = [...entries].sort((left, right) => value(left) - value(right));
  const total = sorted.reduce((sum, entry) => sum + weight(entry), 0);
  if (!(total > 0)) return value(sorted[0]!);
  let running = 0;
  for (const entry of sorted) {
    running += weight(entry);
    if (running >= total / 2) return value(entry);
  }
  return value(sorted[sorted.length - 1]!);
}

/**
 * Estimates mm/px from dimension annotations that carry pixel `span` endpoints:
 * `valueMm / |span|`. This is a direct measurement of the drawing's own dimension
 * chain, so it does not depend on the model guessing the image width.
 *
 * Robustness (the model measures horizontal totals accurately but the vertical
 * chain spans are coarse): ratios are weighted by span length, the center is the
 * long-span weighted median, and spans outside a weighted-MAD band are rejected as
 * per-dimension outliers instead of averaging axes. Short stubs below 3% of the
 * diagonal never contribute, and a lone short span is not trusted enough to
 * override a known scale. Returns `null` when nothing usable exists.
 */
export function estimateScaleFromDimensionSpans(
  dimensions: ParseDimension[],
  image: { width: number; height: number },
): DimensionSpanScaleEstimate | null {
  const diagonal = Math.hypot(image.width, image.height);
  const longEdge = Math.max(image.width, image.height);
  const minSpanPx = Math.max(1, diagonal * MIN_SPAN_DIAGONAL_RATIO);

  const samples: RatioSample[] = [];
  for (const dimension of dimensions) {
    const valueMm = dimension.valueMm;
    if (typeof valueMm !== 'number' || !(valueMm > 0)) continue;
    const span = dimension.span;
    if (!span) continue;
    const spanPx = Math.hypot(span.b.x - span.a.x, span.b.y - span.a.y);
    if (!Number.isFinite(spanPx) || spanPx < minSpanPx) continue;
    const ratio = valueMm / spanPx;
    if (!Number.isFinite(ratio)) continue;
    if (ratio < MIN_SCALE_MM_PER_PX || ratio > MAX_SCALE_MM_PER_PX) continue;
    samples.push({ ratio, spanPx });
  }
  if (samples.length === 0) return null;

  const center = weightedMedian(
    samples,
    (sample) => sample.ratio,
    (sample) => sample.spanPx,
  );
  // Weighted MAD: long spans dominate, so noisy short segments cannot widen the band.
  const mad = weightedMedian(
    samples,
    (sample) => Math.abs(sample.ratio - center),
    (sample) => sample.spanPx,
  );
  const tolerance = Math.max(mad * 3, center * SPAN_CLUSTER_TOLERANCE_RATIO, 0.02);
  const kept = samples
    .filter((sample) => Math.abs(sample.ratio - center) <= tolerance)
    .sort((left, right) => left.ratio - right.ratio);
  if (kept.length === 0) return null;

  const spread = kept[kept.length - 1]!.ratio / kept[0]!.ratio;
  if (spread > 1.25) return null;
  const longestSpanPx = kept.reduce((longest, sample) => Math.max(longest, sample.spanPx), 0);
  return {
    mmPerPx:
      Math.round(
        weightedMedian(
          kept,
          (sample) => sample.ratio,
          (sample) => sample.spanPx,
        ) * 1000,
      ) / 1000,
    samples: kept.length,
    spread: Math.round(spread * 1000) / 1000,
    longestSpanPx: Math.round(longestSpanPx * 10) / 10,
    trusted:
      kept.length >= 2 || longestSpanPx >= longEdge * MIN_TOTAL_SPAN_LONG_EDGE_RATIO,
  };
}

export function mergeDrafts(
  local: ParseDraft,
  ai: ParseDraft | null,
  options: MergeDraftsOptions = {},
): MergeDraftsResult {
  if (!ai) {
    return {
      draft: local,
      notes: ['视觉模型未启用或未返回结果，使用本地识别'],
    };
  }
  const hintWeight = options.aiHintWeight ?? 0.75;
  const diagonal = Math.hypot(local.image.width, local.image.height);
  const tolerance = Math.max(10, Math.round(diagonal * 0.012));
  const notes: string[] = [];
  const diagnostics = [...local.diagnostics, ...ai.diagnostics.map((item) => `视觉模型：${item}`)];

  let walls: ParseWall[];
  if (local.walls.length >= 2) {
    walls = [...local.walls];
    const envelope = localEnvelope(local.walls);
    const minThicknessPx = Math.max(
      3,
      median(local.walls.map((wall) => wall.thicknessPx)) * ANNOTATION_THIN_RATIO,
    );
    const envelopeMargin = diagonal * ANNOTATION_ENVELOPE_MARGIN_RATIO;
    let added = 0;
    let skippedAnnotation = 0;
    for (const candidate of ai.walls) {
      if (walls.some((wall) => wallsOverlap(wall, candidate, tolerance))) continue;
      // Never drop local walls: this guard only applies to AI-added candidates.
      if (
        envelope &&
        isLikelyAnnotationLine(candidate, minThicknessPx, envelope, envelopeMargin)
      ) {
        skippedAnnotation += 1;
        continue;
      }
      walls.push({
        ...candidate,
        confidence: clamp01(candidate.confidence * hintWeight),
      });
      added += 1;
    }
    if (added > 0) notes.push(`视觉模型补充了 ${added} 段本地未识别的墙体`);
    if (skippedAnnotation > 0) {
      notes.push(`已忽略 ${skippedAnnotation} 段疑似标注线的视觉墙体`);
    }
  } else {
    walls = ai.walls.map((wall) => ({ ...wall, confidence: clamp01(wall.confidence * 0.9) }));
    notes.push('本地墙体提取不足，已回退到视觉模型结果');
  }

  const openings = mergeOpenings(local.openings, ai.openings, Math.max(12, tolerance));
  if (ai.openings.length > 0) notes.push('门窗位置已结合视觉模型校准');
  const rooms = mergeRooms(local.rooms, ai.rooms);
  if (local.rooms.length === 0 && ai.rooms.length > 0) notes.push('房间来自视觉模型');
  const labels = mergeLabels(local.labels, ai.labels);
  const dimensions = mergeDimensions(local.dimensions, ai.dimensions);

  /*
   * Scale: a `calibration` value is user intent and is never touched. Otherwise a
   * span-derived scale (mm per dimension-chain px) is a direct measurement and is
   * preferred over the model's own image-width guess.
   */
  const spanScale = estimateScaleFromDimensionSpans(dimensions, local.image);
  let scale = local.scale;
  if (local.scale.source === 'calibration') {
    // Two-point calibration wins over every automatic estimate.
  } else if (local.scale.source === 'assumed') {
    if (spanScale?.trusted) {
      scale = { mmPerPx: spanScale.mmPerPx, source: 'ai' };
      notes.push(
        `已按尺寸标注跨度校准比例尺：${spanScale.mmPerPx.toFixed(2)} mm/px（${spanScale.samples} 处标注）`,
      );
    } else if (ai.scale.source !== 'assumed') {
      scale = ai.scale;
      notes.push('比例尺来自视觉模型估计');
    }
  } else if (spanScale?.trusted) {
    const difference = Math.abs(spanScale.mmPerPx - local.scale.mmPerPx) / local.scale.mmPerPx;
    if (difference > 0.1) {
      scale = { mmPerPx: spanScale.mmPerPx, source: 'ai' };
      notes.push(
        `尺寸标注跨度与本地比例相差 ${Math.round(difference * 100)}%，已按标注校准：${spanScale.mmPerPx.toFixed(2)} mm/px`,
      );
    }
  }

  const wallConfidence =
    walls.length > 0 ? walls.reduce((sum, wall) => sum + wall.confidence, 0) / walls.length : 0;
  const roomConfidence =
    rooms.length > 0 ? rooms.reduce((sum, room) => sum + room.confidence, 0) / rooms.length : 0;
  const labelConfidence =
    labels.length > 0 ? labels.reduce((sum, label) => sum + label.confidence, 0) / labels.length : 0;
  const overall = clamp01(0.45 * wallConfidence + 0.35 * roomConfidence + 0.2 * labelConfidence);

  return {
    draft: {
      ...local,
      walls,
      openings,
      rooms,
      labels,
      dimensions,
      scale,
      confidence: {
        overall: Number(overall.toFixed(3)),
        walls: Number(wallConfidence.toFixed(3)),
        rooms: Number(roomConfidence.toFixed(3)),
        labels: Number(labelConfidence.toFixed(3)),
      },
      diagnostics: [...diagnostics, ...notes],
    },
    notes,
  };
}
