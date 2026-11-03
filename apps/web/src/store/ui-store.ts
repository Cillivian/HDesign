import { create } from 'zustand';
import type { Point } from '@hdesign/domain';
import {
  applyTheme,
  readUiPrefs,
  type AccentId,
  type CanvasStyle,
  type ThemeMode,
} from '../design-system/theme';

export const TOOL_IDS = [
  'select',
  'pan',
  'wall',
  'door',
  'window',
  'sliding',
  'room',
  'furniture',
  'measure',
  'text',
  'calibrate',
  'mep-socket',
  'mep-switch',
  'mep-light',
  'mep-water',
  'mep-drain',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_LABELS: Record<ToolId, string> = {
  select: '选择',
  pan: '平移',
  wall: '墙体',
  door: '门',
  window: '窗',
  sliding: '推拉门',
  room: '房间',
  furniture: '家具',
  measure: '测量',
  text: '文字',
  calibrate: '校准',
  'mep-socket': '插座',
  'mep-switch': '开关',
  'mep-light': '灯位',
  'mep-water': '给水',
  'mep-drain': '排水',
};

export type SelectionKind = 'none' | 'wall' | 'opening' | 'room' | 'furniture' | 'mep' | 'annotation';

export interface Selection {
  kind: SelectionKind;
  ids: string[];
}

export const EMPTY_SELECTION: Selection = { kind: 'none', ids: [] };

export type LeftPanelId = 'assets' | 'styles' | 'materials' | 'import' | 'mep' | 'ai';
export type RightPanelId = 'properties' | 'layers' | 'scene' | 'sheets' | 'ai';
export type ViewMode = '2d' | '3d';
export type DialogId = 'command' | 'settings' | 'shortcuts' | 'sheets' | 'import' | 'newProject';

export interface ToastItem {
  id: string;
  kind: 'info' | 'success' | 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface UiState {
  tool: ToolId;
  selection: Selection;
  hoverId: string | null;
  viewport: Viewport;
  view: ViewMode;
  leftPanel: LeftPanelId | null;
  rightPanel: RightPanelId | null;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  theme: ThemeMode;
  accent: AccentId;
  canvasStyle: CanvasStyle;
  activeDialog: DialogId | null;
  toasts: ToastItem[];
  aiOpen: boolean;
  activeSheetId: string | null;
  spacePanning: boolean;
  pendingFurnitureSkuId: string | null;

  setTool: (tool: ToolId) => void;
  setSelection: (kind: SelectionKind, ids: string[]) => void;
  selectOne: (kind: SelectionKind, id: string) => void;
  toggleSelection: (kind: SelectionKind, id: string) => void;
  clearSelection: () => void;
  setHoverId: (id: string | null) => void;
  setViewport: (viewport: Viewport) => void;
  panBy: (dx: number, dy: number) => void;
  setView: (view: ViewMode) => void;
  setLeftPanel: (panel: LeftPanelId | null) => void;
  setRightPanel: (panel: RightPanelId | null) => void;
  toggleLeftCollapsed: () => void;
  toggleRightCollapsed: () => void;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
  setCanvasStyle: (canvasStyle: CanvasStyle) => void;
  openDialog: (dialog: DialogId) => void;
  closeDialog: () => void;
  pushToast: (message: string, kind?: ToastItem['kind'], detail?: string) => void;
  dismissToast: (id: string) => void;
  setAiOpen: (open: boolean) => void;
  setActiveSheet: (id: string | null) => void;
  setSpacePanning: (panning: boolean) => void;
  setPendingFurnitureSku: (skuId: string | null) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  tool: 'select',
  selection: EMPTY_SELECTION,
  hoverId: null,
  viewport: { x: 0, y: 0, scale: 1 },
  view: '2d',
  leftPanel: 'assets',
  rightPanel: 'properties',
  leftCollapsed: false,
  rightCollapsed: false,
  ...readUiPrefs(),
  activeDialog: null,
  toasts: [],
  aiOpen: false,
  activeSheetId: null,
  spacePanning: false,
  pendingFurnitureSkuId: null,

  setTool: (tool) => set({ tool }),
  setSelection: (kind, ids) => set({ selection: { kind, ids } }),
  selectOne: (kind, id) => set({ selection: { kind, ids: [id] } }),
  toggleSelection: (kind, id) => {
    const current = get().selection;
    if (current.kind !== kind) {
      set({ selection: { kind, ids: [id] } });
      return;
    }
    const has = current.ids.includes(id);
    const ids = has ? current.ids.filter((item) => item !== id) : [...current.ids, id];
    set({ selection: { kind: ids.length ? kind : 'none', ids } });
  },
  clearSelection: () => set({ selection: EMPTY_SELECTION }),
  setHoverId: (hoverId) => set({ hoverId }),
  setViewport: (viewport) => set({ viewport }),
  panBy: (dx, dy) =>
    set((state) => ({ viewport: { ...state.viewport, x: state.viewport.x + dx, y: state.viewport.y + dy } })),
  setView: (view) => set({ view }),
  setLeftPanel: (leftPanel) => set({ leftPanel, leftCollapsed: false }),
  setRightPanel: (rightPanel) => set({ rightPanel, rightCollapsed: false }),
  toggleLeftCollapsed: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),
  toggleRightCollapsed: () => set((state) => ({ rightCollapsed: !state.rightCollapsed })),
  setTheme: (theme) => {
    const { accent, canvasStyle } = get();
    set({ theme });
    applyTheme(theme, accent, canvasStyle);
  },
  setAccent: (accent) => {
    const { theme, canvasStyle } = get();
    set({ accent });
    applyTheme(theme, accent, canvasStyle);
  },
  setCanvasStyle: (canvasStyle) => {
    const { theme, accent } = get();
    set({ canvasStyle });
    applyTheme(theme, accent, canvasStyle);
  },
  openDialog: (activeDialog) => set({ activeDialog }),
  closeDialog: () => set({ activeDialog: null }),
  pushToast: (message, kind = 'info', detail) => {
    toastSeq += 1;
    const id = `toast-${Date.now().toString(36)}-${toastSeq}`;
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind, message, detail }] }));
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setActiveSheet: (activeSheetId) => set({ activeSheetId }),
  setSpacePanning: (spacePanning) => set({ spacePanning }),
  setPendingFurnitureSku: (pendingFurnitureSkuId) => set({ pendingFurnitureSkuId }),
}));

export function cursorPointToWorld(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}
