import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RasterImage } from '@hdesign/plan-recognition';
import { ImportError } from '../import/errors';
import { canvasToRaster, createCanvas, validateFile } from '../import/raster';

/**
 * pdfjs-dist rasterisation for the import wizard.
 * Pages are rendered in the pdf.js worker; the canvas stays on the main thread
 * because we need RGBA pixels for the recognition worker.
 */
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const PDF_LONG_EDGE = 2400;
const MAX_PAGES = 120;

export interface PdfPageInfo {
  index: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  landscape: boolean;
  label: string;
}

export interface RenderedPdfPage {
  raster: RasterImage;
  dataUrl: string;
  pageIndex: number;
  width: number;
  height: number;
  scale: number;
}

export interface OpenedPdf {
  name: string;
  pageCount: number;
  pages: PdfPageInfo[];
  renderPage: (index: number, options?: { longEdge?: number }) => Promise<RenderedPdfPage>;
  destroy: () => Promise<void>;
}

function mapPdfError(error: unknown): ImportError {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'PasswordException' || /password/i.test(message)) {
    return new ImportError(
      'PDF_PASSWORD',
      'PDF 已加密，需要密码才能打开',
      '请在本地解除密码（另存为新的 PDF）后再导入',
    );
  }
  if (name === 'MissingPDFException') {
    return new ImportError('PDF_CORRUPT', 'PDF 文件不存在或无法读取', '请重新选择文件');
  }
  if (name === 'InvalidPDFException' || name === 'UnexpectedResponseException') {
    return new ImportError(
      'PDF_CORRUPT',
      'PDF 文件已损坏或格式不受支持',
      '请用 PDF 阅读器另存为新的 PDF 后再导入',
    );
  }
  return new ImportError(
    'PDF_PAGE_FAILED',
    'PDF 解析失败',
    message.slice(0, 160) || '请确认文件完整且未加密',
  );
}

export async function openPdf(file: File): Promise<OpenedPdf> {
  validateFile(file);
  const buffer = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    // Copy the buffer: pdf.js may transfer it to its worker.
    data: buffer.slice(),
    useSystemFonts: true,
  });
  let document: PDFDocumentProxy;
  try {
    document = await loadingTask.promise;
  } catch (error) {
    void loadingTask.destroy().catch(() => undefined);
    throw mapPdfError(error);
  }

  const pages: PdfPageInfo[] = [];
  const pageCount = Math.min(document.numPages, MAX_PAGES);
  try {
    for (let index = 0; index < pageCount; index += 1) {
      const page = await document.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({
        index,
        widthPt: Math.round(viewport.width),
        heightPt: Math.round(viewport.height),
        rotation: page.rotate,
        landscape: viewport.width > viewport.height,
        label: `第 ${index + 1} 页`,
      });
      page.cleanup();
    }
  } catch (error) {
    void loadingTask.destroy().catch(() => undefined);
    throw mapPdfError(error);
  }

  const renderPage = async (
    index: number,
    options: { longEdge?: number } = {},
  ): Promise<RenderedPdfPage> => {
    if (index < 0 || index >= pageCount) {
      throw new ImportError('PDF_PAGE_FAILED', `PDF 只有 ${pageCount} 页`);
    }
    const longEdge = Math.min(3600, Math.max(400, options.longEdge ?? PDF_LONG_EDGE));
    try {
      const page = await document.getPage(index + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const rawScale = longEdge / Math.max(baseViewport.width, baseViewport.height);
      const scale = Math.min(4, Math.max(0.2, rawScale));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new ImportError('PDF_PAGE_FAILED', '浏览器无法创建画布', '请释放内存后重试');
      }
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;
      const raster = canvasToRaster(canvas);
      page.cleanup();
      return {
        raster,
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        pageIndex: index,
        width: canvas.width,
        height: canvas.height,
        scale,
      };
    } catch (error) {
      throw mapPdfError(error);
    }
  };

  return {
    name: file.name,
    pageCount,
    pages,
    renderPage,
    destroy: async () => {
      try {
        await document.cleanup();
      } catch {
        /* already disposed */
      }
      try {
        await loadingTask.destroy();
      } catch {
        /* already disposed */
      }
    },
  };
}

/** Renders a short-edge thumbnail-ish preview for the page picker. */
export async function renderPdfPagePreview(
  pdf: OpenedPdf,
  pageIndex: number,
): Promise<string> {
  const rendered = await pdf.renderPage(pageIndex, { longEdge: 480 });
  return rendered.dataUrl;
}
