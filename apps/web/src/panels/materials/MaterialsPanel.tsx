import { useMemo, useState } from 'react';
import { Layers, PaintBucket } from 'lucide-react';
import { MATERIALS, type MaterialDef, type MaterialScope } from '@hdesign/catalog';
import { Badge, Button, Section, cn } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { materialAssignmentId, resolveTargetRoom } from '../assets/target';

const SCOPES: Array<{ id: MaterialScope; label: string; hint: string }> = [
  { id: 'floor', label: '地面', hint: '更新房间地面材质' },
  { id: 'wall', label: '墙面', hint: '更新房间墙面材质' },
  { id: 'ceiling', label: '顶面', hint: '顶面乳胶漆 / 吊顶' },
  { id: 'joinery', label: '柜体', hint: '柜体板材与饰面' },
  { id: 'countertop', label: '台面', hint: '台面石材 / 岩板' },
  { id: 'metal', label: '金属', hint: '五金与金属细节' },
  { id: 'fabric', label: '布艺', hint: '布艺与皮革' },
];

export function MaterialsPanel() {
  const [scope, setScope] = useState<MaterialScope>('floor');
  const [allRooms, setAllRooms] = useState(true);

  const doc = useDocStore((state) => state.doc);
  const commit = useDocStore((state) => state.commit);
  const selection = useUiStore((state) => state.selection);
  const pushToast = useUiStore((state) => state.pushToast);

  const targetRoom = useMemo(
    () => resolveTargetRoom(doc, selection.kind, selection.ids),
    [doc, selection.kind, selection.ids],
  );
  const materials = useMemo(
    () => MATERIALS.filter((material) => material.scope === scope),
    [scope],
  );

  const currentMaterialId = useMemo(() => {
    if (!allRooms && targetRoom) {
      if (scope === 'floor') return targetRoom.floorMaterialId;
      if (scope === 'wall') return targetRoom.wallMaterialId;
      const assignment = doc.materials.find(
        (entry) => entry.roomId === targetRoom.id && entry.scope === scope,
      );
      return assignment?.materialId;
    }
    if (scope === 'floor' || scope === 'wall') {
      const global = doc.materials.find((entry) => !entry.roomId && entry.scope === scope);
      return global?.materialId;
    }
    const global = doc.materials.find((entry) => !entry.roomId && entry.scope === scope);
    return global?.materialId;
  }, [allRooms, doc.materials, scope, targetRoom]);

  const applyMaterial = (material: MaterialDef) => {
    const rooms = allRooms || !targetRoom ? doc.rooms : [targetRoom];
    if (rooms.length === 0) {
      pushToast('方案中没有房间，无法应用材质', 'warning');
      return;
    }
    commit((draft) => {
      for (const room of rooms) {
        const roomTarget = draft.rooms.find((entry) => entry.id === room.id);
        if (!roomTarget) continue;
        if (material.scope === 'floor') roomTarget.floorMaterialId = material.id;
        if (material.scope === 'wall') roomTarget.wallMaterialId = material.id;
        const id = materialAssignmentId(roomTarget.id, material.scope);
        const existing = draft.materials.find((entry) => entry.id === id);
        if (existing) {
          existing.materialId = material.id;
          existing.meta = { source: 'manual', rationale: '材质面板替换' };
        } else {
          draft.materials.push({
            id,
            roomId: roomTarget.id,
            scope: material.scope as 'floor' | 'wall' | 'ceiling' | 'joinery' | 'countertop',
            materialId: material.id,
            meta: { source: 'manual', rationale: '材质面板替换' },
          });
        }
      }
      if (allRooms) {
        const globalId = materialAssignmentId(undefined, material.scope);
        const existing = draft.materials.find((entry) => entry.id === globalId);
        if (existing) {
          existing.materialId = material.id;
        } else {
          draft.materials.push({
            id: globalId,
            scope: material.scope as 'floor' | 'wall' | 'ceiling' | 'joinery' | 'countertop',
            materialId: material.id,
            meta: { source: 'manual', rationale: '材质面板全局替换' },
          });
        }
      }
    });
    pushToast(`已应用「${material.name}」`, 'success', `${SCOPES.find((entry) => entry.id === scope)?.label} · ${allRooms ? '全部房间' : targetRoom?.name ?? '当前房间'}`);
  };

  const scopeLabel = SCOPES.find((entry) => entry.id === scope)?.label ?? scope;

  return (
    <div className="space-y-2 p-2.5">
      <div className="flex flex-wrap gap-1">
        {SCOPES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={scope === entry.id}
            onClick={() => setScope(entry.id)}
            className={cn(
              'rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              scope === entry.id
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-subtle hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-[2px] border border-line bg-raised px-2 py-1.5">
        <div className="min-w-0">
          <p className="text-[10px] text-faint">应用范围</p>
          <p className="truncate text-[11px] font-medium text-ink">
            {allRooms || !targetRoom ? '全部房间' : targetRoom.name}
          </p>
        </div>
        <Button
          size="xs"
          variant={allRooms ? 'soft' : 'outline'}
          onClick={() => setAllRooms((value) => !value)}
          disabled={!targetRoom}
          title={targetRoom ? '切换全部 / 当前房间' : '在画布中选择房间后可单间应用'}
        >
          {allRooms ? '全部房间' : '当前房间'}
        </Button>
      </div>

      <div className="flex items-center justify-between text-[10px] text-faint">
        <span>
          {scopeLabel} · {materials.length} 种参考材质
        </span>
        <Badge tone="outline">本地材质库</Badge>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {materials.map((material) => {
          const active = material.id === currentMaterialId;
          return (
            <button
              key={material.id}
              type="button"
              onClick={() => applyMaterial(material)}
              title={`${material.name} · ${material.pricePerSqm ?? '—'} 元/㎡`}
              aria-pressed={active}
              className={cn(
                'rounded-[2px] border p-1 text-left transition-colors',
                active
                  ? 'border-accent bg-accent-soft/40'
                  : 'border-line hover:border-accent/50 hover:bg-subtle',
              )}
            >
              <span
                className="block h-8 w-full rounded-[1px] border border-black/5"
                style={{ background: material.color }}
              />
              <span className="mt-1 block truncate text-[10px] text-ink">{material.name}</span>
              <span className="num block text-[9px] text-faint">
                {material.pricePerSqm ? `¥${material.pricePerSqm}/㎡` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <Section
        title="铺装提示"
        subtitle="材质会写入房间与材质清单，可 Ctrl+Z 整体撤销。"
        actions={
          <span className="text-faint">
            <Layers size={13} />
          </span>
        }
      >
        <div className="space-y-1 text-[10px] leading-relaxed text-muted">
          <p>
            <span className="text-ink">{scopeLabel}</span>
            {scope === 'floor'
              ? '：优先选用耐磨等级 AC4 以上的木地板，湿区使用防滑砖。'
              : scope === 'wall'
                ? '：湿区墙面需做防水，乳胶漆建议哑光或蛋壳光。'
                : scope === 'joinery'
                  ? '：柜体板材建议 E0 级，湿区使用防潮板。'
                  : scope === 'countertop'
                    ? '：台面优先石英石或岩板，灶具周边留伸缩缝。'
                    : '：金属与布艺用于点缀，注意与主材色调统一。'}
          </p>
          <p className="flex items-center gap-1 text-faint">
            <PaintBucket size={11} /> 点击色卡立即应用到{allRooms || !targetRoom ? '全部房间' : targetRoom?.name}
          </p>
        </div>
      </Section>
    </div>
  );
}
