import { useMemo } from 'react';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { openingDetailParts, segmentWalls } from '../wall-geometry';
import { MM_TO_M } from '../floor-geometry';
import { openingMaterial, unitBox, wallMaterial } from '../materials';
import type { ScenePalette } from '../palette';
import { useSceneStore } from '../scene-store';

/**
 * Walls are split around openings into solid spans + sills/lintels and rendered
 * as scaled unit boxes (shared geometry, one material per colour). No CSG.
 */
export function Walls({ palette }: { palette: ScenePalette }) {
  const walls = useDocStore((state) => state.doc.walls);
  const openings = useDocStore((state) => state.doc.openings);
  const layers = useDocStore((state) => state.doc.layers);
  const wallMode = useSceneStore((state) => state.wallMode);
  const cutHeight = useSceneStore((state) => state.cutHeight);
  const selectedWallIds = useUiStore((state) =>
    state.selection.kind === 'wall' ? state.selection.ids : null,
  );
  const selectedOpeningIds = useUiStore((state) =>
    state.selection.kind === 'opening' ? state.selection.ids : null,
  );

  const visibleLayers = useMemo(
    () => new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [layers],
  );

  const built = useMemo(
    () =>
      segmentWalls(
        walls.filter((wall) => visibleLayers.has(wall.layerId)),
        openings,
        { cutHeight: wallMode === 'cut' ? cutHeight : undefined },
      ),
    [walls, openings, visibleLayers, wallMode, cutHeight],
  );

  return (
    <group>
      {built.boxes.map((part) => {
        const selected = Boolean(selectedWallIds?.includes(part.wallId));
        return (
          <mesh
            key={part.key}
            geometry={unitBox}
            position={[
              part.cx * MM_TO_M,
              ((part.bottom + part.top) / 2) * MM_TO_M,
              part.cy * MM_TO_M,
            ]}
            rotation={[0, part.yaw, 0]}
            scale={[
              (part.end - part.start) * MM_TO_M,
              (part.top - part.bottom) * MM_TO_M,
              part.thickness * MM_TO_M,
            ]}
            material={wallMaterial(part.isLoadBearing, part.wallKind === 'low-wall', selected, palette)}
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              useUiStore.getState().selectOne('wall', part.wallId);
            }}
          />
        );
      })}

      {built.frames.map((frame) => {
        const centerAlong = (frame.start + frame.end) / 2;
        const parts = openingDetailParts(frame);
        const selected = Boolean(selectedOpeningIds?.includes(frame.openingId));
        return (
          <group
            key={frame.key}
            position={[frame.cx * MM_TO_M, 0, frame.cy * MM_TO_M]}
            rotation={[0, frame.yaw, 0]}
          >
            {parts.map((part) => (
              <mesh
                key={part.key}
                geometry={unitBox}
                position={[
                  (part.along - centerAlong) * MM_TO_M,
                  (part.bottom + part.height / 2) * MM_TO_M,
                  (part.offsetZ ?? 0) * MM_TO_M,
                ]}
                rotation={[0, part.rotationY ?? 0, 0]}
                scale={[part.width * MM_TO_M, part.height * MM_TO_M, part.depth * MM_TO_M]}
                material={openingMaterial(part.role, selected, palette)}
                castShadow={part.role !== 'glass'}
                receiveShadow={part.role !== 'glass'}
                onClick={(event) => {
                  event.stopPropagation();
                  useUiStore.getState().selectOne('opening', frame.openingId);
                }}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
