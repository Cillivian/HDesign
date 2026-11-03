import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Room } from '@hdesign/domain';
import { useDocStore } from '../../store/doc-store';
import { roomLabelText, roomLabelWorld } from '../floor-geometry';
import type { ScenePalette } from '../palette';
import { useSceneStore } from '../scene-store';
import { roomLabelTexture } from '../textures';

/** Room name + area labels as camera-facing sprites (canvas texture, no external font). */
export function RoomLabels({ palette }: { palette: ScenePalette }) {
  const rooms = useDocStore((state) => state.doc.rooms);
  const walls = useDocStore((state) => state.doc.walls);
  const labels = useSceneStore((state) => state.labels);
  const wallMode = useSceneStore((state) => state.wallMode);
  const preset = useSceneStore((state) => state.preset);

  const maxWallHeight = useMemo(
    () => Math.max(2800, ...walls.map((wall) => wall.height)),
    [walls],
  );

  // Labels are an inspection aid: they would block the first-person view.
  if (!labels || preset === 'walk') return null;
  const heightMm = wallMode === 'cut' ? 420 : maxWallHeight + 420;

  return (
    <group>
      {rooms.map((room) => (
        <RoomLabel key={room.id} room={room} heightMm={heightMm} palette={palette} />
      ))}
    </group>
  );
}

function RoomLabel({ room, heightMm, palette }: { room: Room; heightMm: number; palette: ScenePalette }) {
  const text = roomLabelText(room);
  const sprite = useRef<THREE.Sprite>(null);
  const texture = useMemo(
    () => roomLabelTexture(text.title, text.subtitle, palette.labelInk, palette.labelBg),
    [text.title, text.subtitle, palette.labelInk, palette.labelBg],
  );
  const position = useMemo(() => roomLabelWorld(room, heightMm), [room, heightMm]);

  // Keep labels legible but not overwhelming: scale with camera distance.
  useFrame((frame) => {
    const object = sprite.current;
    if (!object) return;
    const distance = frame.camera.position.distanceTo(object.position);
    const scale = Math.min(3, Math.max(0.85, distance * 0.13));
    object.scale.set(scale, scale * 0.39, 1);
  });

  if (!texture) return null;
  return (
    <sprite ref={sprite} position={position} scale={[2.4, 0.94, 1]} renderOrder={20}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}
