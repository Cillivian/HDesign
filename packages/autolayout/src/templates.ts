import type { FurnitureCategory } from '@hdesign/catalog';
import type { RoomType } from '@hdesign/domain';

/**
 * Per-room furniture programme. Slots are ordered: earlier slots anchor later
 * relative placements (coffee table in front of the sofa, chairs around the
 * dining table, nightstands beside the bed…).
 */
export interface SlotSpec {
  role: string;
  category: FurnitureCategory;
  /** Explicit catalogue pick (wins over style preference). */
  skuId?: string;
  /** Style preference candidates, filtered by category + room type. */
  skuIds?: string[];
  placement: 'wall' | 'corner' | 'center' | 'front' | 'beside' | 'around';
  /** Role of the anchor item for relative placements. */
  anchor?: string;
  side?: 'left' | 'right' | 'both';
  /** Clearance gap from the anchor in mm. */
  gap?: number;
  /** Item count for `around` (chairs) / `beside` placements. */
  count?: number;
  wallPreference?: 'longest' | 'opposite-door' | 'opposite-anchor' | 'window' | 'shortest' | 'any';
  centerOnWall?: boolean;
  /** Skip the slot in fill-empty mode when the room already has this category. */
  dedupeCategory?: boolean;
  tall?: boolean;
  required?: boolean;
  /** Human-readable reason surfaced in diagnostics when the slot is skipped. */
  label?: string;
}

const wall = (
  role: string,
  category: FurnitureCategory,
  extra: Partial<SlotSpec> = {},
): SlotSpec => ({
  role,
  category,
  placement: 'wall',
  dedupeCategory: true,
  ...extra,
});

const center = (
  role: string,
  category: FurnitureCategory,
  extra: Partial<SlotSpec> = {},
): SlotSpec => ({
  role,
  category,
  placement: 'center',
  dedupeCategory: true,
  ...extra,
});

const corner = (
  role: string,
  category: FurnitureCategory,
  extra: Partial<SlotSpec> = {},
): SlotSpec => ({
  role,
  category,
  placement: 'corner',
  dedupeCategory: true,
  ...extra,
});

const relative = (
  role: string,
  category: FurnitureCategory,
  placement: 'front' | 'beside' | 'around',
  anchor: string,
  extra: Partial<SlotSpec> = {},
): SlotSpec => ({
  role,
  category,
  placement,
  anchor,
  dedupeCategory: false,
  ...extra,
});

/** Room programme for a room type + area. Order is placement order. */
export function slotsForRoom(roomType: RoomType, areaSqm: number): SlotSpec[] {
  switch (roomType) {
    case 'living':
      return livingSlots(areaSqm);
    case 'master-bedroom':
      return masterBedroomSlots(areaSqm);
    case 'bedroom':
      return bedroomSlots(areaSqm);
    case 'kids-room':
      return kidsRoomSlots(areaSqm);
    case 'dining':
      return diningSlots(areaSqm);
    case 'kitchen':
      return kitchenSlots(areaSqm);
    case 'bath':
      return bathSlots(areaSqm);
    case 'entry':
      return entrySlots(areaSqm);
    case 'study':
      return studySlots(areaSqm);
    case 'balcony':
      return balconySlots(areaSqm);
    case 'corridor':
      return corridorSlots(areaSqm);
    default:
      return otherSlots(areaSqm);
  }
}

function livingSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('tv-cabinet', 'storage', { skuIds: ['tv-cabinet', 'tv-cabinet-float'], wallPreference: 'longest', required: true, label: '电视柜' }),
    wall('sofa', 'sofa', {
      skuIds: ['sofa-3', 'sofa-2', 'sofa-module', 'sofa-l'],
      wallPreference: 'opposite-anchor',
      centerOnWall: true,
      required: true,
      label: '沙发',
    }),
    center('rug', 'textile', { skuIds: ['rug'], label: '地毯' }),
    relative('coffee-table', 'table', 'front', 'sofa', { skuIds: ['coffee-table', 'coffee-table-round'], gap: 420, required: true, label: '茶几' }),
    corner('floor-lamp', 'lighting', { skuIds: ['floor-lamp'], label: '落地灯' }),
    corner('plant', 'plant', { skuIds: ['plant', 'plant-large'], side: 'right', label: '绿植' }),
  ];
  if (area >= 18) {
    slots.push(wall('sideboard', 'storage', { skuIds: ['sideboard', 'sideboard-glass'], wallPreference: 'longest', label: '餐边柜' }));
  }
  if (area >= 24) {
    slots.push(wall('armchair', 'sofa', { skuIds: ['armchair', 'sofa-single'], wallPreference: 'any', label: '单椅' }));
  }
  if (area >= 26) {
    slots.push(center('dining-table', 'table', { skuIds: ['dining-table', 'dining-table-6'], label: '餐桌' }));
    slots.push(
      relative('dining-chair', 'chair', 'around', 'dining-table', {
        skuIds: ['dining-chair', 'dining-chair-wood'],
        count: area >= 34 ? 6 : 4,
        gap: 80,
        label: '餐椅',
      }),
    );
    slots.push(center('pendant-light', 'lighting', { skuIds: ['pendant-light', 'chandelier'], label: '吊灯' }));
  }
  if (area >= 30) {
    slots.push(wall('bookshelf', 'storage', { skuIds: ['bookshelf', 'bookshelf-wide'], wallPreference: 'longest', label: '书架' }));
  }
  return slots;
}

function masterBedroomSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('bed', 'bed', { skuIds: ['bed-double', 'bed-king', 'bed-double-wood', 'bed-tatami'], wallPreference: 'opposite-door', centerOnWall: true, required: true, label: '双人床' }),
    relative('nightstand-left', 'storage', 'beside', 'bed', { skuIds: ['nightstand'], side: 'left', gap: 60, label: '床头柜' }),
    relative('nightstand-right', 'storage', 'beside', 'bed', { skuIds: ['nightstand'], side: 'right', gap: 60, label: '床头柜' }),
    wall('wardrobe', 'storage', { skuIds: ['wardrobe', 'wardrobe-sliding'], wallPreference: 'longest', required: true, label: '衣柜' }),
    relative('rug', 'textile', 'front', 'bed', { skuIds: ['rug', 'rug-bedroom'], gap: 500, label: '地毯' }),
  ];
  if (area >= 12) {
    slots.push(wall('dresser', 'storage', { skuIds: ['dresser'], wallPreference: 'longest', label: '斗柜' }));
  }
  if (area >= 15) {
    slots.push(wall('desk', 'table', { skuIds: ['desk', 'dressing-table'], wallPreference: 'window', label: '书桌' }));
    slots.push(relative('desk-chair', 'chair', 'around', 'desk', { skuIds: ['desk-chair', 'chair'], count: 1, gap: 60, label: '书椅' }));
  }
  if (area >= 19) {
    slots.push(relative('bench', 'chair', 'front', 'bed', { skuIds: ['bench', 'ottoman'], gap: 260, label: '床尾凳' }));
  }
  if (area >= 22) {
    slots.push(corner('plant', 'plant', { skuIds: ['plant', 'plant-large'], label: '绿植' }));
  }
  return slots;
}

function bedroomSlots(area: number): SlotSpec[] {
  const bedSku = area >= 11 ? 'bed-double' : 'bed-single';
  const slots: SlotSpec[] = [
    wall('bed', 'bed', { skuIds: [bedSku, 'bed-single', 'bed-double'], wallPreference: 'opposite-door', centerOnWall: true, required: true, label: '床' }),
    relative('nightstand', 'storage', 'beside', 'bed', { skuIds: ['nightstand'], side: 'left', gap: 60, label: '床头柜' }),
    wall('wardrobe', 'storage', { skuIds: ['wardrobe', 'wardrobe-sliding'], wallPreference: 'longest', label: '衣柜' }),
    relative('rug', 'textile', 'front', 'bed', { skuIds: ['rug', 'rug-bedroom'], gap: 480, label: '地毯' }),
  ];
  if (area >= 10) {
    slots.push(wall('desk', 'table', { skuIds: ['desk', 'study-table'], wallPreference: 'window', label: '书桌' }));
    slots.push(relative('desk-chair', 'chair', 'around', 'desk', { skuIds: ['chair', 'desk-chair'], count: 1, gap: 50, label: '书椅' }));
  }
  if (area >= 13) {
    slots.push(wall('bookshelf', 'storage', { skuIds: ['bookshelf'], wallPreference: 'longest', label: '书架' }));
  }
  return slots;
}

function kidsRoomSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('kids-bed', 'bed', { skuIds: ['kids-bed', 'bed-single'], wallPreference: 'opposite-door', centerOnWall: true, required: true, label: '儿童床' }),
    wall('wardrobe', 'storage', { skuIds: ['wardrobe', 'shoe-cabinet-tall'], wallPreference: 'longest', label: '衣柜' }),
  ];
  if (area >= 8) {
    slots.push(wall('kids-desk', 'table', { skuIds: ['study-table', 'desk'], wallPreference: 'window', label: '学习桌' }));
    slots.push(relative('kids-chair', 'chair', 'around', 'kids-desk', { skuIds: ['kids-chair', 'chair'], count: 1, gap: 40, label: '儿童椅' }));
  }
  slots.push(wall('bookshelf', 'storage', { skuIds: ['bookshelf'], wallPreference: 'longest', label: '书架' }));
  slots.push(center('rug', 'textile', { skuIds: ['rug-round', 'rug'], label: '地毯' }));
  slots.push(wall('toy-box', 'storage', { skuIds: ['toy-box', 'cabinet'], wallPreference: 'shortest', label: '玩具收纳' }));
  return slots;
}

function diningSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    center('dining-table', 'table', { skuIds: ['dining-table', 'dining-table-round', 'dining-table-6'], required: true, label: '餐桌' }),
    relative('dining-chair', 'chair', 'around', 'dining-table', {
      skuIds: ['dining-chair', 'dining-chair-wood'],
      count: area >= 14 ? 6 : 4,
      gap: 80,
      label: '餐椅',
    }),
    wall('sideboard', 'storage', { skuIds: ['sideboard', 'sideboard-glass'], wallPreference: 'longest', label: '餐边柜' }),
    center('pendant-light', 'lighting', { skuIds: ['pendant-light', 'chandelier'], label: '吊灯' }),
    center('rug', 'textile', { skuIds: ['rug', 'rug-round'], label: '地毯' }),
    corner('plant', 'plant', { skuIds: ['plant', 'plant-small'], label: '绿植' }),
  ];
  return slots;
}

function kitchenSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('kitchen-counter', 'kitchen', { skuIds: ['kitchen-counter', 'kitchen-counter-1800'], wallPreference: 'longest', required: true, label: '橱柜' }),
    wall('kitchen-counter-2', 'kitchen', { skuIds: ['kitchen-counter-1800', 'kitchen-counter'], wallPreference: 'longest', label: '橱柜' }),
    wall('fridge', 'kitchen', { skuIds: ['fridge', 'fridge-french'], wallPreference: 'shortest', required: true, label: '冰箱' }),
    wall('range-hood', 'kitchen', { skuIds: ['range-hood'], wallPreference: 'any', label: '油烟机' }),
  ];
  if (area >= 12) {
    slots.push(center('kitchen-island', 'kitchen', { skuIds: ['kitchen-island', 'kitchen-island-small'], label: '中岛' }));
  }
  slots.push(corner('plant-small', 'plant', { skuIds: ['plant-small'], label: '绿植' }));
  return slots;
}

function bathSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    corner('shower', 'bath', { skuIds: ['shower', 'shower-screen'], required: true, label: '淋浴' }),
    wall('toilet', 'bath', { skuIds: ['toilet', 'toilet-wall'], wallPreference: 'shortest', required: true, label: '马桶' }),
    wall('vanity', 'bath', { skuIds: ['vanity', 'vanity-double'], wallPreference: 'longest', required: true, label: '浴室柜' }),
  ];
  if (area >= 5) {
    slots.push(wall('washing-machine', 'bath', { skuIds: ['washing-machine'], wallPreference: 'any', label: '洗衣机' }));
  }
  slots.push(wall('mirror', 'bath', { skuIds: ['mirror'], wallPreference: 'any', label: '浴室镜' }));
  slots.push(wall('towel-rack', 'bath', { skuIds: ['towel-rack'], wallPreference: 'shortest', label: '毛巾架' }));
  if (area >= 4) {
    slots.push(wall('water-heater', 'bath', { skuIds: ['water-heater'], wallPreference: 'any', label: '热水器' }));
  }
  if (area >= 6) {
    slots.push(corner('plant-small', 'plant', { skuIds: ['plant-small'], label: '绿植' }));
  }
  return slots;
}

function entrySlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('shoe-cabinet', 'storage', { skuIds: ['shoe-cabinet', 'shoe-cabinet-tall'], wallPreference: 'longest', required: true, label: '鞋柜' }),
    wall('bench', 'chair', { skuIds: ['bench', 'stool'], wallPreference: 'shortest', label: '换鞋凳' }),
    wall('mirror', 'decor', { skuIds: ['mirror-decor', 'mirror'], wallPreference: 'any', label: '穿衣镜' }),
    corner('coat-rack', 'storage', { skuIds: ['coat-rack'], label: '衣帽架' }),
    center('rug', 'textile', { skuIds: ['rug-runner', 'doormat'], label: '地垫' }),
  ];
  if (area >= 3) {
    slots.push(corner('plant', 'plant', { skuIds: ['plant-small', 'plant'], label: '绿植' }));
  }
  return slots;
}

function studySlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('desk', 'table', { skuIds: ['desk', 'desk-long', 'desk-standing'], wallPreference: 'window', centerOnWall: true, required: true, label: '书桌' }),
    relative('desk-chair', 'chair', 'around', 'desk', { skuIds: ['desk-chair', 'chair'], count: 1, gap: 60, label: '办公椅' }),
    wall('bookshelf', 'storage', { skuIds: ['bookshelf', 'bookshelf-wide'], wallPreference: 'longest', label: '书架' }),
    corner('floor-lamp', 'lighting', { skuIds: ['floor-lamp', 'desk-lamp'], label: '落地灯' }),
    center('rug', 'textile', { skuIds: ['rug', 'rug-runner'], label: '地毯' }),
  ];
  if (area >= 8) {
    slots.push(wall('side-table', 'table', { skuIds: ['side-table', 'cabinet'], wallPreference: 'shortest', label: '边几' }));
  }
  slots.push(corner('plant', 'plant', { skuIds: ['plant', 'plant-small'], label: '绿植' }));
  return slots;
}

function balconySlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('washing-machine', 'bath', { skuIds: ['washing-machine'], wallPreference: 'longest', required: true, label: '洗衣机' }),
    corner('plant-large', 'plant', { skuIds: ['plant-large', 'plant'], label: '大型绿植' }),
    wall('bench', 'chair', { skuIds: ['bench', 'folding-chair'], wallPreference: 'shortest', label: '休闲凳' }),
    center('rug', 'textile', { skuIds: ['rug-runner', 'doormat'], label: '地垫' }),
  ];
  if (area >= 6) {
    slots.push(wall('laundry-cabinet', 'storage', { skuIds: ['laundry-cabinet'], wallPreference: 'longest', label: '洗衣柜' }));
    slots.push(corner('plant', 'plant', { skuIds: ['plant-small', 'plant'], label: '绿植' }));
  }
  return slots;
}

function corridorSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('console-table', 'table', { skuIds: ['console-table', 'side-table'], wallPreference: 'longest', label: '玄关桌' }),
    center('rug', 'textile', { skuIds: ['rug-runner'], label: '地毯' }),
    corner('plant', 'plant', { skuIds: ['plant-small'], label: '绿植' }),
  ];
  if (area >= 4) {
    slots.push(wall('shoe-cabinet', 'storage', { skuIds: ['shoe-cabinet', 'shoe-rack'], wallPreference: 'shortest', label: '鞋柜' }));
  }
  return slots;
}

function otherSlots(area: number): SlotSpec[] {
  const slots: SlotSpec[] = [
    wall('table', 'table', { skuIds: ['desk', 'dining-table', 'side-table'], wallPreference: 'longest', label: '桌' }),
    relative('chair', 'chair', 'around', 'table', { skuIds: ['chair', 'dining-chair'], count: 1, gap: 60, label: '椅' }),
  ];
  if (area >= 6) slots.push(corner('plant', 'plant', { skuIds: ['plant-small'], label: '绿植' }));
  return slots;
}
