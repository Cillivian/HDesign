import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { roomBBox, roomLabelPoint } from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useSceneStore } from '../scene-store';
import { lightingState, sunPosition } from '../lighting';
import { MM_TO_M, type SceneBounds } from '../camera';

/**
 * Hemisphere + directional sun driven by the 7–18 hour slider (or night mode),
 * plus warm interior point lights per room.
 */
export function SceneLighting({ bounds }: { bounds: SceneBounds }) {
  const hour = useSceneStore((state) => state.hour);
  const night = useSceneStore((state) => state.night);
  const rooms = useDocStore((state) => state.doc.rooms);
  const state = useMemo(() => lightingState(hour, night), [hour, night]);
  const sun = useMemo(() => sunPosition(hour, bounds), [hour, bounds]);
  const shadowRadius = Math.max(bounds.spanMm * MM_TO_M * 0.95, 6);

  useFrame((frame) => {
    frame.gl.toneMappingExposure = state.exposure;
  });

  const roomLights = useMemo(
    () =>
      rooms.slice(0, 12).map((room) => {
        const anchor = roomLabelPoint(room);
        const box = roomBBox(room);
        return {
          id: room.id,
          position: [
            anchor.x * MM_TO_M,
            Math.min(room.ceiling.height, 2600) * MM_TO_M,
            anchor.y * MM_TO_M,
          ] as [number, number, number],
          distance: Math.max(Math.max(box.w, box.h) * MM_TO_M * 0.9, 3),
        };
      }),
    [rooms],
  );

  return (
    <>
      <hemisphereLight
        color={state.hemiSky}
        groundColor={state.hemiGround}
        intensity={state.hemiIntensity}
      />
      <ambientLight intensity={state.ambientIntensity} />
      <directionalLight
        position={sun}
        intensity={state.sunIntensity}
        color={state.sunColor}
        castShadow={state.sunIntensity > 0.1}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-camera-near={0.5}
        shadow-camera-far={shadowRadius * 4 + 40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {roomLights.map((light) => (
        <pointLight
          key={light.id}
          position={light.position}
          intensity={state.interiorIntensity}
          color="#FFD7A3"
          distance={light.distance}
          decay={2}
        />
      ))}
    </>
  );
}
