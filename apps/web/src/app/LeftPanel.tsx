import { ChevronLeft } from 'lucide-react';
import { useUiStore, type LeftPanelId } from '../store/ui-store';
import { IconButton, cn } from '../design-system/primitives';
import { AssetsPanel } from '../panels/assets/AssetsPanel';
import { StylesPanel } from '../panels/styles/StylesPanel';
import { MaterialsPanel } from '../panels/materials/MaterialsPanel';
import { ImportPanel } from '../panels/import/ImportPanel';
import { MepPanel } from '../panels/mep/MepPanel';
import { AiPanel } from '../panels/ai/AiPanel';

const TITLES: Record<LeftPanelId, string> = {
  assets: '素材库',
  styles: '风格方案',
  materials: '材质',
  import: '导入图纸',
  mep: '水电点位',
  ai: 'AI 设计助手',
};

function PanelBody({ panel }: { panel: LeftPanelId }) {
  switch (panel) {
    case 'assets':
      return <AssetsPanel />;
    case 'styles':
      return <StylesPanel />;
    case 'materials':
      return <MaterialsPanel />;
    case 'import':
      return <ImportPanel />;
    case 'mep':
      return <MepPanel />;
    case 'ai':
      return <AiPanel />;
  }
}

export function LeftPanel() {
  const panel = useUiStore((state) => state.leftPanel);
  const toggleCollapsed = useUiStore((state) => state.toggleLeftCollapsed);

  if (!panel) return null;

  return (
    <aside
      aria-label={TITLES[panel]}
      className={cn(
        'flex w-[296px] shrink-0 flex-col border-r border-line bg-surface',
        'max-[1180px]:absolute max-[1180px]:bottom-0 max-[1180px]:left-12 max-[1180px]:top-0 max-[1180px]:z-30 max-[1180px]:shadow-[var(--shadow-pop)]',
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[12px] font-semibold tracking-[0.01em] text-ink">{TITLES[panel]}</h2>
        <IconButton
          label="收起左栏"
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          className="-mr-1.5"
        >
          <ChevronLeft size={14} />
        </IconButton>
      </div>
      <div className="hd-scroll min-h-0 flex-1 overflow-y-auto">
        <PanelBody panel={panel} />
      </div>
    </aside>
  );
}
