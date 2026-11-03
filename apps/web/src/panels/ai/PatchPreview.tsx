import { Check, Undo2, X } from 'lucide-react';
import { Badge, Button, Callout, Segmented } from '../../design-system/primitives';
import { summarizeDiff, type BriefApplyMode, type PatchExecutionResult } from '../../services/patch-executor';

const MODE_OPTIONS: Array<{ value: BriefApplyMode; label: string; title: string }> = [
  { value: 'replace', label: '替换家具', title: '清空涉及房间的现有家具后重新布置' },
  { value: 'fill-empty', label: '补充空房', title: '保留现有家具，只给空房间补充布置' },
  { value: 'style-only', label: '只改风格', title: '只应用风格、材质与房间类型，不动家具和水电' },
];

export function ModeSelector({
  mode,
  onChange,
}: {
  mode: BriefApplyMode;
  onChange: (mode: BriefApplyMode) => void;
}) {
  return (
    <div className="space-y-1">
      <Segmented
        value={mode}
        options={MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label, title: option.title }))}
        onChange={onChange}
        ariaLabel="应用方式"
        size="xs"
        className="flex w-full [&>button]:flex-1"
      />
      <p className="text-[10px] leading-snug text-faint">
        {MODE_OPTIONS.find((option) => option.value === mode)?.title}
      </p>
    </div>
  );
}

export function PatchPreviewCard({
  result,
  applied,
  busy,
  mode,
  showMode,
  onModeChange,
  onApply,
  onDiscard,
  onUndo,
  canUndo,
  title,
  applyLabel = '确认应用',
}: {
  result: (PatchExecutionResult & { diagnostics?: string[] }) | null;
  applied: boolean;
  busy: boolean;
  mode?: BriefApplyMode;
  showMode?: boolean;
  onModeChange?: (mode: BriefApplyMode) => void;
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  canUndo: boolean;
  title?: string;
  applyLabel?: string;
}) {
  if (!result) return null;
  const diffLines = summarizeDiff(result.diff);
  const hasChanges = result.changed;
  return (
    <div className="rounded-[3px] border border-accent/30 bg-accent-soft/40 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-ink">{applied ? '已应用到方案' : (title ?? '修改预览')}</p>
          <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-muted">{result.summary}</p>
        </div>
        <Badge tone={applied ? 'ok' : 'accent'}>{applied ? '已应用' : hasChanges ? '待确认' : '无可执行变更'}</Badge>
      </div>

      {showMode && mode && onModeChange ? (
        <div className="mt-2">
          <ModeSelector mode={mode} onChange={onModeChange} />
        </div>
      ) : null}

      {diffLines.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {diffLines.map((line) => (
            <li key={line} className="flex items-center gap-1 text-[10px] text-ink">
              <span className="h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {result.applied.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {result.applied.slice(0, 10).map((line, index) => (
            <li key={`${line}-${index}`} className="flex items-start gap-1 text-[10px] leading-snug text-muted">
              <Check size={11} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {result.rejected.length > 0 ? (
        <div className="mt-2 rounded-[2px] border border-electric/30 bg-electric-soft px-2 py-1.5">
          <p className="text-[10px] font-medium text-electric">部分指令被拒绝</p>
          <ul className="mt-1 space-y-0.5">
            {result.rejected.slice(0, 6).map((rejection, index) => (
              <li key={`${rejection.op}-${index}`} className="text-[10px] leading-snug text-muted">
                {rejection.op}：{rejection.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-1.5">
        {applied ? (
          <>
            <Button size="xs" variant="outline" disabled={!canUndo || busy} onClick={onUndo}>
              <Undo2 size={12} /> 撤销本次
            </Button>
            <Button size="xs" variant="ghost" onClick={onDiscard}>
              清除
            </Button>
          </>
        ) : (
          <>
            <Button size="xs" variant="primary" disabled={busy || !hasChanges} onClick={onApply}>
              <Check size={12} /> {applyLabel}
            </Button>
            <Button size="xs" variant="ghost" onClick={onDiscard}>
              <X size={12} /> 取消
            </Button>
          </>
        )}
        {result.rejected.length > 0 ? (
          <span className="ml-auto text-[9px] text-faint">可重试或手动调整</span>
        ) : null}
      </div>

      {result.diagnostics && result.diagnostics.length > 0 ? (
        <Callout tone="neutral" title="引擎提示">
          <ul className="space-y-0.5">
            {result.diagnostics.slice(0, 4).map((line, index) => (
              <li key={`${line}-${index}`} className="text-[10px] leading-snug">
                {line}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </div>
  );
}
