import { useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Palette, Sparkles } from 'lucide-react';
import {
  MATERIALS,
  STYLE_PRESETS,
  applyStyleToProject,
  applyStyleTokensToProject,
  buildCustomStyle,
  extractPalette,
  getStylePreset,
  styleTokensFromPalette,
  type PaletteColor,
  type StylePreset,
  type StyleTokens,
} from '@hdesign/catalog';
import { STYLE_TOKEN_KEYS, type StyleTokenKey } from '@hdesign/domain';
import { Badge, Button, Section, cn } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { resolveTargetRoom } from '../assets/target';

const TOKEN_LABELS: Record<StyleTokenKey, string> = {
  wall: '墙面',
  wallAccent: '墙裙',
  ceiling: '顶面',
  floor: '地面',
  joinery: '柜体',
  metal: '金属',
  fabric: '布艺',
  leather: '皮革',
  stone: '石材',
  plant: '绿植',
};

interface Extracted {
  name: string;
  tokens: StyleTokens;
  palette: PaletteColor[];
}

function TokenSwatches({ tokens, size = 'md' }: { tokens: StyleTokens; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('flex overflow-hidden rounded-[2px]', size === 'sm' ? 'h-8' : 'h-10')}>
      {STYLE_TOKEN_KEYS.map((key) => (
        <span
          key={key}
          title={`${TOKEN_LABELS[key]} ${tokens[key]}`}
          className="flex-1"
          style={{ background: tokens[key] }}
        />
      ))}
    </div>
  );
}

function StyleCard({
  style,
  active,
  previewing,
  onPreview,
  onApply,
}: {
  style: StylePreset;
  active: boolean;
  previewing: boolean;
  onPreview: () => void;
  onApply: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative rounded-[3px] border p-1.5 transition-colors',
        active ? 'border-accent bg-accent-soft/30' : 'border-line bg-surface hover:border-accent/50',
        previewing && !active ? 'border-line-strong' : '',
      )}
    >
      <button type="button" onClick={onPreview} className="block w-full text-left" aria-pressed={previewing}>
        <TokenSwatches tokens={style.tokens} />
        <div className="mt-1 flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{style.name}</p>
          {active ? <Badge tone="accent">当前</Badge> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-faint">{style.description}</p>
      </button>
      <button
        type="button"
        onClick={onApply}
        title={`应用「${style.name}」`}
        className={cn(
          'absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-[2px] border transition-colors',
          active
            ? 'border-accent/40 bg-accent text-on-accent'
            : 'border-line bg-surface text-muted opacity-0 hover:text-accent group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        {active ? <Check size={11} /> : <Palette size={11} />}
      </button>
    </div>
  );
}

export function StylesPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [extracting, setExtracting] = useState(false);

  const doc = useDocStore((state) => state.doc);
  const commit = useDocStore((state) => state.commit);
  const selection = useUiStore((state) => state.selection);
  const pushToast = useUiStore((state) => state.pushToast);

  const activeId = doc.style.id;
  const preview = useMemo(
    () => getStylePreset(previewId ?? activeId) ?? STYLE_PRESETS[0]!,
    [activeId, previewId],
  );
  const customTokens = doc.style.customTokens as StyleTokens | undefined;
  const hasCustom = Boolean(customTokens && Object.keys(customTokens).length > 0);
  const showingCustom = previewId === null && hasCustom && !getStylePreset(activeId);
  const previewTokens: StyleTokens = showingCustom && customTokens ? customTokens : preview.tokens;
  const previewName = showingCustom ? (doc.style.name ?? '自定义风格') : preview.name;
  const previewLighting = showingCustom ? { temperature: 3500, intensity: 0.9 } : preview.lighting;
  const previewMood = showingCustom ? ['取色', '自定义'] : preview.moodKeywords;
  const targetRoom = useMemo(
    () => resolveTargetRoom(doc, selection.kind, selection.ids),
    [doc, selection.kind, selection.ids],
  );

  const applyStyle = (style: StylePreset) => {
    const app = applyStyleToProject(doc, style.id);
    commit((draft) => {
      draft.style = app.style;
      draft.materials = app.materials;
      draft.furniture = app.furniture;
      draft.rooms = app.rooms;
    });
    setPreviewId(style.id);
    pushToast(`已应用「${style.name}」`, 'success', '配色 / 材质 / 家具联动，可 Ctrl+Z 一次撤销');
  };

  const applyCustomTokens = () => {
    if (!customTokens) return;
    const app = applyStyleTokensToProject(doc, customTokens, activeId);
    commit((draft) => {
      draft.style = app.style;
      draft.materials = app.materials;
      draft.furniture = app.furniture;
      draft.rooms = app.rooms;
    });
    pushToast('已应用自定义配色', 'success', '当前方案已按提取配色联动');
  };

  const applyRoomMaterial = (scope: 'floor' | 'wall', materialId: string) => {
    if (!targetRoom) {
      pushToast('请先在画布中选择一个房间', 'warning', '房间材质按单间应用');
      return;
    }
    const material = MATERIALS.find((entry) => entry.id === materialId);
    commit((draft) => {
      const room = draft.rooms.find((entry) => entry.id === targetRoom.id);
      if (!room) return;
      if (scope === 'floor') room.floorMaterialId = materialId;
      if (scope === 'wall') room.wallMaterialId = materialId;
      const id = `mat-${room.id}-${scope}`;
      const existing = draft.materials.find((entry) => entry.id === id);
      if (existing) existing.materialId = materialId;
      else
        draft.materials.push({
          id,
          roomId: room.id,
          scope,
          materialId,
          meta: { source: 'manual', rationale: '风格面板手动应用材质' },
        });
    });
    pushToast(`已应用「${material?.name ?? materialId}」`, 'success', `${targetRoom.name} · ${scope === 'floor' ? '地面' : '墙面'}`);
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    try {
      const url = URL.createObjectURL(file);
      const image = await loadImage(url);
      URL.revokeObjectURL(url);
      const maxSide = 420;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas-2d-unavailable');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const palette = extractPalette(data, { k: 6, sampleStep: 5 });
      const tokens = styleTokensFromPalette(palette);
      setExtracted({
        name: file.name.replace(/\.[^.]+$/u, '') || '参考图风格',
        tokens,
        palette,
      });
      pushToast('配色提取完成', 'success', '点击「保存为自定义风格」写入方案');
    } catch {
      pushToast('参考图解析失败', 'error', '请使用 JPG / PNG 图片，或换一张重试。');
    } finally {
      setExtracting(false);
    }
  };

  const saveCustomStyle = () => {
    if (!extracted) return;
    const custom = buildCustomStyle(extracted.name, extracted.tokens);
    commit((draft) => {
      draft.style = {
        id: custom.id,
        name: custom.name,
        overrides: {},
        customTokens: { ...custom.tokens },
      };
      const scopes = ['floor', 'wall', 'ceiling', 'joinery', 'countertop'] as const;
      for (const scope of scopes) {
        const materialId = custom.materials[scope];
        if (!materialId) continue;
        const id = `mat-all-${scope}`;
        const existing = draft.materials.find((entry) => entry.id === id);
        if (existing) existing.materialId = materialId;
        else
          draft.materials.push({
            id,
            scope,
            materialId,
            meta: { source: 'style', rationale: `自定义风格「${custom.name}」` },
          });
      }
    });
    setPreviewId(custom.id);
    pushToast('已保存自定义风格', 'success', `「${custom.name}」已写入当前方案，可再次应用`);
  };

  const floorOptions = useMemo(() => MATERIALS.filter((entry) => entry.scope === 'floor').slice(0, 6), []);
  const wallOptions = useMemo(() => MATERIALS.filter((entry) => entry.scope === 'wall').slice(0, 6), []);

  return (
    <div className="space-y-3 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-faint">{STYLE_PRESETS.length} 套内置风格 · 本地引擎</span>
        <Badge tone="outline">一键联动</Badge>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {STYLE_PRESETS.map((style) => (
          <StyleCard
            key={style.id}
            style={style}
            active={style.id === activeId}
            previewing={style.id === preview.id}
            onPreview={() => setPreviewId(style.id)}
            onApply={() => applyStyle(style)}
          />
        ))}
      </div>

      <Section
        title={`风格预览 · ${previewName}`}
        subtitle={`${previewLighting.temperature}K · 照度 ${Math.round(previewLighting.intensity * 100)}% · ${previewMood.join(' / ')}`}
      >
        <div className="space-y-1">
          {STYLE_TOKEN_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="h-3.5 w-6 shrink-0 rounded-[1px] border border-black/5"
                style={{ background: previewTokens[key] }}
              />
              <span className="w-8 text-[10px] text-faint">{TOKEN_LABELS[key]}</span>
              <span className="num text-[9px] uppercase text-muted">{previewTokens[key]}</span>
            </div>
          ))}
        </div>
        <Button
          block
          size="sm"
          variant="primary"
          className="mt-2"
          onClick={() => {
            if (showingCustom) applyCustomTokens();
            else applyStyle(preview);
          }}
        >
          <Sparkles size={12} /> 应用「{previewName}」风格
        </Button>
      </Section>

      {hasCustom && customTokens ? (
        <Section title="当前自定义风格" subtitle={doc.style.name ?? doc.style.id}>
          <TokenSwatches tokens={customTokens} size="sm" />
          <div className="mt-1.5 flex gap-1">
            <Button size="xs" variant="soft" onClick={applyCustomTokens}>
              应用自定义配色
            </Button>
            <span className="self-center text-[9px] text-faint">来自参考图取色</span>
          </div>
        </Section>
      ) : null}

      <Section
        title="参考图提取配色"
        subtitle="本地 k-means 取色，无需联网 / AI；生成可复用的自定义风格。"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void onPickImage(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          block
          size="sm"
          variant="outline"
          disabled={extracting}
          onClick={() => fileRef.current?.click()}
        >
          {extracting ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          {extracting ? '正在提取…' : '上传参考图提取配色'}
        </Button>
        {extracted ? (
          <div className="mt-2 space-y-1.5">
            <TokenSwatches tokens={extracted.tokens} size="sm" />
            <div className="flex flex-wrap gap-1">
              {extracted.palette.slice(0, 6).map((color) => (
                <span
                  key={color.hex}
                  title={`${color.hex} · ${(color.ratio * 100).toFixed(0)}%`}
                  className="h-4 w-4 rounded-[1px] border border-black/10"
                  style={{ background: color.hex }}
                />
              ))}
            </div>
            <Button block size="xs" variant="accent" onClick={saveCustomStyle}>
              保存为自定义风格「{extracted.name}」
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        title="单间手调材质"
        subtitle={targetRoom ? `当前房间「${targetRoom.name}」` : '在画布中选择房间后可单间应用'}
      >
        <p className="mb-1 text-[10px] text-faint">地面</p>
        <div className="flex flex-wrap gap-1">
          {floorOptions.map((material) => (
            <button
              key={material.id}
              type="button"
              onClick={() => applyRoomMaterial('floor', material.id)}
              title={material.name}
              className="h-6 w-6 rounded-[1px] border border-black/10 hover:ring-1 hover:ring-accent/60"
              style={{ background: material.color }}
            />
          ))}
        </div>
        <p className="mb-1 mt-2 text-[10px] text-faint">墙面</p>
        <div className="flex flex-wrap gap-1">
          {wallOptions.map((material) => (
            <button
              key={material.id}
              type="button"
              onClick={() => applyRoomMaterial('wall', material.id)}
              title={material.name}
              className="h-6 w-6 rounded-[1px] border border-black/10 hover:ring-1 hover:ring-accent/60"
              style={{ background: material.color }}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image-load-failed'));
    image.src = url;
  });
}
