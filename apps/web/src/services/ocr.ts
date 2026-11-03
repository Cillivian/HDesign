import type { OcrToken, RasterImage } from '@hdesign/plan-recognition';
import { ImportError } from '../import/errors';
import { rasterToCanvas } from '../import/raster';

/**
 * Optional OCR. Language packs + wasm are vendored by scripts/fetch-ocr-assets.mjs
 * into apps/web/public/ocr. When they are missing (offline environment, CI, a fresh
 * clone) the import wizard simply skips OCR: local CV still runs, scale can be set
 * with two-point calibration and the vision model can fill labels when configured.
 */

export interface OcrAssetManifest {
  generatedAt?: string;
  langs?: string[];
  files?: string[];
}

export interface OcrResult {
  available: boolean;
  tokens: OcrToken[];
  reason?: string;
}

const MANIFEST_PATH = '/ocr/manifest.json';
export const OCR_LANGS = ['chi_sim', 'eng'];

let availability: Promise<boolean> | null = null;

/** Checks (once, cached) whether OCR assets have been vendored. */
export async function isOcrAvailable(): Promise<boolean> {
  if (!availability) {
    availability = (async () => {
      try {
        const response = await fetch(MANIFEST_PATH, { cache: 'force-cache' });
        if (!response.ok) return false;
        const manifest = (await response.json()) as OcrAssetManifest;
        if (!Array.isArray(manifest.files) || manifest.files.length === 0) return false;
        // The language packs are gitignored; probe one so a fresh clone falls back
        // gracefully instead of failing at worker start-up.
        const languageFile =
          manifest.files.find((file) => file.endsWith('.traineddata.gz')) ?? manifest.files[0];
        if (!languageFile) return false;
        const probe = await fetch(`/ocr/${languageFile}`, { method: 'HEAD', cache: 'force-cache' });
        if (!probe.ok) return false;
        const contentType = probe.headers.get('content-type') ?? '';
        return !contentType.includes('text/html');
      } catch {
        return false;
      }
    })();
  }
  return availability;
}

export function resetOcrAvailability(): void {
  availability = null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface TesseractWord {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface TesseractLine {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  words?: TesseractWord[];
}

interface TesseractParagraph {
  lines?: TesseractLine[];
}

interface TesseractBlock {
  paragraphs?: TesseractParagraph[];
}

interface OcrWorkerHandle {
  recognize: (...args: unknown[]) => Promise<{ data: TesseractPage }>;
  terminate: () => Promise<unknown>;
}

interface TesseractPage {
  text?: string;
  blocks?: TesseractBlock[] | null;
}

function tokenFromBbox(
  text: string,
  bbox: { x0: number; y0: number; x1: number; y1: number } | undefined,
  confidence: number | undefined,
): OcrToken | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned || !bbox) return null;
  const width = Math.abs(bbox.x1 - bbox.x0);
  const height = Math.abs(bbox.y1 - bbox.y0);
  if (width < 2 || height < 2) return null;
  return {
    text: cleaned,
    x: bbox.x0 + width / 2,
    y: bbox.y0 + height / 2,
    w: width,
    h: height,
    confidence: Math.min(1, Math.max(0, (confidence ?? 60) / 100)),
  };
}

function collectTokens(page: TesseractPage): OcrToken[] {
  const tokens: OcrToken[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const token = tokenFromBbox(word.text ?? '', word.bbox, word.confidence);
          if (token) tokens.push(token);
        }
        // Chinese room names are often split into single-character words; keep the
        // whole line as an extra token so point-in-polygon labelling still works.
        if (line.text && line.words && line.words.length > 1) {
          const token = tokenFromBbox(line.text, line.bbox, line.confidence);
          if (token) tokens.push(token);
        }
      }
    }
  }
  return tokens.slice(0, 600);
}

export interface RunOcrOptions {
  onProgress?: (message: string, progress: number) => void;
  signal?: AbortSignal;
}

/**
 * Runs tesseract.js over a raster. Never throws for "OCR unavailable": callers get
 * `available:false` plus a human readable reason and continue without OCR.
 */
export async function recognizeText(
  raster: RasterImage,
  options: RunOcrOptions = {},
): Promise<OcrResult> {
  if (!(await isOcrAvailable())) {
    return {
      available: false,
      tokens: [],
      reason: 'OCR 语言包未安装（运行 pnpm setup:ocr 可启用文字识别），已跳过',
    };
  }
  options.onProgress?.('加载 OCR 引擎', 0.1);
  let worker: OcrWorkerHandle | null = null;
  try {
    // tesseract.js is CommonJS; dynamic import keeps it out of the main bundle.
    const module = (await import('tesseract.js')) as unknown as {
      createWorker?: (langs: string[], oem: number, options: Record<string, unknown>) => Promise<unknown>;
      default?: {
        createWorker?: (langs: string[], oem: number, options: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const createWorker = module.createWorker ?? module.default?.createWorker;
    if (!createWorker) throw new Error('OCR 引擎不可用');
    if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError');
    const created = await withTimeout(
      createWorker(OCR_LANGS, 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        gzip: true,
        logger: (message: { status?: string; progress?: number }) => {
          options.onProgress?.(message.status ?? '识别文字', 0.15 + (message.progress ?? 0) * 0.5);
        },
      }),
      90_000,
      'OCR 引擎加载超时（语言包可能不完整）',
    );
    worker = created as OcrWorkerHandle;
    options.onProgress?.('识别尺寸与房间名', 0.7);
    const canvas = rasterToCanvas(raster);
    const result = await withTimeout(
      worker!.recognize(canvas, {}, { blocks: true }) as Promise<{ data: TesseractPage }>,
      90_000,
      'OCR 识别超时',
    );
    const tokens = collectTokens(result.data);
    options.onProgress?.('文字识别完成', 1);
    return { available: true, tokens };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      tokens: [],
      reason: `OCR 未完成：${message}。可继续使用本地 CV、两点校准或视觉模型`,
    };
  } finally {
    try {
      await worker?.terminate();
    } catch {
      /* ignore */
    }
  }
}

export function assertOcrConfigured(available: boolean): void {
  if (!available) {
    throw new ImportError(
      'OCR_UNAVAILABLE',
      'OCR 需要本地语言包',
      '运行 pnpm setup:ocr 下载语言包；不安装也不影响本地识别与手工描图',
    );
  }
}
