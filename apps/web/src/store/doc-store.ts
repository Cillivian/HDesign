import { create } from 'zustand';
import { produce } from 'immer';
import {
  createEmptyProject,
  type Annotation,
  type Circuit,
  type FurnitureItem,
  type Layer,
  type MaterialAssignment,
  type MepDevice,
  type Opening,
  type Project,
  type ProjectSettings,
  type Reference,
  type Room,
  type SheetSpec,
  type StyleAssignment,
  type TitleBlock,
  type Wall,
} from '@hdesign/domain';

const MAX_HISTORY = 100;

export interface CommitOptions {
  /** Push a history entry. Ignored while a gesture is active. */
  history?: boolean;
  touch?: boolean;
}

interface DocState {
  doc: Project;
  past: Project[];
  future: Project[];
  gestureBase: Project | null;
  loaded: boolean;
  dirty: boolean;

  loadProject: (project: Project) => void;
  resetDoc: (project?: Project) => void;
  commit: (recipe: (draft: Project) => void, options?: CommitOptions) => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;
  setDirty: (dirty: boolean) => void;

  updateProjectName: (name: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  addWall: (wall: Wall) => void;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  removeWall: (id: string) => void;

  addOpening: (opening: Opening) => void;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  removeOpening: (id: string) => void;

  addRoom: (room: Room) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  removeRoom: (id: string) => void;
  setRoomMaterial: (
    roomId: string | undefined,
    scope: MaterialAssignment['scope'],
    materialId: string,
  ) => void;

  addFurniture: (items: FurnitureItem | FurnitureItem[]) => void;
  updateFurniture: (id: string, patch: Partial<Omit<FurnitureItem, 'id'>>) => void;
  moveFurniture: (ids: string[], dx: number, dy: number) => void;
  removeFurniture: (ids: string | string[]) => void;

  addMepDevice: (device: MepDevice) => void;
  addMepDevices: (devices: MepDevice[]) => void;
  updateMepDevice: (id: string, patch: Partial<Omit<MepDevice, 'id'>>) => void;
  removeMepDevice: (id: string) => void;
  addCircuit: (circuit: Circuit) => void;
  updateCircuit: (id: string, patch: Partial<Circuit>) => void;
  removeCircuit: (id: string) => void;

  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;

  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  removeLayer: (id: string) => boolean;
  reorderLayers: (orderedIds: string[]) => void;

  setReference: (reference: Reference | undefined) => void;
  updateReference: (patch: Partial<Reference>) => void;

  updateSheet: (id: string, patch: Partial<SheetSpec>) => void;
  updateSheetTitleBlock: (id: string, patch: Partial<TitleBlock>) => void;

  setStyle: (patch: Partial<StyleAssignment>) => void;
  setMaterials: (materials: MaterialAssignment[]) => void;
  updateAiMeta: (patch: Partial<Project['aiMeta']>) => void;
}

function stamp(draft: Project): void {
  draft.updatedAt = new Date().toISOString();
}

export const useDocStore = create<DocState>()((set, get) => ({
  doc: createEmptyProject('未命名方案'),
  past: [],
  future: [],
  gestureBase: null,
  loaded: false,
  dirty: false,

  loadProject: (project) =>
    set({
      doc: project,
      past: [],
      future: [],
      gestureBase: null,
      loaded: true,
      dirty: false,
    }),

  resetDoc: (project) =>
    set({
      doc: project ?? createEmptyProject('未命名方案'),
      past: [],
      future: [],
      gestureBase: null,
      loaded: true,
      dirty: false,
    }),

  commit: (recipe, options = {}) => {
    const state = get();
    const history = options.history ?? true;
    const next = produce(state.doc, (draft) => {
      recipe(draft);
      if (options.touch !== false) stamp(draft);
    });
    if (!history || state.gestureBase) {
      set({ doc: next, dirty: true });
      return;
    }
    const past = state.past.length >= MAX_HISTORY ? state.past.slice(1) : state.past;
    set({ doc: next, past: [...past, state.doc], future: [], dirty: true });
  },

  beginGesture: () => {
    const state = get();
    if (state.gestureBase) return;
    set({ gestureBase: structuredClone(state.doc) });
  },

  endGesture: () => {
    const state = get();
    if (!state.gestureBase) return;
    const base = state.gestureBase;
    const changed = base !== state.doc;
    if (!changed) {
      set({ gestureBase: null });
      return;
    }
    const past = state.past.length >= MAX_HISTORY ? state.past.slice(1) : state.past;
    set({ past: [...past, base], future: [], gestureBase: null, dirty: true });
  },

  cancelGesture: () => {
    const state = get();
    if (!state.gestureBase) return;
    set({ doc: state.gestureBase, gestureBase: null });
  },

  undo: () => {
    const state = get();
    if (state.gestureBase) return;
    const previous = state.past[state.past.length - 1];
    if (!previous) return;
    set({
      doc: previous,
      past: state.past.slice(0, -1),
      future: [state.doc, ...state.future].slice(0, MAX_HISTORY),
      dirty: true,
    });
  },

  redo: () => {
    const state = get();
    if (state.gestureBase) return;
    const next = state.future[0];
    if (!next) return;
    set({
      doc: next,
      past: [...state.past, state.doc].slice(-MAX_HISTORY),
      future: state.future.slice(1),
      dirty: true,
    });
  },

  setDirty: (dirty) => set({ dirty }),

  updateProjectName: (name) =>
    get().commit((draft) => {
      draft.name = name;
    }),

  updateSettings: (patch) =>
    get().commit((draft) => {
      Object.assign(draft.settings, patch);
    }),

  addWall: (wall) =>
    get().commit((draft) => {
      draft.walls.push(wall);
    }),

  updateWall: (id, patch) =>
    get().commit((draft) => {
      const wall = draft.walls.find((item) => item.id === id);
      if (!wall) return;
      Object.assign(wall, patch);
      wall.id = id;
    }),

  removeWall: (id) =>
    get().commit((draft) => {
      const wall = draft.walls.find((item) => item.id === id);
      if (!wall) return;
      draft.walls = draft.walls.filter((item) => item.id !== id);
      draft.openings = draft.openings.filter((opening) => opening.wallId !== id);
      for (const device of draft.mep.devices) {
        if (device.wallId === id) {
          delete device.wallId;
          delete device.t;
        }
      }
    }),

  addOpening: (opening) =>
    get().commit((draft) => {
      draft.openings.push(opening);
    }),

  updateOpening: (id, patch) =>
    get().commit((draft) => {
      const opening = draft.openings.find((item) => item.id === id);
      if (!opening) return;
      Object.assign(opening, patch);
      opening.id = id;
    }),

  removeOpening: (id) =>
    get().commit((draft) => {
      draft.openings = draft.openings.filter((item) => item.id !== id);
    }),

  addRoom: (room) =>
    get().commit((draft) => {
      draft.rooms.push(room);
    }),

  updateRoom: (id, patch) =>
    get().commit((draft) => {
      const room = draft.rooms.find((item) => item.id === id);
      if (!room) return;
      Object.assign(room, patch);
      room.id = id;
    }),

  removeRoom: (id) =>
    get().commit((draft) => {
      draft.rooms = draft.rooms.filter((item) => item.id !== id);
      draft.furniture = draft.furniture.map((item) =>
        item.roomId === id ? { ...item, roomId: undefined } : item,
      );
      draft.mep.devices = draft.mep.devices.map((item) =>
        item.roomId === id ? { ...item, roomId: undefined } : item,
      );
      draft.materials = draft.materials.filter((item) => item.roomId !== id);
    }),

  setRoomMaterial: (roomId, scope, materialId) =>
    get().commit((draft) => {
      const id = `mat-${roomId ?? 'all'}-${scope}`;
      const existing = draft.materials.find((item) => item.id === id);
      if (existing) {
        existing.materialId = materialId;
        return;
      }
      draft.materials.push({ id, roomId, scope, materialId });
    }),

  addFurniture: (items) =>
    get().commit((draft) => {
      const list = Array.isArray(items) ? items : [items];
      draft.furniture.push(...list);
    }),

  updateFurniture: (id, patch) =>
    get().commit((draft) => {
      const item = draft.furniture.find((entry) => entry.id === id);
      if (!item) return;
      Object.assign(item, patch);
      item.id = id;
    }),

  moveFurniture: (ids, dx, dy) =>
    get().commit(
      (draft) => {
        for (const item of draft.furniture) {
          if (ids.includes(item.id)) {
            item.x += dx;
            item.y += dy;
          }
        }
      },
      { history: true },
    ),

  removeFurniture: (ids) =>
    get().commit((draft) => {
      const list = Array.isArray(ids) ? ids : [ids];
      draft.furniture = draft.furniture.filter((item) => !list.includes(item.id));
    }),

  addMepDevice: (device) =>
    get().commit((draft) => {
      draft.mep.devices.push(device);
      if (device.circuitId) {
        const circuit = draft.mep.circuits.find((item) => item.id === device.circuitId);
        if (circuit && !circuit.deviceIds.includes(device.id)) circuit.deviceIds.push(device.id);
      }
    }),

  addMepDevices: (devices) =>
    get().commit((draft) => {
      draft.mep.devices.push(...devices);
      for (const device of devices) {
        if (!device.circuitId) continue;
        const circuit = draft.mep.circuits.find((item) => item.id === device.circuitId);
        if (circuit && !circuit.deviceIds.includes(device.id)) circuit.deviceIds.push(device.id);
      }
    }),

  updateMepDevice: (id, patch) =>
    get().commit((draft) => {
      const device = draft.mep.devices.find((item) => item.id === id);
      if (!device) return;
      const previousCircuit = device.circuitId;
      Object.assign(device, patch);
      device.id = id;
      if (previousCircuit !== device.circuitId) {
        for (const circuit of draft.mep.circuits) {
          circuit.deviceIds = circuit.deviceIds.filter((deviceId) => deviceId !== id);
        }
        if (device.circuitId) {
          const circuit = draft.mep.circuits.find((item) => item.id === device.circuitId);
          if (circuit) circuit.deviceIds.push(id);
        }
      }
    }),

  removeMepDevice: (id) =>
    get().commit((draft) => {
      draft.mep.devices = draft.mep.devices.filter((item) => item.id !== id);
      for (const circuit of draft.mep.circuits) {
        circuit.deviceIds = circuit.deviceIds.filter((deviceId) => deviceId !== id);
      }
    }),

  addCircuit: (circuit) =>
    get().commit((draft) => {
      draft.mep.circuits.push(circuit);
    }),

  updateCircuit: (id, patch) =>
    get().commit((draft) => {
      const circuit = draft.mep.circuits.find((item) => item.id === id);
      if (!circuit) return;
      Object.assign(circuit, patch);
      circuit.id = id;
    }),

  removeCircuit: (id) =>
    get().commit((draft) => {
      draft.mep.circuits = draft.mep.circuits.filter((item) => item.id !== id);
      for (const device of draft.mep.devices) {
        if (device.circuitId === id) delete device.circuitId;
      }
    }),

  addAnnotation: (annotation) =>
    get().commit((draft) => {
      draft.annotations.push(annotation);
    }),

  updateAnnotation: (id, patch) =>
    get().commit((draft) => {
      const annotation = draft.annotations.find((item) => item.id === id);
      if (!annotation) return;
      Object.assign(annotation, patch);
      annotation.id = id;
    }),

  removeAnnotation: (id) =>
    get().commit((draft) => {
      draft.annotations = draft.annotations.filter((item) => item.id !== id);
    }),

  addLayer: (layer) =>
    get().commit((draft) => {
      draft.layers.push(layer);
    }),

  updateLayer: (id, patch) =>
    get().commit((draft) => {
      const layer = draft.layers.find((item) => item.id === id);
      if (!layer) return;
      Object.assign(layer, patch);
      layer.id = id;
    }),

  removeLayer: (id) => {
    const doc = get().doc;
    const used =
      doc.walls.some((item) => item.layerId === id) ||
      doc.furniture.some((item) => item.layerId === id) ||
      doc.mep.devices.some((item) => item.layerId === id) ||
      doc.annotations.some((item) => item.layerId === id);
    if (used) return false;
    get().commit((draft) => {
      draft.layers = draft.layers.filter((item) => item.id !== id);
      draft.layers.forEach((layer, index) => {
        layer.order = index;
      });
    });
    return true;
  },

  reorderLayers: (orderedIds) =>
    get().commit((draft) => {
      orderedIds.forEach((id, index) => {
        const layer = draft.layers.find((item) => item.id === id);
        if (layer) layer.order = index;
      });
    }),

  setReference: (reference) =>
    get().commit((draft) => {
      if (!reference) {
        delete draft.reference;
        return;
      }
      draft.reference = reference;
    }),

  updateReference: (patch) =>
    get().commit((draft) => {
      if (!draft.reference) return;
      Object.assign(draft.reference, patch);
    }),

  updateSheet: (id, patch) =>
    get().commit((draft) => {
      const sheet = draft.sheets.find((item) => item.id === id);
      if (!sheet) return;
      Object.assign(sheet, patch);
      sheet.id = id;
    }),

  updateSheetTitleBlock: (id, patch) =>
    get().commit((draft) => {
      const sheet = draft.sheets.find((item) => item.id === id);
      if (!sheet) return;
      Object.assign(sheet.titleBlock, patch);
    }),

  setStyle: (patch) =>
    get().commit((draft) => {
      Object.assign(draft.style, patch);
      if (patch.id) draft.style.id = patch.id;
    }),

  setMaterials: (materials) =>
    get().commit((draft) => {
      draft.materials = materials;
    }),

  updateAiMeta: (patch) =>
    get().commit(
      (draft) => {
        Object.assign(draft.aiMeta, patch);
      },
      { history: false },
    ),
}));

export function undoDepth(): number {
  return useDocStore.getState().past.length;
}

export function redoDepth(): number {
  return useDocStore.getState().future.length;
}
