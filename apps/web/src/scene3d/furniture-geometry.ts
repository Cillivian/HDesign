import type { FurnitureItem } from '@hdesign/domain';

/**
 * Parametric low-poly furniture builders.
 *
 * `buildFurnitureParts` returns primitives in the item's local space:
 * x spans the item width, z the depth, y is up from the floor (all mm).
 * The component layer turns them into three.js meshes with a shared material per
 * tone, so an unknown catalogue SKU always degrades to a generic box.
 */

export const FURNITURE_BUILDERS = [
  'bed',
  'sofa',
  'table',
  'chair',
  'wardrobe',
  'bookshelf',
  'nightstand',
  'desk',
  'counter',
  'sink',
  'fridge',
  'tv',
  'rug',
  'plant',
  'lamp',
  'toilet',
  'shower',
  'vanity',
  'bathtub',
  'washing-machine',
  'range-hood',
  'stove',
  'stool',
  'bench',
  'mirror',
  'generic',
] as const;

export type FurnitureBuilderKey = (typeof FURNITURE_BUILDERS)[number];

export type PartTone =
  | 'primary'
  | 'primaryDark'
  | 'primaryLight'
  | 'secondary'
  | 'metal'
  | 'glass'
  | 'fabric'
  | 'accent'
  | 'emissive'
  | 'foliage'
  | 'white'
  | 'dark'
  | 'stone';

export type FurniturePartShape =
  | { kind: 'box'; size: [number, number, number] }
  | { kind: 'cylinder'; radius: number; radiusTop?: number; height: number; segments?: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'cone'; radius: number; height: number };

export interface FurniturePart {
  key: string;
  shape: FurniturePartShape;
  /** Local space position, mm. */
  position: [number, number, number];
  rotation?: [number, number, number];
  tone: PartTone;
}

export interface FurnitureBuild {
  builder: FurnitureBuilderKey;
  parts: FurniturePart[];
}

type RawPart = Omit<FurniturePart, 'key'>;

const MIN = 6;
const positive = (value: number, fallback = MIN): number => (Number.isFinite(value) && value > fallback ? value : fallback);

function box(
  size: [number, number, number],
  position: [number, number, number],
  tone: PartTone = 'primary',
  rotation?: [number, number, number],
): RawPart {
  return {
    shape: { kind: 'box', size: [positive(size[0]), positive(size[1]), positive(size[2])] },
    position,
    tone,
    rotation,
  };
}

function cylinder(
  radius: number,
  height: number,
  position: [number, number, number],
  tone: PartTone = 'primaryDark',
  radiusTop?: number,
  rotation?: [number, number, number],
): RawPart {
  return {
    shape: {
      kind: 'cylinder',
      radius: positive(radius, 4),
      radiusTop: radiusTop === undefined ? undefined : positive(radiusTop, 4),
      height: positive(height, 4),
      segments: 16,
    },
    position,
    tone,
    rotation,
  };
}

function sphere(radius: number, position: [number, number, number], tone: PartTone = 'foliage'): RawPart {
  return { shape: { kind: 'sphere', radius: positive(radius, 4) }, position, tone };
}

function legs4(
  width: number,
  depth: number,
  height: number,
  inset: number,
  thickness: number,
  tone: PartTone = 'primaryDark',
): RawPart[] {
  const x = Math.max(0, width / 2 - inset - thickness / 2);
  const z = Math.max(0, depth / 2 - inset - thickness / 2);
  const y = height / 2;
  return [
    box([thickness, height, thickness], [-x, y, -z], tone),
    box([thickness, height, thickness], [x, y, -z], tone),
    box([thickness, height, thickness], [-x, y, z], tone),
    box([thickness, height, thickness], [x, y, z], tone),
  ];
}

type Builder = (w: number, d: number, h: number) => RawPart[];

const BUILDERS: Record<FurnitureBuilderKey, Builder> = {
  bed: (w, d, h) => {
    const baseH = Math.min(Math.max(h * 0.28, 150), 360);
    const headH = Math.min(Math.max(h * 0.86, 520), 1250);
    const mattressH = Math.min(Math.max(h * 0.16, 120), 260);
    const mattressY = baseH + mattressH / 2;
    const headDepth = Math.min(Math.max(d * 0.06, 60), 120);
    return [
      box([w * 0.98, baseH, d * 0.97], [0, baseH / 2, 0], 'primaryDark'),
      box([w * 0.92, mattressH, d * 0.86], [0, mattressY, d * 0.02], 'white'),
      box([w, headH, headDepth], [0, headH / 2, -d / 2 + headDepth / 2], 'primary'),
      box([w * 0.34, 130, d * 0.2], [w * 0.21, mattressY + mattressH / 2 + 70, -d * 0.31], 'white'),
      box([w * 0.34, 130, d * 0.2], [-w * 0.21, mattressY + mattressH / 2 + 70, -d * 0.31], 'white'),
      box([w * 0.8, 45, d * 0.5], [0, mattressY + mattressH / 2 + 24, d * 0.16], 'fabric'),
    ];
  },
  sofa: (w, d, h) => {
    const baseH = Math.min(Math.max(h * 0.42, 280), 420);
    const backH = Math.min(Math.max(h, 600), 900);
    const armW = Math.min(Math.max(w * 0.09, 90), 200);
    const armH = Math.min(Math.max(h * 0.62, 420), 680);
    const backDepth = Math.min(Math.max(d * 0.2, 120), 260);
    const cushionDepth = Math.max(d - backDepth - 40, 120);
    return [
      box([w, baseH, d], [0, baseH / 2, 0], 'primaryDark'),
      box([w, backH, backDepth], [0, backH / 2, -d / 2 + backDepth / 2], 'primary'),
      box([armW, armH, d], [-w / 2 + armW / 2, armH / 2, 0], 'primary'),
      box([armW, armH, d], [w / 2 - armW / 2, armH / 2, 0], 'primary'),
      box([w - armW * 2 - 20, 90, cushionDepth], [0, baseH + 45, 18], 'fabric'),
      box([(w - armW * 2 - 40) / 2, 90, cushionDepth * 0.8], [-(w / 4 - armW / 2), baseH + 92, 16], 'fabric'),
      box([(w - armW * 2 - 40) / 2, 90, cushionDepth * 0.8], [w / 4 - armW / 2, baseH + 92, 16], 'fabric'),
    ];
  },
  table: (w, d, h) => {
    const topT = Math.min(Math.max(h * 0.08, 30), 70);
    const legT = Math.min(Math.max(Math.min(w, d) * 0.055, 28), 80);
    const inset = Math.max(legT, Math.min(w, d) * 0.05);
    const legH = Math.max(h - topT, 60);
    return [
      box([w, topT, d], [0, h - topT / 2, 0], 'primary'),
      ...legs4(w, d, legH, inset, legT),
    ];
  },
  chair: (w, d, h) => {
    const seatH = Math.min(Math.max(h * 0.55, 380), 500);
    const seatT = Math.min(Math.max(h * 0.09, 50), 110);
    const backH = Math.max(h - seatH, 200);
    const backT = Math.min(Math.max(d * 0.08, 42), 90);
    const legH = Math.max(seatH - seatT / 2, 80);
    return [
      box([w, seatT, d], [0, seatH, 0], 'primary'),
      box([w, backH, backT], [0, seatH + backH / 2, -d / 2 + backT / 2], 'primary'),
      ...legs4(w, d, legH, 55, 38),
    ];
  },
  wardrobe: (w, d, h) => {
    const doorT = Math.min(Math.max(d * 0.06, 22), 45);
    return [
      box([w, h, d], [0, h / 2, 0], 'primaryDark'),
      box([w / 2 - 16, h * 0.96, doorT], [-w / 4, h * 0.49, d / 2 + doorT / 2], 'primary'),
      box([w / 2 - 16, h * 0.96, doorT], [w / 4, h * 0.49, d / 2 + doorT / 2], 'primary'),
      box([26, Math.min(h * 0.16, 320), 22], [-36, h * 0.52, d / 2 + doorT + 14], 'metal'),
      box([26, Math.min(h * 0.16, 320), 22], [36, h * 0.52, d / 2 + doorT + 14], 'metal'),
    ];
  },
  bookshelf: (w, d, h) => {
    const sideT = Math.min(Math.max(w * 0.04, 26), 70);
    const shelfT = Math.min(Math.max(h * 0.02, 20), 40);
    const shelves = Math.min(Math.max(Math.round(h / 360), 3), 7);
    const parts: RawPart[] = [
      box([sideT, h, d], [-w / 2 + sideT / 2, h / 2, 0], 'primaryDark'),
      box([sideT, h, d], [w / 2 - sideT / 2, h / 2, 0], 'primaryDark'),
      box([w, shelfT, d], [0, shelfT / 2, 0], 'primaryDark'),
      box([w, shelfT, d], [0, h - shelfT / 2, 0], 'primaryDark'),
      box([w, h, Math.min(18, d * 0.06)], [0, h / 2, -d / 2 + 9], 'primaryLight'),
    ];
    for (let index = 1; index < shelves; index += 1) {
      parts.push(box([w - sideT * 2, shelfT, d - 8], [0, (h / shelves) * index, 0], 'primary'));
    }
    return parts;
  },
  nightstand: (w, d, h) => [
    box([w, h, d], [0, h / 2, 0], 'primaryDark'),
    box([w, Math.min(30, h * 0.06), d * 1.02], [0, h - 12, 0], 'primary'),
    box([w * 0.78, h * 0.28, 20], [0, h * 0.66, d / 2 + 10], 'primary'),
    box([w * 0.2, 16, 18], [0, h * 0.66, d / 2 + 26], 'metal'),
  ],
  desk: (w, d, h) => {
    const topT = Math.min(Math.max(h * 0.06, 28), 60);
    const sideT = Math.min(Math.max(w * 0.035, 30), 70);
    return [
      box([w, topT, d], [0, h - topT / 2, 0], 'primary'),
      box([sideT, h - topT, d * 0.94], [-w / 2 + sideT / 2, (h - topT) / 2, 0], 'primaryDark'),
      box([sideT, h - topT, d * 0.94], [w / 2 - sideT / 2, (h - topT) / 2, 0], 'primaryDark'),
      box([w - sideT * 2, Math.min(h * 0.35, 380), 22], [0, h - topT - Math.min(h * 0.18, 190), -d / 2 + 30], 'primaryLight'),
    ];
  },
  counter: (w, d, h) => {
    const topT = Math.min(Math.max(h * 0.05, 30), 60);
    return [
      box([w, h * 0.9, d * 0.94], [0, (h * 0.9) / 2 + 90, 0], 'primary'),
      box([w * 0.92, 90, d * 0.86], [0, 45, 0], 'dark'),
      box([w, topT, d * 1.04], [0, h - topT / 2, 0], 'stone'),
      box([w * 0.9, 24, 16], [0, h * 0.78, d * 0.47 + 8], 'metal'),
      box([Math.min(w * 0.4, 900), h * 0.26, 18], [w * 0.16, h * 0.6, d * 0.47 + 8], 'primaryLight'),
    ];
  },
  sink: (w, d, h) => {
    const basinD = d * 0.62;
    return [
      box([w, Math.min(h * 0.8, 220), d], [0, Math.max(h - 120, 90) - Math.min(h * 0.8, 220) / 2, 0], 'primaryDark'),
      box([w * 0.86, 120, basinD], [0, h - 60, 0], 'stone'),
      box([w * 0.7, 90, basinD * 0.7], [0, h - 40, 0], 'metal'),
      cylinder(Math.min(w, d) * 0.04, Math.min(h * 0.5, 260), [0, h + 60, -d * 0.32], 'metal'),
      box([Math.min(w, d) * 0.06, 40, Math.min(d * 0.4, 180)], [0, h + 180, -d * 0.16], 'metal'),
    ];
  },
  fridge: (w, d, h) => [
    box([w, h, d], [0, h / 2, 0], 'white'),
    box([w - 30, h / 2 - 40, 24], [0, h * 0.76, d / 2 + 12], 'primaryLight'),
    box([w - 30, h / 2 - 60, 24], [0, h * 0.26, d / 2 + 12], 'primaryLight'),
    box([22, Math.min(h * 0.3, 400), 20], [-w * 0.32, h * 0.72, d / 2 + 32], 'metal'),
    box([22, Math.min(h * 0.3, 400), 20], [-w * 0.32, h * 0.34, d / 2 + 32], 'metal'),
  ],
  tv: (w, d, h) =>
    h <= 900
      ? [
          box([w, h * 0.9, d], [0, h * 0.45, 0], 'primaryDark'),
          box([w, Math.min(30, h * 0.07), d * 1.02], [0, h - 12, 0], 'primary'),
          box([w * 0.55, 16, d * 0.5], [0, h * 0.45, d / 2 + 12], 'dark'),
        ]
      : [
          box([w * 0.42, 40, d * 0.62], [0, 30, 0], 'primaryDark'),
          box([w * 0.16, 120, 60], [0, 100, 0], 'primaryDark'),
          box([w, h * 0.58, 52], [0, h * 0.68, 0], 'dark'),
          box([w * 0.94, h * 0.52, 8], [0, h * 0.68, 30], 'primaryLight'),
        ],
  rug: (w, d) => [
    box([w, 14, d], [0, 7, 0], 'primaryDark'),
    box([Math.max(w - 160, w * 0.7), 16, Math.max(d - 160, d * 0.7)], [0, 8, 0], 'primary'),
    box([Math.max(w - 380, w * 0.45), 18, Math.max(d - 380, d * 0.45)], [0, 9, 0], 'fabric'),
  ],
  plant: (w, d, h) => {
    const potH = Math.min(Math.max(h * 0.22, 160), 460);
    const potR = Math.min(w, d) * 0.28;
    const foliageY = h * 0.7;
    return [
      cylinder(potR, potH, [0, potH / 2, 0], 'stone', potR * 1.05),
      cylinder(potR * 0.04 + 8, h * 0.5, [0, potH + h * 0.24, 0], 'secondary'),
      sphere(Math.min(w, d) * 0.3, [0, foliageY, 0], 'foliage'),
      sphere(Math.min(w, d) * 0.22, [Math.min(w, d) * 0.16, foliageY + h * 0.12, -Math.min(w, d) * 0.08], 'foliage'),
      sphere(Math.min(w, d) * 0.2, [-Math.min(w, d) * 0.15, foliageY + h * 0.06, Math.min(w, d) * 0.12], 'foliage'),
    ];
  },
  lamp: (w, d, h) => {
    const baseR = Math.min(w, d) * 0.3;
    if (h > 700) {
      return [
        cylinder(baseR, 36, [0, 18, 0], 'metal'),
        cylinder(Math.max(baseR * 0.06, 14), h * 0.68, [0, h * 0.36, 0], 'metal'),
        { shape: { kind: 'cone', radius: Math.min(w, d) * 0.46, height: h * 0.19 }, position: [0, h * 0.87, 0], tone: 'emissive' },
        sphere(Math.min(w, d) * 0.2, [0, h * 0.78, 0], 'emissive'),
      ];
    }
    return [
      cylinder(baseR, 50, [0, 25, 0], 'metal'),
      cylinder(Math.max(baseR * 0.12, 12), h * 0.52, [0, h * 0.3, 0], 'metal'),
      { shape: { kind: 'cone', radius: Math.min(w, d) * 0.44, height: h * 0.34 }, position: [0, h * 0.72, 0], tone: 'emissive' },
    ];
  },
  toilet: (w, d, h) => [
    box([w * 0.9, h * 0.42, d * 0.92], [0, h * 0.21, d * 0.02], 'white'),
    cylinder(w * 0.44, h * 0.3, [0, h * 0.47, d * 0.1], 'white', w * 0.5),
    box([w, h * 0.42, d * 0.26], [0, h * 0.52, -d / 2 + d * 0.13], 'white'),
    cylinder(w * 0.5, 28, [0, Math.min(h * 0.64, 440), d * 0.1], 'primaryLight', w * 0.54),
  ],
  shower: (w, d, h) => [
    box([w, 80, d], [0, 40, 0], 'white'),
    box([w, h * 0.9, 16], [0, h * 0.45, -d / 2 + 8], 'glass'),
    box([16, h * 0.9, d], [-w / 2 + 8, h * 0.45, 0], 'glass'),
    box([54, h * 0.85, 54], [w / 2 - 40, h * 0.425, -d / 2 + 40], 'metal'),
    cylinder(78, 22, [w / 2 - 80, h * 0.86, -d / 2 + 100], 'metal'),
  ],
  vanity: (w, d, h) => [
    box([w, h * 0.9, d], [0, h * 0.45, 0], 'primaryDark'),
    box([w, 36, d * 1.03], [0, h - 18, 0], 'stone'),
    cylinder(Math.min(w * 0.2, d * 0.3), 90, [0, h + 30, 0], 'white'),
    cylinder(Math.max(w * 0.02, 12), Math.min(h * 0.4, 220), [0, h + 130, -d * 0.3], 'metal'),
    box([w * 0.82, Math.min(h * 0.62, 700), 22], [0, h + Math.min(h * 0.62, 700) * 0.42, -d / 2 + 14], 'glass'),
  ],
  bathtub: (w, d, h) => {
    const rim = Math.min(w, d) * 0.09;
    return [
      box([w, h * 0.55, d], [0, h * 0.275, 0], 'white'),
      box([Math.max(w - rim * 2, 100), h * 0.36, Math.max(d - rim * 2, 100)], [0, h * 0.5, 0], 'primaryLight'),
      box([Math.max(w - rim * 2.6, 80), h * 0.3, Math.max(d - rim * 2.6, 80)], [0, h * 0.54, 0], 'glass'),
    ];
  },
  'washing-machine': (w, d, h) => [
    box([w, h, d], [0, h / 2, 0], 'white'),
    box([w * 0.92, 40, d * 0.92], [0, h - 20, 0], 'primaryLight'),
    cylinder(Math.min(w, h) * 0.3, 26, [0, h * 0.46, d / 2 + 10], 'glass', undefined, [Math.PI / 2, 0, 0]),
    box([w * 0.7, 30, 18], [0, h * 0.9, d / 2 + 4], 'metal'),
  ],
  'range-hood': (w, d, h) => [
    box([w, Math.max(h * 0.32, 160), d], [0, h * 0.8, 0], 'metal'),
    box([w * 0.7, Math.max(h * 0.45, 200), d * 0.5], [0, h * 0.92, 0], 'metal'),
    box([w * 0.9, 24, d * 0.86], [0, h * 0.64, 0], 'dark'),
  ],
  stove: (w, d, h) => [
    box([w, h, d], [0, h / 2, 0], 'primaryDark'),
    box([w, 26, d], [0, h - 13, 0], 'dark'),
    cylinder(Math.min(w, d) * 0.14, 12, [-w * 0.22, h + 4, -d * 0.18], 'metal'),
    cylinder(Math.min(w, d) * 0.14, 12, [w * 0.22, h + 4, -d * 0.18], 'metal'),
    cylinder(Math.min(w, d) * 0.14, 12, [-w * 0.22, h + 4, d * 0.18], 'metal'),
    cylinder(Math.min(w, d) * 0.14, 12, [w * 0.22, h + 4, d * 0.18], 'metal'),
  ],
  stool: (w, d, h) => {
    const seatR = Math.max(Math.min(w, d) / 2 - 10, 40);
    return [
      cylinder(seatR, Math.min(70, h * 0.12), [0, h, 0], 'primary'),
      ...legs4(seatR * 1.4, seatR * 1.4, h - 40, 0, 34),
    ];
  },
  bench: (w, d, h) => [
    box([w, Math.min(90, h * 0.16), d], [0, h - 40, 0], 'primary'),
    ...legs4(w, d, Math.max(h - 80, 80), 80, 50),
  ],
  mirror: (w, d, h) => [
    box([w, h, Math.max(d, 30)], [0, h / 2, 0], 'metal'),
    box([Math.max(w - 60, 40), Math.max(h - 60, 40), Math.max(d, 30) + 6], [0, h / 2, 4], 'glass'),
  ],
  generic: (w, d, h) => {
    const plinth = Math.min(Math.max(h * 0.06, 20), 80);
    return [
      box([w, h - plinth, d], [0, plinth + (h - plinth) / 2, 0], 'primary'),
      box([w * 0.96, plinth, d * 0.96], [0, plinth / 2, 0], 'primaryDark'),
      box([w * 1.01, Math.min(Math.max(h * 0.03, 12), 34), d * 1.01], [0, h - 6, 0], 'primaryLight'),
    ];
  },
};

const ALIASES: Record<string, FurnitureBuilderKey> = {
  beddouble: 'bed',
  bedsingle: 'bed',
  bedqueen: 'bed',
  bedking: 'bed',
  kidsbed: 'bed',
  bunkbed: 'bed',
  sofabed: 'bed',
  sofabeddouble: 'bed',
  coffeetable: 'table',
  sidetable: 'table',
  diningtable: 'table',
  desktable: 'desk',
  deskchair: 'chair',
  diningchair: 'chair',
  barstool: 'stool',
  tvcabinet: 'tv',
  tvstand: 'tv',
  mediaconsole: 'tv',
  floorestand: 'lamp',
  floorlamp: 'lamp',
  tablelamp: 'lamp',
  pendantlight: 'lamp',
  ceilinglight: 'lamp',
  kitchencounter: 'counter',
  basecabinet: 'counter',
  kitchencabinet: 'counter',
  washbasin: 'sink',
  bathroombasin: 'sink',
  washingmachine: 'washing-machine',
  washer: 'washing-machine',
  rangehood: 'range-hood',
  cookerhood: 'range-hood',
  gasstove: 'stove',
  cooktop: 'stove',
  bathtub: 'bathtub',
  bookshelf: 'bookshelf',
  bookcase: 'bookshelf',
  nightstand: 'nightstand',
  bedside: 'nightstand',
  wardrobe: 'wardrobe',
  closet: 'wardrobe',
  armchair: 'chair',
  officechair: 'chair',
  stool: 'stool',
  bench: 'bench',
  mirror: 'mirror',
  plantpot: 'plant',
  pottedplant: 'plant',
  rug: 'rug',
  carpet: 'rug',
  fridge: 'fridge',
  refrigerator: 'fridge',
  shower: 'shower',
  showerroom: 'shower',
  toilet: 'toilet',
  vanity: 'vanity',
  bathroomvanity: 'vanity',
};

/** Normalise a catalogue builder key (e.g. "sofa-3" / "kitchenCounter") to a builder. */
export function normalizeBuilderKey(raw: string | undefined | null): FurnitureBuilderKey | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (key.length === 0) return null;
  if (ALIASES[key]) return ALIASES[key];
  // Longest builder match first so "washing-machine" beats "-machine".
  const sorted = [...FURNITURE_BUILDERS].sort((a, b) => b.length - a.length);
  for (const builder of sorted) {
    const compact = builder.replace(/[^a-z0-9]+/g, '');
    if (key === compact || key.startsWith(compact) || key.endsWith(compact)) return builder;
  }
  for (const builder of sorted) {
    const compact = builder.replace(/[^a-z0-9]+/g, '');
    if (key.includes(compact) && compact.length > 3) return builder;
  }
  return null;
}

const SKU_PATTERNS: Array<[RegExp, FurnitureBuilderKey]> = [
  [/^bed/i, 'bed'],
  [/^sofa/i, 'sofa'],
  [/^coffee-?table/i, 'table'],
  [/^dining-?table/i, 'table'],
  [/^dining-?chair/i, 'chair'],
  [/^desk-?chair/i, 'chair'],
  [/^chair/i, 'chair'],
  [/^stool/i, 'stool'],
  [/^bench/i, 'bench'],
  [/^desk/i, 'desk'],
  [/^wardrobe/i, 'wardrobe'],
  [/^bookshelf|^bookcase/i, 'bookshelf'],
  [/^nightstand|^bedside/i, 'nightstand'],
  [/^tv/i, 'tv'],
  [/^kitchen-?counter|^counter|^cabinet/i, 'counter'],
  [/^fridge|^refrigerator/i, 'fridge'],
  [/^shower/i, 'shower'],
  [/^toilet/i, 'toilet'],
  [/^vanity/i, 'vanity'],
  [/^bathtub|^tub/i, 'bathtub'],
  [/^sink|^basin/i, 'sink'],
  [/^washing-?machine|^washer/i, 'washing-machine'],
  [/^range-?hood|^hood/i, 'range-hood'],
  [/^stove|^cooktop/i, 'stove'],
  [/^rug|^carpet/i, 'rug'],
  [/^plant/i, 'plant'],
  [/^lamp|^light/i, 'lamp'],
  [/^mirror/i, 'mirror'],
];

const NAME_PATTERNS: Array<[RegExp, FurnitureBuilderKey]> = [
  [/沙发/, 'sofa'],
  [/床/, 'bed'],
  [/衣柜|衣帽柜/, 'wardrobe'],
  [/书架|书柜/, 'bookshelf'],
  [/床头柜/, 'nightstand'],
  [/电视柜|电视/, 'tv'],
  [/书桌/, 'desk'],
  [/餐椅|椅子|座椅|办公椅/, 'chair'],
  [/餐凳|吧凳|凳/, 'stool'],
  [/餐桌|茶几|边几|桌/, 'table'],
  [/浴室柜/, 'vanity'],
  [/浴缸/, 'bathtub'],
  [/淋浴|花洒/, 'shower'],
  [/马桶|坐便/, 'toilet'],
  [/台盆|水槽|洗手盆/, 'sink'],
  [/冰箱/, 'fridge'],
  [/洗衣机/, 'washing-machine'],
  [/油烟机|抽油烟/, 'range-hood'],
  [/燃气灶|灶台|灶/, 'stove'],
  [/地毯|地垫/, 'rug'],
  [/绿植|植物|盆栽/, 'plant'],
  [/灯/, 'lamp'],
  [/镜子|穿衣镜/, 'mirror'],
  [/橱柜|地柜|台面|柜/, 'counter'],
];

export interface BuilderResolveInput {
  skuId: string;
  name?: string;
  /** Catalogue builder key, when @hdesign/catalog is available. */
  builder?: string;
}

export function resolveBuilderKey(input: BuilderResolveInput): FurnitureBuilderKey {
  const fromBuilder = normalizeBuilderKey(input.builder);
  if (fromBuilder) return fromBuilder;
  const fromSku = normalizeBuilderKey(input.skuId);
  if (fromSku) return fromSku;
  for (const [pattern, builder] of SKU_PATTERNS) {
    if (pattern.test(input.skuId)) return builder;
  }
  if (input.name) {
    for (const [pattern, builder] of NAME_PATTERNS) {
      if (pattern.test(input.name)) return builder;
    }
  }
  return 'generic';
}

export function buildFurnitureParts(item: FurnitureItem, builderOverride?: string): FurnitureBuild {
  const builder = builderOverride
    ? resolveBuilderKey({ skuId: item.skuId, name: item.name, builder: builderOverride })
    : resolveBuilderKey({ skuId: item.skuId, name: item.name });
  const width = Math.max(item.w, 60);
  const depth = Math.max(item.d, 60);
  const height = Math.max(item.h, 30);
  const builderFn = BUILDERS[builder] ?? BUILDERS.generic;
  const parts = builderFn(width, depth, height)
    .filter((part) => Number.isFinite(part.position[0]) && Number.isFinite(part.position[1]))
    .map((part, index) => ({ ...part, key: `${item.id}:${builder}:${index}` }));
  return { builder, parts: parts.length > 0 ? parts : buildFurnitureParts(item, 'generic').parts };
}
