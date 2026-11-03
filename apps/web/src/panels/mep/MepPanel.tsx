import { useMemo, useState } from 'react';
import { RefreshCw, Trash2, Zap } from 'lucide-react';
import {
  createDefaultCircuits,
  MEP_META,
  type Circuit,
  type MepDevice,
  type MepKind,
} from '@hdesign/domain';
import { generateMep } from '@hdesign/autolayout';
import { Badge, Button, EmptyState, IconButton, Section, cn } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { MepSymbolPreview } from '../assets/SymbolPreview';

const WATTS: Partial<Record<MepKind, number>> = {
  socket: 300,
  'socket-16a': 2000,
  switch: 5,
  'switch-double': 5,
  light: 60,
  'light-spot': 20,
  ac: 1500,
  'weak-current': 15,
  'floor-heat': 2000,
  gas: 20,
};

const GROUPS: Array<{ id: 'all' | 'electric' | 'water'; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'electric', label: '电位' },
  { id: 'water', label: '水位' },
];

function deviceLoad(device: MepDevice): number {
  return WATTS[device.kind] ?? 0;
}

function circuitLoad(circuit: Circuit, devices: MepDevice[]): { count: number; watts: number } {
  const assigned = devices.filter((device) => device.circuitId === circuit.id);
  return {
    count: assigned.length,
    watts: assigned.reduce((sum, device) => sum + deviceLoad(device), 0),
  };
}

function HeightInput({ device }: { device: MepDevice }) {
  return (
    <input
      type="number"
      min={0}
      max={4000}
      step={50}
      defaultValue={device.height}
      aria-label={`${MEP_META[device.kind].label} 安装高度`}
      onBlur={(event) => {
        const value = Number(event.target.value);
        if (!Number.isFinite(value) || value < 0 || value > 4000) return;
        if (value !== device.height) {
          useDocStore.getState().updateMepDevice(device.id, { height: value });
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="num h-5 w-14 rounded-[2px] border border-line bg-surface px-1 text-right text-[10px] text-ink focus-visible:border-accent focus-visible:outline-none"
    />
  );
}

export function MepPanel() {
  const [mode, setMode] = useState<'replace' | 'fill'>('replace');
  const [roomId, setRoomId] = useState<string>('all');
  const [group, setGroup] = useState<'all' | 'electric' | 'water'>('all');

  const doc = useDocStore((state) => state.doc);
  const commit = useDocStore((state) => state.commit);
  const addMepDevices = useDocStore((state) => state.addMepDevices);
  const updateMepDevice = useDocStore((state) => state.updateMepDevice);
  const removeMepDevice = useDocStore((state) => state.removeMepDevice);
  const updateCircuit = useDocStore((state) => state.updateCircuit);
  const pushToast = useUiStore((state) => state.pushToast);

  const devices = doc.mep.devices;
  const circuits = doc.mep.circuits;
  const roomName = useMemo(() => {
    const map = new Map(doc.rooms.map((room) => [room.id, room.name]));
    return (id: string | undefined) => (id ? map.get(id) ?? '未归属' : '未归属');
  }, [doc.rooms]);

  const electricCount = devices.filter((device) => MEP_META[device.kind].group === 'electric').length;
  const waterCount = devices.length - electricCount;

  const visibleDevices = useMemo(() => {
    return devices.filter((device) => {
      if (group !== 'all' && MEP_META[device.kind].group !== group) return false;
      if (roomId !== 'all' && device.roomId !== roomId) return false;
      return true;
    });
  }, [devices, group, roomId]);

  const groupedDevices = useMemo(() => {
    const map = new Map<string, MepDevice[]>();
    for (const device of visibleDevices) {
      const key = device.roomId ?? 'unassigned';
      const list = map.get(key) ?? [];
      list.push(device);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => roomName(a[0]).localeCompare(roomName(b[0])));
  }, [roomName, visibleDevices]);

  const circuitSummary = useMemo(
    () =>
      circuits.map((circuit) => {
        const load = circuitLoad(circuit, devices);
        const capacity = circuit.amp * 220;
        return { circuit, ...load, ratio: capacity > 0 ? load.watts / capacity : 0 };
      }),
    [circuits, devices],
  );

  const totalWatts = circuitSummary.reduce((sum, entry) => sum + entry.watts, 0);
  const overloaded = circuitSummary.filter((entry) => entry.ratio > 0.8);

  const generate = () => {
    const project = useDocStore.getState().doc;
    const targetRoomIds = roomId === 'all' ? project.rooms.map((room) => room.id) : [roomId];
    // Circuits must exist before generation so devices can reference them.
    const input =
      project.mep.circuits.length === 0
        ? { ...project, mep: { ...project.mep, circuits: createDefaultCircuits() } }
        : project;
    const result = generateMep(input, { mode });
    const scopedDevices =
      roomId === 'all' ? result.devices : result.devices.filter((device) => device.roomId === roomId);
    if (scopedDevices.length === 0) {
      pushToast('没有生成新的水电点位', 'warning', result.diagnostics[0]);
      return;
    }
    if (mode === 'fill') {
      addMepDevices(scopedDevices);
    } else {
      commit((draft) => {
        if (draft.mep.circuits.length === 0) draft.mep.circuits = createDefaultCircuits();
        draft.mep.devices = [
          ...draft.mep.devices.filter((device) => !targetRoomIds.includes(device.roomId ?? '')),
          ...scopedDevices,
        ];
        const byCircuit = new Map<string, string[]>();
        for (const device of draft.mep.devices) {
          if (!device.circuitId) continue;
          byCircuit.set(device.circuitId, [...(byCircuit.get(device.circuitId) ?? []), device.id]);
        }
        for (const circuit of draft.mep.circuits) {
          circuit.deviceIds = byCircuit.get(circuit.id) ?? [];
        }
      });
    }
    pushToast(
      mode === 'replace' ? '已按规则重新生成点位' : '已补充水电点位',
      'success',
      `${scopedDevices.length} 个点位 · ${roomId === 'all' ? '全部房间' : roomName(roomId)} · Ctrl+Z 撤销`,
    );
    if (result.diagnostics.length > 0) {
      pushToast(result.diagnostics[0]!, 'info', '规则引擎提示');
    }
  };

  const clearDevices = () => {
    commit((draft) => {
      draft.mep.devices = [];
      for (const circuit of draft.mep.circuits) circuit.deviceIds = [];
    });
    pushToast('已清空全部水电点位', 'info');
  };

  return (
    <div className="space-y-2 p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-[3px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[10px] text-faint">电位点位</p>
          <p className="num text-[18px] font-medium text-electric">{electricCount}</p>
        </div>
        <div className="rounded-[3px] border border-line bg-raised px-2 py-1.5">
          <p className="text-[10px] text-faint">水位点位</p>
          <p className="num text-[18px] font-medium text-water">{waterCount}</p>
        </div>
      </div>

      <div className="space-y-1.5 rounded-[3px] border border-line bg-raised p-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] text-muted" htmlFor="mep-room">
            生成范围
          </label>
          <select
            id="mep-room"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className="h-6 max-w-[150px] rounded-[2px] border border-line bg-surface px-1 text-[10px] text-ink"
          >
            <option value="all">全部房间</option>
            {doc.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={mode === 'replace'}
            onClick={() => setMode('replace')}
            className={cn(
              'flex-1 rounded-[2px] border px-1.5 py-1 text-[10px] font-medium',
              mode === 'replace'
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            替换生成
          </button>
          <button
            type="button"
            aria-pressed={mode === 'fill'}
            onClick={() => setMode('fill')}
            className={cn(
              'flex-1 rounded-[2px] border px-1.5 py-1 text-[10px] font-medium',
              mode === 'fill'
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            增量补充
          </button>
        </div>
        <Button block variant="primary" size="sm" onClick={generate}>
          <Zap size={13} /> 按房间一键生成点位
        </Button>
        <p className="text-[9px] leading-snug text-faint">
          规则：厨房台面插座 1100 / 冰箱窗 300 / 油烟机 2200；卫浴防水插座 1300；卧室床头 700 / 空调 2200；开关 1300 靠门。
        </p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-faint">
        <span>
          回路 {circuits.length} 条 · 估算 {totalWatts} W
        </span>
        <div className="flex items-center gap-1">
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value as 'all' | 'electric' | 'water')}
            aria-label="点位分组"
            className="h-5 rounded-[2px] border border-line bg-surface px-1 text-[10px] text-muted"
          >
            {GROUPS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {overloaded.length > 0 ? (
        <div className="rounded-[2px] border border-electric/30 bg-electric-soft px-2 py-1.5 text-[10px] leading-snug text-electric">
          回路重载提示：{overloaded.map((entry) => entry.circuit.name).join('、')} 负载超过 80%，建议拆分回路或增大线径。
        </div>
      ) : null}

      <Section
        title="点位清单"
        subtitle={`${visibleDevices.length} 个点位`}
        actions={
          devices.length > 0 ? (
            <Button size="xs" variant="ghost" onClick={clearDevices} title="清空全部点位">
              <RefreshCw size={11} /> 清空
            </Button>
          ) : undefined
        }
      >
        {groupedDevices.length === 0 ? (
          <EmptyState
            title="还没有点位"
            description="点击「按房间一键生成点位」，按厨房/卫浴/卧室等规则自动布置，生成后可按房间编辑高度与回路。"
          />
        ) : (
          <div className="space-y-2">
            {groupedDevices.map(([key, list]) => (
              <div key={key}>
                <p className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted">
                  <span>{roomName(key === 'unassigned' ? undefined : key)}</span>
                  <span className="num text-faint">{list.length} 个</span>
                </p>
                <ul className="space-y-0.5">
                  {list.map((device) => {
                    const meta = MEP_META[device.kind];
                    return (
                      <li
                        key={device.id}
                        className="flex items-center gap-1 rounded-[2px] border border-line bg-surface px-1.5 py-1"
                      >
                        <span
                          className={cn(
                            'block h-4 w-4 shrink-0',
                            meta.group === 'water' ? 'text-water' : 'text-electric',
                          )}
                        >
                          <MepSymbolPreview kind={device.kind} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
                          {meta.label}
                          {device.waterproof ? (
                            <span className="ml-1 text-[9px] text-water">防水</span>
                          ) : null}
                        </span>
                        <HeightInput device={device} />
                        <select
                          value={device.circuitId ?? ''}
                          aria-label={`${meta.label} 回路`}
                          onChange={(event) =>
                            updateMepDevice(device.id, {
                              circuitId: event.target.value || undefined,
                            })
                          }
                          className="h-5 max-w-[68px] rounded-[2px] border border-line bg-surface px-0.5 text-[9px] text-muted"
                        >
                          <option value="">无回路</option>
                          {circuits.map((circuit) => (
                            <option key={circuit.id} value={circuit.id}>
                              {circuit.name}
                            </option>
                          ))}
                        </select>
                        <IconButton
                          label={`删除 ${meta.label}`}
                          size="icon-sm"
                          variant="ghost"
                          className="h-5 w-5 text-faint hover:text-danger"
                          onClick={() => removeMepDevice(device.id)}
                        >
                          <Trash2 size={11} />
                        </IconButton>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="回路汇总" subtitle="按点位估算负载，超过 80% 会提示重载。">
        <ul className="space-y-1.5">
          {circuitSummary.map(({ circuit, count, watts, ratio }) => {
            const percent = Math.min(100, Math.round(ratio * 100));
            const overload = ratio > 0.8;
            return (
              <li key={circuit.id} className="rounded-[2px] border border-line bg-raised px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-[11px] text-ink">
                    <Badge tone={overload ? 'danger' : 'outline'}>{circuit.wire} mm²</Badge>
                    <span className="truncate">{circuit.name}</span>
                  </span>
                  <span className="num shrink-0 text-[9px] text-faint">
                    {count} 点 · {watts} W
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div
                      className={cn('h-full', overload ? 'bg-danger' : 'bg-electric/70')}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <input
                    type="number"
                    min={6}
                    max={63}
                    step={1}
                    defaultValue={circuit.amp}
                    aria-label={`${circuit.name} 回路电流`}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value) || value < 6 || value > 63) return;
                      if (value !== circuit.amp) updateCircuit(circuit.id, { amp: value });
                    }}
                    className="num h-5 w-10 rounded-[2px] border border-line bg-surface px-1 text-right text-[9px] text-ink focus-visible:border-accent focus-visible:outline-none"
                  />
                  <span className="text-[9px] text-faint">A</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
