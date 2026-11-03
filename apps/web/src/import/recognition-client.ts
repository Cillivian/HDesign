import type { ParseRasterResult, RasterImage } from '@hdesign/plan-recognition';
import { ImportError } from './errors';
import {
  rasterToWorkerRaster,
  workerRasterToRaster,
  type WorkerParseOptions,
  type WorkerResponse,
} from './recognition-protocol';

export interface LocalParseProgress {
  stage: string;
  progress: number;
  label: string;
}

export interface RunLocalParseOptions {
  onProgress?: (progress: LocalParseProgress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Runs the local CV pipeline in a dedicated Web Worker.
 * Each call uses a fresh worker so a failed/cancelled parse cannot leak state.
 */
export function runLocalParse(
  raster: RasterImage,
  options: WorkerParseOptions,
  runOptions: RunLocalParseOptions = {},
): Promise<ParseRasterResult> {
  // Keep this exact inline pattern: Vite statically detects it and emits the worker
  // chunk for production builds (a URL stored in a variable is not detected).
  const worker = new Worker(new URL('../services/recognition.worker.ts', import.meta.url), {
    type: 'module',
  });
  const timeoutMs = runOptions.timeoutMs ?? 120_000;

  return new Promise<ParseRasterResult>((resolve, reject) => {
    let settled = false;
    const finish = (): void => {
      settled = true;
      window.clearTimeout(timer);
      runOptions.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const timer = window.setTimeout(() => {
      finish();
      reject(
        new ImportError(
          'WORKER_FAILED',
          '识别超时',
          '图像可能过大，请压缩到 2400 像素长边以内或重试',
        ),
      );
    }, timeoutMs);

    const onAbort = (): void => {
      finish();
      reject(new DOMException('已取消识别', 'AbortError'));
    };
    if (runOptions.signal?.aborted) {
      onAbort();
      return;
    }
    runOptions.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onerror = (event) => {
      if (settled) return;
      finish();
      reject(
        new ImportError(
          'WORKER_FAILED',
          '识别线程启动失败',
          event.message || '请刷新页面后重试',
        ),
      );
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (settled) return;
      if (message.type === 'progress') {
        runOptions.onProgress?.({
          stage: message.stage,
          progress: message.progress,
          label: message.label,
        });
        return;
      }
      if (message.type === 'error') {
        finish();
        reject(new ImportError('WORKER_FAILED', '识别失败', message.message));
        return;
      }
      finish();
      resolve({
        draft: message.draft,
        debug: message.debug,
        skewDeg: message.skewDeg,
        raster: workerRasterToRaster(message.raster),
      });
    };

    const payload = {
      type: 'parse' as const,
      raster: rasterToWorkerRaster(raster),
      options,
    };
    // Transfer the pixel copy: the caller keeps its own raster for the underlay.
    worker.postMessage(payload, [payload.raster.data]);
  });
}
