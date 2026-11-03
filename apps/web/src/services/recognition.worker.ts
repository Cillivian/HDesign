/// <reference lib="webworker" />
import { parseRaster } from '@hdesign/plan-recognition';
import type {
  WorkerParseRequest,
  WorkerProgressMessage,
  WorkerResponse,
  WorkerResultMessage,
} from '../import/recognition-protocol';

/**
 * Recognition Web Worker: the whole CV pipeline runs here so the 2400px raster
 * never blocks the UI thread. Progress messages are coarse stage updates emitted
 * from parseRaster via the onProgress hook.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerParseRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'parse') return;
  try {
    const raster = {
      width: request.raster.width,
      height: request.raster.height,
      data: new Uint8ClampedArray(request.raster.data),
    };
    const result = parseRaster(raster, {
      ...request.options,
      onProgress: (progress) => {
        const message: WorkerProgressMessage = {
          type: 'progress',
          stage: progress.stage,
          progress: progress.progress,
          label: progress.label,
        };
        scope.postMessage(message);
      },
    });
    const response: WorkerResultMessage = {
      type: 'result',
      draft: result.draft,
      debug: result.debug,
      skewDeg: result.skewDeg,
      raster: {
        width: result.raster.width,
        height: result.raster.height,
        data: result.raster.data.buffer as ArrayBuffer,
      },
    };
    const transfer: Transferable[] = [response.raster.data];
    scope.postMessage(response, transfer);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
};
