import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { buildMepMarkers, buildMepRuns, type MepMarker, type MepRun } from '../mep-geometry';
import { standardMaterial, unitBox, unitDisc } from '../materials';
import type { ScenePalette } from '../palette';
import { useSceneStore } from '../scene-store';
import { mepIconTexture } from '../textures';

const WATER = 'water';

/** Wall-mounted MEP plates (water blue / electric amber) plus optional pipe runs. */
export function MepDevices({ palette }: { palette: ScenePalette }) {
  const devices = useDocStore((state) => state.doc.mep.devices);
  const walls = useDocStore((state) => state.doc.walls);
  const rooms = useDocStore((state) => state.doc.rooms);
  const mep = useSceneStore((state) => state.mep);
  const pipes = useSceneStore((state) => state.pipes);
  const wallMode = useSceneStore((state) => state.wallMode);
  const cutHeight = useSceneStore((state) => state.cutHeight);
  const selectedIds = useUiStore((state) =>
    state.selection.kind === 'mep' ? state.selection.ids : null,
  );

  const markers = useMemo(() => buildMepMarkers(devices, walls, rooms), [devices, walls, rooms]);
  const runs = useMemo(
    () =>
      buildMepRuns(devices, rooms, {
        // In the dollhouse cut the ceiling trunk would float above the shortened
        // walls, so route the wires just under the cut plane instead.
        electricTrunkMm: wallMode === 'cut' ? Math.max(cutHeight - 150, 700) : 2400,
      }),
    [devices, rooms, wallMode, cutHeight],
  );

  if (!mep) return null;
  return (
    <group>
      {markers.map((marker) => (
        <MepMarkerMesh
          key={marker.id}
          marker={marker}
          palette={palette}
          selected={Boolean(selectedIds?.includes(marker.id))}
        />
      ))}
      {pipes
        ? runs.map((run) => (
            <MepRunLine
              key={run.key}
              run={run}
              color={run.group === WATER ? palette.water : palette.electric}
            />
          ))
        : null}
    </group>
  );
}

function MepMarkerMesh({
  marker,
  palette,
  selected,
}: {
  marker: MepMarker;
  palette: ScenePalette;
  selected: boolean;
}) {
  const color = marker.group === WATER ? palette.water : palette.electric;
  const texture = useMemo(
    () => mepIconTexture(marker.short, marker.group, palette),
    [marker.short, marker.group, palette],
  );
  const plateMaterial = useMemo(
    () =>
      standardMaterial(color, {
        roughness: 0.45,
        metalness: 0.2,
        emissive: color,
        emissiveIntensity: selected ? 0.55 : 0.14,
      }),
    [color, selected],
  );
  const sprite = texture ? (
    <sprite position={[0, marker.floorMounted ? 0.12 : 0.1, 0]} scale={[0.2, 0.2, 1]} renderOrder={11}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  ) : null;

  if (marker.floorMounted) {
    return (
      <group
        position={marker.position}
        onClick={(event) => {
          event.stopPropagation();
          useUiStore.getState().selectOne('mep', marker.id);
        }}
      >
        <mesh geometry={unitDisc} rotation={[-Math.PI / 2, 0, 0]} scale={[0.24, 0.24, 1]} material={plateMaterial} />
        {sprite}
      </group>
    );
  }

  return (
    <group
      position={marker.position}
      rotation={[0, marker.yaw, 0]}
      onClick={(event) => {
        event.stopPropagation();
        useUiStore.getState().selectOne('mep', marker.id);
      }}
    >
      <mesh geometry={unitBox} scale={[0.16, 0.1, 0.05]} material={plateMaterial} castShadow />
      {sprite}
    </group>
  );
}

function MepRunLine({ run, color }: { run: MepRun; color: string }) {
  // Built as a plain THREE.Line primitive: the JSX <line> tag would collide with SVG's line element.
  const line = useMemo(() => {
    const points = run.points.map((point) => new THREE.Vector3(point[0], point[1], point[2]));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthTest: true,
    });
    const object = new THREE.Line(geometry, material);
    object.renderOrder = 8;
    return object;
  }, [run, color]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  return <primitive object={line} />;
}
