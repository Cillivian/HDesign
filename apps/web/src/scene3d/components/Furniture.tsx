import { useMemo } from 'react';
import * as THREE from 'three';
import type { FurnitureItem } from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { useUiStore } from '../../store/ui-store';
import { lookupFurnitureSku } from '../catalog-bridge';
import { buildFurnitureParts, type FurniturePart } from '../furniture-geometry';
import { MM_TO_M } from '../floor-geometry';
import { furnitureMaterials, unitBox, unitCone, unitCylinder, unitSphere } from '../materials';
import type { ScenePalette } from '../palette';
import { SelectionBox } from './SelectionBox';

type MaterialSet = Record<string, THREE.MeshStandardMaterial>;

/** Parametric catalogue furniture; unknown SKUs fall back to a generic box. */
export function Furniture({ palette }: { palette: ScenePalette }) {
  const items = useDocStore((state) => state.doc.furniture);
  const layers = useDocStore((state) => state.doc.layers);
  const selectedIds = useUiStore((state) =>
    state.selection.kind === 'furniture' ? state.selection.ids : null,
  );
  const visibleLayers = useMemo(
    () => new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id)),
    [layers],
  );

  return (
    <group>
      {items
        .filter((item) => visibleLayers.has(item.layerId))
        .map((item) => (
          <FurniturePiece
            key={item.id}
            item={item}
            palette={palette}
            selected={Boolean(selectedIds?.includes(item.id))}
          />
        ))}
    </group>
  );
}

function FurniturePiece({
  item,
  palette,
  selected,
}: {
  item: FurnitureItem;
  palette: ScenePalette;
  selected: boolean;
}) {
  const sku = useMemo(() => lookupFurnitureSku(item.skuId), [item.skuId]);
  const build = useMemo(() => buildFurnitureParts(item, sku?.builder), [item, sku]);
  const materials = useMemo(() => furnitureMaterials(item.color, palette), [item.color, palette]);
  const yaw = -item.rotation * (Math.PI / 180);

  return (
    <group
      position={[item.x * MM_TO_M, 0, item.y * MM_TO_M]}
      rotation={[0, yaw, 0]}
      scale={[item.flipX ? -1 : 1, 1, 1]}
      onClick={(event) => {
        event.stopPropagation();
        useUiStore.getState().selectOne('furniture', item.id);
      }}
    >
      {build.parts.map((part) => (
        <FurniturePartMesh key={part.key} part={part} materials={materials} />
      ))}
      {selected ? (
        <SelectionBox
          widthMm={item.w}
          heightMm={item.h}
          depthMm={item.d}
          color={palette.accent}
          position={[0, item.h / 2, 0]}
        />
      ) : null}
    </group>
  );
}

function FurniturePartMesh({ part, materials }: { part: FurniturePart; materials: MaterialSet }) {
  const material = materials[part.tone] ?? materials.primary!;
  const position: [number, number, number] = [
    part.position[0] * MM_TO_M,
    part.position[1] * MM_TO_M,
    part.position[2] * MM_TO_M,
  ];
  const rotation = part.rotation;
  const castsShadow = part.tone !== 'glass';

  const shape = part.shape;
  switch (shape.kind) {
    case 'box':
      return (
        <mesh
          geometry={unitBox}
          position={position}
          rotation={rotation}
          scale={[
            shape.size[0] * MM_TO_M,
            shape.size[1] * MM_TO_M,
            shape.size[2] * MM_TO_M,
          ]}
          material={material}
          castShadow={castsShadow}
          receiveShadow
        />
      );
    case 'cylinder':
      return (
        <mesh
          geometry={unitCylinder}
          position={position}
          rotation={rotation}
          scale={[shape.radius * 2 * MM_TO_M, shape.height * MM_TO_M, shape.radius * 2 * MM_TO_M]}
          material={material}
          castShadow={castsShadow}
          receiveShadow
        />
      );
    case 'sphere':
      return (
        <mesh
          geometry={unitSphere}
          position={position}
          rotation={rotation}
          scale={[shape.radius * 2 * MM_TO_M, shape.radius * 2 * MM_TO_M, shape.radius * 2 * MM_TO_M]}
          material={material}
          castShadow={castsShadow}
          receiveShadow
        />
      );
    case 'cone':
      return (
        <mesh
          geometry={unitCone}
          position={position}
          rotation={rotation}
          scale={[shape.radius * 2 * MM_TO_M, shape.height * MM_TO_M, shape.radius * 2 * MM_TO_M]}
          material={material}
          castShadow={castsShadow}
          receiveShadow
        />
      );
    default:
      return null;
  }
}
