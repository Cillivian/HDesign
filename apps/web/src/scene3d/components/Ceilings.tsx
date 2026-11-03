import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { MM_TO_M, roomFloorOutline } from '../floor-geometry';
import { standardMaterial } from '../materials';
import type { ScenePalette } from '../palette';
import { useSceneStore } from '../scene-store';

/** Optional flat ceilings — only rendered with full-height walls (hidden in the dollhouse cut). */
export function Ceilings({ palette }: { palette: ScenePalette }) {
  const rooms = useDocStore((state) => state.doc.rooms);
  const labels = useSceneStore((state) => state.ceilings);
  const wallMode = useSceneStore((state) => state.wallMode);
  const visible = labels && wallMode === 'full';

  const ceilings = useMemo(
    () =>
      visible
        ? rooms
            .filter((room) => room.ceiling.type !== 'none')
            .map((room) => {
              const outline = roomFloorOutline(room);
              const shape = new THREE.Shape(outline.points.map((point) => new THREE.Vector2(point.x, point.y)));
              const geometry = new THREE.ShapeGeometry(shape);
              geometry.rotateX(-Math.PI / 2);
              return { room, geometry, height: room.ceiling.height * MM_TO_M };
            })
        : [],
    [rooms, visible],
  );

  useEffect(
    () => () => {
      for (const item of ceilings) item.geometry.dispose();
    },
    [ceilings],
  );

  const material = useMemo(
    () => standardMaterial(palette.ceiling, { roughness: 0.96, side: THREE.DoubleSide }),
    [palette.ceiling],
  );

  if (!visible || ceilings.length === 0) return null;
  return (
    <group>
      {ceilings.map(({ room, geometry, height }) => (
        <mesh
          key={room.id}
          geometry={geometry}
          material={material}
          position={[0, height, 0]}
          onClick={(event) => {
            event.stopPropagation();
            useUiStore.getState().selectOne('room', room.id);
          }}
        />
      ))}
    </group>
  );
}
