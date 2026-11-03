import type { OcrToken, ParseDebug, ParseDraft, RasterImage } from '@hdesign/plan-recognition';
import type { Point } from '@hdesign/domain';

/** Shared state types for the import wizard (kept UI-framework free). */

export type WizardStep = 'upload' | 'progress' | 'review' | 'applied';

export type StageId = 'rasterize' | 'cv' | 'ocr' | 'vision';

export interface StageState {
  id: StageId;
  label: string;
  hint: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  progress: number;
  detail?: string;
}

export interface SourceInfo {
  name: string;
  kind: 'image' | 'pdf';
  pageIndex?: number;
  pageCount?: number;
  raster: RasterImage;
  dataUrl: string;
  scaledDown: boolean;
}

export interface OcrSummary {
  available: boolean;
  tokenCount: number;
  reason?: string;
}

export interface VisionSummary {
  available: boolean;
  model?: string;
  reason?: string;
  mock?: boolean;
}

export interface RecognitionState {
  source: SourceInfo;
  /** Deskewed raster (coordinates in the draft refer to this image). */
  raster: RasterImage;
  dataUrl: string;
  draft: ParseDraft;
  debug: ParseDebug;
  ocr: OcrSummary;
  vision: VisionSummary;
}

export interface EditableWall {
  id: string;
  a: Point;
  b: Point;
  thicknessPx: number;
  confidence: number;
}

export type ScaleSource = 'ocr' | 'calibration' | 'assumed' | 'ai';

export interface ScaleState {
  mmPerPx: number;
  source: ScaleSource;
  /** Calibration measurement, when the user calibrated manually. */
  measurement?: { a: Point; b: Point; distancePx: number; mm: number };
}

export interface LayerToggles {
  walls: boolean;
  rooms: boolean;
  openings: boolean;
  labels: boolean;
}

export interface CalibrationDraft {
  points: Point[];
}

export function wallLengthPx(wall: EditableWall): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
}

export function wallLengthMm(wall: EditableWall, mmPerPx: number): number {
  return wallLengthPx(wall) * mmPerPx;
}

export function draftToEditableWalls(draft: ParseDraft): EditableWall[] {
  return draft.walls.map((wall, index) => ({
    id: wall.id ?? `wall-${index + 1}`,
    a: { ...wall.a },
    b: { ...wall.b },
    thicknessPx: wall.thicknessPx,
    confidence: wall.confidence,
  }));
}

export function guessSourceName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || '导入方案';
}

export function emptyStages(): StageState[] {
  return [
    { id: 'rasterize', label: '栅格化', hint: '读取图片 / PDF 页面', status: 'pending', progress: 0 },
    { id: 'cv', label: '本地 CV', hint: '墙体 · 房间 · 门窗', status: 'pending', progress: 0 },
    { id: 'ocr', label: '文字识别', hint: '尺寸标注与房间名', status: 'pending', progress: 0 },
    { id: 'vision', label: '视觉增强', hint: 'DeepSeek 视觉补充', status: 'pending', progress: 0 },
  ];
}

export function tokensForScale(tokens: OcrToken[]): OcrToken[] {
  return tokens.filter((token) => token.text.trim().length > 0);
}
