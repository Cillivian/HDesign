import type { SheetKind, SheetSpec, TitleBlock } from '@hdesign/domain';
import type { BomOverrides } from './bom';

/** Paper sizes supported by the sheet renderer (landscape orientation). */
export const PAPER_SIZES = ['A4', 'A3', 'A2'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/** Legal drawing scales (denominator of 1:N). */
export const SHEET_SCALES = [50, 75, 100, 150, 200] as const;
export type SheetScale = (typeof SHEET_SCALES)[number];

export interface PaperSpec {
  id: PaperSize;
  /** Landscape width / height in millimetres. */
  widthMm: number;
  heightMm: number;
  /** Inner drawing frame margin from the paper edge. */
  marginMm: number;
}

export interface SheetRenderOptions {
  /** Overrides `sheet.size`. */
  size?: PaperSize;
  /** Overrides `sheet.scale`. */
  scale?: SheetScale;
  /** Overrides `sheet.layerIds` (layer inclusion). */
  layerIds?: string[];
  includeDimensions?: boolean;
  includeNorthArrow?: boolean;
  includeScaleBar?: boolean;
  includeTitleBlock?: boolean;
  includeNotes?: boolean;
  includeLegend?: boolean;
  includeRoomLabels?: boolean;
  /** Partial override merged over `sheet.titleBlock`. */
  titleBlock?: Partial<TitleBlock>;
  /** Extra note lines shown in the bottom note strip. */
  notes?: string[];
  /** Force-hide the AI badge even when the project carries AI metadata. */
  aiBadge?: boolean;
  /** Stable prefix for `<defs>` ids (keeps DOM ids unique when preview + print coexist). */
  idPrefix?: string;
  /** Quantity / unit price edits coming from the sheets panel. */
  bomOverrides?: BomOverrides;
  /** BOM table maximum rows per column (renderer auto-sizes by paper). */
  bomRowsPerColumn?: number;
}

export interface SheetRenderResult {
  svg: string;
  /** Resolved paper layout (useful for cropping previews/thumbnails). */
  frame: LayoutFrame;
  widthMm: number;
  heightMm: number;
  paper: PaperSize;
  /** Effective scale denominator actually used (auto-fitted when it overflows). */
  scale: number;
  /** Requested scale denominator (from sheet / options). */
  requestedScale: number;
  kind: SheetKind;
  sheet: SheetSpec;
  titleBlock: TitleBlock;
  /** Non-fatal issues surfaced to the UI (auto fit, clipped tables, missing symbols…). */
  warnings: string[];
}

export interface PointMm {
  x: number;
  y: number;
}

export interface RectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutFrame {
  paper: PaperSpec;
  page: RectMm;
  frame: RectMm;
  titleBlock: RectMm;
  notes: RectMm;
  drawing: RectMm;
  plan: RectMm;
  legend: RectMm;
}
