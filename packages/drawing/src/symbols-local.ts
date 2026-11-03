import type { FurnitureItem, MepKind } from '@hdesign/domain';

/**
 * Local symbol library used until `@hdesign/symbols` (workstream B) exposes its
 * renderer API. The adapter in `symbols.ts` prefers the shared package at runtime;
 * this file only provides deterministic fallback geometry.
 *
 * Coordinate system: symbols are authored in a 1000×1000 box for furniture and a
 * 24×24 box for MEP glyphs, centred on the box centre. `fill: 'body'` resolves to
 * the furniture body colour, `stroke: 'outline'` resolves to the plan ink colour.
 */

export interface SymbolPathDef {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface SymbolDef {
  key: string;
  /** Intrinsic logical width/height (symbol units). */
  w: number;
  d: number;
  paths: SymbolPathDef[];
  /** `shared` = came from @hdesign/symbols, `local` = fallback library. */
  origin?: 'shared' | 'local';
}

function box(key: string, paths: SymbolPathDef[]): SymbolDef {
  return { key, w: 1000, d: 1000, paths };
}

const FURNITURE: Record<string, SymbolDef> = {
  sofa: box('sofa', [
    { d: 'M70 200 H930 V840 H70 Z', fill: 'body' },
    { d: 'M70 140 H930 V260 H70 Z', fill: 'body', stroke: 'outline' },
    { d: 'M70 200 H180 V840 H70 Z', fill: 'body', stroke: 'outline' },
    { d: 'M820 200 H930 V840 H820 Z', fill: 'body', stroke: 'outline' },
    { d: 'M180 380 H500 V620 H180 Z M500 380 H820 V620 H500 Z', stroke: 'outline' },
    { d: 'M180 620 H820', stroke: 'outline' },
  ]),
  chair: box('chair', [
    { d: 'M230 300 H770 V820 H230 Z', fill: 'body' },
    { d: 'M230 300 H770 V390 H230 Z', fill: 'body', stroke: 'outline' },
    { d: 'M230 300 V180 H770 V300', stroke: 'outline' },
  ]),
  'bar-stool': box('bar-stool', [
    { d: 'M500 500 m-260 0 a260 260 0 1 0 520 0 a260 260 0 1 0 -520 0', fill: 'body' },
    { d: 'M500 240 V760 M240 500 H760', stroke: 'outline' },
  ]),
  table: box('table', [
    { d: 'M90 240 H910 V760 H90 Z', fill: 'body' },
    { d: 'M150 300 H850 V700 H150 Z', stroke: 'outline' },
  ]),
  bed: box('bed', [
    { d: 'M110 180 H890 V920 H110 Z', fill: 'body' },
    { d: 'M110 180 H890 V330 H110 Z', fill: 'body', stroke: 'outline' },
    { d: 'M190 370 H470 V540 H190 Z M530 370 H810 V540 H530 Z', stroke: 'outline' },
    { d: 'M110 620 H890', stroke: 'outline' },
  ]),
  'bed-single': box('bed-single', [
    { d: 'M180 180 H820 V920 H180 Z', fill: 'body' },
    { d: 'M180 180 H820 V330 H180 Z', fill: 'body', stroke: 'outline' },
    { d: 'M250 370 H750 V540 H250 Z', stroke: 'outline' },
    { d: 'M180 620 H820', stroke: 'outline' },
  ]),
  nightstand: box('nightstand', [
    { d: 'M180 180 H820 V820 H180 Z', fill: 'body' },
    { d: 'M180 500 H820', stroke: 'outline' },
    { d: 'M500 500 V820', stroke: 'outline' },
  ]),
  wardrobe: box('wardrobe', [
    { d: 'M80 160 H920 V860 H80 Z', fill: 'body' },
    { d: 'M80 500 H920', stroke: 'outline' },
    { d: 'M500 160 V860', stroke: 'outline' },
    { d: 'M460 320 H540 M460 680 H540', stroke: 'outline' },
  ]),
  bookshelf: box('bookshelf', [
    { d: 'M110 160 H890 V860 H110 Z', fill: 'body' },
    { d: 'M110 330 H890 M110 500 H890 M110 670 H890', stroke: 'outline' },
  ]),
  'tv-cabinet': box('tv-cabinet', [
    { d: 'M80 260 H920 V800 H80 Z', fill: 'body' },
    { d: 'M80 530 H920', stroke: 'outline' },
    { d: 'M460 530 H540', stroke: 'outline' },
  ]),
  tv: box('tv', [
    { d: 'M160 300 H840 V720 H160 Z', fill: 'body' },
    { d: 'M220 360 H780 V660 H220 Z', stroke: 'outline' },
  ]),
  'kitchen-counter': box('kitchen-counter', [
    { d: 'M80 220 H920 V800 H80 Z', fill: 'body' },
    { d: 'M80 220 H920 V330 H80 Z', stroke: 'outline' },
    { d: 'M620 430 m-120 0 a120 120 0 1 0 240 0 a120 120 0 1 0 -240 0', stroke: 'outline' },
    { d: 'M250 420 m-50 0 a50 50 0 1 0 100 0 a50 50 0 1 0 -100 0', stroke: 'outline' },
    { d: 'M250 640 m-50 0 a50 50 0 1 0 100 0 a50 50 0 1 0 -100 0', stroke: 'outline' },
  ]),
  fridge: box('fridge', [
    { d: 'M160 140 H840 V880 H160 Z', fill: 'body' },
    { d: 'M160 430 H840', stroke: 'outline' },
    { d: 'M220 260 H320 M220 540 H320', stroke: 'outline' },
  ]),
  shower: box('shower', [
    { d: 'M120 120 H880 V880 H120 Z', fill: 'body' },
    { d: 'M120 120 H380 V380 H120 Z', stroke: 'outline' },
    { d: 'M120 880 L500 500 M380 120 L880 620', stroke: 'outline' },
    { d: 'M700 700 m-60 0 a60 60 0 1 0 120 0 a60 60 0 1 0 -120 0', stroke: 'outline' },
  ]),
  toilet: box('toilet', [
    { d: 'M220 140 H780 V360 H220 Z', fill: 'body' },
    { d: 'M260 360 H740 C820 360 900 520 900 660 C900 820 780 900 500 900 C220 900 100 820 100 660 C100 520 180 360 260 360 Z', fill: 'body', stroke: 'outline' },
    { d: 'M300 620 H700 V760 H300 Z', stroke: 'outline' },
  ]),
  vanity: box('vanity', [
    { d: 'M100 200 H900 V820 H100 Z', fill: 'body' },
    { d: 'M300 380 H700 V660 H300 Z', stroke: 'outline' },
    { d: 'M460 380 H540 V280 H460 Z', stroke: 'outline' },
  ]),
  sink: box('sink', [
    { d: 'M140 220 H860 V780 H140 Z', fill: 'body' },
    { d: 'M260 340 H740 V660 H260 Z', stroke: 'outline' },
    { d: 'M460 340 H540 V240 H460 Z', stroke: 'outline' },
  ]),
  bathtub: box('bathtub', [
    { d: 'M120 180 H880 V820 H120 Z', fill: 'body' },
    { d: 'M220 280 H780 V720 H220 Z', stroke: 'outline' },
    { d: 'M500 280 V720', stroke: 'outline' },
  ]),
  'washing-machine': box('washing-machine', [
    { d: 'M160 160 H840 V840 H160 Z', fill: 'body' },
    { d: 'M500 560 m-220 0 a220 220 0 1 0 440 0 a220 220 0 1 0 -440 0', stroke: 'outline' },
    { d: 'M640 240 H780', stroke: 'outline' },
  ]),
  'range-hood': box('range-hood', [
    { d: 'M120 300 H880 V700 H120 Z', fill: 'body' },
    { d: 'M250 380 H750 M250 500 H750 M250 620 H750', stroke: 'outline' },
  ]),
  'floor-lamp': box('floor-lamp', [
    { d: 'M500 500 m-300 0 a300 300 0 1 0 600 0 a300 300 0 1 0 -600 0', fill: 'body', stroke: 'outline' },
    { d: 'M500 500 m-110 0 a110 110 0 1 0 220 0 a110 110 0 1 0 -220 0', stroke: 'outline' },
  ]),
  'table-lamp': box('table-lamp', [
    { d: 'M500 500 m-230 0 a230 230 0 1 0 460 0 a230 230 0 1 0 -460 0', fill: 'body', stroke: 'outline' },
    { d: 'M500 300 V700', stroke: 'outline' },
  ]),
  'pendant-light': box('pendant-light', [
    { d: 'M500 500 m-280 0 a280 280 0 1 0 560 0 a280 280 0 1 0 -560 0', fill: 'body', stroke: 'outline' },
    { d: 'M300 500 H700 M500 300 V700', stroke: 'outline' },
  ]),
  plant: box('plant', [
    { d: 'M500 620 m-180 0 a180 180 0 1 0 360 0 a180 180 0 1 0 -360 0', fill: 'body', stroke: 'outline' },
    { d: 'M500 440 C380 380 300 480 320 560 C400 560 460 500 500 440 Z', fill: 'body', stroke: 'outline' },
    { d: 'M500 440 C620 380 700 480 680 560 C600 560 540 500 500 440 Z', fill: 'body', stroke: 'outline' },
  ]),
  rug: box('rug', [
    { d: 'M60 120 H940 V880 H60 Z', fill: 'body', stroke: 'outline' },
    { d: 'M140 200 H860 V800 H140 Z', stroke: 'outline' },
  ]),
  mirror: box('mirror', [
    { d: 'M200 140 H800 V860 H200 Z', fill: 'body' },
    { d: 'M260 480 C360 260 560 260 740 480', stroke: 'outline' },
  ]),
  curtain: box('curtain', [
    { d: 'M120 100 H880 V900 H120 Z', fill: 'body' },
    { d: 'M260 100 C320 320 200 520 260 900 M500 100 C560 320 440 520 500 900 M740 100 C800 320 680 520 740 900', stroke: 'outline' },
  ]),
  ac: box('ac', [
    { d: 'M120 300 H880 V700 H120 Z', fill: 'body' },
    { d: 'M200 400 H800 M200 500 H800 M200 600 H800', stroke: 'outline' },
  ]),
  'water-heater': box('water-heater', [
    { d: 'M500 500 m-330 0 a330 330 0 1 0 660 0 a330 330 0 1 0 -660 0', fill: 'body', stroke: 'outline' },
    { d: 'M340 500 H660', stroke: 'outline' },
  ]),
  'shoe-cabinet': box('shoe-cabinet', [
    { d: 'M80 280 H920 V780 H80 Z', fill: 'body' },
    { d: 'M80 530 H920', stroke: 'outline' },
  ]),
  sideboard: box('sideboard', [
    { d: 'M60 280 H940 V780 H60 Z', fill: 'body' },
    { d: 'M500 280 V780', stroke: 'outline' },
    { d: 'M340 280 V780 M660 280 V780', stroke: 'outline' },
  ]),
  bench: box('bench', [
    { d: 'M100 300 H900 V700 H100 Z', fill: 'body' },
    { d: 'M100 500 H900', stroke: 'outline' },
  ]),
  'kids-bed': box('kids-bed', [
    { d: 'M180 180 H820 V920 H180 Z', fill: 'body' },
    { d: 'M180 180 H820 V330 H180 Z', fill: 'body', stroke: 'outline' },
    { d: 'M250 380 H750 V560 H250 Z', stroke: 'outline' },
    { d: 'M180 650 H820', stroke: 'outline' },
  ]),
  generic: box('generic', [
    { d: 'M120 120 H880 V880 H120 Z', fill: 'body' },
    { d: 'M120 120 L880 880 M880 120 L120 880', stroke: 'outline' },
  ]),
};

const FURNITURE_ALIASES: Array<[RegExp, string]> = [
  [/sofa|沙发/, 'sofa'],
  [/coffee-table|茶几/, 'table'],
  [/dining-table|餐桌|书桌|desk|桌子/, 'table'],
  [/dining-chair|chair|椅|stool|凳|bench/, 'chair'],
  [/bed-single|单人床/, 'bed-single'],
  [/bed|床/, 'bed'],
  [/nightstand|床头柜/, 'nightstand'],
  [/wardrobe|衣柜|closet/, 'wardrobe'],
  [/bookshelf|书架/, 'bookshelf'],
  [/tv-cabinet|电视柜/, 'tv-cabinet'],
  [/^tv$|-tv|电视/, 'tv'],
  [/kitchen-counter|橱柜|地柜|counter/, 'kitchen-counter'],
  [/fridge|冰箱/, 'fridge'],
  [/shower|淋浴/, 'shower'],
  [/toilet|马桶/, 'toilet'],
  [/vanity|浴室柜/, 'vanity'],
  [/sink|洗手盆|水槽/, 'sink'],
  [/bathtub|浴缸/, 'bathtub'],
  [/washing|洗衣机/, 'washing-machine'],
  [/range-hood|油烟机/, 'range-hood'],
  [/floor-lamp|落地灯/, 'floor-lamp'],
  [/table-lamp|台灯/, 'table-lamp'],
  [/pendant|吊灯/, 'pendant-light'],
  [/plant|绿植|花/, 'plant'],
  [/rug|地毯/, 'rug'],
  [/mirror|镜/, 'mirror'],
  [/curtain|窗帘/, 'curtain'],
  [/\bac\b|空调/, 'ac'],
  [/water-heater|热水器/, 'water-heater'],
  [/shoe|鞋柜/, 'shoe-cabinet'],
  [/sideboard|餐边柜/, 'sideboard'],
];

export function localFurnitureSymbol(key: string): SymbolDef {
  const bySku = FURNITURE[key];
  if (bySku) return bySku;
  for (const [pattern, alias] of FURNITURE_ALIASES) {
    if (pattern.test(key)) {
      const symbol = FURNITURE[alias];
      if (symbol) return symbol;
    }
  }
  return FURNITURE.generic!;
}

/** MEP glyphs authored in a 24×24 box. */
const MEP: Record<MepKind, SymbolDef> = {
  socket: {
    key: 'socket',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M9 8.5 V12 M15 8.5 V12 M9 15.5 H15', stroke: 'outline', strokeWidth: 1.6 },
    ],
  },
  'socket-16a': {
    key: 'socket-16a',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 2.5 A9.5 9.5 0 1 0 12 21.5 A9.5 9.5 0 1 0 12 2.5 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M12 2.5 A4 4 0 0 1 12 10.5', stroke: 'outline', strokeWidth: 1.4 },
      { d: 'M9 8 V11.5 M15 8 V11.5 M9 16 H15', stroke: 'outline', strokeWidth: 1.8 },
    ],
  },
  switch: {
    key: 'switch',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 9 A7 7 0 1 0 12 23 A7 7 0 1 0 12 9 Z', fill: 'none', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M12 9 V2', stroke: 'outline', strokeWidth: 1.8 },
    ],
  },
  'switch-double': {
    key: 'switch-double',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 9 A7 7 0 1 0 12 23 A7 7 0 1 0 12 9 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M8.5 9 L6 2 M15.5 9 L18 2', stroke: 'outline', strokeWidth: 1.6 },
    ],
  },
  light: {
    key: 'light',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 5 A7 7 0 1 0 12 19 A7 7 0 1 0 12 5 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M12 1.5 V5 M12 19 V22.5 M1.5 12 H5 M19 12 H22.5', stroke: 'outline', strokeWidth: 1.6 },
    ],
  },
  'light-spot': {
    key: 'light-spot',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4 Z', stroke: 'outline', strokeWidth: 1.5 },
      { d: 'M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 Z', fill: 'outline' },
    ],
  },
  ac: {
    key: 'ac',
    w: 24,
    d: 24,
    paths: [
      { d: 'M2.5 5 H21.5 V19 H2.5 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M6 8.5 C9 10 9 14 6 15.5 M12 8.5 C15 10 15 14 12 15.5 M18 8.5 C21 10 21 14 18 15.5', stroke: 'outline', strokeWidth: 1.3 },
    ],
  },
  'weak-current': {
    key: 'weak-current',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 3 L21 20 H3 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M12 9 V15 M8.5 16 H15.5', stroke: 'outline', strokeWidth: 1.4 },
    ],
  },
  'water-cold': {
    key: 'water-cold',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M6.5 12 C8.5 9.5 10.5 14.5 12.5 12 C14.5 9.5 16.5 14.5 18.5 12', stroke: 'outline', strokeWidth: 1.5 },
    ],
  },
  'water-hot': {
    key: 'water-hot',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M6.5 10.5 C8.5 8 10.5 13 12.5 10.5 C14.5 8 16.5 13 18.5 10.5', stroke: 'outline', strokeWidth: 1.5 },
      { d: 'M6.5 15.5 C8.5 13 10.5 18 12.5 15.5 C14.5 13 16.5 18 18.5 15.5', stroke: 'outline', strokeWidth: 1.5 },
    ],
  },
  drain: {
    key: 'drain',
    w: 24,
    d: 24,
    paths: [
      { d: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M7 7 L17 17 M17 7 L7 17', stroke: 'outline', strokeWidth: 1.5 },
    ],
  },
  'floor-drain': {
    key: 'floor-drain',
    w: 24,
    d: 24,
    paths: [
      { d: 'M4 4 H20 V20 H4 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M7 7 L17 17 M17 7 L7 17', stroke: 'outline', strokeWidth: 1.4 },
    ],
  },
  gas: {
    key: 'gas',
    w: 24,
    d: 24,
    paths: [
      { d: 'M4 6 H20 V18 H4 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M9 15 C9 11 12 10 12 6 C15 9 16 13 14 15 C12.5 16.5 9.5 16.5 9 15 Z', stroke: 'outline', strokeWidth: 1.3 },
    ],
  },
  'floor-heat': {
    key: 'floor-heat',
    w: 24,
    d: 24,
    paths: [
      { d: 'M3 5 H21 V19 H3 Z', stroke: 'outline', strokeWidth: 1.6 },
      { d: 'M6 9 C8 7 10 11 12 9 C14 7 16 11 18 9 M6 14 C8 12 10 16 12 14 C14 12 16 16 18 14', stroke: 'outline', strokeWidth: 1.3 },
    ],
  },
};

export function localMepSymbol(kind: MepKind): SymbolDef {
  return MEP[kind] ?? MEP.light;
}

export type { FurnitureItem };
