import { useState } from 'react';
import { Layers3, Plus, Trash2 } from 'lucide-react';
import { floorEntities, type Floor } from '@hdesign/domain';
import {
  Badge,
  Button,
  Callout,
  Field,
  IconButton,
  NumberField,
  Section,
  TextField,
  cn,
} from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';

function floorSummary(doc: ReturnType<typeof useDocStore.getState>['doc'], floor: Floor) {
  const entities = floorEntities(doc, floor);
  return {
    walls: entities.walls.length,
    rooms: entities.rooms.length,
    openings: entities.openings.length,
    stairwells: entities.stairwells.length,
  };
}

export function FloorsPanel() {
  const doc = useDocStore((state) => state.doc);
  const switchFloor = useDocStore((state) => state.switchFloor);
  const addFloor = useDocStore((state) => state.addFloor);
  const removeFloor = useDocStore((state) => state.removeFloor);
  const renameFloor = useDocStore((state) => state.renameFloor);
  const setFloorHeight = useDocStore((state) => state.setFloorHeight);
  const setFloorElevation = useDocStore((state) => state.setFloorElevation);
  const pushToast = useUiStore((state) => state.pushToast);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const floors = doc.floors;
  const activeId = doc.activeFloorId;

  const commitName = (floor: Floor) => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== floor.name) renameFloor(floor.id, trimmed);
    setEditingId(null);
  };

  return (
    <div className="flex min-h-0 flex-col gap-0">
      <Section
        title="楼层"
        subtitle="复式 / 多楼层设计：每层独立底图、墙体与图纸集"
        actions={
          <Button
            variant="accent"
            size="xs"
            onClick={() => {
              addFloor();
              pushToast('已新增楼层，并生成该层图纸集', 'success');
            }}
          >
            <Plus size={12} aria-hidden="true" className="mr-1" />
            新增楼层
          </Button>
        }
      >
        <Callout tone="accent" title="当前激活楼层">
          画布、工具栏与属性面板只编辑当前激活楼层；3D 视图按标高把所有楼层叠加显示。切换楼层不会撤销历史记录。
        </Callout>
      </Section>

      <div className="flex flex-col gap-2 px-3 pb-3">
        {floors.map((floor, index) => {
          const active = floor.id === activeId;
          const summary = floorSummary(doc, floor);
          return (
            <div
              key={floor.id}
              className={cn(
                'rounded-[3px] border p-2.5 transition-colors',
                active ? 'border-accent/50 bg-accent-soft/40' : 'border-line bg-raised',
              )}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => switchFloor(floor.id)}
                  aria-label={`切换到 ${floor.name}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-[10px] font-semibold',
                      active ? 'bg-accent text-white' : 'bg-subtle text-muted',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate text-[12px] font-medium text-ink">{floor.name}</span>
                </button>
                {active ? <Badge tone="accent">编辑中</Badge> : null}
                <IconButton
                  label={`删除 ${floor.name}`}
                  variant="ghost"
                  size="icon-sm"
                  disabled={floors.length <= 1}
                  onClick={() => {
                    if (!removeFloor(floor.id)) {
                      pushToast('至少保留一层，无法删除', 'warning');
                      return;
                    }
                    pushToast(`已删除 ${floor.name}`, 'success');
                  }}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </IconButton>
              </div>

              <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                标高 {floor.elevation} mm · {summary.walls} 墙 · {summary.openings} 洞口 ·{' '}
                {summary.rooms} 房 · {summary.stairwells} 楼梯/挑空
                {floor.reference ? ' · 有底图' : ''}
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="楼层名称">
                  {editingId === floor.id ? (
                    <TextField
                      autoFocus
                      value={nameDraft}
                      aria-label={`${floor.name} 名称`}
                      maxLength={40}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onBlur={() => commitName(floor)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(floor.id);
                        setNameDraft(floor.name);
                      }}
                      className={cn(
                        'h-7 w-full truncate rounded-[2px] border border-line bg-surface px-2 text-left text-xs text-ink',
                        'hover:border-accent focus-visible:border-accent focus-visible:outline-none',
                      )}
                    >
                      {floor.name}
                    </button>
                  )}
                </Field>
                <Field label="层高" hint="mm">
                  <NumberField
                    min={2000}
                    max={6000}
                    step={50}
                    value={floor.height}
                    aria-label={`${floor.name} 层高`}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) setFloorHeight(floor.id, value);
                    }}
                  />
                </Field>
                <Field label="标高" hint="增删楼层时按层高重算">
                  <NumberField
                    step={50}
                    value={floor.elevation}
                    aria-label={`${floor.name} 标高`}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) setFloorElevation(floor.id, value);
                    }}
                  />
                </Field>
                <Field label="图纸">
                  <div className="flex h-7 items-center rounded-[2px] border border-line bg-surface px-2 text-[11px] text-muted">
                    {doc.sheets.filter((sheet) => sheet.floorId === floor.id).length} 张
                  </div>
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <Section title="楼梯与挑空" subtitle="在复式平面中标记上下层关系">
        <Callout tone="neutral" title="可编辑标注实体">
          用工具栏的「楼梯」「挑空」在当前楼层点击两点框出范围；选中后可在右侧属性面板设置类型、名称与关联楼层。
          这些标记用于表达上下层交通与贯通中空区域，不会自动生成梯段几何。
        </Callout>
      </Section>

      <Section title="批量导入" subtitle="一次生成整套复式楼层">
        <p className="mb-2 text-[11px] leading-relaxed text-muted">
          打开「导入图纸」，选择一份多页 PDF（每页对应一层）或多张图片，逐页校对比例后一次性生成 1F / 2F / 3F…
          各层共用比例与原点。
        </p>
        <Button
          variant="outline"
          size="sm"
          block
          onClick={() => useUiStore.getState().setLeftPanel('import')}
        >
          <Layers3 size={12} aria-hidden="true" className="mr-1.5" />
          前往导入图纸
        </Button>
      </Section>
    </div>
  );
}
