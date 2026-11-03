import { distanceToSegment, polygonAreaSqm, pointInPolygon, type Point } from '@hdesign/domain';
import type { OcrToken, OpeningCandidate, ScaleEstimate, ScaleSample, WallCandidate } from './types';
import { median, rejectOutliers } from './raster';

/* ------------------------------------------------------------------ */
/* Dimension text parsing                                             */
/* ------------------------------------------------------------------ */

export interface ParsedDimension {
  text: string;
  /** All millimetre values in the token, in reading order. */
  valuesMm: number[];
  kind: 'single' | 'pair' | 'chain';
  /** Primary value: the first value, or the sum of a chain. */
  valueMm: number;
}

function normalizeDimensionText(text: string): string {
  return text
    .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, ' ')
    .replace(/[．。]/g, '.')
    .replace(/[×✕✖]/g, 'x')
    .replace(/[＋]/g, '+')
    .replace(/[Ｍ]/g, 'm')
    .trim();
}

function toMillimetres(value: number, unit: string | undefined): number {
  if (unit) {
    const normalized = unit.toLowerCase();
    if (normalized === 'm') return value * 1000;
    if (normalized === 'cm') return value * 10;
    return value;
  }
  // Floor plans annotate either millimetres ("3600") or metres ("3.6").
  if (value >= 100) return value;
  if (value >= 1.5) return value * 1000;
  return value * 1000;
}

/**
 * Parses the dimension annotations found on floor plans:
 * `3600`, `3.6m`, `3600x2800`, `3600×2800`, `3600+1800`, `3600mm`.
 */
export function parseDimensionText(text: string): { items: ParsedDimension[] } {
  const normalized = normalizeDimensionText(text);
  const items: ParsedDimension[] = [];
  const matchPattern = /(\d+(?:\.\d+)?)\s*(mm|cm|m)?/gi;
  const matches: Array<{ value: number; unit: string | undefined; index: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = matchPattern.exec(normalized)) !== null) {
    matches.push({
      value: Number.parseFloat(match[1]!),
      unit: match[2]?.toLowerCase(),
      index: match.index,
      end: match.index + match[0].length,
    });
    if (matches.length > 24) break;
  }
  if (matches.length === 0) return { items };
  if (matches.length > 8) return { items };

  // Detect separators between consecutive numbers.
  const separators: string[] = [];
  for (let index = 0; index + 1 < matches.length; index += 1) {
    separators.push(normalized.slice(matches[index]!.end, matches[index + 1]!.index).trim());
  }
  const isChain = separators.length > 0 && separators.every((separator) => separator === '+');
  const isPair =
    separators.length === 1 &&
    separators.every((separator) => separator === 'x' || separator === '*' || separator === '×');

  if (isChain) {
    const valuesMm = matches.map((entry) => Math.round(toMillimetres(entry.value, entry.unit)));
    items.push({
      text: normalized,
      valuesMm,
      kind: 'chain',
      valueMm: valuesMm.reduce((sum, value) => sum + value, 0),
    });
    return { items };
  }
  if (isPair) {
    const valuesMm = matches.map((entry) => Math.round(toMillimetres(entry.value, entry.unit)));
    items.push({ text: normalized, valuesMm, kind: 'pair', valueMm: valuesMm[0]! });
    return { items };
  }
  for (const entry of matches) {
    items.push({
      text: normalized,
      valuesMm: [Math.round(toMillimetres(entry.value, entry.unit))],
      kind: 'single',
      valueMm: Math.round(toMillimetres(entry.value, entry.unit)),
    });
  }
  return { items };
}

/* ------------------------------------------------------------------ */
/* Scale estimation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Dimension annotations are pure measurements. Text with letters (room names,
 * notes, logos) or symbols is not a dimension even if it contains digits.
 */
export function looksLikeDimensionToken(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned) return false;
  return /^\d[\d\s.,+x×-]*(mm|cm|m)?$/i.test(cleaned);
}

export interface ScaleEstimationOptions {
  /** Known scale (two-point calibration or an AI hint) short-circuits OCR inference. */
  known?: { mmPerPx: number; source: 'calibration' | 'ai' };
  assumedMmPerPx?: number;
  /** Maximum distance from the OCR token to a wall for it to be considered its annotation. */
  maxDistancePx?: number;
  /** Detected openings, used to sanity-check the OCR scale. */
  openings?: OpeningCandidate[];
}

/**
 * Residential plans have physically plausible walls and doors. A scale that turns
 * detected walls into 400 mm slabs or doors into 2 m gaps is a misread OCR cluster,
 * so fall back to the assumed scale and let the user calibrate.
 */
function isPlausibleScale(
  mmPerPx: number,
  walls: WallCandidate[],
  openings: OpeningCandidate[] | undefined,
): boolean {
  const thicknesses = walls.map((wall) => wall.thicknessPx * mmPerPx).filter((value) => value > 0);
  if (thicknesses.length > 0) {
    const wallThickness = median(thicknesses);
    if (wallThickness < 60 || wallThickness > 380) return false;
  }
  const doorWidths = (openings ?? [])
    .filter((opening) => opening.kind === 'door')
    .map((opening) => opening.widthPx * mmPerPx);
  if (doorWidths.length > 0) {
    const doorWidth = median(doorWidths);
    if (doorWidth < 500 || doorWidth > 1800) return false;
  }
  return true;
}

function wallVector(wall: WallCandidate): { dx: number; dy: number; length: number } {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  return { dx, dy, length: Math.hypot(dx, dy) };
}

export function estimateScaleFromDimensions(
  walls: WallCandidate[],
  tokens: OcrToken[],
  imageWidth: number,
  imageHeight: number,
  options: ScaleEstimationOptions = {},
): ScaleEstimate {
  const assumed = options.assumedMmPerPx ?? 10;
  if (options.known) {
    return {
      mmPerPx: options.known.mmPerPx,
      source: options.known.source,
      confidence: 1,
      samples: [],
      axis: {
        x: { mmPerPx: options.known.mmPerPx, count: 0 },
        y: { mmPerPx: options.known.mmPerPx, count: 0 },
      },
    };
  }
  const diagonal = Math.hypot(imageWidth, imageHeight);
  const maxDistance = options.maxDistancePx ?? Math.max(30, Math.round(diagonal * 0.06));

  interface Candidate {
    sample: ScaleSample;
    confidence: number;
  }
  const candidates: Candidate[] = [];

  for (const token of tokens) {
    if (walls.length === 0) break;
    const confidence = token.confidence ?? 0.5;
    // Low-confidence OCR boxes (logos, hatching, damage) produce garbage dimensions.
    if (confidence < 0.45) continue;
    if (!looksLikeDimensionToken(token.text)) continue;
    const parsed = parseDimensionText(token.text);
    if (parsed.items.length === 0) continue;
    const tokenPoint = { x: token.x, y: token.y };
    // Pick the nearest wall; it defines both the reference span and the axis.
    let nearest: { wall: WallCandidate; distance: number } | null = null;
    for (const wall of walls) {
      const distance = distanceToSegment(tokenPoint, wall.a, wall.b);
      if (!nearest || distance < nearest.distance) nearest = { wall, distance };
    }
    if (!nearest || nearest.distance > maxDistance) continue;
    const vector = wallVector(nearest.wall);
    if (vector.length < 8) continue;
    const axis: 'x' | 'y' = Math.abs(vector.dx) >= Math.abs(vector.dy) ? 'x' : 'y';
    for (const item of parsed.items) {
      // A pair (3600x2800) does not map cleanly onto one wall; skip those here.
      if (item.kind === 'pair') continue;
      const mmPerPx = item.valueMm / vector.length;
      if (!Number.isFinite(mmPerPx) || mmPerPx < 1 || mmPerPx > 120) continue;
      candidates.push({
        confidence,
        sample: {
          axis,
          text: token.text,
          valueMm: item.valueMm,
          spanPx: Math.round(vector.length * 10) / 10,
          mmPerPx: Math.round(mmPerPx * 1000) / 1000,
        },
      });
    }
  }

  // Cluster candidate ratios: a real plan repeats the same scale across annotations,
  // while misread digits scatter. Require a consistent cluster before trusting OCR.
  candidates.sort((left, right) => left.sample.mmPerPx - right.sample.mmPerPx);
  const clusters: Candidate[][] = [];
  for (const candidate of candidates) {
    const current = clusters[clusters.length - 1];
    const previous = current?.[current.length - 1];
    if (
      current &&
      previous &&
      Math.abs(candidate.sample.mmPerPx - previous.sample.mmPerPx) <=
        Math.max(0.06, previous.sample.mmPerPx * 0.035)
    ) {
      current.push(candidate);
    } else {
      clusters.push([candidate]);
    }
  }
  clusters.sort((left, right) => right.length - left.length);
  const best = clusters[0] ?? [];
  const bestConfidence = best.reduce((max, candidate) => Math.max(max, candidate.confidence), 0);
  const axes = new Set(best.map((candidate) => candidate.sample.axis));
  // A single-axis pair is usually the same misread text repeated (e.g. top + bottom
  // "10400" both read as "18480"); require broader support in that case.
  const trusted =
    (best.length >= 2 && axes.size >= 2) ||
    (best.length >= 3 && bestConfidence >= 0.6) ||
    (best.length === 1 && bestConfidence >= 0.85);
  const samples: ScaleSample[] = trusted ? best.map((candidate) => candidate.sample) : [];
  const accepted = trusted
    ? rejectOutliers(
        samples.map((sample) => sample.mmPerPx),
        2.5,
      )
    : [];

  if (accepted.length === 0 || !isPlausibleScale(median(accepted), walls, options.openings)) {
    return {
      mmPerPx: assumed,
      source: 'assumed',
      confidence: 0.15,
      samples: [],
      axis: {
        x: { mmPerPx: assumed, count: 0 },
        y: { mmPerPx: assumed, count: 0 },
      },
    };
  }
  const xSamples = samples.filter((sample) => sample.axis === 'x').map((sample) => sample.mmPerPx);
  const ySamples = samples.filter((sample) => sample.axis === 'y').map((sample) => sample.mmPerPx);
  const mmPerPx = median(accepted);
  const spread = accepted.length > 1 ? Math.max(...accepted) / Math.min(...accepted) : 1;
  const avgConfidence =
    samples.reduce((sum, sample) => {
      const match = candidates.find((candidate) => candidate.sample === sample);
      return sum + (match?.confidence ?? 0.5);
    }, 0) / samples.length;
  let confidence: number;
  if (accepted.length >= 4 && spread <= 1.08) confidence = 0.92;
  else if (accepted.length >= 3) confidence = 0.8;
  else if (accepted.length >= 2) confidence = 0.65;
  else confidence = 0.5;
  confidence *= Math.min(1, 0.6 + avgConfidence * 0.5);
  if (spread > 1.25) confidence *= 0.6;
  return {
    mmPerPx: Math.round(mmPerPx * 1000) / 1000,
    source: 'ocr',
    confidence: Math.round(confidence * 100) / 100,
    samples,
    axis: {
      x: {
        mmPerPx: xSamples.length > 0 ? Math.round(median(rejectOutliers(xSamples, 2.5)) * 1000) / 1000 : mmPerPx,
        count: xSamples.length,
      },
      y: {
        mmPerPx: ySamples.length > 0 ? Math.round(median(rejectOutliers(ySamples, 2.5)) * 1000) / 1000 : mmPerPx,
        count: ySamples.length,
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Geometry helpers used by rooms / furniture mapping                 */
/* ------------------------------------------------------------------ */

export function polygonContainsPoint(polygon: Point[], point: Point): boolean {
  return pointInPolygon(point, polygon);
}

export function polygonAreaSquareMetres(polygon: Point[], mmPerPx: number): number {
  const scaled = polygon.map((point) => ({ x: point.x * mmPerPx, y: point.y * mmPerPx }));
  return Math.round(polygonAreaSqm(scaled) * 100) / 100;
}
