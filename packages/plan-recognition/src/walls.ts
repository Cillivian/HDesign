import { distanceToSegment, type Point } from '@hdesign/domain';
import type {
  BinaryImage,
  OpeningCandidate,
  WallCandidate,
  WallExtraction,
} from './types';
import {
  binarize,
  median,
  otsuThreshold,
  quantile,
  toGrayscale,
} from './raster';
import { adaptiveThreshold, isThinPixel } from './ink';
import { angleToAxis, houghSegments, segmentAngleDeg } from './hough';

/* ------------------------------------------------------------------ */
/* Tuning                                                             */
/* ------------------------------------------------------------------ */

interface WallTuning {
  minWallLengthPx: number;
  bridgeGapPx: number;
  typicalThickness: number;
  minThickness: number;
  maxThickness: number;
}

export function wallTuning(width: number, height: number, options: {
  minWallLengthPx?: number;
  bridgeGapPx?: number;
}): WallTuning {
  const diagonal = Math.hypot(width, height);
  return {
    minWallLengthPx: options.minWallLengthPx ?? clamp(Math.round(diagonal * 0.018), 12, 60),
    // Doors and up to ~3 m sliding openings must be bridged so a wall stays one wall.
    bridgeGapPx: options.bridgeGapPx ?? clamp(Math.round(diagonal * 0.2), 40, 520),
    typicalThickness: 10,
    minThickness: 3,
    maxThickness: 26,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------------------ */
/* Stroke thickness estimate                                          */
/* ------------------------------------------------------------------ */

export interface StrokeThickness {
  /** Dominant wall poché thickness (usually the exterior/load-bearing wall in plans). */
  median: number;
  /** Lower bound: thinner interior partitions still count as walls. */
  low: number;
  /** Upper bound: thicker structural walls / columns still reach this band. */
  high: number;
  /** True when the estimate came from a real thick-band cluster (not the fallback). */
  clustered?: boolean;
}

/**
 * Estimates stroke widths from per-pixel run lengths.
 *
 * Wall pixels are long in one direction and exactly `thickness` in the other.
 * The naive median over *all* long runs is dominated by annotation ink: on a
 * CAD drawing, thin dimension/axis lines and text strokes are one to two
 * orders of magnitude more numerous than wall poché, so a median collapses to
 * 2-3 px and every line on the sheet passes the wall filter. Instead we keep
 * only long runs whose short side is at least 4 px, bucket them, and take the
 * dominant *thick* cluster: that is the drawn wall band. Text strokes (short
 * runs) and single-pixel annotation lines never form that cluster.
 */
export function estimateStrokeThickness(
  verticalRun: Int32Array,
  horizontalRun: Int32Array,
  minLongRun = 28,
): StrokeThickness {
  const samples: number[] = [];
  for (let index = 0; index < verticalRun.length; index += 1) {
    const vertical = verticalRun[index]!;
    const horizontal = horizontalRun[index]!;
    if (!vertical || !horizontal) continue;
    const long = Math.max(vertical, horizontal);
    const short = Math.min(vertical, horizontal);
    // `short < 4` is the annotation-line band (dimension lines, axis chains,
    // dashes); it must not contribute to the wall thickness estimate.
    if (long < minLongRun || short < 4 || short > 96) continue;
    samples.push(short);
  }
  if (samples.length < 8) {
    // Tiny or hollow-line drawings: keep the previous median heuristic so
    // low-resolution plans still produce a usable thickness band.
    const fallback = samples.length > 0 ? samples : [10];
    const center = median(fallback);
    const low = Math.max(2, Math.round(center * 0.5));
    return {
      median: Math.max(2, Math.round(center)),
      low,
      high: Math.max(low + 1, Math.round(center * 1.8)),
      clustered: false,
    };
  }

  // Histogram in 2 px buckets; walls are a stable band, annotation strokes are not.
  const buckets = new Map<number, number>();
  for (const sample of samples) {
    const bucket = Math.min(96, Math.floor(sample / 2) * 2);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  // Walk buckets thickest-first so a wide text/hatch band cannot outvote the
  // wall poché: a bucket wins when it holds the most ink and is at least half
  // as common as the global peak.
  let peak = 0;
  for (const count of buckets.values()) peak = Math.max(peak, count);
  let wallBucket = 0;
  let wallCount = 0;
  for (const [bucket, count] of buckets) {
    if (bucket < 4) continue;
    if (count < peak * 0.35) continue;
    if (bucket > wallBucket || (bucket === wallBucket && count > wallCount)) {
      wallBucket = bucket;
      wallCount = count;
    }
  }
  if (wallBucket === 0) {
    const values = samples.filter((value) => value >= 4);
    const center = median(values.length > 0 ? values : samples);
    const low = Math.max(2, Math.round(center * 0.5));
    return {
      median: Math.max(2, Math.round(center)),
      low,
      high: Math.max(low + 1, Math.round(center * 1.8)),
      clustered: false,
    };
  }
  // Average the winning bucket with its neighbours for sub-bucket precision.
  let weighted = 0;
  let weight = 0;
  for (const delta of [-1, 0, 1]) {
    const bucket = wallBucket + delta * 2;
    const count = buckets.get(bucket) ?? 0;
    weighted += bucket * count;
    weight += count;
  }
  const typical = Math.max(4, Math.round(weight > 0 ? weighted / weight : wallBucket));
  // 0.35 keeps 100 mm partitions in a 240 mm-poché drawing while dropping
  // text strokes and hatch stripes (which sit at 25-40% of that in practice).
  const low = Math.max(3, Math.round(typical * 0.35));
  const high = Math.max(low + 2, Math.round(typical * 1.75));
  return { median: typical, low, high, clustered: true };
}

/* ------------------------------------------------------------------ */
/* Oriented band extraction                                           */
/* ------------------------------------------------------------------ */

interface BandSegment {
  orientation: 'h' | 'v';
  /** Centerline coordinate: y for horizontal bands, x for vertical bands. */
  pos: number;
  start: number;
  end: number;
  thickness: number;
  confidence: number;
}

interface TrackedBand {
  /** Running median of the run centers (wall centerline). */
  pos: number;
  /** Running median of the run widths (wall thickness). */
  thickness: number;
  start: number;
  end: number;
  /** Last observed run center, used for continuity matching. */
  lastCenter: number;
  centers: number[];
  widths: number[];
}

function bandsFromMask(
  mask: BinaryImage,
  orientation: 'h' | 'v',
  tuning: WallTuning,
): BandSegment[] {
  const { width, height, data } = mask;
  const alongAxis = orientation === 'h' ? width : height;
  const acrossAxis = orientation === 'h' ? height : width;
  const minLength = tuning.minWallLengthPx;
  // Keep short terminal stubs (a wall ends at a T junction and its last piece is
  // thinner than the min wall length); they are merged/bridged or dropped later.
  const minRawLength = Math.max(4, Math.round(minLength * 0.35));
  // A wall band may drift by a pixel or two along its length; the tracker keeps
  // following as long as the next run centre is within this distance.
  const continueTolerance = Math.max(3, tuning.typicalThickness * 0.6);

  const segments: BandSegment[] = [];
  let active: TrackedBand[] = [];

  const pixelAt = (along: number, across: number): number =>
    orientation === 'h' ? data[across * width + along]! : data[along * width + across]!;

  const flush = (band: TrackedBand): void => {
    if (band.end - band.start + 1 < minRawLength) return;
    segments.push({
      orientation,
      pos: median(band.centers),
      start: band.start,
      end: band.end,
      thickness: Math.max(2, Math.round(median(band.widths))),
      confidence: 0.5,
    });
  };

  for (let along = 0; along < alongAxis; along += 1) {
    // Wall-thickness runs of the mask along this scanline/column. Unlike a
    // whole-component pass this cannot be poisoned by one large solid block:
    // every across-direction run is measured on its own, so a wall band that
    // merges with a shear-wall block keeps being traced outside the block.
    const runs: Array<{ center: number; thickness: number }> = [];
    let across = 0;
    while (across < acrossAxis) {
      if (!pixelAt(along, across)) {
        across += 1;
        continue;
      }
      let end = across;
      while (end + 1 < acrossAxis && pixelAt(along, end + 1)) end += 1;
      const thickness = end - across + 1;
      if (thickness >= tuning.minThickness && thickness <= tuning.maxThickness) {
        runs.push({ center: (across + end) / 2, thickness });
      }
      across = end + 1;
    }

    const usedRuns = new Uint8Array(runs.length);
    const usedBands = new Uint8Array(active.length);
    // Greedy nearest-center matching keeps collinear bands stable across
    // junctions, where two bands cross the same scanline.
    for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
      const run = runs[runIndex]!;
      let bestBand = -1;
      let bestDistance = Infinity;
      for (let bandIndex = 0; bandIndex < active.length; bandIndex += 1) {
        if (usedBands[bandIndex]) continue;
        const distance = Math.abs(run.center - active[bandIndex]!.lastCenter);
        if (distance <= continueTolerance && distance < bestDistance) {
          bestDistance = distance;
          bestBand = bandIndex;
        }
      }
      if (bestBand < 0) continue;
      const band = active[bestBand]!;
      usedBands[bestBand] = 1;
      usedRuns[runIndex] = 1;
      band.centers.push(run.center);
      band.widths.push(run.thickness);
      band.pos = median(band.centers);
      band.thickness = median(band.widths);
      band.lastCenter = run.center;
      band.end = along;
    }

    const survivors: TrackedBand[] = [];
    for (let bandIndex = 0; bandIndex < active.length; bandIndex += 1) {
      const band = active[bandIndex]!;
      if (usedBands[bandIndex]) survivors.push(band);
      else flush(band);
    }
    for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
      if (usedRuns[runIndex]) continue;
      const run = runs[runIndex]!;
      survivors.push({
        pos: run.center,
        thickness: run.thickness,
        start: along,
        end: along,
        lastCenter: run.center,
        centers: [run.center],
        widths: [run.thickness],
      });
    }
    active = survivors;
    if (segments.length > 400) break;
  }
  for (const band of active) flush(band);
  return segments;
}

/* ------------------------------------------------------------------ */
/* Hollow (double-line / hatched) wall bands                          */
/* ------------------------------------------------------------------ */

/** A long, thin axial stroke: a wall face line, a glass line or a hatch edge. */
interface LongLine {
  /** Center coordinate across the stroke (y for horizontal, x for vertical). */
  pos: number;
  start: number;
  end: number;
  /** Stroke width in px (1-7 for drawn face/glass lines). */
  thickness: number;
}

/**
 * Collects long thin axial strokes.
 *
 * A wall face line is long along the wall and only a few pixels across, while
 * solid poché is thick in both directions (so it is captured by the run-length
 * band pass instead) and text/dimension ticks are short (so they never become
 * lines). This is the raw material for detecting hollow wall bands: groups of
 * parallel face lines one wall thickness apart.
 *
 * Strokes are returned as individual pieces; `mergeLinePieces` stitches pieces
 * of the same drawn line back together (crossing dimension ticks and hatch
 * lines cut a hole in the thin-stroke test at every intersection).
 */
function extractLongLines(
  ink: BinaryImage,
  alongRun: Int32Array,
  acrossRun: Int32Array,
  orientation: 'h' | 'v',
  minLineLength: number,
  maxThin: number,
): LongLine[] {
  const { width, height, data } = ink;
  const alongAxis = orientation === 'h' ? width : height;
  const acrossAxis = orientation === 'h' ? height : width;
  const indexAt = (along: number, across: number): number =>
    orientation === 'h' ? across * width + along : along * width + across;
  void alongRun;
  const isInk = (along: number, across: number): boolean =>
    data[indexAt(along, across)] === 1;

  // A drawn line is long along the wall and thin across it. Thickness is taken
  // as the median across-run over the whole run so that hatch stripes or ticks
  // touching the line (which locally stretch the across-run) cannot classify it
  // as solid poché.
  const lines: LongLine[] = [];
  for (let across = 0; across < acrossAxis; across += 1) {
    let along = 0;
    while (along < alongAxis) {
      if (!isInk(along, across)) {
        along += 1;
        continue;
      }
      let end = along;
      while (end + 1 < alongAxis && isInk(end + 1, across)) end += 1;
      const length = end - along + 1;
      if (length >= minLineLength) {
        const samples: number[] = [];
        const stride = Math.max(1, Math.floor(length / 9));
        for (let sample = along; sample <= end; sample += stride) {
          samples.push(acrossRun[indexAt(sample, across)]!);
        }
        // Lower quartile, not median: a wall face line runs along the edge of a
        // hatched band, so part of it is welded to hatch strokes and its
        // across-run balloons there. The open side of the stroke keeps the
        // quartile at the true 1-7 px line width, while a solid poché band is
        // thick everywhere and stays above the limit.
        if (quantile(samples, 0.25) <= maxThin) {
          lines.push({ pos: across, start: along, end, thickness: Math.max(1, median(samples)) });
        }
      }
      along = end + 1;
    }
  }
  return lines;
}

/** One drawn line, possibly cut into several visible pieces by crossings. */
interface MergedLine {
  pos: number;
  thickness: number;
  intervals: Array<{ start: number; end: number }>;
}

/**
 * Stitches line pieces that belong to the same drawn stroke: same centerline
 * position, pieces close enough along the stroke. A perpendicular tick or a
 * hatch stripe only removes a couple of pixels from the thin-stroke test, so
 * the pieces stay adjacent and are fused again here.
 */
function mergeLinePieces(pieces: LongLine[], positionTolerance: number, bridge: number): MergedLine[] {
  const sorted = [...pieces].sort((left, right) => left.pos - right.pos);
  interface Active {
    posSum: number;
    weight: number;
    lastPos: number;
    minPos: number;
    maxPos: number;
    thickness: number;
    intervals: Array<{ start: number; end: number }>;
  }
  const active: Active[] = [];
  for (const piece of sorted) {
    let target: Active | undefined;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const line = active[index]!;
      if (piece.pos - line.lastPos > positionTolerance) break;
      // Only fuse pieces of the *same* drawn stroke: their spans continue each
      // other (a crossing removes at most a few px). Two unrelated collinear
      // strokes elsewhere in the drawing must stay separate lines.
      const connected = line.intervals.some(
        (interval) => piece.start <= interval.end + bridge && piece.end >= interval.start - bridge,
      );
      if (connected) {
        target = line;
        break;
      }
    }
    if (!target) {
      target = {
        posSum: 0,
        weight: 0,
        lastPos: piece.pos,
        minPos: piece.pos,
        maxPos: piece.pos,
        thickness: piece.thickness,
        intervals: [],
      };
      active.push(target);
    }
    target.posSum += piece.pos;
    target.weight += 1;
    target.lastPos = piece.pos;
    target.minPos = Math.min(target.minPos, piece.pos);
    target.maxPos = Math.max(target.maxPos, piece.pos);
    target.thickness = Math.max(target.thickness, piece.thickness);
    target.intervals.push({ start: piece.start, end: piece.end });
  }
  const lines: MergedLine[] = [];
  for (const line of active) {
    line.intervals.sort((left, right) => left.start - right.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of line.intervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end + bridge) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    }
    lines.push({
      pos: line.weight > 0 ? line.posSum / line.weight : line.minPos,
      thickness: line.thickness,
      intervals: merged,
    });
  }
  return lines;
}


/** Ink fraction of the strip between two face lines (sampled on a coarse grid). */
function stripInkFraction(
  ink: BinaryImage,
  orientation: 'h' | 'v',
  start: number,
  end: number,
  from: number,
  to: number,
): number {
  const { width, height, data } = ink;
  const alongFrom = Math.max(0, Math.ceil(start) + 1);
  const alongTo = Math.min((orientation === 'h' ? width : height) - 1, Math.floor(end) - 1);
  const acrossFrom = Math.max(0, Math.ceil(from) + 1);
  const acrossTo = Math.min((orientation === 'h' ? height : width) - 1, Math.floor(to) - 1);
  if (alongTo < alongFrom || acrossTo < acrossFrom) return 0;
  const alongStep = Math.max(1, Math.round((alongTo - alongFrom) / 40));
  const acrossStep = Math.max(1, Math.round((acrossTo - acrossFrom) / 12));
  let inkCount = 0;
  let sampleCount = 0;
  for (let along = alongFrom; along <= alongTo; along += alongStep) {
    for (let across = acrossFrom; across <= acrossTo; across += acrossStep) {
      sampleCount += 1;
      const index = orientation === 'h' ? across * width + along : along * width + across;
      if (data[index]) inkCount += 1;
    }
  }
  return sampleCount > 0 ? inkCount / sampleCount : 0;
}

/** Distance from a point to a band's drawn rectangle (along span, across thickness). */
function pointBandDistance(point: { x: number; y: number }, band: BandSegment): number {
  const half = Math.max(2, band.thickness / 2);
  const along = band.orientation === 'h' ? point.x : point.y;
  const across = band.orientation === 'h' ? point.y : point.x;
  const alongGap = along < band.start ? band.start - along : along > band.end ? along - band.end : 0;
  const acrossGap = Math.max(0, Math.abs(across - band.pos) - half);
  return Math.hypot(alongGap, acrossGap);
}

/**
 * True when one of the band's *endpoints* sits on another band.
 *
 * Real walls join the rest of the wall network at their ends (a T or L
 * junction); drawing-margin ink (dimension chains, axis strips) merely crosses
 * walls or floats free. Using endpoint contact instead of rectangle proximity
 * therefore rejects annotation bands even when they run across the building.
 */
function bandTouchesAtEndpoint(band: BandSegment, others: BandSegment[], tolerance: number): boolean {
  const endpoints =
    band.orientation === 'h'
      ? [
          { x: band.start, y: band.pos },
          { x: band.end, y: band.pos },
        ]
      : [
          { x: band.pos, y: band.start },
          { x: band.pos, y: band.end },
        ];
  return others.some((other) => {
    if (other.orientation !== band.orientation) {
      // Perpendicular junction: an end of this band abuts the other wall.
      return endpoints.some((point) => pointBandDistance(point, other) <= tolerance);
    }
    // Collinear continuation: same centerline and a really small span gap.
    if (Math.abs(other.pos - band.pos) > Math.max(6, tolerance * 0.4)) return false;
    const gap = other.start > band.end ? other.start - band.end : band.start > other.end ? band.start - other.end : 0;
    return gap <= tolerance;
  });
}

/**
 * Drops hollow bands that do not belong to the main wall network: growth starts
 * from the solid-poché bands (which the run-length pass finds reliably) and
 * repeatedly admits hollow bands touching what is already accepted. Dimension
 * chains, axis lines and legend strips in the drawing margin never reach the
 * wall network and disappear.
 */
function pruneDisconnectedBands(
  solid: BandSegment[],
  hollow: BandSegment[],
  tolerance: number,
): BandSegment[] {
  if (hollow.length === 0) return solid;
  const kept = [...solid];
  let remaining = hollow;
  let changed = kept.length > 0;
  while (changed && remaining.length > 0) {
    changed = false;
    const next: BandSegment[] = [];
    for (const band of remaining) {
      if (bandTouchesAtEndpoint(band, kept, tolerance)) {
        kept.push(band);
        changed = true;
      } else {
        next.push(band);
      }
    }
    remaining = next;
  }
  return kept;
}

/**
 * Recovers walls that are drawn hollow: a band of two or more parallel face /
 * glass / poché-boundary lines one wall thickness apart (the standard CAD
 * representation of non-structural walls and window sections). Solid poché is
 * already handled by the run-length pass.
 *
 * The lines of one drawn wall sit 8-10 px apart inside the band, while unrelated
 * long strokes (dimension chains, axis lines, grid leaders) are isolated: their
 * nearest parallel neighbour is a whole wall thickness away or forms a pair with
 * an empty strip between. Grouping close parallel lines and then requiring
 * hatch/fill evidence between the outer faces is what separates a wall from
 * annotation ink — and it keeps solid-poché fixtures unchanged, because their
 * window openings are just two glass lines with an empty strip between them.
 */
function hollowBands(
  ink: BinaryImage,
  verticalRun: Int32Array,
  horizontalRun: Int32Array,
  tuning: WallTuning,
  thickness: StrokeThickness,
): BandSegment[] {
  // A face line is at least as long as the shortest wall we would keep; this
  // also keeps text glyph strokes (10-20 px) out of the line set.
  const minLineLength = Math.max(20, tuning.minWallLengthPx);
  // Face lines can be several px thick on a downsampled render, and hatch strokes
  // touch them often enough to stretch the across-run; keep the limit well below
  // one wall thickness so solid poché is still left to the run-length pass.
  const maxThin = clamp(Math.round(thickness.median * 0.35), 4, 12);
  // Parallel lines of one drawn wall are ~8-10 px apart (glass lines, poché
  // boundary lines); annotation strokes are separated by >= one wall thickness.
  const joinGap = clamp(Math.round(thickness.median * 0.32), 4, 12);
  const pairLow = Math.max(8, Math.round(thickness.median * 0.6));
  const pairHigh = Math.max(joinGap + 2, Math.round(thickness.median * 1.25));
  // Bands shorter than the minimum wall length are dropped later anyway; using
  // that length here keeps text/symbol strokes from forming false bands.
  const minOverlap = Math.max(12, tuning.minWallLengthPx);
  const bridge = Math.max(4, joinGap);

  const bands: BandSegment[] = [];
  for (const orientation of ['h', 'v'] as const) {
    const pieces = extractLongLines(
      ink,
      orientation === 'h' ? horizontalRun : verticalRun,
      orientation === 'h' ? verticalRun : horizontalRun,
      orientation,
      minLineLength,
      maxThin,
    );
    const lines = mergeLinePieces(pieces, 1.5, bridge);
    if (lines.length < 2) continue;

    interface Candidate {
      pos: number;
      thickness: number;
      intervals: Array<{ start: number; end: number }>;
      score: number;
    }
    const candidates: Candidate[] = [];
    const coverage = new Int16Array(orientation === 'h' ? ink.width : ink.height);
    const touched: number[] = [];

    for (let first = 0; first < lines.length; first += 1) {
      const firstPos = lines[first]!.pos;
      for (let last = first + 1; last < lines.length; last += 1) {
        const extent = lines[last]!.pos - firstPos;
        if (extent > pairHigh) break;
        if (extent < pairLow) continue;
        const count = last - first + 1;
        // A wall band's lines are drawn as separate segments and broken by
        // junctions, so require most lines (not all) to cover each position.
        const needed = Math.max(2, Math.ceil(count * 0.5));
        touched.length = 0;
        let minStart = Infinity;
        let maxEnd = -Infinity;
        for (let index = first; index <= last; index += 1) {
          for (const interval of lines[index]!.intervals) {
            const from = Math.max(0, interval.start - 2);
            const to = Math.min(coverage.length - 1, interval.end + 2);
            if (to < from) continue;
            if (from < minStart) minStart = from;
            if (to > maxEnd) maxEnd = to;
            for (let along = from; along <= to; along += 1) {
              if (coverage[along] === 0) touched.push(along);
              coverage[along] = coverage[along]! + 1;
            }
          }
        }
        const intervals: Array<{ start: number; end: number }> = [];
        if (maxEnd >= minStart) {
          let runStart = -1;
          for (let along = minStart; along <= maxEnd + 1; along += 1) {
            const value = along <= maxEnd ? coverage[along]! : 0;
            if (value >= needed) {
              if (runStart < 0) runStart = along;
            } else if (runStart >= 0) {
              if (along - runStart >= minOverlap) intervals.push({ start: runStart, end: along - 1 });
              runStart = -1;
            }
          }
        }
        for (const along of touched) coverage[along] = 0;
        if (intervals.length === 0) continue;
        let score = 0;
        for (const interval of intervals) score += interval.end - interval.start + 1;
        // A bare pair of face lines only counts when the strip between them is
        // inked (hatch fill); a window opening in a solid-poché plan has two
        // glass lines and an empty strip, and must stay an opening.
        if (count < 3) {
          let inked = 0;
          let sampled = 0;
          for (const interval of intervals) {
            const length = interval.end - interval.start + 1;
            inked +=
              stripInkFraction(ink, orientation, interval.start, interval.end, firstPos, lines[last]!.pos) *
              length;
            sampled += length;
          }
          if (sampled === 0 || inked / sampled < 0.15) continue;
        }
        candidates.push({
          pos: (firstPos + lines[last]!.pos) / 2,
          thickness: Math.max(2, Math.round(extent)),
          intervals,
          score,
        });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    for (const candidate of candidates) {
      for (const interval of candidate.intervals) {
        const duplicate = bands.some(
          (band) =>
            band.orientation === orientation &&
            Math.abs(band.pos - candidate.pos) <= joinGap &&
            Math.min(band.end, interval.end) - Math.max(band.start, interval.start) >
              Math.min(band.end - band.start, interval.end - interval.start) * 0.5,
        );
        if (duplicate) continue;
        bands.push({
          orientation,
          pos: candidate.pos,
          start: interval.start,
          end: interval.end,
          thickness: candidate.thickness,
          confidence: 0.46,
        });
        if (bands.length >= 240) break;
      }
      if (bands.length >= 240) break;
    }
    if (bands.length >= 240) break;
  }
  return bands;
}

/* ------------------------------------------------------------------ */
/* Collinear merge + opening inference                                */
/* ------------------------------------------------------------------ */

interface MergeResult {
  segments: BandSegment[];
  gaps: Array<{
    orientation: 'h' | 'v';
    pos: number;
    start: number;
    end: number;
    /** Wall index in the merged list (filled later by matching pos). */
    posTolerance: number;
  }>;
}

function mergeCollinear(segments: BandSegment[], tuning: WallTuning): MergeResult {
  const result: BandSegment[] = [];
  const gaps: MergeResult['gaps'] = [];
  const positionTolerance = Math.max(2, tuning.typicalThickness * 0.45);
  const minGap = Math.max(5, Math.round(tuning.typicalThickness * 0.6));

  for (const orientation of ['h', 'v'] as const) {
    const group = segments
      .filter((segment) => segment.orientation === orientation)
      .sort((left, right) => left.pos - right.pos || left.start - right.start);
    const consumed = new Uint8Array(group.length);
    for (let index = 0; index < group.length; index += 1) {
      if (consumed[index]) continue;
      const merged = { ...group[index]! };
      consumed[index] = 1;
      let changed = true;
      while (changed) {
        changed = false;
        for (let cursor = 0; cursor < group.length; cursor += 1) {
          if (consumed[cursor]) continue;
          const candidate = group[cursor]!;
          if (Math.abs(candidate.pos - merged.pos) > positionTolerance) continue;
          const gapStart = Math.max(merged.start, candidate.start);
          const gapEnd = Math.min(merged.end, candidate.end);
          const overlap = gapEnd - gapStart;
          const gap = gapStart > gapEnd ? gapStart - gapEnd : 0;
          const overlapping = overlap >= 0 && gap === 0 && overlap > 0;
          const connected = overlap > 0 || gap <= tuning.bridgeGapPx;
          if (!connected) continue;
          if (!overlapping && gap > tuning.bridgeGapPx) continue;
          if (!overlapping && gap > 0) {
            const gapA = merged.end < candidate.start ? merged.end : candidate.start;
            const gapB = merged.end < candidate.start ? candidate.start : merged.end;
            if (gapB - gapA >= minGap) {
              gaps.push({
                orientation,
                pos: (merged.pos + candidate.pos) / 2,
                start: gapA,
                end: gapB,
                posTolerance: positionTolerance,
              });
            }
          }
          merged.pos =
            (merged.pos * (merged.end - merged.start + 1) +
              candidate.pos * (candidate.end - candidate.start + 1)) /
            Math.max(1, merged.end - merged.start + candidate.end - candidate.start + 2);
          merged.start = Math.min(merged.start, candidate.start);
          merged.end = Math.max(merged.end, candidate.end);
          merged.thickness = Math.round((merged.thickness + candidate.thickness) / 2);
          merged.confidence = Math.min(0.95, merged.confidence + 0.05);
          consumed[cursor] = 1;
          changed = true;
        }
      }
      result.push(merged);
    }
  }
  return { segments: result, gaps };
}

/* ------------------------------------------------------------------ */
/* Orthogonalisation + endpoint snapping                              */
/* ------------------------------------------------------------------ */

function orthogonalize(segments: BandSegment[]): void {
  for (const segment of segments) {
    // Bands are already orientation-classified; keep pos exact (centerline).
    segment.pos = Math.round(segment.pos * 2) / 2;
  }
}

function snapEndpoints(segments: BandSegment[], extent: number): void {
  const horizontals = segments.filter((segment) => segment.orientation === 'h');
  const verticals = segments.filter((segment) => segment.orientation === 'v');
  for (let pass = 0; pass < 2; pass += 1) {
    for (const horizontal of horizontals) {
      for (const vertical of verticals) {
        for (const end of ['start', 'end'] as const) {
          const x = horizontal[end];
          if (Math.abs(vertical.pos - x) > extent) continue;
          if (
            horizontal.pos < vertical.start - extent ||
            horizontal.pos > vertical.end + extent
          ) {
            continue;
          }
          horizontal[end] = vertical.pos;
          horizontal.confidence = Math.min(0.96, horizontal.confidence + 0.02);
          vertical.confidence = Math.min(0.96, vertical.confidence + 0.02);
        }
        for (const end of ['start', 'end'] as const) {
          const y = vertical[end];
          if (Math.abs(horizontal.pos - y) > extent) continue;
          if (
            vertical.pos < horizontal.start - extent ||
            vertical.pos > horizontal.end + extent
          ) {
            continue;
          }
          vertical[end] = horizontal.pos;
          vertical.confidence = Math.min(0.96, vertical.confidence + 0.02);
          horizontal.confidence = Math.min(0.96, horizontal.confidence + 0.02);
        }
      }
    }
  }
}

function segmentLength(segment: BandSegment): number {
  return Math.abs(segment.end - segment.start);
}

function segmentMidpoint(segment: BandSegment): Point {
  return segment.orientation === 'h'
    ? { x: (segment.start + segment.end) / 2, y: segment.pos }
    : { x: segment.pos, y: (segment.start + segment.end) / 2 };
}

/**
 * Drops isolated short fragments. Text glyphs ("LIVING", "3600") can produce
 * solid short runs that look like tiny wall bands; real short wall nibs always
 * touch a longer wall, so keep those and drop the floaters.
 */
function pruneIsolatedFragments(
  segments: BandSegment[],
  tuning: WallTuning,
): BandSegment[] {
  const keepLength = Math.max(tuning.minWallLengthPx * 1.5, tuning.typicalThickness * 2.5);
  return segments.filter((segment) => {
    const length = segmentLength(segment);
    if (length >= keepLength) return true;
    const midpoint = segmentMidpoint(segment);
    const attached = segments.some((other) => {
      if (other === segment) return false;
      if (segmentLength(other) < segmentLength(segment) * 1.5) return false;
      const distance =
        other.orientation === 'h'
          ? distanceToSegment(
              midpoint,
              { x: other.start, y: other.pos },
              { x: other.end, y: other.pos },
            )
          : distanceToSegment(
              midpoint,
              { x: other.pos, y: other.start },
              { x: other.pos, y: other.end },
            );
      return distance <= Math.max(12, tuning.typicalThickness * 1.5);
    });
    return attached;
  });
}

function dedupe(segments: BandSegment[], minLength: number): BandSegment[] {
  const kept: BandSegment[] = [];
  for (const segment of segments) {
    if (segment.end - segment.start < minLength) continue;
    const duplicate = kept.find(
      (other) =>
        other.orientation === segment.orientation &&
        Math.abs(other.pos - segment.pos) <= 3 &&
        Math.abs(other.start - segment.start) <= 6 &&
        Math.abs(other.end - segment.end) <= 6,
    );
    if (!duplicate) kept.push(segment);
  }
  return kept;
}

function bandCoverage(mask: BinaryImage, segment: BandSegment): number {
  const { width, height, data } = mask;
  const length = segment.end - segment.start;
  if (length <= 0) return 0;
  const steps = Math.min(64, Math.max(8, Math.round(length / 4)));
  let hits = 0;
  let samples = 0;
  for (let step = 0; step <= steps; step += 1) {
    const along = Math.round(segment.start + (length * step) / steps);
    samples += 1;
    let found = false;
    const acrossCenter = Math.round(segment.pos);
    const radius = Math.max(1, Math.round(segment.thickness / 2) + 1);
    for (let offset = -radius; offset <= radius; offset += 1) {
      const across = acrossCenter + offset;
      if (along < 0 || along >= (segment.orientation === 'h' ? width : height)) continue;
      if (across < 0 || across >= (segment.orientation === 'h' ? height : width)) continue;
      const index =
        segment.orientation === 'h' ? across * width + along : along * width + across;
      if (data[index]) {
        found = true;
        break;
      }
    }
    if (found) hits += 1;
  }
  return samples > 0 ? hits / samples : 0;
}

/* ------------------------------------------------------------------ */
/* Duplicate band collapse                                            */
/* ------------------------------------------------------------------ */

/**
 * Fuses bands that are two detector views of the same drawn wall.
 *
 * The hollow-band pass and the run-length pass can both describe one wall, and
 * a thick band exposes several nested line groups, so the same wall may arrive
 * as two or three parallel bands a few px apart. Real parallel walls are never
 * that close; overlapping bands whose centerlines are within ~0.8 of the
 * thinner wall are one wall, so they are merged (span union, span-weighted
 * centerline and thickness).
 */
function collapseParallelBands(segments: BandSegment[]): BandSegment[] {
  const sorted = [...segments].sort(
    (left, right) => right.end - right.start - (left.end - left.start) || right.thickness - left.thickness,
  );
  const result: BandSegment[] = [];
  for (const segment of sorted) {
    let target: BandSegment | undefined;
    for (const other of result) {
      if (other.orientation !== segment.orientation) continue;
      const shorter = Math.min(other.end - other.start, segment.end - segment.start);
      if (shorter <= 0) continue;
      const overlap = Math.min(other.end, segment.end) - Math.max(other.start, segment.start);
      if (overlap < shorter * 0.6) continue;
      if (
        Math.abs(other.pos - segment.pos) >
        Math.max(6, Math.min(other.thickness, segment.thickness) * 0.8)
      ) {
        continue;
      }
      target = other;
      break;
    }
    if (!target) {
      result.push({ ...segment });
      continue;
    }
    const weightA = target.end - target.start + 1;
    const weightB = segment.end - segment.start + 1;
    target.pos = (target.pos * weightA + segment.pos * weightB) / (weightA + weightB);
    target.thickness = Math.round(
      (target.thickness * weightA + segment.thickness * weightB) / (weightA + weightB),
    );
    target.start = Math.min(target.start, segment.start);
    target.end = Math.max(target.end, segment.end);
    target.confidence = Math.max(target.confidence, segment.confidence);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Openings                                                           */
/* ------------------------------------------------------------------ */

function classifyGap(
  ink: BinaryImage,
  gap: MergeResult['gaps'][number],
  thickness: number,
): OpeningCandidate['kind'] {
  const { width, height, data } = ink;
  const gapLength = gap.end - gap.start;
  if (gapLength < 4) return 'door';
  const half = thickness / 2;

  // Windows are drawn as a pair of thin lines running parallel to the wall.
  // Plans draw them at slightly different offsets, so scan a narrow band and let
  // any offset with high coverage count as a window.
  const steps = Math.max(3, Math.round(gapLength / 3));
  const maxOffset = Math.max(4, Math.round(half) + 5);
  for (let offset = 3; offset <= maxOffset; offset += 1) {
    for (const sign of [-1, 1]) {
      let windowVotes = 0;
      let windowSamples = 0;
      for (let step = 0; step <= steps; step += 1) {
        const along = Math.round(gap.start + (gapLength * step) / steps);
        const across = Math.round(gap.pos + sign * offset);
        const x = gap.orientation === 'h' ? along : across;
        const y = gap.orientation === 'h' ? across : along;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        windowSamples += 1;
        if (data[y * width + x]) windowVotes += 1;
      }
      // A window glyph is a thin line running the full width of the opening; a
      // door swing arc only grazes a few offsets.
      if (windowSamples > 0 && windowVotes / windowSamples > 0.45) return 'window';
    }
  }

  // Doors are drawn with a swing arc on one side of the wall near the gap.
  let arcVotes = 0;
  for (let step = 0; step <= steps; step += 1) {
    const along = Math.round(gap.start + (gapLength * step) / steps);
    for (let across = 1; across <= Math.max(6, gapLength * 0.7); across += 1) {
      for (const sign of [-1, 1]) {
        const x = gap.orientation === 'h' ? along : gap.pos + sign * across;
        const y = gap.orientation === 'h' ? gap.pos + sign * across : along;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const pixel = data[Math.round(y) * width + Math.round(x)]!;
        if (pixel) arcVotes += 1;
      }
    }
  }
  if (arcVotes > gapLength * 0.25) return 'door';
  // Unexplained gap: most likely a door opening.
  return 'door';
}

/* ------------------------------------------------------------------ */
/* Hollow-wall fallback (double-line drawings)                        */
/* ------------------------------------------------------------------ */

function hollowWallWalls(ink: BinaryImage, tuning: WallTuning): BandSegment[] {
  const thinMask: BinaryImage = {
    width: ink.width,
    height: ink.height,
    data: new Uint8Array(ink.data.length),
  };
  for (let index = 0; index < ink.data.length; index += 1) {
    if (ink.data[index] && isThinPixel(ink, index)) thinMask.data[index] = 1;
  }
  const lines = houghSegments(thinMask, {
    minVotes: 16,
    minLength: Math.max(20, tuning.minWallLengthPx),
    maxLines: 120,
  });
  const segments: BandSegment[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const left = lines[index]!;
    const leftAngle = segmentAngleDeg(left.a, left.b);
    if (Math.abs(angleToAxis(leftAngle)) > 8) continue;
    const leftLength = Math.hypot(left.b.x - left.a.x, left.b.y - left.a.y);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const right = lines[cursor]!;
      const rightAngle = segmentAngleDeg(right.a, right.b);
      if (Math.abs(((leftAngle - rightAngle + 90) % 180) - 90) > 4) continue;
      const rightLength = Math.hypot(right.b.x - right.a.x, right.b.y - right.a.y);
      if (Math.min(leftLength, rightLength) < tuning.minWallLengthPx) continue;
      const radians = (leftAngle * Math.PI) / 180;
      const direction = { x: Math.cos(radians), y: Math.sin(radians) };
      const normal = { x: -direction.y, y: direction.x };
      const distance =
        Math.abs((right.a.x - left.a.x) * normal.x + (right.a.y - left.a.y) * normal.y);
      if (distance < 6 || distance > 44) continue;
      const horizontalWall = Math.abs(direction.x) >= Math.abs(direction.y);
      const leftRange = horizontalWall
        ? [Math.min(left.a.x, left.b.x), Math.max(left.a.x, left.b.x)]
        : [Math.min(left.a.y, left.b.y), Math.max(left.a.y, left.b.y)];
      const rightRange = horizontalWall
        ? [Math.min(right.a.x, right.b.x), Math.max(right.a.x, right.b.x)]
        : [Math.min(right.a.y, right.b.y), Math.max(right.a.y, right.b.y)];
      const overlapStart = Math.max(leftRange[0]!, rightRange[0]!);
      const overlapEnd = Math.min(leftRange[1]!, rightRange[1]!);
      const overlap = overlapEnd - overlapStart;
      if (overlap < 0.55 * Math.min(leftLength, rightLength)) continue;
      const centerline = {
        x: (left.a.x + left.b.x + right.a.x + right.b.x) / 4,
        y: (left.a.y + left.b.y + right.a.y + right.b.y) / 4,
      };
      segments.push({
        orientation: horizontalWall ? 'h' : 'v',
        pos: horizontalWall ? centerline.y : centerline.x,
        start: Math.round(overlapStart),
        end: Math.round(overlapEnd),
        thickness: Math.round(distance),
        confidence: 0.42,
      });
    }
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* Main extraction                                                    */
/* ------------------------------------------------------------------ */

export interface WallExtractionOptions {
  minWallLengthPx?: number;
  bridgeGapPx?: number;
  /** Extra thin-line fallback for hollow (double line) walls. */
  allowHollowFallback?: boolean;
}

export function extractWalls(
  ink: BinaryImage,
  verticalRun: Int32Array,
  horizontalRun: Int32Array,
  options: WallExtractionOptions = {},
): WallExtraction {
  const tuning = wallTuning(ink.width, ink.height, options);
  const diagonal = Math.hypot(ink.width, ink.height);
  // Wall poché is long; annotation ink (dimension ticks, text, dashes) is not.
  const thickness = estimateStrokeThickness(
    verticalRun,
    horizontalRun,
    Math.max(28, Math.round(diagonal * 0.02)),
  );
  tuning.typicalThickness = thickness.median;
  tuning.minThickness = Math.max(2, thickness.low);
  tuning.maxThickness = Math.max(6, thickness.high);

  const horizontalMask: BinaryImage = {
    width: ink.width,
    height: ink.height,
    data: new Uint8Array(ink.data.length),
  };
  const verticalMask: BinaryImage = {
    width: ink.width,
    height: ink.height,
    data: new Uint8Array(ink.data.length),
  };
  // Very short wall stubs near T junctions still need to enter the band masks,
  // otherwise a door close to a corner eats the whole wall end.
  const minMaskLength = Math.max(7, Math.round(tuning.minWallLengthPx * 0.35));
  const minLength = minMaskLength;
  for (let index = 0; index < ink.data.length; index += 1) {
    if (!ink.data[index]) continue;
    const vertical = verticalRun[index]!;
    const horizontal = horizontalRun[index]!;
    if (
      vertical >= tuning.minThickness &&
      vertical <= tuning.maxThickness &&
      horizontal >= minLength
    ) {
      horizontalMask.data[index] = 1;
    }
    if (
      horizontal >= tuning.minThickness &&
      horizontal <= tuning.maxThickness &&
      vertical >= minLength
    ) {
      verticalMask.data[index] = 1;
    }
  }
  const solidBands = [
    ...bandsFromMask(horizontalMask, 'h', tuning),
    ...bandsFromMask(verticalMask, 'v', tuning),
  ];
  let usedHollowFallback = false;
  // Hollow (double-line / hatched) poché is invisible to the pure run-length
  // filter: only the solid black structural chunks pass it. Recover the hollow
  // bands from groups of long parallel face lines, then keep only the ones that
  // connect to the wall network so drawing-margin annotation strips are not
  // mistaken for walls.
  const hollow = hollowBands(ink, verticalRun, horizontalRun, tuning, thickness);
  const connectTolerance = Math.max(10, Math.round(tuning.typicalThickness * 1.0));
  const connectedHollow = pruneDisconnectedBands(solidBands, hollow, connectTolerance);
  let raw = connectedHollow;
  if (raw.length > solidBands.length) usedHollowFallback = true;
  if (
    options.allowHollowFallback !== false &&
    raw.reduce((sum, segment) => sum + (segment.end - segment.start), 0) <
      tuning.minWallLengthPx * 6
  ) {
    const houghHollow = hollowWallWalls(ink, tuning);
    if (houghHollow.length > 0) {
      raw = [...raw, ...houghHollow];
      usedHollowFallback = true;
    }
  }

  const merged = mergeCollinear(raw, tuning);
  orthogonalize(merged.segments);
  const snapExtent = clamp(Math.round(Math.hypot(ink.width, ink.height) * 0.022), 8, 40);
  snapEndpoints(merged.segments, snapExtent);
  const deduped = dedupe(merged.segments, tuning.minWallLengthPx);
  const finals = collapseParallelBands(pruneIsolatedFragments(deduped, tuning));

  // Assign each gap to the nearest surviving wall so openings can be mapped.
  const walls: WallCandidate[] = finals.map((segment) => {
    const coverage = bandCoverage(
      segment.orientation === 'h' ? horizontalMask : verticalMask,
      segment,
    );
    const a: Point =
      segment.orientation === 'h'
        ? { x: segment.start, y: segment.pos }
        : { x: segment.pos, y: segment.start };
    const b: Point =
      segment.orientation === 'h'
        ? { x: segment.end, y: segment.pos }
        : { x: segment.pos, y: segment.end };
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const lengthScore = Math.min(1, length / (tuning.minWallLengthPx * 4));
    const thicknessScore = 1 - Math.min(1, Math.abs(segment.thickness - tuning.typicalThickness) / Math.max(4, tuning.typicalThickness));
    const confidence = clamp(
      0.3 + 0.35 * coverage + 0.2 * thicknessScore + 0.15 * lengthScore,
      0.2,
      0.98,
    );
    return {
      a,
      b,
      thicknessPx: Math.max(2, Math.min(200, Math.round(segment.thickness))),
      confidence: Number(confidence.toFixed(3)),
      parts: 1,
    };
  });

  const openings: OpeningCandidate[] = [];
  for (const gap of merged.gaps) {
    const centerAlong = (gap.start + gap.end) / 2;
    const gapLength = gap.end - gap.start;
    const candidates = walls
      .map((wall, index) => ({ wall, index }))
      .filter(({ wall }) => {
        if (gap.orientation === 'h') {
          return (
            Math.abs(wall.a.y - gap.pos) <= 4 &&
            wall.a.y === wall.b.y &&
            centerAlong >= Math.min(wall.a.x, wall.b.x) - 2 &&
            centerAlong <= Math.max(wall.a.x, wall.b.x) + 2
          );
        }
        return (
          Math.abs(wall.a.x - gap.pos) <= 4 &&
          wall.a.x === wall.b.x &&
          centerAlong >= Math.min(wall.a.y, wall.b.y) - 2 &&
          centerAlong <= Math.max(wall.a.y, wall.b.y) + 2
        );
      })
      .sort(
        (left, right) =>
          Math.abs(centerAlong - (left.wall.a.x + left.wall.b.x) / 2) -
          Math.abs(centerAlong - (right.wall.a.x + right.wall.b.x) / 2),
      );
    const match = candidates[0];
    if (!match) continue;
    if (gapLength < 6) continue;
    const centerPoint: Point =
      gap.orientation === 'h'
        ? { x: centerAlong, y: match.wall.a.y }
        : { x: match.wall.a.x, y: centerAlong };
    const startPoint = gap.orientation === 'h' ? match.wall.a : match.wall.a;
    const offsetPx = Math.hypot(centerPoint.x - startPoint.x, centerPoint.y - startPoint.y);
    openings.push({
      kind: classifyGap(ink, gap, match.wall.thicknessPx),
      center: centerPoint,
      widthPx: Math.round(gapLength),
      confidence: usedHollowFallback ? 0.4 : 0.6,
      wallIndex: match.index,
      offsetPx,
    });
  }

  const wallPixels = ink.data.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  return {
    walls,
    openings,
    bands: raw.map((segment) =>
      segment.orientation === 'h'
        ? { a: { x: segment.start, y: segment.pos }, b: { x: segment.end, y: segment.pos } }
        : { a: { x: segment.pos, y: segment.start }, b: { x: segment.pos, y: segment.end } },
    ),
    medianThicknessPx: thickness.median,
    wallPixels,
  };
}

/**
 * Thresholds ink with a light adaptive pass so uneven scans still produce a
 * usable wall mask. Falls back to global Otsu when the result is too sparse.
 */
export function buildInk(
  raster: { width: number; height: number; data: Uint8ClampedArray },
  options: { inverted?: boolean; threshold?: number } = {},
): { ink: BinaryImage; threshold: number; inverted: boolean } {
  const gray = toGrayscale(raster);
  const threshold = options.threshold ?? Math.max(40, otsuThreshold(gray));
  const inverted = options.inverted ?? false;
  let ink = binarize(gray, threshold, inverted);
  const ratio = countInk(ink) / (ink.width * ink.height);
  if (ratio > 0.5 || ratio < 0.0002) {
    const adaptive = adaptiveThreshold(gray, inverted);
    const adaptiveRatio = countInk(adaptive) / (adaptive.width * adaptive.height);
    if (adaptiveRatio > ratio && adaptiveRatio < 0.5) ink = adaptive;
  }
  return { ink, threshold, inverted };
}

export function countInk(mask: BinaryImage): number {
  let total = 0;
  for (let index = 0; index < mask.data.length; index += 1) {
    if (mask.data[index]) total += 1;
  }
  return total;
}
