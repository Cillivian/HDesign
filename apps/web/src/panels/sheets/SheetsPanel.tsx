import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Layers3,
  Printer,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import {
  SHEET_KIND_LABELS,
  SHEET_KINDS,
  SHEET_SCALES,
  SHEET_SIZES,
  type Layer,
  type Project,
  type SheetKind,
  type SheetSpec,
  type TitleBlock,
} from '@hdesign/domain';
import {
  BOM_SCOPE_LABELS,
  computeBom,
  formatCurrency,
  formatNumber,
  renderSheet,
  type BomOverrides,
  type SheetRenderResult,
} from '@hdesign/drawing';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import {
  Badge,
  Button,
  Callout,
  IconButton,
  NumberField,
  Section,
  Segmented,
  Spinner,
  TextField,
  cn,
} from '../../design-system/primitives';
import { downloadSheetPng } from '../../services/export/png';
import { downloadSheetPdf, type PdfRenderMode } from '../../services/export/pdf';
import { downloadSheetCsv } from '../../services/export/csv';
import { downloadSvgFromString } from './helpers';

/* ------------------------------------------------------------------ */
/* Local helpers                                                      */
/* ------------------------------------------------------------------ */

const PRINT_STYLE_ID = 'hdesign-sheet-print-style';
const KIND_ORDER = new Map<SheetKind, number>(SHEET_KINDS.map((kind, index) => [kind, index]));
const PDF_MODE_LABELS: Array<{ value: PdfRenderMode; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'raster', label: '位图' },
  { value: 'vector', label: '矢量' },
];

function bomStorageKey(projectId: string): string {
  return `hdesign.bom.${projectId}`;
}

function loadBomOverrides(projectId: string): BomOverrides {
  try {
    const raw = localStorage.getItem(bomStorageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BomOverrides;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function ensurePrintStyle(): HTMLStyleElement {
  let style = document.getElementById(PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    document.head.appendChild(style);
  }
  return style;
}

/* ------------------------------------------------------------------ */
/* Sheet list                                                         */
/* ------------------------------------------------------------------ */

function SheetListItem({
  project,
  sheet,
  active,
  onSelect,
}: {
  project: Project;
  sheet: SheetSpec;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[11px] transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-ink',
      )}
    >
      <FileText size={13} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{SHEET_KIND_LABELS[sheet.kind]}</span>
      <span className="num shrink-0 text-[9px] text-faint">
        {sheet.size} · 1:{sheet.scale}
      </span>
      <span className="sr-only">{project.rooms.length ? `${project.rooms.length} 个房间` : '空白图纸'}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Options panel                                                      */
/* ------------------------------------------------------------------ */

interface OptionsProps {
  project: Project;
  sheet: SheetSpec;
  layerCounts: Map<string, number>;
  titleDraft: TitleBlock;
  onTitleChange: (patch: Partial<TitleBlock>) => void;
  onTitleCommit: () => void;
  onSheetChange: (patch: Partial<SheetSpec>) => void;
  onResetOverrides: () => void;
  hasOverrides: boolean;
}

function SheetOptions({
  project,
  sheet,
  layerCounts,
  titleDraft,
  onTitleChange,
  onTitleCommit,
  onSheetChange,
  onResetOverrides,
  hasOverrides,
}: OptionsProps) {
  const layers = useMemo(() => [...project.layers].sort((a, b) => a.order - b.order), [project.layers]);
  const included = new Set(sheet.layerIds);
  const toggleLayer = (layer: Layer) => {
    const next = new Set(included);
    if (next.has(layer.id)) next.delete(layer.id);
    else next.add(layer.id);
    onSheetChange({ layerIds: [...next] });
  };
  return (
    <div className="space-y-3">
      <Section title="图纸参数" dense className="py-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted">图幅</span>
            <Segmented
              ariaLabel="图幅"
              size="xs"
              value={sheet.size}
              onChange={(value) => onSheetChange({ size: value })}
              options={SHEET_SIZES.map((size) => ({ value: size, label: size }))}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-[10px] text-muted">比例</span>
            <Segmented
              ariaLabel="出图比例"
              size="xs"
              value={String(sheet.scale)}
              onChange={(value) => onSheetChange({ scale: Number(value) as SheetSpec['scale'] })}
              options={SHEET_SCALES.map((scale) => ({ value: String(scale), label: `1:${scale}` }))}
            />
          </div>
          <label className="flex items-center justify-between gap-2 text-[10px] text-muted">
            标注尺寸链
            <input
              type="checkbox"
              checked={sheet.includeDimensions}
              onChange={(event) => onSheetChange({ includeDimensions: event.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
          </label>
        </div>
      </Section>

      <Section
        title="图层"
        dense
        className="py-0"
        actions={
          <button
            type="button"
            className="text-[10px] text-accent hover:underline"
            onClick={() =>
              onSheetChange({ layerIds: included.size === layers.length ? [] : layers.map((layer) => layer.id) })
            }
          >
            {included.size === layers.length ? '全不选' : '全选'}
          </button>
        }
      >
        <ul className="space-y-0.5">
          {layers.map((layer) => (
            <li key={layer.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-[10px]',
                  layer.visible ? 'text-muted' : 'text-faint',
                )}
              >
                <input
                  type="checkbox"
                  checked={included.has(layer.id)}
                  onChange={() => toggleLayer(layer)}
                  className="h-3 w-3 accent-[var(--accent)]"
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-[1px] border border-line"
                  style={{ background: layer.color ?? 'var(--bg-subtle)' }}
                />
                <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                {!layer.visible ? <span className="text-[9px] text-faint">已隐藏</span> : null}
                <span className="num text-[9px] text-faint">{layerCounts.get(layer.id) ?? 0}</span>
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="图签" dense className="py-0">
        <div className="space-y-1.5">
          {(
            [
              ['projectName', '工程名称'],
              ['sheetNo', '图号'],
              ['designer', '设计'],
              ['date', '日期'],
              ['notes', '说明'],
            ] as Array<[keyof TitleBlock, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-0.5 text-[10px] text-muted">
              {label}
              <TextField
                value={titleDraft[key]}
                onChange={(event) => onTitleChange({ [key]: event.target.value })}
                onBlur={onTitleCommit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onTitleCommit();
                    (event.target as HTMLInputElement).blur();
                  }
                }}
                aria-label={label}
                className="h-6 text-[11px]"
              />
            </label>
          ))}
        </div>
      </Section>

      {hasOverrides ? (
        <Section title="清单编辑" dense className="py-0">
          <Button size="xs" variant="ghost" block onClick={onResetOverrides}>
            <RefreshCw size={11} /> 还原清单修改
          </Button>
        </Section>
      ) : null}

      <p className="px-1 text-[9px] leading-relaxed text-faint">
        图纸为方案参考，尺寸与点位需现场复核；未校准底图不得作为施工依据。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BOM editor                                                         */
/* ------------------------------------------------------------------ */

function BomEditor({
  project,
  overrides,
  onChange,
  onReset,
}: {
  project: Project;
  overrides: BomOverrides;
  onChange: (next: BomOverrides) => void;
  onReset: () => void;
}) {
  const bom = useMemo(() => computeBom(project, overrides), [project, overrides]);
  const numberValue = (value: string): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const setMaterial = (key: string, patch: { quantity?: number; unitPrice?: number }) => {
    const current = overrides.materials?.[key] ?? {};
    onChange({ ...overrides, materials: { ...overrides.materials, [key]: { ...current, ...patch } } });
  };
  const setFurniture = (key: string, patch: { unitPrice?: number; count?: number }) => {
    const current = overrides.furniture?.[key] ?? {};
    onChange({ ...overrides, furniture: { ...overrides.furniture, [key]: { ...current, ...patch } } });
  };
  const setMep = (key: string, patch: { unitPrice?: number; count?: number }) => {
    const current = overrides.mep?.[key] ?? {};
    onChange({ ...overrides, mep: { ...overrides.mep, [key]: { ...current, ...patch } } });
  };
  const unitPriceField = (value: number, commit: (next: number) => void, label: string) => (
    <NumberField
      value={String(value)}
      min={0}
      step={1}
      aria-label={label}
      onChange={(event) => {
        const next = numberValue(event.target.value);
        if (next !== undefined) commit(next);
      }}
      className="h-6 w-16 px-1 text-[10px]"
    />
  );

  const rowCount = bom.materials.length + bom.furniture.length + bom.mep.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-ink">物料清单</p>
          <p className="text-[10px] text-faint">
            套内 {formatNumber(bom.areaSqm, 1)} ㎡ · {bom.roomCount} 空间 · 合计{' '}
            <span className="num text-ink">{formatCurrency(bom.totals.total)}</span>
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onReset} disabled={!Object.keys(overrides).length}>
          <RefreshCw size={11} /> 还原
        </Button>
      </div>
      <div className="hd-scroll max-h-[240px] overflow-auto rounded-[2px] border border-line">
        <table className="w-full border-collapse text-[10px]">
          <thead className="sticky top-0 bg-raised text-[9px] text-faint">
            <tr>
              <th className="border-b border-line px-1.5 py-1 text-left font-medium">类别 / 名称</th>
              <th className="border-b border-line px-1 py-1 text-right font-medium">数量</th>
              <th className="border-b border-line px-1 py-1 text-right font-medium">单价</th>
              <th className="border-b border-line px-1.5 py-1 text-right font-medium">金额</th>
            </tr>
          </thead>
          <tbody>
            {bom.materials.map((line) => (
              <tr key={line.key} className="border-b border-line/60">
                <td className="px-1.5 py-1">
                  <span className="text-faint">{BOM_SCOPE_LABELS[line.scope]} · </span>
                  <span className="text-ink">{line.name}</span>
                  <span className="block truncate text-[9px] text-faint">{line.rooms.join('/')}</span>
                </td>
                <td className="px-1 py-1 text-right">
                  <NumberField
                    value={String(line.quantity)}
                    min={0}
                    step={0.1}
                    aria-label={`${line.name} 数量`}
                    onChange={(event) => {
                      const next = numberValue(event.target.value);
                      if (next !== undefined) setMaterial(line.key, { quantity: next });
                    }}
                    className="h-6 w-16 px-1 text-[10px]"
                  />
                  <span className="ml-1 text-[9px] text-faint">{line.unit}</span>
                </td>
                <td className="px-1 py-1 text-right">
                  {unitPriceField(line.unitPrice, (next) => setMaterial(line.key, { unitPrice: next }), `${line.name} 单价`)}
                </td>
                <td className="num px-1.5 py-1 text-right text-ink">{formatNumber(line.amount, 0)}</td>
              </tr>
            ))}
            {bom.furniture.map((line) => (
              <tr key={line.key} className="border-b border-line/60">
                <td className="px-1.5 py-1">
                  <span className="text-faint">家具 · </span>
                  <span className="text-ink">{line.name}</span>
                </td>
                <td className="px-1 py-1 text-right">
                  <NumberField
                    value={String(line.count)}
                    min={0}
                    step={1}
                    aria-label={`${line.name} 数量`}
                    onChange={(event) => {
                      const next = numberValue(event.target.value);
                      if (next !== undefined) setFurniture(line.skuId, { count: next });
                    }}
                    className="h-6 w-16 px-1 text-[10px]"
                  />
                  <span className="ml-1 text-[9px] text-faint">{line.unit}</span>
                </td>
                <td className="px-1 py-1 text-right">
                  {unitPriceField(line.unitPrice, (next) => setFurniture(line.skuId, { unitPrice: next }), `${line.name} 单价`)}
                </td>
                <td className="num px-1.5 py-1 text-right text-ink">{formatNumber(line.amount, 0)}</td>
              </tr>
            ))}
            {bom.mep.map((line) => (
              <tr key={line.key} className="border-b border-line/60">
                <td className="px-1.5 py-1">
                  <span className="text-faint">{line.group === 'water' ? '水位 · ' : '电位 · '}</span>
                  <span className="text-ink">{line.label}</span>
                </td>
                <td className="px-1 py-1 text-right">
                  <NumberField
                    value={String(line.count)}
                    min={0}
                    step={1}
                    aria-label={`${line.label} 数量`}
                    onChange={(event) => {
                      const next = numberValue(event.target.value);
                      if (next !== undefined) setMep(line.kind, { count: next });
                    }}
                    className="h-6 w-16 px-1 text-[10px]"
                  />
                  <span className="ml-1 text-[9px] text-faint">{line.unit}</span>
                </td>
                <td className="px-1 py-1 text-right">
                  {unitPriceField(line.unitPrice, (next) => setMep(line.kind, { unitPrice: next }), `${line.label} 单价`)}
                </td>
                <td className="num px-1.5 py-1 text-right text-ink">{formatNumber(line.amount, 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-raised">
            <tr className="border-t border-line">
              <td className="px-1.5 py-1 text-[10px] font-medium text-ink" colSpan={3}>
                共 {rowCount} 行 · 材质 {formatNumber(bom.totals.materials, 0)} · 家具 {formatNumber(bom.totals.furniture, 0)} · 水电{' '}
                {formatNumber(bom.totals.mep, 0)}
              </td>
              <td className="num px-1.5 py-1 text-right text-[11px] font-semibold text-ink">
                {formatCurrency(bom.totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[9px] leading-relaxed text-faint">
        数量/单价修改仅影响本机图纸与 CSV 导出，不改变方案模型；价格来自本地材质库参考价。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main panel                                                         */
/* ------------------------------------------------------------------ */

export function SheetsPanel() {
  const doc = useDocStore((state) => state.doc);
  const updateSheet = useDocStore((state) => state.updateSheet);
  const updateSheetTitleBlock = useDocStore((state) => state.updateSheetTitleBlock);
  const activeSheetId = useUiStore((state) => state.activeSheetId);
  const setActiveSheet = useUiStore((state) => state.setActiveSheet);
  const pushToast = useUiStore((state) => state.pushToast);

  const sheets = useMemo(
    () => [...doc.sheets].sort((a, b) => (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99)),
    [doc.sheets],
  );
  const active = sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0];

  const [rootRef, width] = useElementWidth<HTMLDivElement>();
  const wide = width >= 680;
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const [showOptions, setShowOptions] = useState(false);
  const [pdfMode, setPdfMode] = useState<PdfRenderMode>('auto');
  const [pngScale, setPngScale] = useState<2 | 3>(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [bomOverrides, setBomOverrides] = useState<BomOverrides>(() => loadBomOverrides(doc.id));
  const [titleDraft, setTitleDraft] = useState<TitleBlock>(
    active?.titleBlock ?? { projectName: doc.name, sheetNo: 'A-01', designer: '', date: '', notes: '' },
  );
  const printRef = useRef<HTMLDivElement | null>(null);

  const activeId = active?.id;
  const activeTitleBlock = active?.titleBlock;
  useEffect(() => {
    if (activeTitleBlock) setTitleDraft(activeTitleBlock);
  }, [activeId, activeTitleBlock]);

  useEffect(() => {
    setBomOverrides(loadBomOverrides(doc.id));
  }, [doc.id]);

  useEffect(() => {
    try {
      if (Object.keys(bomOverrides).length) {
        localStorage.setItem(bomStorageKey(doc.id), JSON.stringify(bomOverrides));
      } else {
        localStorage.removeItem(bomStorageKey(doc.id));
      }
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, [bomOverrides, doc.id]);

  const layerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (layerId: string) => counts.set(layerId, (counts.get(layerId) ?? 0) + 1);
    for (const wall of doc.walls) bump(wall.layerId);
    for (const room of doc.rooms) bump(room.layerId);
    for (const item of doc.furniture) bump(item.layerId);
    for (const device of doc.mep.devices) bump(device.layerId);
    for (const annotation of doc.annotations) bump(annotation.layerId);
    return counts;
  }, [doc]);

  const renderState = useMemo<{ result: SheetRenderResult | null; error: string | null }>(() => {
    if (!active) return { result: null, error: null };
    try {
      return {
        result: renderSheet(doc, active, { bomOverrides, idPrefix: `sheet-preview-${active.id}` }),
        error: null,
      };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [doc, active, bomOverrides]);
  const renderResult = renderState.result;

  const previewWidth =
    zoom === 'fit' ? '100%' : `${Math.round(((renderResult?.widthMm ?? 420) / 25.4) * 96)}px`;

  const changeSheet = useCallback(
    (patch: Partial<SheetSpec>) => {
      if (!active) return;
      updateSheet(active.id, patch);
    },
    [active, updateSheet],
  );

  const changeTitle = useCallback((patch: Partial<TitleBlock>) => {
    setTitleDraft((current) => ({ ...current, ...patch }));
  }, []);

  const commitTitle = useCallback(() => {
    if (!active) return;
    const current = active.titleBlock;
    const patch: Partial<TitleBlock> = {};
    (Object.keys(current) as Array<keyof TitleBlock>).forEach((key) => {
      if (current[key] !== titleDraft[key]) patch[key] = titleDraft[key];
    });
    if (Object.keys(patch).length) updateSheetTitleBlock(active.id, patch);
  }, [active, titleDraft, updateSheetTitleBlock]);

  const resetOverrides = useCallback(() => {
    setBomOverrides({});
    pushToast('已还原清单修改', 'info');
  }, [pushToast]);

  const withExport = useCallback(
    async (label: string, task: () => Promise<string>) => {
      setBusy(label);
      setProgress(null);
      try {
        const message = await task();
        pushToast(`${label} 已导出`, 'success', message);
      } catch (error) {
        pushToast(`${label} 导出失败`, 'error', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [pushToast],
  );

  const handleSvg = useCallback(() => {
    if (!active || !renderResult) return;
    void withExport('SVG', async () => downloadSvgFromString(renderResult.svg, doc.name, active));
  }, [active, doc.name, renderResult, withExport]);

  const handlePng = useCallback(() => {
    if (!active) return;
    void withExport('PNG', async () => {
      const result = await downloadSheetPng(doc, active, { rasterScale: pngScale });
      return `${result.widthPx}×${result.heightPx}px · ${result.filename}`;
    });
  }, [active, doc, pngScale, withExport]);

  const handlePdf = useCallback(() => {
    if (!active) return;
    void withExport('PDF', async () => {
      const result = await downloadSheetPdf(doc, active, {
        mode: pdfMode,
        dpi: 300,
        onProgress: (stage) => setProgress(stage),
      });
      return `${result.mode === 'vector' ? '矢量' : `${result.dpi ?? 300}dpi 位图`} · ${result.filename}`;
    });
  }, [active, doc, pdfMode, withExport]);

  const handleCsv = useCallback(() => {
    if (!active) return;
    void withExport('CSV', async () => downloadSheetCsv(doc, active, bomOverrides).filename);
  }, [active, bomOverrides, doc, withExport]);

  const handlePrint = useCallback(() => {
    if (!active || !renderResult) return;
    const style = ensurePrintStyle();
    style.textContent = `
@page { size: ${renderResult.paper} landscape; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#hdesign-print-root) { display: none !important; }
  #hdesign-print-root { display: block !important; position: absolute; inset: 0; background: #fff; }
  #hdesign-print-root svg { display: block; width: 100vw; height: auto; }
}`;
    const originalTitle = document.title;
    document.title = `${doc.name}-${active.titleBlock.sheetNo}-${SHEET_KIND_LABELS[active.kind]}`;
    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    window.setTimeout(restore, 1500);
  }, [active, doc.name, renderResult]);

  const handleRegenerate = useCallback(() => {
    setBomOverrides({});
    pushToast('已按当前方案重新生成图纸', 'success');
  }, [pushToast]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[11px] text-muted">
        当前项目还没有图纸，请重新打开方案或导入项目包。
      </div>
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
        <span className="font-medium text-ink">{active.titleBlock.sheetNo}</span> · {SHEET_KIND_LABELS[active.kind]}
        <span className="ml-1 text-[9px] text-faint">
          {renderResult ? `${renderResult.paper} · 1:${Math.round(renderResult.scale)}` : ''}
        </span>
      </span>
      <Segmented
        ariaLabel="预览缩放"
        size="xs"
        value={zoom}
        onChange={(value) => setZoom(value)}
        options={[
          { value: 'fit', label: '适应' },
          { value: 'actual', label: '实际' },
        ]}
      />
      {wide ? null : (
        <IconButton
          label="图纸设置"
          size="icon-sm"
          variant="ghost"
          active={showOptions}
          onClick={() => setShowOptions((value) => !value)}
        >
          <Settings2 size={13} />
        </IconButton>
      )}
      <IconButton label="重新生成" size="icon-sm" variant="ghost" onClick={handleRegenerate}>
        <RefreshCw size={13} />
      </IconButton>
      <div className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
      {wide ? (
        <>
          <Button size="xs" variant="outline" onClick={handleSvg} disabled={!renderResult || busy !== null}>
            {busy === 'SVG' ? <Spinner /> : <Download size={11} />} SVG
          </Button>
          <Button size="xs" variant="outline" onClick={handlePng} disabled={!renderResult || busy !== null}>
            {busy === 'PNG' ? <Spinner /> : <ImageIcon size={11} />} PNG
          </Button>
          <Button size="xs" variant="outline" onClick={handlePdf} disabled={!renderResult || busy !== null}>
            {busy === 'PDF' ? <Spinner /> : <FileText size={11} />} PDF
          </Button>
          <Button size="xs" variant="outline" onClick={handleCsv} disabled={busy !== null}>
            {busy === 'CSV' ? <Spinner /> : <FileSpreadsheet size={11} />} CSV
          </Button>
          <Button size="xs" variant="primary" onClick={handlePrint} disabled={!renderResult}>
            <Printer size={11} /> 打印
          </Button>
        </>
      ) : (
        <>
          <IconButton label="导出 SVG" size="icon-sm" variant="outline" onClick={handleSvg} disabled={!renderResult || busy !== null}>
            {busy === 'SVG' ? <Spinner /> : <Download size={13} />}
          </IconButton>
          <IconButton label="导出 PNG（2x）" size="icon-sm" variant="outline" onClick={handlePng} disabled={!renderResult || busy !== null}>
            {busy === 'PNG' ? <Spinner /> : <ImageIcon size={13} />}
          </IconButton>
          <IconButton label="导出 PDF" size="icon-sm" variant="outline" onClick={handlePdf} disabled={!renderResult || busy !== null}>
            {busy === 'PDF' ? <Spinner /> : <FileText size={13} />}
          </IconButton>
          <IconButton label="导出 CSV" size="icon-sm" variant="outline" onClick={handleCsv} disabled={busy !== null}>
            {busy === 'CSV' ? <Spinner /> : <FileSpreadsheet size={13} />}
          </IconButton>
          <IconButton label="打印图纸" size="icon-sm" variant="primary" onClick={handlePrint} disabled={!renderResult}>
            <Printer size={13} />
          </IconButton>
        </>
      )}
    </div>
  );

  const progressBar = busy ? (
    <div className="flex items-center gap-1.5 border-b border-line bg-raised px-2 py-1 text-[10px] text-muted" role="status">
      <Spinner /> {progress ?? `正在导出 ${busy}…`}
    </div>
  ) : null;

  const preview = (
    <div className={cn('hd-scroll min-h-0 flex-1 overflow-auto bg-app', wide ? 'p-3' : 'p-2')}>
      {renderResult ? (
        <div className="mx-auto w-full" style={{ maxWidth: zoom === 'fit' ? '100%' : 'none', width: previewWidth }}>
          <div
            className="sheet-edge overflow-hidden border border-line bg-white shadow-[var(--shadow-sheet)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            style={{ aspectRatio: `${renderResult.widthMm} / ${renderResult.heightMm}` }}
            // Generated locally from validated project data; every text node is XML-escaped.
            dangerouslySetInnerHTML={{ __html: renderResult.svg }}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[9px] text-faint">
            <span>
              {renderResult.widthMm}×{renderResult.heightMm}mm · {renderResult.paper} · 比例 1:
              {Math.round(renderResult.scale)}
              {renderResult.scale !== renderResult.requestedScale
                ? `（已按图幅适配，原 1:${renderResult.requestedScale}）`
                : ''}
            </span>
            <span>方案参考 · 未校准 · 需人工复核</span>
          </div>
          {renderResult.warnings.length ? (
            <div className="mt-1.5">
              <Callout tone="warning" title="出图提示">
                {renderResult.warnings.join('；')}
              </Callout>
            </div>
          ) : null}
        </div>
      ) : (
        <Callout tone="danger" title="图纸生成失败">
          {renderState.error ?? '未知错误'}。请尝试增减图层或降低图幅后重试。
        </Callout>
      )}
    </div>
  );

  const options = (
    <div>
      <SheetOptions
        project={doc}
        sheet={active}
        layerCounts={layerCounts}
        titleDraft={titleDraft}
        onTitleChange={changeTitle}
        onTitleCommit={commitTitle}
        onSheetChange={changeSheet}
        onResetOverrides={resetOverrides}
        hasOverrides={Object.keys(bomOverrides).length > 0}
      />
      <div className="border-t border-line p-2">
        <Section title="PNG 分辨率" dense className="py-0">
          <Segmented
            ariaLabel="PNG 分辨率"
            size="xs"
            value={String(pngScale)}
            onChange={(value) => setPngScale(Number(value) === 3 ? 3 : 2)}
            options={[
              { value: '2', label: '2x' },
              { value: '3', label: '3x' },
            ]}
          />
          <p className="mt-1 text-[9px] leading-relaxed text-faint">2x 适合预览分享，3x 适合打印校样。</p>
        </Section>
      </div>
      <div className="border-t border-line p-2">
        <Section title="PDF 文字模式" dense className="py-0">
          <Segmented
            ariaLabel="PDF 文字模式"
            size="xs"
            value={pdfMode}
            onChange={(value) => setPdfMode(value)}
            options={PDF_MODE_LABELS.map((option) => ({ value: option.value, label: option.label }))}
          />
          <p className="mt-1 text-[9px] leading-relaxed text-faint">
            中文图纸默认按 300dpi 位图输出以保证字体正确；矢量模式仅建议用于无中文标注的图。
          </p>
        </Section>
      </div>
    </div>
  );

  const sheetList = (
    <div className={cn(wide ? 'flex w-[188px] shrink-0 flex-col border-r border-line' : 'border-b border-line')}>
      <div className="flex h-8 items-center justify-between px-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold text-muted">
          <Layers3 size={12} /> 图纸
        </span>
        <Badge tone="outline">{sheets.length}</Badge>
      </div>
      <ul className={cn('p-1.5', wide ? 'space-y-0.5' : 'flex gap-1 overflow-x-auto')}>
        {sheets.map((sheet) => (
          <li key={sheet.id} className={wide ? '' : 'shrink-0'}>
            {wide ? (
              <SheetListItem
                project={doc}
                sheet={sheet}
                active={sheet.id === active.id}
                onSelect={() => setActiveSheet(sheet.id)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveSheet(sheet.id)}
                aria-current={sheet.id === active.id ? 'true' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-[2px] border px-2 py-1 text-[10px]',
                  sheet.id === active.id
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {SHEET_KIND_LABELS[sheet.kind]}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-surface">
      {toolbar}
      {progressBar}
      {wide ? (
        <div className="flex min-h-0 flex-1">
          {sheetList}
          <div className="flex min-w-0 flex-1 flex-col">
            {preview}
            {active.kind === 'bom' ? (
              <div className="max-h-[280px] shrink-0 overflow-y-auto border-t border-line p-2">
                <BomEditor project={doc} overrides={bomOverrides} onChange={setBomOverrides} onReset={resetOverrides} />
              </div>
            ) : null}
          </div>
          <aside aria-label="图纸设置" className="hd-scroll w-[248px] shrink-0 overflow-y-auto border-l border-line p-2">
            {options}
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {sheetList}
          {preview}
          <div className="hd-scroll max-h-[46%] min-h-0 overflow-y-auto border-t border-line">
            {active.kind === 'bom' ? (
              <div className="border-b border-line p-2">
                <BomEditor project={doc} overrides={bomOverrides} onChange={setBomOverrides} onReset={resetOverrides} />
              </div>
            ) : null}
            {showOptions ? <div className="p-2">{options}</div> : null}
          </div>
        </div>
      )}
      {createPortal(
        <div id="hdesign-print-root" ref={printRef} aria-hidden="true" style={{ display: 'none' }}>
          {renderResult ? <div dangerouslySetInnerHTML={{ __html: renderResult.svg }} /> : null}
        </div>,
        document.body,
      )}
    </div>
  );
}
