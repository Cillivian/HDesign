import { ChevronRight } from 'lucide-react';
import { useUiStore, type RightPanelId } from '../store/ui-store';
import { useDocStore } from '../store/doc-store';
import { IconButton, cn } from '../design-system/primitives';
import { PropertiesPanel } from '../panels/properties/PropertiesPanel';
import { LayersPanel } from '../panels/layers/LayersPanel';
import { ScenePanel } from '../panels/scene/ScenePanel';
import { SheetsPanel } from '../panels/sheets/SheetsPanel';
import { AiPanel } from '../panels/ai/AiPanel';

const TABS: Array<{ id: RightPanelId; label: string }> = [
  { id: 'properties', label: '属性' },
  { id: 'layers', label: '图层' },
  { id: 'scene', label: '场景' },
  { id: 'sheets', label: '图纸' },
  { id: 'ai', label: 'AI' },
];

function PanelBody({ panel }: { panel: RightPanelId }) {
  switch (panel) {
    case 'properties':
      return <PropertiesPanel />;
    case 'layers':
      return <LayersPanel />;
    case 'scene':
      return <ScenePanel />;
    case 'sheets':
      return <SheetsPanel />;
    case 'ai':
      return <AiPanel />;
  }
}

export function RightPanel() {
  const panel = useUiStore((state) => state.rightPanel) ?? 'properties';
  const setRightPanel = useUiStore((state) => state.setRightPanel);
  const toggleCollapsed = useUiStore((state) => state.toggleRightCollapsed);
  const layerCount = useDocStore((state) => state.doc.layers.length);

  return (
    <aside
      aria-label="属性面板"
      className={cn(
        'flex w-[320px] shrink-0 flex-col border-l border-line bg-surface',
        'max-[1180px]:absolute max-[1180px]:bottom-0 max-[1180px]:right-0 max-[1180px]:top-0 max-[1180px]:z-30 max-[1180px]:shadow-[var(--shadow-pop)]',
      )}
    >
      <div className="flex h-9 shrink-0 items-center border-b border-line">
        <div role="tablist" aria-label="右侧面板" className="flex min-w-0 flex-1 items-stretch">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={panel === tab.id}
              onClick={() => setRightPanel(tab.id)}
              className={cn(
                'relative flex h-9 flex-1 items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                panel === tab.id ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
              {tab.id === 'layers' && layerCount > 0 ? (
                <span className="num text-[9px] text-faint">{layerCount}</span>
              ) : null}
              {panel === tab.id ? (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t bg-accent" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
        <IconButton
          label="收起右栏"
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          className="mx-1"
        >
          <ChevronRight size={14} />
        </IconButton>
      </div>
      <div className="hd-scroll min-h-0 flex-1 overflow-y-auto">
        <PanelBody panel={panel} />
      </div>
    </aside>
  );
}
