import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDocStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';
import { orbitPose, sceneBounds } from './camera';
import { useScenePalette } from './palette';
import { useSceneStore } from './scene-store';
import { CameraRig } from './components/CameraRig';
import { Ceilings } from './components/Ceilings';
import { Floors } from './components/Floors';
import { Furniture } from './components/Furniture';
import { Ground } from './components/Ground';
import { MepDevices } from './components/MepDevices';
import { RoomLabels } from './components/RoomLabels';
import { SceneHud } from './components/SceneHud';
import { SceneLighting } from './components/SceneLighting';
import { WalkController } from './components/WalkController';
import { Walls } from './components/Walls';
import type { ScenePalette } from './palette';
import type { SceneBounds } from './camera';

/**
 * Heavy 3D scene (three / @react-three/fiber / drei live in this lazy chunk).
 * `SceneCanvas` only imports this module through React.lazy.
 */
export default function SceneView() {
  const palette = useScenePalette();
  const preset = useSceneStore((state) => state.preset);
  const walls = useDocStore((state) => state.doc.walls);
  const rooms = useDocStore((state) => state.doc.rooms);
  const furniture = useDocStore((state) => state.doc.furniture);

  const bounds = useMemo(() => sceneBounds(walls, rooms, furniture), [walls, rooms, furniture]);
  // Snapshot the initial framing so document edits never snap the camera back.
  const [initialCamera] = useState(() => orbitPose('bird', bounds));

  return (
    <div className="absolute inset-0" style={{ background: palette.backdrop }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        frameloop={preset === 'walk' ? 'always' : 'demand'}
        camera={{
          position: initialCamera.position,
          fov: initialCamera.fov ?? 42,
          near: 0.05,
          far: 600,
        }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.shadowMap.type = THREE.PCFShadowMap;
          gl.setClearColor(new THREE.Color(palette.backdrop));
        }}
        onPointerMissed={() => useUiStore.getState().clearSelection()}
      >
        <Suspense fallback={null}>
          <SceneContent bounds={bounds} palette={palette} />
        </Suspense>
      </Canvas>
      <SceneHud bounds={bounds} />
    </div>
  );
}

function SceneContent({ bounds, palette }: { bounds: SceneBounds; palette: ScenePalette }) {
  return (
    <>
      <color attach="background" args={[palette.backdrop]} />
      <InvalidateOnChange />
      <SceneLighting bounds={bounds} />
      <Ground bounds={bounds} palette={palette} />
      <Floors palette={palette} />
      <Walls palette={palette} />
      <Ceilings palette={palette} />
      <Furniture palette={palette} />
      <MepDevices palette={palette} />
      <RoomLabels palette={palette} />
      <CameraRig bounds={bounds} />
      <WalkController />
    </>
  );
}

/** R3F "demand" mode needs an explicit invalidate when scene settings change. */
function InvalidateOnChange() {
  const invalidate = useThree((state) => state.invalidate);
  const wallMode = useSceneStore((state) => state.wallMode);
  const cutHeight = useSceneStore((state) => state.cutHeight);
  const ceilings = useSceneStore((state) => state.ceilings);
  const labels = useSceneStore((state) => state.labels);
  const hour = useSceneStore((state) => state.hour);
  const night = useSceneStore((state) => state.night);
  const mep = useSceneStore((state) => state.mep);
  const pipes = useSceneStore((state) => state.pipes);
  const selection = useUiStore((state) => state.selection);

  useEffect(() => {
    invalidate();
  }, [invalidate, wallMode, cutHeight, ceilings, labels, hour, night, mep, pipes, selection]);

  return null;
}
