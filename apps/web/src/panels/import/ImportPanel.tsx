import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  FileUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  PenLine,
  RotateCcw,
  ScanLine,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { Point } from '@hdesign/domain';
import type { ParseDraft } from '@hdesign/plan-recognition';
import {
  Badge,
  Button,
  Callout,
  IconButton,
  NumberField,
  Section,
  Segmented,
  Spinner,
  cn,
} from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { decodeImageFile, isPdfFile, rasterToDataUrl, validateFile } from '../../import/raster';
import { ImportError, errorMessage } from '../../import/errors';
import { applyRecognizedPlan, applyTraceOnly } from '../../import/apply';
import { RecognitionOverlay } from '../../import/RecognitionOverlay';
import {
  applyCalibration,
  scaleStateFromDraft,
  useImportRecognition,
} from '../../import/useImportRecognition';
import { getVisionStatus, type VisionStatus } from '../../services/ai-parse';
import { openPdf, type OpenedPdf } from '../../services/pdf';
import {
  draftToEditableWalls,
  type EditableWall,
  type LayerToggles,
  type ScaleState,
  type SourceInfo,
  type StageState,
  type WizardStep,
} from '../../import/types';

interface SampleEntry {
  id: string;
  title: string;
  image: string;
  pdf: string | null;
  widthPx: number;
  heightPx: number;
  wallCount: number;
  roomCount: number;
  areaSqm: number;
}

interface PdfPickerState {
  pdf: OpenedPdf;
  pageIndex: number;
  preview: string | null;
  previewLoading: boolean;
}

const STAGE_ICON = {
  pending: 'pending',
  running: 'running',
  done: 'done',
  skipped: 'skipped',
  error: 'error',
} as const;

function StageRow({ stage }: { stage: StageState }) {
  const percent = Math.round(Math.min(1, Math.max(0, stage.progress)) * 100);
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center">
        {STAGE_ICON[stage.status] === 'running' ? <Spinner className="h-3.5 w-3.5 text-accent" /> : null}
        {STAGE_ICON[stage.status] === 'done' ? <CheckCircle2 size={14} className="text-ok" /> : null}
        {STAGE_ICON[stage.status] === 'error' ? <AlertTriangle size={14} className="text-danger" /> : null}
        {STAGE_ICON[stage.status] === 'skipped' ? (
          <span className="text-[10px] text-faint">跳过</span>
        ) : null}
        {STAGE_ICON[stage.status] === 'pending' ? (
          <span className="block h-1.5 w-1.5 rounded-full bg-line-strong" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('text-[11px]', stage.status === 'running' ? 'text-ink' : 'text-muted')}>
            {stage.label}
          </span>
          <span className="num text-[10px] text-faint">
            {stage.status === 'done'
              ? '完成'
              : stage.status === 'skipped'
                ? '跳过'
                : stage.status === 'error'
                  ? '失败'
                  : `${percent}%`}
          </span>
        </div>
        {stage.detail ? (
          <p className="mt-0.5 break-words text-[10px] leading-snug text-faint">{stage.detail}</p>
        ) : null}
        {stage.status === 'running' ? (
          <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ImportPanel() {
  const pushToast = useUiStore((state) => state.pushToast);
  const setRightPanel = useUiStore((state) => state.setRightPanel);
  const setTool = useUiStore((state) => state.setTool);
  const existingWalls = useDocStore((state) => state.doc.walls.length);
  const existingRooms = useDocStore((state) => state.doc.rooms.length);

  const { stages, busy, error, recognition, start, cancel, reset, clearError } =
    useImportRecognition();

  const [step, setStep] = useState<WizardStep>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleEntry[]>([]);
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);
  const [pdfPicker, setPdfPicker] = useState<PdfPickerState | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [visionStatus, setVisionStatus] = useState<VisionStatus | null>(null);

  const [walls, setWalls] = useState<EditableWall[]>([]);
  const [scale, setScale] = useState<ScaleState>({ mmPerPx: 10, source: 'assumed' });
  const [layers, setLayers] = useState<LayerToggles>({
    walls: true,
    rooms: true,
    openings: true,
    labels: true,
  });
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationMm, setCalibrationMm] = useState('');
  const [highlightWallId, setHighlightWallId] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState<'replace' | 'append'>('replace');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{
    mode: 'recognize' | 'trace';
    wallCount: number;
    openingCount: number;
    roomCount: number;
    skippedWalls: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<OpenedPdf | null>(null);

  /* Sample plans + vision status for the one-click demo path. */
  useEffect(() => {
    let cancelled = false;
    fetch('/samples/samples.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { samples?: SampleEntry[] } | null) => {
        if (!cancelled && data?.samples) setSamples(data.samples);
      })
      .catch(() => undefined);
    void getVisionStatus()
      .then((status) => {
        if (!cancelled) setVisionStatus(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /* Destroy the pdf.js document when the panel unmounts. */
  useEffect(
    () => () => {
      void pdfRef.current?.destroy();
      pdfRef.current = null;
    },
    [],
  );

  /* Recognition finished -> review state. */
  useEffect(() => {
    if (!recognition) return;
    setWalls(draftToEditableWalls(recognition.draft));
    setScale(scaleStateFromDraft(recognition.draft));
    setCalibrationPoints([]);
    setCalibrating(false);
    setStep('review');
  }, [recognition]);

  const pdf = pdfPicker?.pdf ?? null;
  const pageIndex = pdfPicker?.pageIndex ?? 0;

  /* Render a page preview when the PDF page selection changes. */
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setPdfPicker((current) =>
      current && current.pdf === pdf ? { ...current, previewLoading: true } : current,
    );
    pdf
      .renderPage(pageIndex, { longEdge: 520 })
      .then((rendered) => {
        if (cancelled) return;
        setPdfPicker((current) =>
          current && current.pdf === pdf && current.pageIndex === pageIndex
            ? { ...current, preview: rendered.dataUrl, previewLoading: false }
            : current,
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setPdfPicker((current) =>
          current && current.pdf === pdf ? { ...current, previewLoading: false } : current,
        );
        const message = errorMessage(cause);
        pushToast(message.message, 'error', message.hint);
      });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, pushToast]);

  const startRecognition = useCallback(
    async (source: SourceInfo) => {
      setStep('progress');
      setSourceName(source.name);
      setApplied(null);
      await start(source);
    },
    [start],
  );

  const handleFile = useCallback(
    async (file: File) => {
      clearError();
      try {
        validateFile(file);
      } catch (cause) {
        const message = errorMessage(cause);
        pushToast(message.message, 'error', message.hint);
        return;
      }
      setSourceName(file.name);
      if (isPdfFile(file)) {
        setFileBusy(true);
        try {
          const opened = await openPdf(file);
          void pdfRef.current?.destroy();
          pdfRef.current = opened;
          setPdfPicker({ pdf: opened, pageIndex: 0, preview: null, previewLoading: true });
        } catch (cause) {
          const message = errorMessage(cause);
          pushToast(message.message, 'error', message.hint);
        } finally {
          setFileBusy(false);
        }
        return;
      }
      setPdfPicker(null);
      setFileBusy(true);
      try {
        const decoded = await decodeImageFile(file);
        const source: SourceInfo = {
          name: file.name,
          kind: 'image',
          raster: decoded.raster,
          dataUrl: rasterToDataUrl(decoded.raster, 'image/jpeg', 0.94),
          scaledDown: decoded.scaledDown,
        };
        await startRecognition(source);
      } catch (cause) {
        const message = errorMessage(cause);
        pushToast(message.message, 'error', message.hint);
        setStep('upload');
      } finally {
        setFileBusy(false);
      }
    },
    [clearError, pushToast, startRecognition],
  );

  const recognizePdfPage = useCallback(async () => {
    if (!pdfPicker) return;
    setFileBusy(true);
    try {
      const rendered = await pdfPicker.pdf.renderPage(pdfPicker.pageIndex);
      const source: SourceInfo = {
        name: pdfPicker.pdf.name,
        kind: 'pdf',
        pageIndex: pdfPicker.pageIndex,
        pageCount: pdfPicker.pdf.pageCount,
        raster: rendered.raster,
        dataUrl: rendered.dataUrl,
        scaledDown: false,
      };
      setPdfPicker(null);
      await startRecognition(source);
    } catch (cause) {
      const message = errorMessage(cause);
      pushToast(message.message, 'error', message.hint);
    } finally {
      setFileBusy(false);
    }
  }, [pdfPicker, pushToast, startRecognition]);

  const loadSample = useCallback(
    async (sample: SampleEntry) => {
      setSampleBusy(sample.id);
      try {
        const response = await fetch(sample.image);
        if (!response.ok) throw new ImportError('IMAGE_DECODE_FAILED', '示例图纸载入失败');
        const blob = await response.blob();
        const file = new File([blob], `${sample.id}.png`, { type: 'image/png' });
        await handleFile(file);
      } catch (cause) {
        const message = errorMessage(cause);
        pushToast('示例图纸载入失败', 'error', message.message);
      } finally {
        setSampleBusy(null);
      }
    },
    [handleFile, pushToast],
  );

  const cancelRecognition = useCallback(() => {
    cancel();
    setStep('upload');
  }, [cancel]);

  const restart = useCallback(() => {
    reset();
    setPdfPicker(null);
    setSourceName(null);
    setApplied(null);
    setWalls([]);
    setScale({ mmPerPx: 10, source: 'assumed' });
    setCalibrationPoints([]);
    setCalibrating(false);
    setCalibrationMm('');
    setStep('upload');
  }, [reset]);

  const handleCalibrationPoint = useCallback((point: Point) => {
    setCalibrationPoints((current) => {
      if (current.length === 0) return [point];
      if (current.length === 1) {
        setCalibrating(false);
        return [current[0]!, point];
      }
      return [point];
    });
  }, []);

  const applyCalibrationValue = useCallback(() => {
    if (calibrationPoints.length !== 2) return;
    const mm = Number.parseFloat(calibrationMm);
    if (!Number.isFinite(mm) || mm <= 0) {
      pushToast('请输入两点之间的实际长度（毫米）', 'warning');
      return;
    }
    const next = applyCalibration({} as ParseDraft, {
      a: calibrationPoints[0]!,
      b: calibrationPoints[1]!,
      mm,
    });
    setScale(next);
    pushToast(`比例已校准：${next.mmPerPx.toFixed(2)} mm/px`, 'success');
  }, [calibrationMm, calibrationPoints, pushToast]);

  const updateWallThickness = useCallback(
    (wallId: string, mm: number) => {
      setWalls((current) =>
        current.map((wall) =>
          wall.id === wallId
            ? { ...wall, thicknessPx: Math.max(1, mm / Math.max(0.1, scale.mmPerPx)) }
            : wall,
        ),
      );
    },
    [scale.mmPerPx],
  );

  const removeWall = useCallback((wallId: string) => {
    setWalls((current) => current.filter((wall) => wall.id !== wallId));
    setHighlightWallId((current) => (current === wallId ? null : current));
  }, []);

  const applyResult = useCallback(async () => {
    if (!recognition) return;
    setApplying(true);
    try {
      const result = await applyRecognizedPlan({
        raster: recognition.raster,
        draft: recognition.draft,
        walls,
        scale,
        replaceExisting: existingWalls > 0 ? replaceMode === 'replace' : true,
        projectNameHint: recognition.source.name,
      });
      setApplied({
        mode: 'recognize',
        wallCount: result.wallCount,
        openingCount: result.openingCount,
        roomCount: result.roomCount,
        skippedWalls: result.skippedWalls,
      });
      setStep('applied');
      pushToast(
        `已生成可编辑草图：${result.wallCount} 段墙 · ${result.roomCount} 个房间`,
        'success',
        result.skippedWalls > 0 ? `${result.skippedWalls} 段过短的墙体已跳过` : undefined,
      );
    } catch (cause) {
      const message = errorMessage(cause);
      pushToast('生成草图失败', 'error', message.message);
    } finally {
      setApplying(false);
    }
  }, [existingWalls, pushToast, recognition, replaceMode, scale, walls]);

  const applyTrace = useCallback(async () => {
    if (!recognition) return;
    setApplying(true);
    try {
      await applyTraceOnly({
        raster: recognition.raster,
        scale,
        projectNameHint: recognition.source.name,
      });
      setApplied({ mode: 'trace', wallCount: 0, openingCount: 0, roomCount: 0, skippedWalls: 0 });
      setStep('applied');
      pushToast('底图已放到锁定参考层，墙体工具已启用', 'success');
    } catch (cause) {
      const message = errorMessage(cause);
      pushToast('放置底图失败', 'error', message.message);
    } finally {
      setApplying(false);
    }
  }, [pushToast, recognition, scale]);

  const draft = recognition?.draft;
  const stepIndex = step === 'upload' ? 0 : step === 'progress' ? 1 : 2;
  const calibrationDone = scale.source === 'calibration' && Boolean(scale.measurement);
  const roomCount = draft?.rooms.length ?? 0;
  const openingCount = draft?.openings.length ?? 0;
  const totalWallLengthMm = useMemo(
    () =>
      walls.reduce(
        (sum, wall) => sum + Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) * scale.mmPerPx,
        0,
      ),
    [scale.mmPerPx, walls],
  );

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-faint">图片或 PDF 户型图</span>
        <Badge tone={visionStatus?.configured ? 'accent' : 'outline'}>
          {visionStatus === null
            ? '检测视觉服务'
            : visionStatus.configured
              ? '视觉增强可用'
              : '仅本地识别'}
        </Badge>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-faint">
        {['上传', '识别', '校对'].map((label, index) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px]',
                stepIndex >= index
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line text-faint',
              )}
            >
              {index + 1}
            </span>
            <span className={stepIndex >= index ? 'text-muted' : 'text-faint'}>{label}</span>
            {index < 2 ? <ChevronRight size={10} className="text-faint" /> : null}
          </span>
        ))}
      </div>

      {error ? (
        <Callout
          tone="danger"
          title="识别失败"
          action={
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                clearError();
                setStep('upload');
              }}
            >
              重试
            </Button>
          }
        >
          {error.message}
          {error.hint ? <p className="mt-1 text-[10px] opacity-80">{error.hint}</p> : null}
        </Callout>
      ) : null}

      {/* Step 1: upload */}
      {step === 'upload' ? (
        <div className="space-y-2.5">
          <div
            role="button"
            tabIndex={0}
            aria-label="选择户型图文件"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-[3px] border border-dashed px-3 py-6 text-center transition-colors',
              dragOver
                ? 'border-accent bg-accent-soft'
                : 'border-line-strong bg-raised hover:border-accent/60 hover:bg-surface',
            )}
          >
            {fileBusy ? (
              <Spinner className="mb-2 h-5 w-5 text-accent" />
            ) : (
              <ImageIcon size={22} className="mb-2 text-faint" />
            )}
            <p className="text-[12px] font-medium text-ink">
              {fileBusy ? '正在读取文件…' : '拖入户型图 / 点击选择'}
            </p>
            <p className="mt-1 text-[10px] text-muted">PNG · JPG · WebP · PDF（多页可选）</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
          </div>

          {pdfPicker ? (
            <div className="space-y-2 rounded-[3px] border border-line bg-raised p-2">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] text-ink" title={sourceName ?? ''}>
                  {sourceName}
                </span>
                <Badge tone="neutral">{pdfPicker.pdf.pageCount} 页</Badge>
              </div>
              <div className="grid max-h-[132px] grid-cols-4 gap-1 overflow-y-auto">
                {pdfPicker.pdf.pages.map((page) => (
                  <button
                    key={page.index}
                    type="button"
                    onClick={() =>
                      setPdfPicker((current) =>
                        current ? { ...current, pageIndex: page.index } : current,
                      )
                    }
                    aria-label={`选择${page.label}`}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-[2px] border p-1',
                      pdfPicker.pageIndex === page.index
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface hover:border-accent/50',
                    )}
                  >
                    <span
                      className={cn(
                        'block border border-line-strong bg-surface',
                        page.landscape ? 'h-4 w-6' : 'h-6 w-4',
                      )}
                    />
                    <span className="num text-[9px] text-muted">{page.index + 1}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center rounded-[2px] border border-line bg-surface p-1">
                {pdfPicker.previewLoading || !pdfPicker.preview ? (
                  <div className="flex h-[86px] w-full items-center justify-center">
                    <Spinner className="h-4 w-4 text-accent" />
                  </div>
                ) : (
                  <img
                    src={pdfPicker.preview}
                    alt={`第 ${pdfPicker.pageIndex + 1} 页预览`}
                    className="max-h-[120px] w-auto max-w-full object-contain"
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  block
                  size="sm"
                  variant="primary"
                  disabled={fileBusy}
                  onClick={() => void recognizePdfPage()}
                >
                  <ScanLine size={13} /> 识别第 {pdfPicker.pageIndex + 1} 页
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void pdfPicker.pdf.destroy();
                    pdfRef.current = null;
                    setPdfPicker(null);
                    setSourceName(null);
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : null}

          {samples.length > 0 ? (
            <Section title="示例图纸" subtitle="合成户型图，可快速体验识别流程。">
              <div className="grid gap-1.5">
                {samples.map((sample) => (
                  <Button
                    key={sample.id}
                    block
                    size="sm"
                    variant="outline"
                    disabled={sampleBusy !== null}
                    onClick={() => void loadSample(sample)}
                    className="justify-between"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {sampleBusy === sample.id ? (
                        <Loader2 size={12} className="animate-spin text-accent" />
                      ) : (
                        <FileText size={12} className="text-faint" />
                      )}
                      <span className="truncate">{sample.title}</span>
                    </span>
                    <span className="num shrink-0 text-[10px] text-faint">
                      {sample.wallCount} 墙 · {sample.areaSqm}㎡
                    </span>
                  </Button>
                ))}
              </div>
            </Section>
          ) : null}

          <Callout tone="neutral" title="识别说明">
            <ul className="space-y-0.5">
              <li>· 本地 CV 提取墙体、房间与门窗断口，全程在本机进行。</li>
              <li>· 尺寸文字由 OCR 读取；未安装语言包时用两点校准比例。</li>
              <li>· 配置 AI_API_KEY 后可用 DeepSeek 视觉补充门窗与标注。</li>
              <li>· 生成的是可编辑草图，识别结果需要人工校对。</li>
            </ul>
          </Callout>
        </div>
      ) : null}

      {/* Step 2: progress */}
      {step === 'progress' ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-[2px] border border-line bg-raised px-2 py-1.5">
            <span className="truncate text-[11px] text-ink" title={sourceName ?? ''}>
              {sourceName ?? '图纸'}
            </span>
            {busy ? <Spinner className="h-3.5 w-3.5 text-accent" /> : null}
          </div>
          <ul className="divide-y divide-line rounded-[2px] border border-line bg-surface px-2">
            {stages.map((stage) => (
              <StageRow key={stage.id} stage={stage} />
            ))}
          </ul>
          <div className="flex items-center gap-1.5">
            <Button block size="sm" variant="outline" onClick={cancelRecognition}>
              <X size={13} /> 取消识别
            </Button>
            {!busy ? (
              <Button block size="sm" variant="primary" onClick={() => setStep('upload')}>
                <RotateCcw size={13} /> 重新选择
              </Button>
            ) : null}
          </div>
          <p className="text-[10px] leading-relaxed text-faint">
            识别在本机 Worker 中完成；首次使用视觉增强时需要联网，可能稍慢。
          </p>
        </div>
      ) : null}

      {/* Step 3: review */}
      {step === 'review' && recognition && draft ? (
        <div className="space-y-2.5">
          <RecognitionOverlay
            dataUrl={recognition.dataUrl}
            width={recognition.raster.width}
            height={recognition.raster.height}
            walls={walls}
            draft={draft}
            layers={layers}
            calibrating={calibrating}
            calibrationPoints={calibrationPoints}
            highlightWallId={highlightWallId}
            mmPerPx={scale.mmPerPx}
            onImageClick={handleCalibrationPoint}
          />

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                ['walls', '墙体'],
                ['rooms', '房间'],
                ['openings', '门窗'],
                ['labels', '标注'],
              ] as Array<[keyof LayerToggles, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={layers[key]}
                onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}
                className={cn(
                  'h-5 rounded-[2px] border px-1.5 text-[10px] transition-colors',
                  layers[key]
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line bg-surface text-faint hover:text-muted',
                )}
              >
                {label}
              </button>
            ))}
            <span className="num ml-auto text-[10px] text-faint">
              {walls.length} 墙 · {roomCount} 房 · {openingCount} 洞口
            </span>
          </div>

          <div className="rounded-[3px] border border-line bg-raised p-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] text-muted">
                <ScanLine size={11} className="text-faint" /> 比例
              </span>
              <span className="num text-[11px] text-ink">{scale.mmPerPx.toFixed(2)} mm/px</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-1">
              <Badge tone={calibrationDone ? 'ok' : scale.source === 'ocr' ? 'accent' : 'outline'}>
                {calibrationDone
                  ? '两点校准'
                  : scale.source === 'ocr'
                    ? '尺寸文字'
                    : scale.source === 'ai'
                      ? '视觉估计'
                      : '假定比例'}
              </Badge>
              <div className="flex items-center gap-1">
                {calibrationDone ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setScale(scaleStateFromDraft(draft));
                      setCalibrationPoints([]);
                      setCalibrationMm('');
                      pushToast('已恢复为识别比例', 'info');
                    }}
                  >
                    恢复
                  </Button>
                ) : null}
                <Button
                  size="xs"
                  variant={calibrating ? 'soft' : 'outline'}
                  onClick={() => {
                    setCalibrating((value) => !value);
                    setCalibrationPoints([]);
                    setCalibrationMm('');
                  }}
                >
                  <ScanLine size={11} /> {calibrating ? '取消取点' : '两点校准'}
                </Button>
              </div>
            </div>
            {calibrationPoints.length === 2 ? (
              <div className="mt-1.5 flex items-end gap-1.5">
                <label className="flex-1 text-[10px] text-muted">
                  两点实际距离（mm）
                  <NumberField
                    value={calibrationMm}
                    onChange={(event) => setCalibrationMm(event.target.value)}
                    placeholder="例如 3600"
                    className="mt-0.5"
                  />
                </label>
                <Button size="xs" variant="primary" onClick={applyCalibrationValue}>
                  应用
                </Button>
              </div>
            ) : null}
            {recognition.ocr.reason && !recognition.ocr.available ? (
              <p className="mt-1 text-[10px] leading-snug text-faint">{recognition.ocr.reason}</p>
            ) : null}
          </div>

          <Section
            title="墙体列表"
            subtitle="可修改墙厚或删除误识别墙体；毫米数值按当前比例换算。"
            actions={<Badge tone="outline">{(totalWallLengthMm / 1000).toFixed(1)} m</Badge>}
            dense
          >
            {walls.length === 0 ? (
              <Callout tone="warning" title="未识别到墙体">
                可使用下方「仅放置底图」后手工描图，或重新识别。
              </Callout>
            ) : (
              <ul className="hd-scroll max-h-[188px] space-y-1 overflow-y-auto pr-1">
                {walls.map((wall, index) => {
                  const lengthMm =
                    Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) * scale.mmPerPx;
                  const thicknessMm = Math.max(50, Math.round(wall.thicknessPx * scale.mmPerPx));
                  return (
                    <li
                      key={wall.id}
                      onMouseEnter={() => setHighlightWallId(wall.id)}
                      onMouseLeave={() => setHighlightWallId(null)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-[2px] border px-1.5 py-1',
                        highlightWallId === wall.id
                          ? 'border-accent/50 bg-accent-soft'
                          : 'border-line bg-surface',
                      )}
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            wall.confidence >= 0.72
                              ? 'var(--ok)'
                              : wall.confidence >= 0.5
                                ? 'var(--electric)'
                                : 'var(--danger)',
                        }}
                        title={`置信度 ${(wall.confidence * 100).toFixed(0)}%`}
                      />
                      <span className="num w-7 shrink-0 text-[10px] text-faint">#{index + 1}</span>
                      <span className="num flex-1 text-[11px] text-ink">
                        {(lengthMm / 1000).toFixed(2)} m
                      </span>
                      <label className="flex items-center gap-0.5 text-[10px] text-faint">
                        厚
                        <NumberField
                          value={thicknessMm}
                          onChange={(event) => {
                            const next = Number.parseFloat(event.target.value);
                            if (Number.isFinite(next) && next > 0) updateWallThickness(wall.id, next);
                          }}
                          className="h-5 w-12 text-[10px]"
                        />
                        mm
                      </label>
                      <IconButton
                        label={`删除墙体 ${index + 1}`}
                        variant="ghost"
                        size="icon-sm"
                        className="h-5 w-5"
                        onClick={() => removeWall(wall.id)}
                      >
                        <Trash2 size={11} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {draft.diagnostics.length > 0 ? (
            <details className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
              <summary className="cursor-pointer text-[10px] text-muted">
                识别诊断（{draft.diagnostics.length}）
              </summary>
              <ul className="mt-1 space-y-0.5">
                {draft.diagnostics.map((item, index) => (
                  <li key={index} className="text-[10px] leading-snug text-faint">
                    · {item}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {existingWalls > 0 ? (
            <Callout tone="warning" title={`当前方案已有 ${existingWalls} 段墙体`}>
              生成草图会改动结构层。请选择处理方式：
              <div className="mt-1.5">
                <Segmented
                  ariaLabel="导入方式"
                  value={replaceMode}
                  onChange={(value) => setReplaceMode(value)}
                  options={[
                    { value: 'replace', label: `替换现有墙体与 ${existingRooms} 个房间` },
                    { value: 'append', label: '追加到现有墙体' },
                  ]}
                />
              </div>
            </Callout>
          ) : null}

          <div className="grid gap-1.5">
            <Button
              block
              variant="primary"
              size="md"
              disabled={applying || walls.length === 0}
              onClick={() => void applyResult()}
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              生成可编辑草图
            </Button>
            <div className="flex items-center gap-1.5">
              <Button
                block
                size="sm"
                variant="outline"
                disabled={applying}
                onClick={() => void applyTrace()}
              >
                <PenLine size={13} /> 仅放置底图，手工描图
              </Button>
              <Button size="sm" variant="ghost" onClick={restart}>
                <RotateCcw size={13} /> 重新识别
              </Button>
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-faint">
            生成后底图会放入锁定的「底图」参考层，墙体/房间在结构层可继续编辑。
          </p>
        </div>
      ) : null}

      {/* Step 4: applied */}
      {step === 'applied' && applied ? (
        <div className="space-y-2.5">
          <Callout tone="ok" title={applied.mode === 'trace' ? '底图已就位' : '草图已生成'}>
            {applied.mode === 'trace'
              ? '底图已放到锁定的参考层，已切换到墙体工具，可按底图描图。'
              : `结构层新增 ${applied.wallCount} 段墙、${applied.openingCount} 处门窗、${applied.roomCount} 个房间；底图保持可见。`}
          </Callout>
          {applied.mode === 'recognize' ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setRightPanel('properties')}>
                检查属性
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRightPanel('layers')}>
                <Layers size={13} /> 图层面板
              </Button>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Button size="sm" variant="primary" block onClick={() => setTool('wall')}>
              <PenLine size={13} /> 继续用墙体工具描图
            </Button>
            <Button size="sm" variant="outline" block onClick={() => setTool('select')}>
              结束导入，返回选择工具
            </Button>
            <Button size="sm" variant="ghost" block onClick={() => setStep('upload')}>
              <FileUp size={13} /> 再导入一张图纸
            </Button>
          </div>
          <p className="text-[10px] leading-relaxed text-faint">
            底图默认锁定；需要在属性面板解除锁定后才能移动或旋转。识别结果建议对照原图逐项校对。
          </p>
        </div>
      ) : null}

      {step === 'review' && !recognition ? (
        <Callout tone="neutral" title="暂无可校对结果">
          请先选择一张图纸并完成识别。
        </Callout>
      ) : null}

      {recognition?.vision.reason ? (
        <p className="text-[10px] leading-relaxed text-faint">
          视觉增强：{recognition.vision.reason}
        </p>
      ) : null}
      {recognition?.vision.available ? (
        <p className="flex items-center gap-1 text-[10px] leading-relaxed text-faint">
          <CheckCircle2 size={11} className="text-ok" />
          视觉增强已启用
          {recognition.vision.mock ? '（演示数据）' : `（${recognition.vision.model ?? 'DeepSeek'}）`}
        </p>
      ) : null}

      {step === 'applied' && sourceName ? (
        <p className="truncate text-[10px] text-faint">来源文件：{sourceName}</p>
      ) : null}

      {applied?.skippedWalls ? (
        <p className="flex items-center gap-1 text-[10px] text-electric">
          <AlertTriangle size={11} /> {applied.skippedWalls} 段过短的墙体已跳过
        </p>
      ) : null}
    </div>
  );
}
