import { create } from 'zustand';
import { DEFAULT_CUT_HEIGHT } from './wall-geometry';

export type CameraPreset = 'top' | 'bird' | 'corner' | 'walk';
export type WallMode = 'full' | 'cut';

export const CAMERA_PRESET_LABELS: Record<CameraPreset, string> = {
  top: '顶视',
  bird: '鸟瞰',
  corner: '四角',
  walk: '漫游',
};

export const CAMERA_PRESETS: CameraPreset[] = ['top', 'bird', 'corner', 'walk'];

export interface SceneFocus {
  /** Monotonic id so repeated focus requests retrigger the camera. */
  nonce: number;
  kind: 'room' | 'selection';
  id?: string;
}

interface SceneState {
  preset: CameraPreset;
  wallMode: WallMode;
  /** Dollhouse clip height in mm, used when wallMode === 'cut'. */
  cutHeight: number;
  ceilings: boolean;
  labels: boolean;
  /** Day- light hour 7..18. */
  hour: number;
  night: boolean;
  mep: boolean;
  pipes: boolean;
  focus: SceneFocus | null;
  /** Wall mode saved when entering walk mode, restored when leaving. */
  preWalkWallMode: WallMode | null;

  setPreset: (preset: CameraPreset) => void;
  setWallMode: (mode: WallMode) => void;
  setCutHeight: (height: number) => void;
  setCeilings: (value: boolean) => void;
  setLabels: (value: boolean) => void;
  setHour: (hour: number) => void;
  setNight: (value: boolean) => void;
  setMep: (value: boolean) => void;
  setPipes: (value: boolean) => void;
  focusRoom: (roomId: string) => void;
  focusSelection: () => void;
}

let focusSeq = 0;

export const useSceneStore = create<SceneState>()((set) => ({
  preset: 'bird',
  wallMode: 'cut',
  cutHeight: DEFAULT_CUT_HEIGHT,
  ceilings: false,
  labels: true,
  hour: 14,
  night: false,
  mep: false,
  pipes: false,
  focus: null,
  preWalkWallMode: null,

  setPreset: (preset) =>
    set((state) => {
      if (preset === 'walk' && state.preset !== 'walk') {
        // First-person view needs real walls: a 1.2 m cutaway would let the eye
        // (1.6 m) look straight over every wall.
        return { preset, preWalkWallMode: state.wallMode, wallMode: 'full' as WallMode };
      }
      if (preset !== 'walk' && state.preset === 'walk' && state.preWalkWallMode) {
        return { preset, wallMode: state.preWalkWallMode, preWalkWallMode: null };
      }
      return { preset };
    }),
  setWallMode: (wallMode) => set({ wallMode }),
  setCutHeight: (cutHeight) => set({ cutHeight }),
  setCeilings: (ceilings) => set({ ceilings }),
  setLabels: (labels) => set({ labels }),
  setHour: (hour) => set({ hour }),
  setNight: (night) => set({ night }),
  setMep: (mep) => set({ mep }),
  setPipes: (pipes) => set({ pipes }),
  focusRoom: (roomId) => set({ focus: { kind: 'room', id: roomId, nonce: (focusSeq += 1) } }),
  focusSelection: () => set({ focus: { kind: 'selection', nonce: (focusSeq += 1) } }),
}));
