import { useMemo, useState } from 'react';
import { Crosshair, Search, Sparkles } from 'lucide-react';
import {
  FURNITURE,
  getFurnitureSku,
  getStylePreset,
  type FurnitureCategory,
  type FurnitureSku,
} from '@hdesign/catalog';
import { createFurnitureItem } from '@hdesign/domain';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  TextField,
  cn,
} from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { FurnitureSymbolPreview } from './SymbolPreview';
import { resolveTargetRoom, roomDropPoint } from './target';

const RECENT_KEY = 'hdesign.assets.recent';

const CATEGORY_GROUPS: Array<{ id: string; label: string; categories: FurnitureCategory[] }> = [
  { id: 'all', label: '全部', categories: [] },
  { id: 'seat', label: '沙发', categories: ['sofa'] },
  { id: 'bed', label: '床', categories: ['bed'] },
  { id: 'table', label: '桌椅', categories: ['table', 'chair'] },
  { id: 'storage', label: '收纳', categories: ['storage'] },
  { id: 'kitchen', label: '厨房', categories: ['kitchen'] },
  { id: 'bath', label: '卫浴', categories: ['bath'] },
  { id: 'appliance', label: '电器', categories: ['appliance'] },
  { id: 'lighting', label: '灯具', categories: ['lighting'] },
  { id: 'soft', label: '软装', categories: ['textile', 'decor'] },
  { id: 'plant', label: '绿植', categories: ['plant'] },
];

const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  bed: '床',
  sofa: '沙发',
  table: '桌',
  chair: '椅',
  storage: '收纳',
  kitchen: '厨房',
  bath: '卫浴',
  appliance: '电器',
  lighting: '灯具',
  textile: '布艺',
  decor: '饰品',
  plant: '绿植',
};

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, 8);
  } catch {
    return [];
  }
}

function pushRecent(id: string, current: string[]): string[] {
  const next = [id, ...current.filter((entry) => entry !== id)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable */
  }
  return next;
}

function cardMeta(sku: FurnitureSku): string {
  return `${Math.round(sku.w)}×${Math.round(sku.d)} mm`;
}

function priceLabel(sku: FurnitureSku): string {
  const [low, high] = sku.priceRange;
  return `¥${Math.round(low / 100) / 10}k–${Math.round(high / 100) / 10}k`;
}

export function AssetsPanel() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [roomFit, setRoomFit] = useState(false);

  const pushToast = useUiStore((state) => state.pushToast);
  const selection = useUiStore((state) => state.selection);
  const setTool = useUiStore((state) => state.setTool);
  const setPendingFurnitureSku = useUiStore((state) => state.setPendingFurnitureSku);
  const doc = useDocStore((state) => state.doc);
  const addFurniture = useDocStore((state) => state.addFurniture);

  const targetRoom = useMemo(
    () => resolveTargetRoom(doc, selection.kind, selection.ids),
    [doc, selection.kind, selection.ids],
  );
  const preset = getStylePreset(doc.style.id);
  const recommended = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!preset) return map;
    for (const sku of FURNITURE) {
      map.set(sku.id, preset.furniturePreference[sku.category]?.includes(sku.id) ?? false);
    }
    return map;
  }, [preset]);

  const items = useMemo(() => {
    const categories = CATEGORY_GROUPS.find((entry) => entry.id === group)?.categories ?? [];
    const needle = query.trim().toLowerCase();
    return FURNITURE.filter((sku) => {
      if (categories.length > 0 && !categories.includes(sku.category)) return false;
      if (roomFit && targetRoom && !sku.roomTypes.includes(targetRoom.type)) return false;
      if (!needle) return true;
      return (
        sku.name.toLowerCase().includes(needle) ||
        sku.id.toLowerCase().includes(needle) ||
        CATEGORY_LABELS[sku.category].includes(needle) ||
        sku.styleTags.some((tag) => tag.includes(needle))
      );
    });
  }, [group, query, roomFit, targetRoom]);

  const recentItems = useMemo(
    () => recent.map((id) => getFurnitureSku(id)).filter((sku): sku is FurnitureSku => Boolean(sku)),
    [recent],
  );

  const addToRoom = (sku: FurnitureSku) => {
    const ui = useUiStore.getState();
    const project = useDocStore.getState().doc;
    const room = resolveTargetRoom(project, ui.selection.kind, ui.selection.ids);
    if (!room) {
      ui.pushToast('没有可放置的房间', 'warning', '请先导入或绘制房间，再添加家具。');
      return;
    }
    const point = roomDropPoint(room);
    const item = createFurnitureItem({
      skuId: sku.id,
      name: sku.name,
      x: point.x,
      y: point.y,
      w: sku.w,
      d: sku.d,
      h: sku.h,
      color: sku.color,
      roomId: room.id,
      meta: { source: 'manual', rationale: `素材库添加（${CATEGORY_LABELS[sku.category]}）` },
    });
    addFurniture(item);
    setRecent((current) => pushRecent(sku.id, current));
    ui.pushToast(`已添加「${sku.name}」`, 'success', `${room.name} · 可在画布中拖动调整`);
  };

  const armPlacement = (sku: FurnitureSku) => {
    setPendingFurnitureSku(sku.id);
    setTool('furniture');
    pushToast('在画布上点击放置', 'info', sku.name);
  };

  return (
    <div>
      <div className="border-b border-line p-2.5">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
          />
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索 ${FURNITURE.length} 件家具、软装`}
            aria-label="搜索家具"
            className="pl-7"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORY_GROUPS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setGroup(entry.id)}
              aria-pressed={group === entry.id}
              className={cn(
                'rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                group === entry.id
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-subtle hover:text-ink',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted">
            <input
              type="checkbox"
              checked={roomFit}
              onChange={(event) => setRoomFit(event.target.checked)}
              className="h-3 w-3 accent-[var(--accent)]"
              disabled={!targetRoom}
            />
            仅适配当前房间
          </label>
          <span className="num text-[10px] text-faint">
            {items.length} 件 · 方案 {doc.furniture.length} 件
          </span>
        </div>
      </div>

      {recentItems.length > 0 ? (
        <div className="border-b border-line px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted">
              <Sparkles size={11} className="text-accent" /> 最近使用
            </span>
            <button
              type="button"
              onClick={() => {
                setRecent([]);
                try {
                  localStorage.removeItem(RECENT_KEY);
                } catch {
                  /* ignore */
                }
              }}
              className="text-[10px] text-faint hover:text-ink"
            >
              清除
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {recentItems.map((sku) => (
              <button
                key={sku.id}
                type="button"
                onClick={() => addToRoom(sku)}
                title={`添加 ${sku.name}`}
                className="flex w-[46px] shrink-0 flex-col items-center gap-0.5 rounded-[2px] border border-line bg-raised px-1 py-1 hover:border-accent/50"
              >
                <span className="block h-6 w-8 text-muted">
                  <FurnitureSymbolPreview symbolKey={sku.symbol} />
                </span>
                <span className="w-full truncate text-center text-[9px] text-muted">{sku.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="没有找到素材" description="换个关键词，或切换分类筛选。" />
      ) : (
        <div className="grid grid-cols-2 gap-1.5 px-3 py-3">
          {items.map((sku) => {
            const isRecommended = recommended.get(sku.id) ?? false;
            return (
              <div
                key={sku.id}
                className="group relative rounded-[3px] border border-line bg-raised p-1.5 transition-colors hover:border-accent/50 hover:bg-surface"
              >
                <button
                  type="button"
                  onClick={() => addToRoom(sku)}
                  title={`添加到${targetRoom ? `「${targetRoom.name}」` : '房间'}`}
                  className="block w-full text-left"
                >
                  <div className="mb-1 flex h-11 items-center justify-center rounded-[2px] bg-subtle px-2 text-muted">
                    <FurnitureSymbolPreview
                      symbolKey={sku.symbol}
                      className="max-h-10 max-w-full"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                      {sku.name}
                    </p>
                    <Badge tone={isRecommended ? 'accent' : 'outline'}>
                      {isRecommended ? 'AI 荐' : '标准'}
                    </Badge>
                  </div>
                  <p className="num mt-0.5 truncate text-[9px] text-faint">
                    {cardMeta(sku)} · {priceLabel(sku)}
                  </p>
                </button>
                <div className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <IconButton
                    label={`在画布放置 ${sku.name}`}
                    size="icon-sm"
                    variant="soft"
                    onClick={() => armPlacement(sku)}
                    className="h-5 w-5"
                  >
                    <Crosshair size={11} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-line px-3 py-2">
        <Button
          block
          variant="outline"
          size="sm"
          onClick={() => {
            const sku = items[0] ?? FURNITURE[0];
            if (!sku) return;
            armPlacement(sku);
          }}
        >
          <Crosshair size={12} /> 在画布点放素材
        </Button>
        <p className="mt-1 text-[10px] leading-snug text-faint">
          点击卡片直接添加；悬停点准星可进入画布点放模式。
          {targetRoom ? `当前目标房间「${targetRoom.name}」` : ''}
        </p>
      </div>
    </div>
  );
}
