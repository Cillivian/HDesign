import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { roomFloorOutline } from '../floor-geometry';
import { standardMaterial } from '../materials';
import type { ScenePalette } from '../palette';
import { floorMaterialFor } from '../textures';

/** Room floor plates built from the domain room polygons (ShapeGeometry). */
export function Floors({ palette }: { palette: ScenePalette }) {
  const rooms = useDocStore((state) => state.doc.rooms);
  const layers = useDocStore((state) => state.doc.layers);
  const selectedRoomIds = useUiStore((state) =>
    state.selection.kind === 'room' ? state.selection.ids : null,
  );
  const visibleLayers = useMemo(
    () => new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [layers],
  );

  const floors = useMemo(
    () =>
      rooms
        .filter((room) => visibleLayers.has(room.layerId))
        .map((room) => {
          const outline = roomFloorOutline(room);
          const shape = new THREE.Shape(outline.points.map((point) => new THREE.Vector2(point.x, point.y)));
          const geometry = new THREE.ShapeGeometry(shape);
          geometry.rotateX(-Math.PI / 2);
          return {
            room,
            geometry,
            repeatX: Math.max(1, outline.bbox.w / 2000),
            repeatY: Math.max(1, outline.bbox.h / 2000),
          };
        }),
    [rooms, visibleLayers],
  );

  useEffect(
    () => () => {
      for (const floor of floors) floor.geometry.dispose();
    },
    [floors],
  );

  const selectionMaterial = useMemo(
    () =>
      standardMaterial(palette.accent, {
        transparent: true,
        opacity: 0.18,
        roughness: 0.9,
        emissive: palette.accent,
        emissiveIntensity: 0.08,
      }),
    [palette.accent],
  );

  return (
    <group>
      {floors.map(({ room, geometry, repeatX, repeatY }) => {
        const selected = Boolean(selectedRoomIds?.includes(room.id));
        return (
          <group key={room.id}>
            <mesh
              geometry={geometry}
              material={floorMaterialFor(room.floorMaterialId, repeatX, repeatY, false, palette)}
              position={[0, 0.012, 0]}
              receiveShadow
              onClick={(event) => {
                event.stopPropagation();
                useUiStore.getState().selectOne('room', room.id);
              }}
            />
            {selected ? (
              <mesh geometry={geometry} material={selectionMaterial} position={[0, 0.02, 0]} renderOrder={4} />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
