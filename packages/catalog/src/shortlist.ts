import type { DesignBrief, RoomType } from '@hdesign/domain';
import type { FurnitureCategory, FurnitureSku } from './types';
import { FURNITURE, getFurnitureSku } from './furniture';
import { getStylePreset } from './styles';

/**
 * Room-aware catalogue shortlist used by the assets panel and the AI adapter.
 *
 * `catalogShortlist(roomType, brief?)` returns every SKU usable in the room,
 * ordered by fit: brief furniture picks first, then style-tag matches, then
 * program keyword matches. Deterministic (id tie-breaker).
 */
export function catalogShortlist(roomType: RoomType, brief?: DesignBrief): FurnitureSku[] {
  const candidates = FURNITURE.filter((sku) => sku.roomTypes.includes(roomType));
  if (!brief) return candidates;

  const styleId = brief.style.presetId;
  const preset = styleId ? getStylePreset(styleId) : undefined;
  const briefFurniture = brief.furniture;
  const roomBrief = brief.rooms.find((room) => room.type === roomType);
  const programs = (roomBrief?.program ?? []).map((entry) => entry.toLowerCase());

  const score = (sku: FurnitureSku): number => {
    let total = 0;
    for (const entry of briefFurniture) {
      if (entry.skuId === sku.id) total += 60;
      else if (entry.category === sku.category) total += 22;
      if (entry.sizeHint?.w && Math.abs(entry.sizeHint.w - sku.w) < 120) total += 6;
    }
    if (preset) {
      if (sku.styleTags.includes(preset.id)) total += 18;
      const preferred = preset.furniturePreference[sku.category];
      if (preferred?.includes(sku.id)) total += 12;
    }
    for (const program of programs) {
      if (program === sku.category || program.includes(sku.category)) total += 10;
      if (program.includes(sku.name)) total += 8;
    }
    if (brief.constraints.children && sku.roomTypes.includes('kids-room')) total += 3;
    const priceMid = (sku.priceRange[0] + sku.priceRange[1]) / 2;
    if (brief.budget.level === '经济') total -= priceMid / 20000;
    if (brief.budget.level === '轻奢') total += priceMid / 30000;
    return total;
  };

  return [...candidates].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
}

/** Resolve a brief's furniture pick to concrete SKUs, qty expanded. */
export function resolveBriefFurniture(brief: DesignBrief, roomType: RoomType): FurnitureSku[] {
  const result: FurnitureSku[] = [];
  for (const entry of brief.furniture) {
    if (entry.skuId) {
      const sku = getFurnitureSku(entry.skuId);
      if (sku) {
        for (let index = 0; index < entry.qty; index += 1) result.push(sku);
        continue;
      }
    }
    const match = catalogShortlist(roomType, brief).find(
      (sku) => sku.category === (entry.category as FurnitureCategory),
    );
    if (match) {
      for (let index = 0; index < entry.qty; index += 1) result.push(match);
    }
  }
  return result;
}
