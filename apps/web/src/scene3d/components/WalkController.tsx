import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { clamp } from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useSceneStore } from '../scene-store';
import { MM_TO_M } from '../camera';
import { EYE_HEIGHT_MM, walkBlockSegments, walkDelta, walkMove, walkStart } from '../walk';

interface WalkState {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
}

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'];

/**
 * First-person walk: PointerLock mouse look, WASD + Shift and 2D wall collision.
 * Runs only while the "walk" camera preset is active (frameloop is "always" then).
 */
export function WalkController() {
  const preset = useSceneStore((state) => state.preset);
  const active = preset === 'walk';
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const walls = useDocStore((state) => state.doc.walls);
  const openings = useDocStore((state) => state.doc.openings);

  const blocks = useMemo(() => walkBlockSegments(walls, openings), [walls, openings]);
  const stateRef = useRef<WalkState>({ x: 0, y: 0, yaw: 0, pitch: 0 });
  const keys = useRef<Set<string>>(new Set());
  const locked = useRef(false);
  const entered = useRef(false);

  // Force one frame whenever walk mode toggles: leaving walk happens while the
  // renderer is on "demand", and the frame resets the spawn latch.
  useEffect(() => {
    invalidate();
  }, [active, invalidate]);

  useEffect(() => {
    if (!active) {
      keys.current.clear();
      return;
    }
    const element = gl.domElement;
    const keySet = keys.current;
    const requestLock = () => {
      if (document.pointerLockElement !== element) element.requestPointerLock?.();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === element;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!locked.current) return;
      const state = stateRef.current;
      state.yaw -= event.movementX * 0.0024;
      state.pitch = clamp(state.pitch - event.movementY * 0.0024, -1.15, 1.15);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' || !MOVE_KEYS.includes(event.code)) return;
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      keySet.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keySet.delete(event.code);
    };
    const onPointerDown = () => requestLock();

    element.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('hdesign:walk-lock', requestLock);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('hdesign:walk-lock', requestLock);
      keySet.clear();
      locked.current = false;
      if (document.pointerLockElement === element) document.exitPointerLock?.();
    };
  }, [active, gl]);

  useFrame((state, delta) => {
    if (!active) {
      entered.current = false;
      return;
    }
    const pose = stateRef.current;
    if (!entered.current) {
      // Spawn inside the largest room each time walk mode is entered.
      entered.current = true;
      const start = walkStart(useDocStore.getState().doc.rooms, blocks);
      pose.x = start.x;
      pose.y = start.y;
      pose.yaw = start.yaw;
      pose.pitch = -0.03;
      state.camera.rotation.order = 'YXZ';
      state.camera.position.set(pose.x * MM_TO_M, EYE_HEIGHT_MM * MM_TO_M, pose.y * MM_TO_M);
      state.camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
    }
    const forward = (keys.current.has('KeyW') ? 1 : 0) - (keys.current.has('KeyS') ? 1 : 0);
    const strafe = (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0);
    if (forward !== 0 || strafe !== 0) {
      const run = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight');
      const step = walkDelta(pose.yaw, forward, strafe, run, Math.min(delta, 0.05));
      const next = walkMove({ x: pose.x, y: pose.y }, step, blocks);
      pose.x = next.x;
      pose.y = next.y;
    }
    state.camera.position.set(pose.x * MM_TO_M, EYE_HEIGHT_MM * MM_TO_M, pose.y * MM_TO_M);
    state.camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  });

  return null;
}
