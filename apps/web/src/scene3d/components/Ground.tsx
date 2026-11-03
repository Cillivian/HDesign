import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MM_TO_M, type SceneBounds } from '../camera';
import { standardMaterial } from '../materials';
import type { ScenePalette } from '../palette';

/** Neutral site plane so walls / furniture always have a shadow catcher. */
export function Ground({ bounds, palette }: { bounds: SceneBounds; palette: ScenePalette }) {
  const size = Math.max(bounds.spanMm * MM_TO_M * 4, 80);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(size, size);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, [size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => standardMaterial(palette.ground, { roughness: 1, metalness: 0 }), [palette.ground]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[bounds.center.x * MM_TO_M, -0.02, bounds.center.y * MM_TO_M]}
      receiveShadow
    />
  );
}
