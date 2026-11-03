/* M0 placeholder — owned by workstream E (drawing + export). */
import { Download, FileText } from 'lucide-react';
import { Badge, Button, Section } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { SHEET_KIND_LABELS } from '@hdesign/domain';

export function SheetsPanel() {
  const sheets = useDocStore((state) => state.doc.sheets);
  const pushToast = useUiStore((state) => state.pushToast);
  const activeSheetId = useUiStore((state) => state.activeSheetId);
  const setActiveSheet = useUiStore((state) => state.setActiveSheet);
  const active = sheets.find((sheet) => sheet.id === activeSheetId) ?? sheets[0];

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[220px] shrink-0 border-r border-line">
        <div className="flex h-9 items-center justify-between border-b border-line px-3">
          <span className="text-[11px] font-semibold text-ink">图纸</span>
          <Badge tone="outline">{sheets.length}</Badge>
        </div>
        <ul className="p-2">
          {sheets.map((sheet) => (
            <li key={sheet.id}>
              <button
                type="button"
                onClick={() => setActiveSheet(sheet.id)}
                className={
                  active?.id === sheet.id
                    ? 'mb-0.5 flex w-full items-center gap-2 rounded-[2px] bg-accent-soft px-2 py-1.5 text-left text-[11px] text-accent'
                    : 'mb-0.5 flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[11px] text-muted hover:bg-subtle hover:text-ink'
                }
              >
                <FileText size={13} />
                <span className="min-w-0 flex-1 truncate">{SHEET_KIND_LABELS[sheet.kind]}</span>
                <span className="num text-[9px] text-faint">{sheet.scale === 100 ? '1:100' : `1:${sheet.scale}`}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center justify-between border-b border-line px-3">
          <span className="text-[11px] text-muted">{active?.titleBlock.sheetNo ?? 'A-01'} · {active?.name}</span>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" onClick={() => pushToast('出图引擎接入中', 'info')}>
              PNG
            </Button>
            <Button size="xs" variant="outline" onClick={() => pushToast('出图引擎接入中', 'info')}>
              PDF
            </Button>
            <Button size="xs" variant="outline" onClick={() => pushToast('出图引擎接入中', 'info')}>
              SVG
            </Button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center bg-app p-6">
          <div className="sheet-edge flex aspect-[420/297] w-full max-w-[760px] flex-col border border-line bg-[var(--canvas-bg)] p-6 text-[var(--canvas-ink)]">
            <div className="flex items-start justify-between border-b border-[var(--canvas-grid)] pb-2">
              <div>
                <p className="font-serif text-[18px] font-semibold">{useDocStore.getState().doc.name}</p>
                <p className="text-[10px] text-[var(--canvas-subtle)]">{active?.name} · 1:100</p>
              </div>
              <div className="text-right text-[9px] text-[var(--canvas-subtle)]">
                <p>图号 A-01</p>
                <p>{active?.titleBlock.date}</p>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <Download size={22} className="mx-auto mb-2 opacity-40" />
                <p className="text-[12px]">出图引擎接入中</p>
                <p className="mt-1 text-[10px] opacity-60">5 类施工图 + 物料清单，支持 PNG / PDF / SVG</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 border-t border-[var(--canvas-grid)] pt-2 text-[9px]">
              <span>投影面积 {useDocStore.getState().doc.rooms.length} 房间</span>
              <span>比例 1:100</span>
              <span>设计 HDesign</span>
              <span>方案参考 · 非施工依据</span>
            </div>
          </div>
        </div>
        <div className="border-t border-line p-2">
          <Section title="图签" dense className="py-0">
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted">
              <span>项目：{active?.titleBlock.projectName || useDocStore.getState().doc.name}</span>
              <span>图名：{active?.name}</span>
              <span>设计师：{active?.titleBlock.designer || '—'}</span>
              <span>说明：{active?.notes || '方案参考，非施工依据'}</span>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
