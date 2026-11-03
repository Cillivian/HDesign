import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ImagePlus, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import type { AiConfig, DesignBrief, DesignPatch } from '@hdesign/domain';
import { Badge, Button, Callout, EmptyState, Spinner, TextField, inputClass } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { useAiStore } from '../../store/ai-store';
import { getCatalogMaterial } from '../../services/ai-design';
import {
  applyPatchToDoc,
  briefFurnitureCounts,
  briefRoomLabel,
} from '../../services/patch-executor';
import { AiConfigCallout, AiPalette, ProjectContextChips, UnconfiguredHint } from './AiShared';
import { PatchPreviewCard } from './PatchPreview';

const EXAMPLES = [
  '89㎡两居，奶油风，预算 15 万，有猫，客厅要投影',
  '日式原木，收纳要多，主卧要大衣柜，厨房开放',
  '一居出租房，轻改造，预算 5 万，耐用好打理',
];

function formatCny(value: number | undefined): string {
  if (!value || value <= 0) return '—';
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return `${Math.round(value)} 元`;
}

function BriefCard({ brief, selected, onSelect }: { brief: DesignBrief; selected: boolean; onSelect: () => void }) {
  const rooms = useDocStore((state) => state.doc.rooms);
  const roomLabels = briefRoomLabel(brief, rooms);
  const counts = briefFurnitureCounts(brief);
  const mepCount = brief.mep.reduce((sum, entry) => sum + entry.kinds.length, 0);
  const materialNames = brief.materials
    .map((entry) => (entry.materialId ? (getCatalogMaterial(entry.materialId)?.name ?? entry.materialId) : undefined))
    .filter((name): name is string => Boolean(name));

  return (
    <div
      className={
        selected
          ? 'rounded-[3px] border border-accent/50 bg-accent-soft/40 p-2'
          : 'rounded-[3px] border border-line bg-surface p-2 hover:border-accent/30'
      }
    >
      <label className="flex cursor-pointer items-start gap-1.5">
        <input
          type="radio"
          name="ai-brief-candidate"
          className="mt-[3px] h-3 w-3 accent-[var(--accent)]"
          checked={selected}
          onChange={onSelect}
          aria-label={`选择方案 ${brief.variantLabel}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold text-ink">{brief.variantLabel}</span>
            {brief.budget.level ? <Badge tone="outline">{brief.budget.level}</Badge> : null}
          </span>
          <span className="mt-1 block">
            <AiPalette tokens={brief.style.tokens} />
          </span>
        </span>
      </label>

      <p className="mt-1.5 line-clamp-3 text-[10px] leading-relaxed text-muted">{brief.summary}</p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {roomLabels.slice(0, 6).map((label) => (
          <Badge key={label} tone="neutral">
            {label}
          </Badge>
        ))}
        <Badge tone="outline">家具 {counts.total} 件</Badge>
        <Badge tone="outline">点位 {mepCount}</Badge>
        <Badge tone="accent">预算 {formatCny(brief.budget.estimateCny ?? brief.budget.targetCny)}</Badge>
      </div>

      {materialNames.length > 0 ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-faint">材质：{materialNames.join('、')}</p>
      ) : null}

      {brief.style.rationale ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-faint">{brief.style.rationale}</p>
      ) : null}

      {brief.assumptions.length > 0 || brief.questions.length > 0 ? (
        <details className="group mt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] text-muted hover:text-ink">
            <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
            假设与待确认（{brief.assumptions.length + brief.questions.length}）
          </summary>
          <div className="mt-1 space-y-0.5">
            {brief.assumptions.map((assumption, index) => (
              <p key={`${assumption}-${index}`} className="text-[10px] leading-snug text-faint">
                假设：{assumption}
              </p>
            ))}
            {brief.questions.map((question) => (
              <p key={question.id} className="text-[10px] leading-snug text-electric">
                待确认：{question.question}
                {question.options.length > 0 ? `（${question.options.join(' / ')}）` : ''}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function BriefTab({ config, ready }: { config: AiConfig | null; ready: boolean }) {
  const canUndo = useDocStore((state) => state.past.length > 0);
  const pushToast = useUiStore((state) => state.pushToast);

  const configError = useAiStore((state) => state.configError);
  const prompt = useAiStore((state) => state.prompt);
  const setPrompt = useAiStore((state) => state.setPrompt);
  const reference = useAiStore((state) => state.reference);
  const setReference = useAiStore((state) => state.setReference);
  const clearReference = useAiStore((state) => state.clearReference);
  const busy = useAiStore((state) => state.busy);
  const stage = useAiStore((state) => state.stage);
  const candidates = useAiStore((state) => state.candidates);
  const selectedBriefId = useAiStore((state) => state.selectedBriefId);
  const selectBrief = useAiStore((state) => state.selectBrief);
  const briefMode = useAiStore((state) => state.briefMode);
  const setBriefMode = useAiStore((state) => state.setBriefMode);
  const briefPreview = useAiStore((state) => state.briefPreview);
  const briefApplyResult = useAiStore((state) => state.briefApplyResult);
  const styleCandidate = useAiStore((state) => state.styleCandidate);
  const generateBrief = useAiStore((state) => state.generateBrief);
  const extractStyle = useAiStore((state) => state.extractStyle);
  const applyBriefCandidate = useAiStore((state) => state.applyBriefCandidate);
  const discardBriefCandidate = useAiStore((state) => state.discardBriefCandidate);
  const undoLastAiChange = useAiStore((state) => state.undoLastAiChange);
  const cancel = useAiStore((state) => state.cancel);

  const quickEdit = useAiStore((state) => state.quickEdit);
  const setQuickEdit = useAiStore((state) => state.setQuickEdit);
  const generateQuickEdit = useAiStore((state) => state.generateQuickEdit);
  const lastPatch = useAiStore((state) => state.lastPatch);
  const patchResult = useAiStore((state) => state.patchResult);
  const patchApplied = useAiStore((state) => state.patchApplied);
  const applyPatchPreview = useAiStore((state) => state.applyPatchPreview);

  const [variantCount, setVariantCount] = useState(3);
  const [confirming, setConfirming] = useState(false);
  const [styleApplied, setStyleApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedBrief = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedBriefId),
    [candidates, selectedBriefId],
  );

  const handleGenerate = () => {
    setConfirming(false);
    void generateBrief({ variantCount });
  };

  const applyStyle = () => {
    if (!styleCandidate) return;
    const patch: DesignPatch = {
      summary: `应用参考图风格「${styleCandidate.name}」`,
      rationale: styleCandidate.rationale,
      ops: [{ op: 'setStyle', customName: styleCandidate.name, tokens: styleCandidate.tokens }],
      questions: [],
    };
    const result = applyPatchToDoc(patch);
    if (result.changed) {
      setStyleApplied(true);
      pushToast('已应用参考图风格', 'success', styleCandidate.name);
    } else {
      pushToast('风格没有产生变化', 'info');
    }
  };

  return (
    <div className="space-y-2.5 p-3">
      <ProjectContextChips />

      <AiConfigCallout config={config} configError={configError} />

      <div>
        <label htmlFor="ai-prompt" className="mb-1 flex items-center justify-between text-[11px] text-muted">
          <span>需求描述</span>
          <span className="text-[10px] text-faint">{prompt.length}/4000</span>
        </label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：89㎡两居，奶油风，预算 15 万，有猫，客厅要投影"
          aria-label="AI 需求描述"
          maxLength={4000}
          rows={3}
          className={`${inputClass} h-auto min-h-[62px] resize-y py-1.5 leading-relaxed`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (ready && !busy) handleGenerate();
            }
          }}
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-[2px] border border-line bg-raised px-1.5 py-0.5 text-left text-[10px] leading-snug text-muted hover:border-accent/40 hover:text-ink"
            >
              {example.slice(0, 14)}…
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label="上传参考图"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void setReference(file);
            event.target.value = '';
          }}
        />
        <Button size="xs" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={12} /> 参考图
        </Button>
        {reference ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <img
              src={reference.dataUrl}
              alt={`参考图 ${reference.name}`}
              className="h-7 w-9 rounded-[2px] border border-line object-cover"
            />
            <span className="min-w-0 flex-1 truncate text-[10px] text-faint">{reference.name}</span>
            <Button size="xs" variant="ghost" aria-label="移除参考图" onClick={clearReference}>
              <X size={12} />
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!ready || busy}
              onClick={() => void extractStyle()}
              title="用视觉模型从参考图提取风格配色"
            >
              <Sparkles size={12} /> 提取风格
            </Button>
          </div>
        ) : (
          <span className="text-[10px] text-faint">可选：风格/配色参考</span>
        )}
      </div>

      {styleCandidate ? (
        <div className="rounded-[3px] border border-line bg-raised p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-ink">参考图风格：{styleCandidate.name}</p>
            <Badge tone="accent">视觉提取</Badge>
          </div>
          <div className="mt-1.5">
            <AiPalette tokens={styleCandidate.tokens} size={20} />
          </div>
          {styleCandidate.materials.length > 0 ? (
            <p className="mt-1 text-[10px] text-muted">材质：{styleCandidate.materials.join('、')}</p>
          ) : null}
          <p className="mt-1 text-[10px] leading-relaxed text-faint">{styleCandidate.mood}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Button size="xs" variant="primary" disabled={busy} onClick={applyStyle}>
              应用这个风格
            </Button>
            {styleApplied ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (undoLastAiChange()) {
                    setStyleApplied(false);
                    pushToast('已撤销风格', 'info');
                  }
                }}
              >
                <Undo2 size={12} /> 撤销
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Button
          block
          variant="primary"
          size="sm"
          disabled={!ready || busy}
          onClick={handleGenerate}
          title={ready ? '生成 2–3 个方案候选' : 'AI 未配置'}
        >
          {busy && stage.stage !== 'done' ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 size={14} />}
          {busy ? '生成中…' : candidates.length > 0 ? '重新生成方案' : '生成设计方案'}
        </Button>
        {busy ? (
          <Button size="sm" variant="outline" onClick={cancel}>
            取消
          </Button>
        ) : (
          <select
            aria-label="方案数量"
            value={variantCount}
            onChange={(event) => setVariantCount(Number(event.target.value))}
            className="h-7 rounded-[2px] border border-line bg-surface px-1 text-[11px] text-ink"
          >
            <option value={2}>2 个方案</option>
            <option value={3}>3 个方案</option>
            <option value={1}>1 个方案</option>
          </select>
        )}
      </div>

      {busy && stage.label ? (
        <p className="flex items-center gap-1.5 text-[10px] text-accent" role="status" aria-live="polite">
          <Spinner className="h-3 w-3" /> {stage.label}
        </p>
      ) : null}

      {!ready ? <UnconfiguredHint /> : null}

      {candidates.length > 0 ? (
        <section aria-label="方案候选" className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold text-muted">方案候选</h4>
            <span className="text-[10px] text-faint">选择一个方向应用</span>
          </div>
          {candidates.map((brief) => (
            <BriefCard
              key={brief.id}
              brief={brief}
              selected={brief.id === selectedBriefId}
              onSelect={() => {
                selectBrief(brief.id);
                setConfirming(false);
              }}
            />
          ))}
        </section>
      ) : !busy && ready ? (
        <EmptyState
          icon={<Sparkles size={18} />}
          title="还没有方案候选"
          description="描述需求后生成 2–3 个方向不同的方案，应用到方案前可以先看差异。"
        />
      ) : null}

      {selectedBrief && briefPreview && !briefApplyResult ? (
        <div className="space-y-1.5">
          <PatchPreviewCard
            result={briefPreview}
            applied={false}
            busy={busy}
            mode={briefMode}
            showMode
            applyLabel="一键上图"
            onModeChange={setBriefMode}
            onApply={() => setConfirming(true)}
            onDiscard={() => {
              discardBriefCandidate();
              setConfirming(false);
            }}
            onUndo={() => undefined}
            canUndo={canUndo}
            title={`应用预览：${selectedBrief.variantLabel}`}
          />
          {confirming ? (
            <Callout tone="warning" title="确认应用到当前方案？">
              <p className="text-[10px] leading-relaxed">
                将在一次可撤销的操作中写入 {briefPreview.diff.furnitureAdded.length} 件家具、
                {briefPreview.diff.materialsUpdated} 处材质与 {briefPreview.diff.mepAdded} 个点位。
                应用到方案后可随时撤销。
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => {
                    applyBriefCandidate(selectedBrief, briefMode);
                    pushToast('已一键上图', 'success', selectedBrief.variantLabel);
                    setConfirming(false);
                  }}
                >
                  确认应用
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                  取消
                </Button>
              </div>
            </Callout>
          ) : null}
        </div>
      ) : null}

      {briefApplyResult ? (
        <PatchPreviewCard
          result={briefApplyResult}
          applied
          busy={busy}
          onApply={() => undefined}
          onDiscard={() => {
            discardBriefCandidate();
            setConfirming(false);
          }}
          onUndo={() => {
            if (undoLastAiChange()) pushToast('已撤销本次上图', 'info');
          }}
          canUndo={canUndo}
        />
      ) : null}

      <section aria-label="快速修改" className="space-y-1.5 border-t border-line pt-2">
        <h4 className="text-[11px] font-semibold text-muted">快速修改</h4>
        <p className="text-[10px] leading-relaxed text-faint">
          用一句话微调当前方案，先生成预览，确认后再写入（可撤销）。
        </p>
        <div className="flex gap-1.5">
          <TextField
            value={quickEdit}
            onChange={(event) => setQuickEdit(event.target.value)}
            placeholder="例如：把沙发换成浅灰布艺"
            aria-label="快速修改描述"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && ready && !busy) {
                event.preventDefault();
                void generateQuickEdit();
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || busy}
            onClick={() => void generateQuickEdit()}
            title={ready ? '生成修改预览' : 'AI 未配置'}
          >
            生成
          </Button>
        </div>
        {lastPatch && patchResult ? (
          <PatchPreviewCard
            result={patchResult}
            applied={patchApplied}
            busy={busy}
            onApply={() => {
              applyPatchPreview();
              pushToast('修改已应用', 'success', lastPatch.summary);
            }}
            onDiscard={() => useAiStore.setState({ lastPatch: null, patchResult: null, patchApplied: false })}
            onUndo={() => {
              if (undoLastAiChange()) {
                useAiStore.setState({ patchApplied: false });
                pushToast('已撤销修改', 'info');
              }
            }}
            canUndo={canUndo}
            title="修改预览"
          />
        ) : null}
      </section>

    </div>
  );
}
