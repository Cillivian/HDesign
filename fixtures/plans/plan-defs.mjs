/**
 * Synthetic floor-plan definitions for the recognition accuracy tests and the
 * sample assets shipped to `apps/web/public/samples`.
 *
 * All coordinates are millimetres in plan space (x right, y down), origin at the
 * top-left wall centreline. Wall openings are measured as `startMm` along the
 * wall direction plus `widthMm`.
 *
 * This file is dependency-free so it can be imported by vitest (tests) and by
 * `fixtures/generate.mjs` (node). Keep the schema stable: the accuracy tests
 * derive their expectations from it instead of hand-written numbers.
 */

export const EXTERIOR = 240;
export const PARTITION = 120;

/** @typedef {{kind:'door'|'window'|'sliding', startMm:number, widthMm:number}} OpeningDef */
/** @typedef {{id:string, aMm:[number,number], bMm:[number,number], thicknessMm:number, openings?:OpeningDef[]}} WallDef */
/** @typedef {{label:string, labelAtMm:[number,number], innerRectMm:[number,number,number,number]}} RoomDef */
/** @typedef {{valueMm:number, axis:'h'|'v', atMm:[number,number]}} DimensionDef */

/** @type {Array<any>} */
export const PLANS = [
  {
    id: 'plan-a',
    glyph: 'A',
    title: 'A · 两室两厅 89㎡',
    widthMm: 10400,
    heightMm: 8600,
    mmPerPx: 10,
    marginPx: 140,
    rotationDeg: 0,
    walls: [
      {
        id: 'top',
        aMm: [0, 0],
        bMm: [10400, 0],
        thicknessMm: EXTERIOR,
        openings: [
          { kind: 'window', startMm: 1200, widthMm: 2000 },
          { kind: 'window', startMm: 6000, widthMm: 1600 },
        ],
      },
      {
        id: 'right',
        aMm: [10400, 0],
        bMm: [10400, 8600],
        thicknessMm: EXTERIOR,
        openings: [
          { kind: 'window', startMm: 900, widthMm: 1200 },
          { kind: 'window', startMm: 6200, widthMm: 1400 },
        ],
      },
      {
        id: 'bottom',
        aMm: [10400, 8600],
        bMm: [0, 8600],
        thicknessMm: EXTERIOR,
        openings: [{ kind: 'window', startMm: 7400, widthMm: 2000 }],
      },
      {
        id: 'left',
        aMm: [0, 8600],
        bMm: [0, 0],
        thicknessMm: EXTERIOR,
        openings: [{ kind: 'door', startMm: 2500, widthMm: 900 }],
      },
      {
        id: 'partition-x5600',
        aMm: [5600, 0],
        bMm: [5600, 8600],
        thicknessMm: PARTITION,
        openings: [
          { kind: 'door', startMm: 3600, widthMm: 900 },
          { kind: 'door', startMm: 6800, widthMm: 900 },
        ],
      },
      {
        id: 'partition-y4800',
        aMm: [0, 4800],
        bMm: [5600, 4800],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 1000, widthMm: 900 }],
      },
      {
        id: 'partition-y3000',
        aMm: [5600, 3000],
        bMm: [10400, 3000],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 200, widthMm: 900 }],
      },
      {
        id: 'partition-x8000',
        aMm: [8000, 0],
        bMm: [8000, 3000],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 1800, widthMm: 900 }],
      },
      {
        id: 'partition-y5800',
        aMm: [5600, 5800],
        bMm: [10400, 5800],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 200, widthMm: 900 }],
      },
    ],
    rooms: [
      { label: 'LIVING', labelAtMm: [2830, 2430], innerRectMm: [120, 120, 5540, 4740] },
      { label: 'MASTER', labelAtMm: [2830, 6670], innerRectMm: [120, 4860, 5540, 8480] },
      { label: 'KITCHEN', labelAtMm: [6800, 2700], innerRectMm: [5660, 120, 7940, 2940] },
      { label: 'BATH', labelAtMm: [9170, 1530], innerRectMm: [8060, 120, 10280, 2940] },
      { label: 'BEDROOM', labelAtMm: [7970, 4400], innerRectMm: [5660, 3060, 10280, 5740] },
      { label: 'DINING', labelAtMm: [7970, 7170], innerRectMm: [5660, 5860, 10280, 8480] },
    ],
    dimensions: [
      { valueMm: 10400, axis: 'h', atMm: [5200, -600] },
      { valueMm: 10400, axis: 'h', atMm: [5200, 9200] },
      { valueMm: 8600, axis: 'v', atMm: [-600, 4300] },
      { valueMm: 8600, axis: 'v', atMm: [11000, 4300] },
      { valueMm: 8600, axis: 'v', atMm: [6200, 7300] },
      { valueMm: 5600, axis: 'h', atMm: [3200, 4200] },
      { valueMm: 4800, axis: 'h', atMm: [7000, 2200] },
      { valueMm: 4800, axis: 'h', atMm: [7000, 6600] },
      { valueMm: 3000, axis: 'v', atMm: [7200, 1500] },
    ],
  },
  {
    id: 'plan-b',
    glyph: 'B',
    title: 'B · 一居开间 45㎡',
    widthMm: 7000,
    heightMm: 6400,
    mmPerPx: 10,
    marginPx: 140,
    rotationDeg: 0,
    walls: [
      {
        id: 'top',
        aMm: [0, 0],
        bMm: [7000, 0],
        thicknessMm: 200,
        openings: [{ kind: 'window', startMm: 1500, widthMm: 1800 }],
      },
      {
        id: 'right',
        aMm: [7000, 0],
        bMm: [7000, 6400],
        thicknessMm: 200,
        openings: [{ kind: 'window', startMm: 800, widthMm: 1600 }],
      },
      {
        id: 'bottom',
        aMm: [7000, 6400],
        bMm: [0, 6400],
        thicknessMm: 200,
        openings: [{ kind: 'window', startMm: 2800, widthMm: 2200 }],
      },
      {
        id: 'left',
        aMm: [0, 6400],
        bMm: [0, 0],
        thicknessMm: 200,
        openings: [{ kind: 'door', startMm: 500, widthMm: 900 }],
      },
      {
        id: 'partition-y4400',
        aMm: [0, 4400],
        bMm: [7000, 4400],
        thicknessMm: 100,
        openings: [{ kind: 'door', startMm: 3600, widthMm: 900 }],
      },
      {
        id: 'partition-x2600',
        aMm: [2600, 4400],
        bMm: [2600, 6400],
        thicknessMm: 100,
        openings: [{ kind: 'door', startMm: 800, widthMm: 900 }],
      },
    ],
    rooms: [
      { label: 'LIVING', labelAtMm: [3500, 2200], innerRectMm: [100, 100, 6900, 4350] },
      { label: 'BATH', labelAtMm: [1300, 6000], innerRectMm: [100, 4450, 2550, 6300] },
      { label: 'KITCHEN', labelAtMm: [4800, 5400], innerRectMm: [2650, 4450, 6900, 6300] },
    ],
    dimensions: [
      { valueMm: 7000, axis: 'h', atMm: [3500, -600] },
      { valueMm: 7000, axis: 'h', atMm: [3500, 7000] },
      { valueMm: 6400, axis: 'v', atMm: [-600, 3200] },
      { valueMm: 6400, axis: 'v', atMm: [7600, 3200] },
      { valueMm: 7000, axis: 'h', atMm: [3500, 3800] },
      { valueMm: 2000, axis: 'v', atMm: [1900, 5400] },
    ],
  },
  {
    id: 'plan-c',
    glyph: 'C',
    title: 'C · 三室两厅 118㎡',
    widthMm: 13000,
    heightMm: 9000,
    mmPerPx: 10,
    marginPx: 140,
    // Slight scan rotation: exercises the Hough deskew stage end to end.
    rotationDeg: 1.4,
    walls: [
      {
        id: 'top',
        aMm: [0, 0],
        bMm: [13000, 0],
        thicknessMm: EXTERIOR,
        openings: [
          { kind: 'window', startMm: 1200, widthMm: 1800 },
          { kind: 'window', startMm: 6000, widthMm: 1800 },
          { kind: 'window', startMm: 10200, widthMm: 1600 },
        ],
      },
      {
        id: 'right',
        aMm: [13000, 0],
        bMm: [13000, 9000],
        thicknessMm: EXTERIOR,
        openings: [
          { kind: 'window', startMm: 1000, widthMm: 1400 },
          { kind: 'window', startMm: 6800, widthMm: 1400 },
        ],
      },
      {
        id: 'bottom',
        aMm: [13000, 9000],
        bMm: [0, 9000],
        thicknessMm: EXTERIOR,
        openings: [
          { kind: 'window', startMm: 9800, widthMm: 2000 },
          { kind: 'window', startMm: 3000, widthMm: 1600 },
        ],
      },
      {
        id: 'left',
        aMm: [0, 9000],
        bMm: [0, 0],
        thicknessMm: EXTERIOR,
        openings: [{ kind: 'door', startMm: 3500, widthMm: 900 }],
      },
      {
        id: 'partition-x5200',
        aMm: [5200, 0],
        bMm: [5200, 9000],
        thicknessMm: PARTITION,
        openings: [
          { kind: 'door', startMm: 1200, widthMm: 900 },
          { kind: 'door', startMm: 4800, widthMm: 900 },
          { kind: 'door', startMm: 7800, widthMm: 900 },
        ],
      },
      {
        id: 'partition-x9200',
        aMm: [9200, 0],
        bMm: [9200, 9000],
        thicknessMm: PARTITION,
        openings: [
          { kind: 'door', startMm: 1200, widthMm: 900 },
          { kind: 'door', startMm: 4400, widthMm: 900 },
          { kind: 'door', startMm: 7200, widthMm: 900 },
        ],
      },
      {
        id: 'partition-y4000',
        aMm: [0, 4000],
        bMm: [5200, 4000],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 1000, widthMm: 900 }],
      },
      {
        id: 'partition-y7000',
        aMm: [0, 7000],
        bMm: [5200, 7000],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 3400, widthMm: 900 }],
      },
      {
        id: 'partition-y3000',
        aMm: [5200, 3000],
        bMm: [13000, 3000],
        thicknessMm: PARTITION,
        openings: [{ kind: 'door', startMm: 1100, widthMm: 900 }],
      },
      {
        id: 'partition-y6000',
        aMm: [5200, 6000],
        bMm: [13000, 6000],
        thicknessMm: PARTITION,
        openings: [
          { kind: 'door', startMm: 1300, widthMm: 900 },
          { kind: 'door', startMm: 5600, widthMm: 900 },
        ],
      },
    ],
    rooms: [
      { label: 'LIVING', labelAtMm: [2600, 2000], innerRectMm: [120, 120, 5140, 3940] },
      { label: 'MASTER', labelAtMm: [2600, 5500], innerRectMm: [120, 4060, 5140, 6940] },
      { label: 'STUDY', labelAtMm: [2600, 8000], innerRectMm: [120, 7060, 5140, 8880] },
      { label: 'KITCHEN', labelAtMm: [7200, 1500], innerRectMm: [5260, 120, 9140, 2940] },
      { label: 'DINING', labelAtMm: [7200, 4500], innerRectMm: [5260, 3060, 9140, 5940] },
      { label: 'BEDROOM', labelAtMm: [7200, 7500], innerRectMm: [5260, 6060, 9140, 8880] },
      { label: 'BATH', labelAtMm: [11100, 1500], innerRectMm: [9260, 120, 12880, 2940] },
      { label: 'BEDROOM', labelAtMm: [11100, 4500], innerRectMm: [9260, 3060, 12880, 5940] },
      { label: 'BEDROOM', labelAtMm: [11100, 7500], innerRectMm: [9260, 6060, 12880, 8880] },
    ],
    dimensions: [
      { valueMm: 13000, axis: 'h', atMm: [6500, -600] },
      { valueMm: 13000, axis: 'h', atMm: [6500, 9600] },
      { valueMm: 9000, axis: 'v', atMm: [-600, 4500] },
      { valueMm: 9000, axis: 'v', atMm: [13600, 4500] },
      { valueMm: 9000, axis: 'v', atMm: [5700, 5000] },
      { valueMm: 9000, axis: 'v', atMm: [8700, 2000] },
      { valueMm: 5200, axis: 'h', atMm: [2600, 3400] },
      { valueMm: 5200, axis: 'h', atMm: [2600, 7600] },
      { valueMm: 7800, axis: 'h', atMm: [6500, 2400] },
      { valueMm: 7800, axis: 'h', atMm: [6500, 6300] },
    ],
  },
];

export function findPlan(id) {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown fixture plan: ${id}`);
  return plan;
}

export function imageSize(plan) {
  return {
    width: Math.round(plan.widthMm / plan.mmPerPx) + plan.marginPx * 2,
    height: Math.round(plan.heightMm / plan.mmPerPx) + plan.marginPx * 2,
  };
}

/** Millimetres (plan space) -> image pixels. */
export function mmToImage(plan, point) {
  return {
    x: plan.marginPx + point[0] / plan.mmPerPx,
    y: plan.marginPx + point[1] / plan.mmPerPx,
  };
}

export function wallLengthMm(wall) {
  return Math.hypot(wall.bMm[0] - wall.aMm[0], wall.bMm[1] - wall.aMm[1]);
}

export function wallAngleDeg(wall) {
  return (Math.atan2(wall.bMm[1] - wall.aMm[1], wall.bMm[0] - wall.aMm[0]) * 180) / Math.PI;
}

export function roomAreaSqm(room) {
  const [x0, y0, x1, y1] = room.innerRectMm;
  return ((x1 - x0) * (y1 - y0)) / 1_000_000;
}

/**
 * Expected recognition output. OCR tokens are reported in the *deskewed* image
 * frame (the source of the synthetic raster is rotated by `rotationDeg`).
 */
export function buildExpected(plan) {
  const { width, height } = imageSize(plan);
  const ocrTokens = [];
  for (const dimension of plan.dimensions) {
    const at = mmToImage(plan, dimension.atMm);
    ocrTokens.push({
      text: String(dimension.valueMm),
      x: Math.round(at.x),
      y: Math.round(at.y),
      w: String(dimension.valueMm).length * 12,
      h: 15,
      confidence: 0.92,
      kind: 'dimension',
    });
  }
  for (const room of plan.rooms) {
    const at = mmToImage(plan, room.labelAtMm);
    ocrTokens.push({
      text: room.label,
      x: Math.round(at.x),
      y: Math.round(at.y),
      w: room.label.length * 12,
      h: 15,
      confidence: 0.9,
      kind: 'label',
    });
  }
  return {
    id: plan.id,
    title: plan.title,
    mmPerPx: plan.mmPerPx,
    rotationDeg: plan.rotationDeg,
    imagePx: { width, height },
    marginPx: plan.marginPx,
    wallCount: plan.walls.length,
    roomCount: plan.rooms.length,
    openingCount: plan.walls.reduce((sum, wall) => sum + (wall.openings?.length ?? 0), 0),
    walls: plan.walls.map((wall) => {
      const midMm = [(wall.aMm[0] + wall.bMm[0]) / 2, (wall.aMm[1] + wall.bMm[1]) / 2];
      return {
        id: wall.id,
        aMm: wall.aMm,
        bMm: wall.bMm,
        midMm,
        lengthMm: wallLengthMm(wall),
        angleDeg: wallAngleDeg(wall),
        thicknessMm: wall.thicknessMm,
      };
    }),
    rooms: plan.rooms.map((room) => ({
      label: room.label,
      innerRectMm: room.innerRectMm,
      areaSqm: roomAreaSqm(room),
    })),
    ocrTokens,
  };
}
