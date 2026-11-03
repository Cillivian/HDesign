import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MM_TO_M } from '../floor-geometry';

/** Wireframe selection box in metres-space around a furniture item. */
export function SelectionBox({
  widthMm,
  heightMm,
  depthMm,
  color,
  position = [0, heightMm / 2, 0],
}: {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  color: string;
  position?: [number, number, number];
}) {
  const geometry = useMemo(
    () =>
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          Math.max(widthMm * MM_TO_M, 0.05),
          Math.max(heightMm * MM_TO_M, 0.05),
          Math.max(depthMm * MM_TO_M, 0.05),
        ),
      ),
    [widthMm, heightMm, depthMm],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments
      geometry={geometry}
      position={[position[0] * MM_TO_M, position[1] * MM_TO_M, position[2] * MM_TO_M]}
      renderOrder={12}
    >
      <lineBasicMaterial color={color} transparent opacity={0.95} depthTest={false} />
    </lineSegments>
  );
}
