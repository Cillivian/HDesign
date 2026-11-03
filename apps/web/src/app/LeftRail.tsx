import { useNavigate } from 'react-router-dom';
import {
  Armchair,
  CircleHelp,
  FileUp,
  LayoutGrid,
  Palette,
  Settings,
  Sparkles,
  SwatchBook,
  Zap,
} from 'lucide-react';
import { useUiStore, type LeftPanelId } from '../store/ui-store';
import { Tip, cn } from '../design-system/primitives';

const ITEMS: Array<{ id: LeftPanelId; label: string; icon: typeof Armchair; hint: string }> = [
  { id: 'assets', label: '素材', icon: Armchair, hint: '家具与软装素材库' },
  { id: 'styles', label: '风格', icon: Palette, hint: '一键风格与配色方案' },
  { id: 'materials', label: '材质', icon: SwatchBook, hint: '地面、墙面与柜体材质' },
  { id: 'import', label: '导入', icon: FileUp, hint: '导入图纸并识别尺寸' },
  { id: 'mep', label: '水电', icon: Zap, hint: '水位与电位点位' },
  { id: 'ai', label: 'AI', icon: Sparkles, hint: '用一句话生成或修改方案' },
];

export function LeftRail() {
  const navigate = useNavigate();
  const leftPanel = useUiStore((state) => state.leftPanel);
  const leftCollapsed = useUiStore((state) => state.leftCollapsed);
  const setLeftPanel = useUiStore((state) => state.setLeftPanel);
  const toggleLeftCollapsed = useUiStore((state) => state.toggleLeftCollapsed);
  const openDialog = useUiStore((state) => state.openDialog);

  return (
    <nav
      aria-label="主工具栏"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-1.5"
    >
      <Tip label="项目列表" side="right">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="项目列表"
          className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-subtle hover:text-ink"
        >
          <LayoutGrid size={17} />
        </button>
      </Tip>
      <span className="mb-1 h-px w-6 bg-line" aria-hidden="true" />
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = leftPanel === item.id && !leftCollapsed;
        return (
          <Tip key={item.id} label={item.hint} side="right">
            <button
              type="button"
              onClick={() => {
                if (active) toggleLeftCollapsed();
                else setLeftPanel(item.id);
              }}
              aria-label={item.label}
              aria-pressed={active}
              className={cn(
                'relative flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-[2px] text-[9px] leading-none transition-colors',
                active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-ink',
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1.5 h-6 w-[2px] rounded-r bg-accent" aria-hidden="true" />
              ) : null}
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          </Tip>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-1">
        <Tip label="快捷键与帮助" side="right">
          <button
            type="button"
            onClick={() => openDialog('shortcuts')}
            aria-label="帮助"
            className="flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-subtle hover:text-ink"
          >
            <CircleHelp size={16} />
          </button>
        </Tip>
        <Tip label="设置" side="right">
          <button
            type="button"
            onClick={() => openDialog('settings')}
            aria-label="设置"
            className="flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-subtle hover:text-ink"
          >
            <Settings size={16} />
          </button>
        </Tip>
      </div>
    </nav>
  );
}
