import {
  createEmptyProject,
  createFurnitureItem,
  createOpening,
  createRoom,
  createWall,
  type Opening,
  type Point,
  type Project,
} from '@hdesign/domain';
import { db } from './persistence';

interface FurnitureSeed {
  skuId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h?: number;
  rotation?: number;
  color?: string;
  roomId?: string;
}

function furniture(seed: FurnitureSeed) {
  return createFurnitureItem({
    skuId: seed.skuId,
    name: seed.name,
    x: seed.x,
    y: seed.y,
    w: seed.w,
    d: seed.d,
    h: seed.h,
    rotation: seed.rotation ?? 0,
    color: seed.color,
    roomId: seed.roomId,
  });
}

function addOpening(
  openings: Opening[],
  wall: ReturnType<typeof createWall>,
  kind: Parameters<typeof createOpening>[1],
  offset: number,
  width: number,
  extra: Partial<Opening> = {},
) {
  openings.push(createOpening(wall, kind, offset, width, extra));
}

function finalize(project: Project, name: string): Project {
  project.name = name;
  project.sheets = project.sheets.map((sheet) => ({
    ...sheet,
    titleBlock: { ...sheet.titleBlock, projectName: name },
  }));
  return project;
}

function apartment(projectName: string, withStudy: boolean): Project {
  const project = createEmptyProject(projectName);
  const outer = 240;
  const walls = [
    createWall({ x: 120, y: 120 }, { x: 10680, y: 120 }, { thickness: outer, isLoadBearing: true }),
    createWall({ x: 10680, y: 120 }, { x: 10680, y: 7680 }, { thickness: outer, isLoadBearing: true }),
    createWall({ x: 10680, y: 7680 }, { x: 120, y: 7680 }, { thickness: outer, isLoadBearing: true }),
    createWall({ x: 120, y: 7680 }, { x: 120, y: 120 }, { thickness: outer, isLoadBearing: true }),
    createWall({ x: 6000, y: 120 }, { x: 6000, y: 4200 }, { thickness: 120 }),
    createWall({ x: 6000, y: 4200 }, { x: 10680, y: 4200 }, { thickness: 120 }),
    createWall({ x: 8300, y: 120 }, { x: 8300, y: 4200 }, { thickness: 120 }),
    createWall({ x: 8600, y: 4200 }, { x: 8600, y: 7680 }, { thickness: 120 }),
  ];
  if (withStudy) {
    walls.push(
      createWall({ x: 120, y: 5000 }, { x: 3000, y: 5000 }, { thickness: 120 }),
      createWall({ x: 3000, y: 5000 }, { x: 3000, y: 7680 }, { thickness: 120 }),
    );
  }
  project.walls = walls;

  const [top, right, bottom, left, innerVertical, innerHorizontal, bedroomDivider, bathDivider] =
    walls as [
      (typeof walls)[number],
      (typeof walls)[number],
      (typeof walls)[number],
      (typeof walls)[number],
      (typeof walls)[number],
      (typeof walls)[number],
      (typeof walls)[number],
      (typeof walls)[number],
    ];

  const openings: Opening[] = [];
  addOpening(openings, left, 'door', 5200, 900, { height: 2200 });
  addOpening(openings, bottom, 'window', 6000, 1800, { sill: 500, height: 1800 });
  addOpening(openings, right, 'window', 2000, 1400, { sill: 900 });
  addOpening(openings, top, 'window', 6600, 1300, { sill: 900 });
  addOpening(openings, right, 'window', 4200, 700, { sill: 1500, height: 800 });
  addOpening(openings, innerVertical, 'door', 2600, 850, { height: 2100 });
  addOpening(openings, bedroomDivider, 'door', 2600, 800);
  addOpening(openings, innerHorizontal, 'door', 900, 800);
  addOpening(openings, bathDivider, 'door', 2600, 700);
  if (withStudy) {
    const studyWall = walls[8]!;
    addOpening(openings, studyWall, 'door', 400, 800);
  }
  project.openings = openings;

  const livingPolygon: Point[] = withStudy
    ? [
        { x: 240, y: 240 },
        { x: 5940, y: 240 },
        { x: 5940, y: 7560 },
        { x: 3060, y: 7560 },
        { x: 3060, y: 5060 },
        { x: 240, y: 5060 },
      ]
    : [
        { x: 240, y: 240 },
        { x: 5940, y: 240 },
        { x: 5940, y: 7560 },
        { x: 240, y: 7560 },
      ];

  project.rooms = [
    createRoom(livingPolygon, {
      id: 'room-living',
      name: '客厅 / 餐厅',
      type: 'living',
      floorMaterialId: 'floor-oak',
      wallMaterialId: 'wall-latex-warm',
    }),
    createRoom(
      [
        { x: 6060, y: 240 },
        { x: 8240, y: 240 },
        { x: 8240, y: 4140 },
        { x: 6060, y: 4140 },
      ],
      { id: 'room-bedroom-2', name: '次卧', type: 'bedroom', floorMaterialId: 'floor-oak-walnut' },
    ),
    createRoom(
      [
        { x: 8360, y: 240 },
        { x: 10440, y: 240 },
        { x: 10440, y: 4140 },
        { x: 8360, y: 4140 },
      ],
      { id: 'room-master', name: '主卧', type: 'master-bedroom', floorMaterialId: 'floor-oak' },
    ),
    createRoom(
      [
        { x: 6060, y: 4260 },
        { x: 8540, y: 4260 },
        { x: 8540, y: 7560 },
        { x: 6060, y: 7560 },
      ],
      { id: 'room-kitchen', name: '厨房', type: 'kitchen', floorMaterialId: 'floor-tile-600' },
    ),
    createRoom(
      [
        { x: 8660, y: 4260 },
        { x: 10440, y: 4260 },
        { x: 10440, y: 7560 },
        { x: 8660, y: 7560 },
      ],
      { id: 'room-bath', name: '卫生间', type: 'bath', floorMaterialId: 'floor-tile-anti-slip' },
    ),
  ];
  if (withStudy) {
    project.rooms.push(
      createRoom(
        [
          { x: 240, y: 5060 },
          { x: 2940, y: 5060 },
          { x: 2940, y: 7560 },
          { x: 240, y: 7560 },
        ],
        { id: 'room-study', name: '书房', type: 'study', floorMaterialId: 'floor-oak-walnut' },
      ),
    );
  }

  project.furniture = [
    furniture({ skuId: 'sofa-3', name: '三人沙发', x: 1250, y: 2600, w: 2200, d: 900, h: 780, rotation: 90, color: '#A9A294', roomId: 'room-living' }),
    furniture({ skuId: 'coffee-table', name: '茶几', x: 3300, y: 2600, w: 1000, d: 550, h: 420, color: '#8C7A63', roomId: 'room-living' }),
    furniture({ skuId: 'tv-cabinet', name: '电视柜', x: 5600, y: 2600, w: 1800, d: 400, h: 450, rotation: 90, color: '#7C6A55', roomId: 'room-living' }),
    furniture({ skuId: 'rug', name: '客厅地毯', x: 3300, y: 2600, w: 2600, d: 2000, h: 12, color: '#C9BCA6', roomId: 'room-living' }),
    furniture({ skuId: 'dining-table', name: '餐桌', x: 3800, y: 6200, w: 1400, d: 800, h: 750, color: '#8C7259', roomId: 'room-living' }),
    furniture({ skuId: 'dining-chair', name: '餐椅', x: 3800, y: 5650, w: 450, d: 480, h: 820, color: '#A08A70', roomId: 'room-living' }),
    furniture({ skuId: 'dining-chair', name: '餐椅', x: 3800, y: 6750, w: 450, d: 480, h: 820, color: '#A08A70', roomId: 'room-living' }),
    furniture({ skuId: 'dining-chair', name: '餐椅', x: 3350, y: 6200, w: 450, d: 480, h: 820, rotation: -90, color: '#A08A70', roomId: 'room-living' }),
    furniture({ skuId: 'dining-chair', name: '餐椅', x: 4250, y: 6200, w: 450, d: 480, h: 820, rotation: 90, color: '#A08A70', roomId: 'room-living' }),
    furniture({ skuId: 'floor-lamp', name: '落地灯', x: 700, y: 1400, w: 400, d: 400, h: 1550, color: '#B9AE9A', roomId: 'room-living' }),
    furniture({ skuId: 'plant', name: '绿植', x: 5500, y: 7100, w: 500, d: 500, h: 1400, color: '#5F7A55', roomId: 'room-living' }),

    furniture({ skuId: 'bed-double', name: '双人床', x: 9400, y: 1500, w: 1500, d: 2000, h: 900, color: '#B7A48C', roomId: 'room-master' }),
    furniture({ skuId: 'nightstand', name: '床头柜', x: 8650, y: 500, w: 400, d: 400, h: 500, color: '#8C7259', roomId: 'room-master' }),
    furniture({ skuId: 'wardrobe', name: '衣柜', x: 9400, y: 3750, w: 1800, d: 600, h: 2200, color: '#9B8A73', roomId: 'room-master' }),

    furniture({ skuId: 'bed-single', name: '单人床', x: 7150, y: 1400, w: 1200, d: 1900, h: 850, color: '#B7A48C', roomId: 'room-bedroom-2' }),
    furniture({ skuId: 'desk', name: '书桌', x: 6700, y: 3850, w: 1100, d: 550, h: 750, color: '#8C7259', roomId: 'room-bedroom-2' }),
    furniture({ skuId: 'chair', name: '书椅', x: 6700, y: 3300, w: 450, d: 480, h: 850, color: '#A08A70', roomId: 'room-bedroom-2' }),

    furniture({ skuId: 'kitchen-counter', name: '厨房地柜', x: 7300, y: 4600, w: 2400, d: 600, h: 850, color: '#D6D2C6', roomId: 'room-kitchen' }),
    furniture({ skuId: 'fridge', name: '冰箱', x: 8100, y: 7200, w: 700, d: 650, h: 1800, color: '#C9CDCB', roomId: 'room-kitchen' }),

    furniture({ skuId: 'shower', name: '淋浴房', x: 9950, y: 4750, w: 900, d: 900, h: 2000, color: '#B9C6C9', roomId: 'room-bath' }),
    furniture({ skuId: 'toilet', name: '马桶', x: 9900, y: 6300, w: 400, d: 650, h: 780, rotation: 90, color: '#E4E1DA', roomId: 'room-bath' }),
    furniture({ skuId: 'vanity', name: '浴室柜', x: 9150, y: 7300, w: 900, d: 500, h: 850, color: '#CBBBA2', roomId: 'room-bath' }),
  ];

  if (withStudy) {
    project.furniture.push(
      furniture({ skuId: 'desk', name: '长书桌', x: 1500, y: 6000, w: 1800, d: 600, h: 750, color: '#8C7259', roomId: 'room-study' }),
      furniture({ skuId: 'chair', name: '办公椅', x: 1500, y: 6500, w: 500, d: 520, h: 880, color: '#6E7A72', roomId: 'room-study' }),
      furniture({ skuId: 'bookshelf', name: '书架', x: 650, y: 6900, w: 1200, d: 350, h: 2000, rotation: 90, color: '#9B8A73', roomId: 'room-study' }),
    );
  }

  project.style = { id: withStudy ? 'japandi' : 'modern-minimal', overrides: {} };
  return finalize(project, projectName);
}

function studio(projectName: string): Project {
  const project = createEmptyProject(projectName);
  const walls = [
    createWall({ x: 120, y: 120 }, { x: 7080, y: 120 }, { thickness: 240, isLoadBearing: true }),
    createWall({ x: 7080, y: 120 }, { x: 7080, y: 5880 }, { thickness: 240, isLoadBearing: true }),
    createWall({ x: 7080, y: 5880 }, { x: 120, y: 5880 }, { thickness: 240, isLoadBearing: true }),
    createWall({ x: 120, y: 5880 }, { x: 120, y: 120 }, { thickness: 240, isLoadBearing: true }),
    createWall({ x: 4800, y: 120 }, { x: 4800, y: 5880 }, { thickness: 120 }),
    createWall({ x: 4800, y: 3000 }, { x: 7080, y: 3000 }, { thickness: 120 }),
  ];
  project.walls = walls;
  const [top, right, bottom, left, vertical] = walls as [
    (typeof walls)[number],
    (typeof walls)[number],
    (typeof walls)[number],
    (typeof walls)[number],
    (typeof walls)[number],
  ];
  const openings: Opening[] = [];
  addOpening(openings, bottom, 'door', 3000, 900, { height: 2200 });
  addOpening(openings, left, 'window', 1800, 1600, { sill: 900 });
  addOpening(openings, top, 'window', 5400, 900, { sill: 1100 });
  addOpening(openings, right, 'window', 3800, 600, { sill: 1500, height: 700 });
  addOpening(openings, vertical, 'door', 2000, 700);
  addOpening(openings, vertical, 'door', 4000, 700);
  project.openings = openings;
  project.rooms = [
    createRoom(
      [
        { x: 240, y: 240 },
        { x: 4740, y: 240 },
        { x: 4740, y: 5760 },
        { x: 240, y: 5760 },
      ],
      { id: 'room-living', name: '起居 / 卧室', type: 'living', floorMaterialId: 'floor-oak' },
    ),
    createRoom(
      [
        { x: 4860, y: 240 },
        { x: 6960, y: 240 },
        { x: 6960, y: 2940 },
        { x: 4860, y: 2940 },
      ],
      { id: 'room-kitchen', name: '厨房', type: 'kitchen', floorMaterialId: 'floor-tile-600' },
    ),
    createRoom(
      [
        { x: 4860, y: 3060 },
        { x: 6960, y: 3060 },
        { x: 6960, y: 5760 },
        { x: 4860, y: 5760 },
      ],
      { id: 'room-bath', name: '卫生间', type: 'bath', floorMaterialId: 'floor-tile-anti-slip' },
    ),
  ];
  project.furniture = [
    furniture({ skuId: 'bed-double', name: '双人床', x: 1500, y: 1400, w: 1500, d: 2000, h: 900, color: '#B7A48C', roomId: 'room-living' }),
    furniture({ skuId: 'sofa-2', name: '双人沙发', x: 3500, y: 4300, w: 1600, d: 850, h: 780, rotation: 180, color: '#A9A294', roomId: 'room-living' }),
    furniture({ skuId: 'coffee-table', name: '茶几', x: 2100, y: 4300, w: 900, d: 500, h: 420, color: '#8C7A63', roomId: 'room-living' }),
    furniture({ skuId: 'desk', name: '书桌', x: 1100, y: 5150, w: 1200, d: 550, h: 750, color: '#8C7259', roomId: 'room-living' }),
    furniture({ skuId: 'wardrobe', name: '衣柜', x: 4350, y: 900, w: 1200, d: 550, h: 2200, rotation: 90, color: '#9B8A73', roomId: 'room-living' }),
    furniture({ skuId: 'kitchen-counter', name: '厨房地柜', x: 5900, y: 550, w: 1900, d: 600, h: 850, color: '#D6D2C6', roomId: 'room-kitchen' }),
    furniture({ skuId: 'fridge', name: '冰箱', x: 6600, y: 2600, w: 650, d: 650, h: 1750, color: '#C9CDCB', roomId: 'room-kitchen' }),
    furniture({ skuId: 'shower', name: '淋浴房', x: 5350, y: 3550, w: 900, d: 900, h: 2000, color: '#B9C6C9', roomId: 'room-bath' }),
    furniture({ skuId: 'toilet', name: '马桶', x: 6600, y: 5300, w: 400, d: 650, h: 780, rotation: -90, color: '#E4E1DA', roomId: 'room-bath' }),
    furniture({ skuId: 'vanity', name: '浴室柜', x: 5450, y: 5400, w: 800, d: 450, h: 850, color: '#CBBBA2', roomId: 'room-bath' }),
  ];
  project.style = { id: 'cream', overrides: {} };
  return finalize(project, projectName);
}

export function createDemoProjects(): Project[] {
  return [
    apartment('两室两厅 · 样板 A', false),
    studio('一居开间 · 样板 B'),
    apartment('三居 · 样板 C', true),
  ];
}

const SEED_FLAG = 'hdesign.seeded';
let seedPromise: Promise<number> | null = null;

export function ensureSeedProjects(): Promise<number> {
  if (!seedPromise) seedPromise = seedProjects();
  return seedPromise;
}

async function seedProjects(): Promise<number> {
  try {
    if (localStorage.getItem(SEED_FLAG) === '1') return 0;
  } catch {
    /* ignore */
  }
  const count = await db.projects.count();
  if (count > 0) {
    try {
      localStorage.setItem(SEED_FLAG, '1');
    } catch {
      /* ignore */
    }
    return 0;
  }
  const projects = createDemoProjects();
  await db.projects.bulkPut(projects);
  try {
    localStorage.setItem(SEED_FLAG, '1');
  } catch {
    /* ignore */
  }
  return projects.length;
}
