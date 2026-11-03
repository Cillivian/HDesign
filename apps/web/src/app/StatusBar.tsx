import { Grid3X3, Magnet, Maximize2, Minus, Plus } from 'lucide-react';
import { useDocStore } from '../store/doc-store';
import { useUiStore, TOOL_LABELS } from '../store/ui-store';
import { useProjectStats, useSelectedEntities } from '../store/selectors';
import { IconButton, Tip } from '../design-system/primitives';

export function StatusBar() {
  const tool = useUiStore((state) => state.tool);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const view = useUiStore((state) => state.view);
  const loaded = useDocStore((state) => state.loaded);
  const dirty = useDocStore((state) => state.dirty);
  const snapEnabled = useDocStore((state) => state.doc.settings.snapEnabled);
  const showGrid = useDocStore((state) => state.doc.settings.showGrid);
  const updateSettings = useDocStore((state) => state.updateSettings);
  const selection = useSelectedEntities();
  const stats = useProjectStats();

  const selectionLabel = (() => {
    if (selection.total === 0) return '未选择';
    if (selection.walls.length) return `已选 ${selection.walls.length} 段墙体`;
    if (selection.rooms.length) return `已选 ${selection.rooms.length} 个房间`;
    if (selection.furniture.length) return `已选 ${selection.furniture.length} 件家具`;
    if (selection.mep.length) return `已选 ${selection.mep.length} 个点位`;
    if (selection.openings.length) return `已选 ${selection.openings.length} 个门窗`;
    return `已选 ${selection.total} 个对象`;
  })();

  const zoom = Math.round(viewport.scale * 100);

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-3 border-t border-line bg-surface px-2.5 text-[10px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-ink">{TOOL_LABELS[tool]}</span>
        <span className="text-line-strong" aria-hidden="true">
          /
        </span>
        <span>
          {view === '2d'
            ? '拖动平移 · 滚轮缩放 · 空格临时平移'
            : '左键旋转 · 右键平移 · 滚轮缩放'}
        </span>
      </span>
      <span className="hidden items-center gap-2 lg:flex">
        <span className="text-line-strong" aria-hidden="true">
          |
        </span>
        <span>{selectionLabel}</span>
        <span className="num">{stats.areaSqm > 0 ? `${stats.areaSqm.toFixed(1)} ㎡` : '— ㎡'}</span>
      </span>
      <span className="ml-auto flex items-center gap-0.5">
        <Tip label="显示/隐藏网格">
          <IconButton
            label="网格"
            size="icon-sm"
            variant="ghost"
            active={showGrid}
            onClick={() => updateSettings({ showGrid: !showGrid })}
            className="h-6 w-6"
          >
            <Grid3X3 size={13} />
          </IconButton>
        </Tip>
        <Tip label="吸附开关">
          <IconButton
            label="吸附"
            size="icon-sm"
            variant="ghost"
            active={snapEnabled}
            onClick={() => updateSettings({ snapEnabled: !snapEnabled })}
            className="h-6 w-6"
          >
            <Magnet size={13} />
          </IconButton>
        </Tip>
        <span className="mx-1 h-3 w-px bg-line" aria-hidden="true" />
        <IconButton
          label="缩小"
          size="icon-sm"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setViewport({ ...viewport, scale: Math.max(0.05, viewport.scale / 1.2) })}
        >
          <Minus size={12} />
        </IconButton>
        <span className="num w-10 text-center text-[10px]">{zoom}%</span>
        <IconButton
          label="放大"
          size="icon-sm"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setViewport({ ...viewport, scale: Math.min(8, viewport.scale * 1.2) })}
        >
          <Plus size={12} />
        </IconButton>
        <IconButton
          label="适应窗口"
          size="icon-sm"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => window.dispatchEvent(new CustomEvent('hdesign:fit'))}
        >
          <Maximize2 size={12} />
        </IconButton>
        <span className="mx-1 h-3 w-px bg-line" aria-hidden="true" />
        <span className="flex items-center gap-1.5">
          <span
            className={dirty ? 'h-1.5 w-1.5 rounded-full bg-accent' : 'h-1.5 w-1.5 rounded-full bg-ok/70'}
            aria-hidden="true"
          />
          <span>{!loaded ? '加载中' : dirty ? '保存中…' : '已保存'}</span>
        </span>
      </span>
    </footer>
  );
}
