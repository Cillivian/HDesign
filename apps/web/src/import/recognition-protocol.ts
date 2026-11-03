import type {
  OcrToken,
  ParseDebug,
  ParseDraft,
  RasterImage,
} from '@hdesign/plan-recognition';

/** Message contract between the import UI and the recognition Web Worker. */

export interface WorkerRaster {
  width: number;
  height: number;
  data: ArrayBuffer;
}

export interface WorkerParseOptions {
  skipDeskew?: boolean;
  scale?: { mmPerPx: number; source: 'calibration' | 'ai' };
  assumedMmPerPx?: number;
  ocr?: OcrToken[];
  minWallLengthPx?: number;
  bridgeGapPx?: number;
  maxSkewDeg?: number;
}

export interface WorkerParseRequest {
  type: 'parse';
  raster: WorkerRaster;
  options: WorkerParseOptions;
}

export type WorkerRequest = WorkerParseRequest;

export interface WorkerProgressMessage {
  type: 'progress';
  stage: string;
  progress: number;
  label: string;
}

export interface WorkerResultMessage {
  type: 'result';
  draft: ParseDraft;
  debug: ParseDebug;
  skewDeg: number;
  raster: WorkerRaster;
}

export interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

export type WorkerResponse = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;

export function rasterToWorkerRaster(raster: RasterImage): WorkerRaster {
  const copy = new Uint8ClampedArray(raster.data);
  return { width: raster.width, height: raster.height, data: copy.buffer };
}

export function workerRasterToRaster(raster: WorkerRaster): RasterImage {
  return {
    width: raster.width,
    height: raster.height,
    data: new Uint8ClampedArray(raster.data),
  };
}
