import { useEffect, useState } from 'react';
import { Box, Compass, MousePointer2, Move3d } from 'lucide-react';
import { Button, Kbd } from '../../design-system/primitives';
import { useDocStore } from '../../store/doc-store';
import type { SceneBounds } from '../camera';
import { CAMERA_PRESET_LABELS, useSceneStore } from '../scene-store';

/** DOM overlay on top of the canvas: status badge, control legend and walk-mode affordances. */
export function SceneHud({ bounds }: { bounds: SceneBounds }) {
  const preset = useSceneStore((state) => state.preset);
  const wallMode = useSceneStore((state) => state.wallMode);
  const setPreset = useSceneStore((state) => state.setPreset);
  const roomCount = useDocStore((state) => state.doc.rooms.length);
  const [locked, setLocked] = useState(false);
  const walk = preset === 'walk';

  useEffect(() => {
    const onLockChange = () => setLocked(Boolean(document.pointerLockElement));
    document.addEventListener('pointerlockchange', onLockChange);
    onLockChange();
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  }, [preset]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-[2px] border border-line bg-surface/95 px-2 py-1 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(23,26,23,0.08)]">
          <Box size={13} className="text-accent" /> 3D 场景
        </span>
        <span className="rounded-[2px] border border-line bg-surface/80 px-2 py-1 text-[10px] text-muted">
          {CAMERA_PRESET_LABELS[preset]} · {wallMode === 'cut' ? '剖切 1.2m' : '全高墙体'} · {roomCount} 个空间
          {' · '}
          {(bounds.widthMm / 1000).toFixed(1)} × {(bounds.depthMm / 1000).toFixed(1)} m
        </span>
      </div>

      {walk && locked ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="block h-1.5 w-1.5 rounded-full bg-surface ring-1 ring-line" />
        </div>
      ) : null}

      {walk && !locked ? (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="pointer-events-auto w-[290px] rounded-[4px] border border-line bg-surface p-4 text-center shadow-[var(--shadow-pop)]">
            <Move3d size={20} className="mx-auto mb-2 text-accent" />
            <p className="text-[13px] font-medium text-ink">第一人称漫游</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> 移动，<Kbd>Shift</Kbd> 加速，鼠标环顾，
              <Kbd>Esc</Kbd> 释放指针。点击画面锁定鼠标。
            </p>
            <Button
              variant="primary"
              size="sm"
              block
              className="mt-3"
              onClick={() => window.dispatchEvent(new Event('hdesign:walk-lock'))}
            >
              开始漫游
            </Button>
            <Button variant="ghost" size="xs" block className="mt-1" onClick={() => setPreset('bird')}>
              退出漫游
            </Button>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 rounded-[2px] border border-line bg-surface/95 px-2 py-1 text-[10px] text-muted">
          {walk ? (
            <>
              <Move3d size={12} className="text-accent" />
              <span>WASD 移动</span>
              <span className="text-faint">·</span>
              <span>Shift 加速</span>
              <span className="text-faint">·</span>
              <span>Esc 释放指针</span>
            </>
          ) : (
            <>
              <MousePointer2 size={12} className="text-accent" />
              <span>左键旋转</span>
              <span className="text-faint">·</span>
              <span>右键平移</span>
              <span className="text-faint">·</span>
              <span>滚轮缩放</span>
              <span className="text-faint">·</span>
              <span>点击选中</span>
            </>
          )}
        </div>
        {walk && locked ? (
          <button
            type="button"
            className="pointer-events-auto self-start rounded-[2px] border border-line bg-surface/95 px-2 py-1 text-[10px] text-muted hover:text-ink"
            onClick={() => {
              document.exitPointerLock?.();
              setPreset('bird');
            }}
          >
            退出漫游
          </button>
        ) : null}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-[2px] border border-line bg-surface/85 px-2 py-1 text-[10px] text-faint">
        <Compass size={12} /> 按需渲染 · DPR ≤ 2
      </div>
    </div>
  );
}
