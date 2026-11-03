import { useMemo } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Badge, Button, Callout, EmptyState, Separator } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { bomDownloadName, bomToCsv, buildBom, type BomLine } from '../../services/bom';

function formatMoney(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  floor: '地面',
  wall: '墙面',
  ceiling: '顶面',
  skirting: '踢脚线',
  furniture: '家具',
  mep: '水电',
};

function LineRow({ line }: { line: BomLine }) {
  return (
    <div className="flex items-start justify-between gap-2 py-0.5 text-[10px]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink">{line.name}</span>
        <span className="block truncate text-[9px] text-faint">
          {CATEGORY_LABELS[line.category] ?? line.category} · {line.qty} {line.unit}
          {line.wastage > 0 ? ` · 损耗 ${Math.round(line.wastage * 100)}%` : ''}
        </span>
      </span>
      <span className="num shrink-0 text-right text-muted">{formatMoney(line.total)}</span>
    </div>
  );
}

export function BomTab() {
  const doc = useDocStore((state) => state.doc);
  const pushToast = useUiStore((state) => state.pushToast);
  const bom = useMemo(() => buildBom(doc), [doc]);

  const download = () => {
    try {
      const csv = bomToCsv(bom);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = bomDownloadName(bom);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast('已导出物料清单 CSV', 'success', bomDownloadName(bom));
    } catch (error) {
      pushToast('导出失败', 'error', error instanceof Error ? error.message : String(error));
    }
  };

  const totalLines = bom.rooms.reduce((sum, room) => sum + room.lines.length, 0);

  if (doc.rooms.length === 0) {
    return (
      <div className="p-3">
        <EmptyState
          icon={<FileSpreadsheet size={18} />}
          title="方案还没有房间"
          description="物料清单根据房间、材质与家具自动计算；先在编辑器中画出房间或导入户型图。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-ink">项目物料清单</p>
          <p className="text-[10px] text-faint">本地计算 · 不依赖 AI</p>
        </div>
        <Button size="xs" variant="outline" onClick={download} aria-label="导出 CSV">
          <Download size={12} /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[9px] text-faint">地面 / 墙面</p>
          <p className="num text-[11px] text-ink">
            {bom.totals.floorAreaSqm}㎡ / {bom.totals.wallAreaSqm}㎡
          </p>
        </div>
        <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[9px] text-faint">顶面 / 踢脚线</p>
          <p className="num text-[11px] text-ink">
            {bom.totals.ceilingAreaSqm}㎡ / {bom.totals.skirtingM}m
          </p>
        </div>
        <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[9px] text-faint">家具 / 水电点位</p>
          <p className="num text-[11px] text-ink">
            {bom.totals.furnitureCount} 件 / {bom.totals.mepCount} 个
          </p>
        </div>
        <div className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[9px] text-faint">估算区间</p>
          <p className="num text-[11px] text-ink">
            {formatMoney(bom.totals.range[0])} – {formatMoney(bom.totals.range[1])}
          </p>
        </div>
      </div>

      <Callout tone="neutral" title={`合计约 ${formatMoney(bom.totals.subtotal)}`}>
        <p className="text-[10px] leading-relaxed">
          共 {totalLines} 条明细，按目录中位价估算；不含人工与税费，实际以门店/施工报价为准。
        </p>
      </Callout>

      <div className="space-y-1.5">
        {bom.rooms.map((room) => (
          <details key={room.roomId} className="rounded-[2px] border border-line bg-surface" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-ink">{room.roomName}</span>
                <span className="num block text-[9px] text-faint">
                  {room.floorAreaSqm}㎡ · 墙面 {room.wallAreaSqm}㎡ · 踢脚线 {room.skirtingM}m
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Badge tone="outline">{room.lines.length} 项</Badge>
                <span className="num text-[10px] text-ink">{formatMoney(room.subtotal)}</span>
              </span>
            </summary>
            <div className="border-t border-line px-2 py-1">
              {room.lines.map((line) => (
                <LineRow key={line.id} line={line} />
              ))}
            </div>
          </details>
        ))}
      </div>

      {bom.lines.length > 0 ? (
        <div className="rounded-[2px] border border-line bg-surface px-2 py-1.5">
          <p className="mb-1 text-[11px] font-medium text-ink">全屋 / 未分房间</p>
          {bom.lines.map((line) => (
            <LineRow key={line.id} line={line} />
          ))}
        </div>
      ) : null}

      <Separator />
      <ul className="space-y-0.5">
        {bom.notes.map((note) => (
          <li key={note} className="text-[9px] leading-relaxed text-faint">
            · {note}
          </li>
        ))}
      </ul>
    </div>
  );
}
