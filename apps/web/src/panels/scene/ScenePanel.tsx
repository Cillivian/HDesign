import {
  Box,
  Camera,
  Crosshair,
  Droplets,
  Eye,
  Gauge,
  Layers,
  Moon,
  Move3d,
  Rotate3d,
  Sun,
  Zap,
} from 'lucide-react';
import { Badge, Button, Kbd, Segmented, Section, cn } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import { useRoomsWithArea } from '../../store/selectors';
import { useUiStore } from '../../store/ui-store';
import { CAMERA_PRESETS, CAMERA_PRESET_LABELS, useSceneStore } from '../../scene3d/scene-store';

/** Right-panel控制台 for the 3D scene: cameras, cutaway, daylight, MEP and room focus. */
export function ScenePanel() {
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const selection = useUiStore((state) => state.selection);
  const selectOne = useUiStore((state) => state.selectOne);
  const roomCount = useDocStore((state) => state.doc.rooms.length);
  const furnitureCount = useDocStore((state) => state.doc.furniture.length);
  const roomsWithArea = useRoomsWithArea();

  const preset = useSceneStore((state) => state.preset);
  const setPreset = useSceneStore((state) => state.setPreset);
  const wallMode = useSceneStore((state) => state.wallMode);
  const setWallMode = useSceneStore((state) => state.setWallMode);
  const cutHeight = useSceneStore((state) => state.cutHeight);
  const setCutHeight = useSceneStore((state) => state.setCutHeight);
  const ceilings = useSceneStore((state) => state.ceilings);
  const setCeilings = useSceneStore((state) => state.setCeilings);
  const labels = useSceneStore((state) => state.labels);
  const setLabels = useSceneStore((state) => state.setLabels);
  const hour = useSceneStore((state) => state.hour);
  const setHour = useSceneStore((state) => state.setHour);
  const night = useSceneStore((state) => state.night);
  const setNight = useSceneStore((state) => state.setNight);
  const mep = useSceneStore((state) => state.mep);
  const setMep = useSceneStore((state) => state.setMep);
  const pipes = useSceneStore((state) => state.pipes);
  const setPipes = useSceneStore((state) => state.setPipes);
  const focusRoom = useSceneStore((state) => state.focusRoom);
  const focusSelection = useSceneStore((state) => state.focusSelection);

  const enter = () => setView('3d');
  const selectedRoomIds = selection.kind === 'room' ? selection.ids : [];

  return (
    <div className="space-y-1 pb-4">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="flex items-center gap-1.5 text-[10px] text-faint">
          <Box size={12} /> 三维场景 · 透视
        </span>
        <Badge tone={view === '3d' ? 'accent' : 'outline'}>
          {view === '3d' ? '渲染中' : '未进入'}
        </Badge>
      </div>

      {view === '2d' ? (
        <div className="px-3 pt-1">
          <Button block variant="primary" size="sm" onClick={enter}>
            <Rotate3d size={13} /> 进入 3D 场景
          </Button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
            当前为平面视图，进入三维后可按层高查看墙体、家具与水电点位。
          </p>
        </div>
      ) : null}

      <Section title="相机" dense subtitle="轨道视角：左键旋转 · 右键平移 · 滚轮缩放">
        <div className="grid grid-cols-4 gap-1">
          {CAMERA_PRESETS.map((candidate) => (
            <Button
              key={candidate}
              size="xs"
              variant={preset === candidate ? 'soft' : 'outline'}
              active={preset === candidate}
              onClick={() => {
                setPreset(candidate);
                enter();
              }}
            >
              {CAMERA_PRESET_LABELS[candidate]}
            </Button>
          ))}
        </div>
        <Button
          block
          size="xs"
          variant="outline"
          className="mt-1.5"
          disabled={selection.kind === 'none'}
          title={selection.kind === 'none' ? '先在平面或三维中选中对象' : '相机移动到选中对象'}
          onClick={() => {
            focusSelection();
            enter();
          }}
        >
          <Crosshair size={12} /> 聚焦选中对象
        </Button>
      </Section>

      <Section title="剖切与显示" dense>
        <Segmented
          ariaLabel="墙体显示"
          size="xs"
          className="mb-2 w-full"
          value={wallMode}
          options={[
            { value: 'cut', label: '剖切' },
            { value: 'full', label: '全高' },
          ]}
          onChange={(mode) => {
            setWallMode(mode);
            enter();
          }}
        />
        {wallMode === 'cut' ? (
          <RangeRow
            label="剖切高度"
            display={`${(cutHeight / 1000).toFixed(2)} m`}
            min={600}
            max={2400}
            step={100}
            value={cutHeight}
            onChange={(value) => {
              setCutHeight(value);
              enter();
            }}
          />
        ) : null}
        <div className="mt-1.5 space-y-1.5">
          <ToggleRow
            label="显示天花"
            icon={<Layers size={13} />}
            checked={ceilings && wallMode === 'full'}
            disabled={wallMode === 'cut'}
            hint={wallMode === 'cut' ? '全高墙体时可用' : undefined}
            onChange={(value) => {
              setCeilings(value);
              enter();
            }}
          />
          <ToggleRow
            label="房间名称与面积"
            icon={<Eye size={13} />}
            checked={labels}
            onChange={(value) => {
              setLabels(value);
              enter();
            }}
          />
          <ToggleRow
            label="水电点位"
            icon={<Zap size={13} />}
            checked={mep}
            onChange={(value) => {
              setMep(value);
              enter();
            }}
          />
          <ToggleRow
            label="管线连接"
            icon={<Droplets size={13} />}
            checked={pipes && mep}
            disabled={!mep}
            hint={!mep ? '先开启水电点位' : undefined}
            onChange={(value) => {
              setPipes(value);
              enter();
            }}
          />
        </div>
      </Section>

      <Section title="日光" dense subtitle="时间轴 7:00 – 18:00，夜间使用室内暖光">
        <RangeRow
          label="时间"
          display={`${String(hour).padStart(2, '0')}:00`}
          min={7}
          max={18}
          step={1}
          value={hour}
          disabled={night}
          onChange={(value) => {
            setHour(value);
            enter();
          }}
        />
        <div className="mt-2">
          <ToggleRow
            label="夜间模式"
            icon={<Moon size={13} />}
            checked={night}
            onChange={(value) => {
              setNight(value);
              enter();
            }}
          />
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-faint">
          {night
            ? '已关闭日光，房间内开启暖色点光源；可从剖切视图查看灯光分布。'
            : '日光由半球光 + 平行光模拟，拖动时间可查看晨昏方向变化。'}
        </p>
      </Section>

      <Section
        title="空间定位"
        dense
        subtitle={roomCount > 0 ? `${roomCount} 个空间 · ${furnitureCount} 件家具` : '尚未创建房间'}
      >
        <div className="hd-scroll max-h-[188px] space-y-1 overflow-y-auto">
          {roomsWithArea.map(({ room, areaSqm }) => {
            const selected = selectedRoomIds.includes(room.id);
            return (
              <button
                key={room.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  selectOne('room', room.id);
                  focusRoom(room.id);
                  enter();
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-[2px] border px-2 py-1 text-left text-[11px] transition-colors',
                  selected
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line text-muted hover:bg-subtle hover:text-ink',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Camera size={11} className="shrink-0 text-faint" />
                  <span className="truncate">{room.name}</span>
                </span>
                <span className="num shrink-0 text-[10px] text-faint">{areaSqm.toFixed(1)} ㎡</span>
              </button>
            );
          })}
          {roomsWithArea.length === 0 ? (
            <p className="rounded-[2px] border border-dashed border-line px-2 py-3 text-center text-[10px] text-faint">
              先在 2D 平面中绘制墙体并创建房间。
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="第一人称漫游" dense>
        <p className="text-[10px] leading-relaxed text-muted">
          进入漫游后点击画面锁定鼠标；按墙体轮廓碰撞，门洞可穿行，Esc 可释放指针。
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>Esc</Kbd>
        </div>
        <Button
          block
          size="xs"
          variant={preset === 'walk' ? 'soft' : 'outline'}
          className="mt-2"
          onClick={() => {
            setPreset(preset === 'walk' ? 'bird' : 'walk');
            enter();
          }}
        >
          <Move3d size={12} /> {preset === 'walk' ? '退出漫游（回到鸟瞰）' : '开始漫游'}
        </Button>
      </Section>

      <Section title="渲染与性能" dense>
        <p className="flex items-center gap-1.5 text-[10px] text-faint">
          <Gauge size={12} /> 按需渲染 · DPR ≤ 2 · 低多边形模型
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-faint">
          静态时只在参数变化时重绘；漫游时持续渲染。阴影由单方向光提供，室内点光源不投影。
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-faint">
          <Sun size={12} /> 当前 {night ? '夜间' : `${hour}:00 日光`} ·{' '}
          {wallMode === 'cut' ? '剖切视图' : '全高墙体'}
        </p>
      </Section>

      <div className="px-3 pt-1">
        <Button
          block
          variant={view === '3d' ? 'outline' : 'primary'}
          size="sm"
          onClick={() => setView(view === '3d' ? '2d' : '3d')}
        >
          {view === '3d' ? '返回 2D 平面' : '进入 3D 场景'}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  icon,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-2 text-[11px]',
        disabled ? 'opacity-45' : 'cursor-pointer',
      )}
      title={hint}
    >
      <span className="flex items-center gap-1.5 text-muted">
        {icon}
        {label}
        {hint ? <span className="text-[9px] text-faint">（{hint}）</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

function RangeRow({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
  disabled,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn('block', disabled ? 'opacity-45' : '')}>
      <span className="flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="num text-[10px] text-faint">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-1 w-full cursor-pointer accent-[var(--accent)]"
        aria-label={label}
      />
    </label>
  );
}
