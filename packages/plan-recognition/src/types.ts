import type { ParseDraft, Point } from '@hdesign/domain';

/**
 * Workstream C raster contracts. Everything here is pure TypeScript over raw RGBA
 * pixels so the pipeline can run in a Web Worker (no DOM, no canvas, no Node APIs).
 */

/** RGBA raster, 4 bytes per pixel, row-major. Matches ImageData. */
export interface RasterImage {
  width: number;
  height: number;
  /** Length must be width * height * 4. */
  data: Uint8ClampedArray;
}

/** Single-channel raster, 1 byte per pixel (0..255). */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Binary mask, 1 = foreground (ink), 0 = background. */
export interface BinaryImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A text token produced by tesseract (or any other OCR engine). Coordinates are pixels. */
export interface OcrToken {
  text: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  confidence?: number;
}

export interface ScaleSample {
  /** Which pixel axis the measurement came from. */
  axis: 'x' | 'y';
  /** OCR text that supplied the value. */
  text: string;
  valueMm: number;
  spanPx: number;
  mmPerPx: number;
}

export interface ScaleEstimate {
  mmPerPx: number;
  source: 'ocr' | 'calibration' | 'ai' | 'assumed';
  confidence: number;
  samples: ScaleSample[];
  /** Per-axis median, useful for diagnostics. */
  axis: {
    x: { mmPerPx: number; count: number };
    y: { mmPerPx: number; count: number };
  };
}

export interface ParseRasterOptions {
  /** Scale provided by the UI (two-point calibration or an AI hint). Skips OCR scale inference. */
  scale?: { mmPerPx: number; source: 'calibration' | 'ai' };
  /** Fallback mm/px when no dimension evidence exists (default 10). */
  assumedMmPerPx?: number;
  /** OCR tokens used for dimension values and room labels. */
  ocr?: OcrToken[];
  /** Do not attempt to correct skew larger than this (default 5°, spec only requires <= 3°). */
  maxSkewDeg?: number;
  /** Minimum wall length in pixels. Defaults to a fraction of the image diagonal. */
  minWallLengthPx?: number;
  /** Collinear gaps up to this many pixels are treated as a wall with an opening (doors/windows). */
  bridgeGapPx?: number;
  /** Attach JSON-safe debug geometry. Default true. */
  debug?: boolean;
  /** Skip the deskew stage (the raster was already deskewed by a previous pass). */
  skipDeskew?: boolean;
  /** Progress callback used by the Web Worker + wizard. */
  onProgress?: (event: { stage: string; progress: number; label: string }) => void;
}

export interface DebugPolyline {
  kind:
    | 'edge'
    | 'hough'
    | 'wall-band'
    | 'wall'
    | 'gap'
    | 'room'
    | 'dimension'
    | 'label';
  points: Point[];
  confidence?: number;
  thicknessPx?: number;
  label?: string;
}

/** JSON-safe diagnostics for an overlay renderer. No typed arrays, no floats-as-strings. */
export interface ParseDebug {
  width: number;
  height: number;
  inverted: boolean;
  threshold: number;
  skewDeg: number;
  deskewed: boolean;
  medianThicknessPx: number;
  wallPixels: number;
  inkRatio: number;
  timingsMs: Record<string, number>;
  stages: string[];
  polylines: DebugPolyline[];
  scale: ScaleEstimate;
  notes: string[];
}

export interface ParseRasterResult {
  draft: ParseDraft;
  /** Deskewed raster used for detection. Coordinates in `draft` refer to this image. */
  raster: RasterImage;
  /** Deskew angle applied, degrees. 0 when the source was already axis aligned. */
  skewDeg: number;
  debug: ParseDebug;
}

export interface WallCandidate {
  a: Point;
  b: Point;
  thicknessPx: number;
  confidence: number;
  /** Number of raw bands merged into this wall. */
  parts: number;
}

export interface OpeningCandidate {
  kind: 'door' | 'window' | 'sliding' | 'arch';
  center: Point;
  widthPx: number;
  confidence: number;
  /** Index into the wall array this opening belongs to. */
  wallIndex: number;
  /** Distance in px from wall start along the wall. */
  offsetPx: number;
}

export interface WallExtraction {
  walls: WallCandidate[];
  openings: OpeningCandidate[];
  bands: Array<{ a: Point; b: Point }>;
  medianThicknessPx: number;
  wallPixels: number;
}

export interface RoomCandidate {
  polygon: Point[];
  label?: string;
  confidence: number;
  areaPx: number;
}
