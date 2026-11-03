/**
 * @hdesign/plan-recognition — local floor-plan recognition (workstream C).
 *
 * Pure TypeScript over RGBA rasters: no DOM, no canvas, no Node APIs. Runs inside a
 * Web Worker in the browser and inside vitest/node for fixtures.
 */
export type {
  BinaryImage,
  DebugPolyline,
  GrayImage,
  OcrToken,
  OpeningCandidate,
  ParseDebug,
  ParseRasterOptions,
  ParseRasterResult,
  RasterImage,
  RoomCandidate,
  ScaleEstimate,
  ScaleSample,
  WallCandidate,
  WallExtraction,
} from './types';
// Re-export the shared parse contract so web workers can type their messages.
export type { ParseDraft } from '@hdesign/domain';
export * from './raster';
export * from './hough';
export * from './ink';
export * from './dimensions';
export * from './walls';
export * from './rooms';
export * from './merge';
export * from './parse';
