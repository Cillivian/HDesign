import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { midPoint, wallLength, type Annotation, type Point } from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import {
  focusPose,
  orbitPose,
  roomFocusPose,
  type CameraPose,
  type SceneBounds,
} from '../camera';
import { MM_TO_M } from '../floor-geometry';
import type { SceneFocus } from '../scene-store';
import { useSceneStore } from '../scene-store';
import { pointAlongWall } from '../wall-geometry';

interface CameraTween {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromFov: number;
  toFov: number;
  t: number;
  duration: number;
}

/**
 * Orbit controls + animated camera presets / focus moves.
 * Rendering stays on demand: the tween calls invalidate() until it completes.
 */
export function CameraRig({ bounds }: { bounds: SceneBounds }) {
  const preset = useSceneStore((state) => state.preset);
  const focus = useSceneStore((state) => state.focus);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const invalidate = useThree((state) => state.invalidate);
  const tween = useRef<CameraTween | null>(null);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const initialized = useRef(false);

  const centerTarget = useMemo(
    () => new THREE.Vector3(bounds.center.x * MM_TO_M, 0, bounds.center.y * MM_TO_M),
    [bounds],
  );

  const startPose = useCallback(
    (pose: CameraPose) => {
      const perspective = camera as THREE.PerspectiveCamera;
      const fromFov = perspective.isPerspectiveCamera ? perspective.fov : 42;
      const toFov = pose.fov ?? fromFov;
      const fromPosition = camera.position.clone();
      const toPosition = new THREE.Vector3(pose.position[0], pose.position[1], pose.position[2]);
      const fromTarget = (controls?.target ?? centerTarget).clone();
      const toTarget = new THREE.Vector3(pose.target[0], pose.target[1], pose.target[2]);
      if (fromPosition.distanceTo(toPosition) < 0.02 && fromTarget.distanceTo(toTarget) < 0.02) {
        return;
      }
      tween.current = { fromPosition, toPosition, fromTarget, toTarget, fromFov, toFov, t: 0, duration: 0.65 };
      invalidate();
    },
    [camera, controls, centerTarget, invalidate],
  );

  // Initialise the orbit target once the default controls register.
  useEffect(() => {
    if (!controls || initialized.current) return;
    controls.target.copy(centerTarget);
    controls.update();
    initialized.current = true;
    invalidate();
  }, [controls, centerTarget, invalidate]);

  useEffect(() => {
    if (preset === 'walk') {
      tween.current = null;
      return;
    }
    startPose(orbitPose(preset, bounds));
  }, [preset, bounds, startPose]);

  useEffect(() => {
    if (!focus || preset === 'walk') return;
    const pose = resolveFocusPose(focus);
    if (pose) startPose(pose);
  }, [focus, preset, startPose]);

  useFrame((state, delta) => {
    const active = tween.current;
    if (!active) return;
    active.t = Math.min(1, active.t + delta / active.duration);
    const k = active.t * active.t * (3 - 2 * active.t);
    state.camera.position.lerpVectors(active.fromPosition, active.toPosition, k);
    if (controls) {
      controls.target.lerpVectors(active.fromTarget, active.toTarget, k);
      controls.update();
    }
    const perspective = state.camera as THREE.PerspectiveCamera;
    if (perspective.isPerspectiveCamera) {
      perspective.fov = active.fromFov + (active.toFov - active.fromFov) * k;
      perspective.updateProjectionMatrix();
    }
    if (active.t >= 1) {
      tween.current = null;
    }
    invalidate();
  });

  if (preset === 'walk') return null;
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={false}
      enablePan
      enableZoom
      minDistance={1.2}
      maxDistance={Math.max(bounds.spanMm * MM_TO_M * 6, 40)}
      maxPolarAngle={Math.PI / 2 - 0.04}
      onStart={() => {
        tween.current = null;
      }}
    />
  );
}

function selectionPoint(annotation: Annotation): Point | null {
  const first = annotation.points[0];
  return first ? { x: first.x, y: first.y } : null;
}

/** Camera pose that frames the current selection (or a room focus request). */
function resolveFocusPose(focus: SceneFocus): CameraPose | null {
  const doc = useDocStore.getState().doc;
  const selection = useUiStore.getState().selection;

  if (focus.kind === 'room' && focus.id) {
    const room = doc.rooms.find((candidate) => candidate.id === focus.id);
    return room ? roomFocusPose(room) : null;
  }

  const id = selection.ids[0];
  if (!id) return null;
  if (selection.kind === 'room') {
    const room = doc.rooms.find((candidate) => candidate.id === id);
    return room ? roomFocusPose(room) : null;
  }
  if (selection.kind === 'wall') {
    const wall = doc.walls.find((candidate) => candidate.id === id);
    if (!wall) return null;
    const center = midPoint(wall.a, wall.b);
    return focusPose(center, Math.max(wallLength(wall) / 2, 600), 'bird', wall.height / 2);
  }
  if (selection.kind === 'opening') {
    const opening = doc.openings.find((candidate) => candidate.id === id);
    if (!opening) return null;
    const wall = doc.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return null;
    const center = pointAlongWall(wall, opening.offset + opening.width / 2);
    return focusPose(center, Math.max(opening.width, 700), 'bird', opening.sill + opening.height / 2);
  }
  if (selection.kind === 'furniture') {
    const item = doc.furniture.find((candidate) => candidate.id === id);
    if (!item) return null;
    return focusPose(
      { x: item.x, y: item.y },
      Math.max(item.w, item.d) / 2,
      'bird',
      item.h / 2,
    );
  }
  if (selection.kind === 'mep') {
    const device = doc.mep.devices.find((candidate) => candidate.id === id);
    if (!device) return null;
    return focusPose({ x: device.x, y: device.y }, 900, 'bird', device.height);
  }
  if (selection.kind === 'annotation') {
    const annotation = doc.annotations.find((candidate) => candidate.id === id);
    const point = annotation ? selectionPoint(annotation) : null;
    return point ? focusPose(point, 900, 'bird', 800) : null;
  }
  return null;
}
