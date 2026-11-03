import type { RoomType, StyleTokenKey } from '@hdesign/domain';

export type FurnitureCategory =
  | 'bed'
  | 'sofa'
  | 'table'
  | 'chair'
  | 'storage'
  | 'kitchen'
  | 'bath'
  | 'appliance'
  | 'lighting'
  | 'textile'
  | 'decor'
  | 'plant';

export interface FurnitureSku {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** Default footprint in mm. */
  w: number;
  d: number;
  h: number;
  /** Symbol key resolved by @hdesign/symbols. */
  symbol: string;
  /** 3D builder key resolved by apps/web/src/scene3d. */
  builder: string;
  color: string;
  priceRange: [number, number];
  styleTags: string[];
  materialSlots: string[];
  wallMounted: boolean;
  collisionExempt?: boolean;
  roomTypes: RoomType[];
}

export type MaterialScope = 'floor' | 'wall' | 'ceiling' | 'joinery' | 'countertop' | 'metal' | 'fabric';

export interface MaterialDef {
  id: string;
  name: string;
  scope: MaterialScope;
  color: string;
  pricePerSqm?: number;
  /** e.g. wood, tile, paint, stone */
  type: string;
  tags: string[];
}

export type StyleTokens = Record<StyleTokenKey, string>;

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  tokens: StyleTokens;
  materials: Partial<Record<MaterialScope, string>>;
  lighting: { temperature: number; intensity: number };
  /** Furniture preference by category; used by autolayout + AI. */
  furniturePreference: Partial<Record<FurnitureCategory, string[]>>;
  moodKeywords: string[];
}
