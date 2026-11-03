import type {
  DesignBrief,
  DesignPatch,
  FurnitureItem,
  MepDevice,
  Project,
  RoomType,
} from '@hdesign/domain';

export interface LayoutOptions {
  styleId: string;
  mode: 'fill-empty' | 'replace';
  seed?: number;
  brief?: DesignBrief;
  /** Overrides inferred room types; keyed by room id. */
  roomTypes?: Record<string, RoomType>;
}

export interface LayoutResult {
  /** New furniture to add (ids already generated). Caller removes old items in replace mode. */
  furniture: FurnitureItem[];
  diagnostics: string[];
}

export interface MepOptions {
  mode?: 'fill' | 'replace';
  styleId?: string;
  brief?: DesignBrief;
}

export interface MepResult {
  devices: MepDevice[];
  diagnostics: string[];
}

/** Deterministic room-by-room furniture placement. Implemented by workstream B. */
export type GenerateLayout = (project: Project, options: LayoutOptions) => LayoutResult;

/** Rule-based water/electric point generation. Implemented by workstream B. */
export type GenerateMep = (project: Project, options?: MepOptions) => MepResult;

/** Applies a validated AI brief through the local layout engine. Implemented in apps/web. */
export type ApplyBrief = (project: Project, brief: DesignBrief) => { furniture: FurnitureItem[]; diagnostics: string[] };
