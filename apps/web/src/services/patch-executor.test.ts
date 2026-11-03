import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createFurnitureItem,
  createMepDevice,
  createOpening,
  createRoom,
  createWall,
  rectPolygon,
  type DesignBrief,
  type DesignPatch,
  type Project,
} from '@hdesign/domain';
import { useDocStore } from '../store/doc-store';
import {
  applyPatchToDoc,
  diffProjects,
  executeDesignBrief,
  executeDesignPatch,
  resolveNearestSkuIn,
  summarizeDiff,
  undoAppliedAiChange,
  type PatchDeps,
} from './patch-executor';
import type { CatalogMaterial, CatalogSku, CatalogStyle } from './ai-design';

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const SKUS: CatalogSku[] = [
  {
    id: 'sofa-3',
    name: '三人沙发',
    category: 'sofa',
    w: 2200,
    d: 900,
    h: 780,
    styleTags: ['cream'],
    materialSlots: ['fabric'],
    roomTypes: ['living'],
    wallMounted: false,
    collisionExempt: false,
  },
  {
    id: 'tv-cabinet',
    name: '电视柜',
    category: 'storage',
    w: 1800,
    d: 400,
    h: 450,
    styleTags: ['cream'],
    materialSlots: ['wood'],
    roomTypes: ['living'],
    wallMounted: true,
    collisionExempt: false,
  },
  {
    id: 'bed-double',
    name: '双人床',
    category: 'bed',
    w: 1500,
    d: 2000,
    h: 900,
    styleTags: [],
    materialSlots: ['fabric'],
    roomTypes: ['master-bedroom'],
    wallMounted: false,
    collisionExempt: false,
  },
];

const MATERIALS: CatalogMaterial[] = [
  { id: 'floor-oak', name: '橡木地板', scope: 'floor', color: '#C9A97D', type: 'wood', pricePerSqm: 200, tags: [] },
  { id: 'wall-latex-warm', name: '暖白乳胶漆', scope: 'wall', color: '#F3EEE4', type: 'paint', pricePerSqm: 40, tags: [] },
  {
    id: 'fabric-linen-grey',
    name: '浅灰亚麻',
    scope: 'fabric',
    color: '#D8D3CA',
    type: 'fabric',
    pricePerSqm: 90,
    tags: [],
  },
];

const STYLES: CatalogStyle[] = [
  {
    id: 'cream',
    name: '奶油',
    description: '奶油风',
    tokens: { wall: '#F5EFE4', floor: '#D9C3A5' },
    materials: { floor: 'floor-oak', wall: 'wall-latex-warm' },
    moodKeywords: ['温暖'],
  },
];

function deps(overrides: Partial<PatchDeps> = {}): PatchDeps {
  return { skus: SKUS, materials: MATERIALS, styles: STYLES, ...overrides };
}

function testProject(): Project {
  const project = createEmptyProject('测试方案');
  project.rooms = [
    createRoom(rectPolygon(0, 0, 4000, 3000), {
      id: 'room-living',
      name: '客厅',
      type: 'living',
      floorMaterialId: 'floor-oak',
      wallMaterialId: 'wall-latex-warm',
    }),
    createRoom(rectPolygon(4200, 0, 3600, 2800), {
      id: 'room-master',
      name: '主卧',
      type: 'master-bedroom',
      floorMaterialId: 'floor-oak',
      wallMaterialId: 'wall-latex-warm',
    }),
    createRoom(rectPolygon(8000, 0, 2400, 2200), {
      id: 'room-bath',
      name: '卫生间',
      type: 'bath',
      floorMaterialId: 'floor-oak',
      wallMaterialId: 'wall-latex-warm',
    }),
  ];
  project.furniture = [
    createFurnitureItem({
      skuId: 'sofa-3',
      name: '三人沙发',
      x: 2000,
      y: 1500,
      w: 2200,
      d: 900,
      h: 780,
      roomId: 'room-living',
    }),
  ];
  return project;
}

function basePatch(ops: DesignPatch['ops']): DesignPatch {
  return { summary: '测试修改', rationale: '测试', ops, questions: [] };
}

/* ------------------------------------------------------------------ */
/* Valid / invalid ops                                                */
/* ------------------------------------------------------------------ */

describe('executeDesignPatch', () => {
  it('applies a valid patch and stamps AI meta', () => {
    const project = testProject();
    const sofaId = project.furniture[0]!.id;
    const result = executeDesignPatch(
      project,
      basePatch([
        { op: 'setStyle', presetId: 'cream', customName: '奶油' },
        { op: 'setRoomMaterial', roomId: 'room-living', scope: 'floor', materialId: 'floor-oak' },
        { op: 'setFurniture', itemId: sofaId, patch: { color: '#D8D3CA', materialId: 'fabric-linen-grey' } },
        { op: 'addFurniture', roomId: 'room-living', skuId: 'tv-cabinet', qty: 1 },
      ]),
      { deps: deps() },
    );

    expect(result.rejected).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.diff.furnitureAdded).toHaveLength(1);
    expect(result.diff.furnitureUpdated[0]?.changes).toContain('颜色');
    expect(result.project.style.id).toBe('cream');
    const sofa = result.project.furniture.find((item) => item.id === sofaId)!;
    expect(sofa.color).toBe('#D8D3CA');
    expect(sofa.meta?.source).toBe('ai');
    expect(result.project.furniture[result.project.furniture.length - 1]!.meta?.source).toBe('ai');
    expect(result.applied.length).toBeGreaterThan(0);
    // Source project is not mutated by the pure executor.
    expect(project.style.id).not.toBe('cream');
    expect(project.furniture).toHaveLength(1);
  });

  it('rejects unknown rooms, furniture, materials and skus with reasons', () => {
    const project = testProject();
    const result = executeDesignPatch(
      project,
      basePatch([
        { op: 'addFurniture', roomId: 'room-missing', skuId: 'tv-cabinet', qty: 1 },
        { op: 'setFurniture', itemId: 'furn-missing', patch: { w: 1800 } },
        { op: 'setRoomMaterial', roomId: 'room-living', scope: 'floor', materialId: 'mat-missing' },
        { op: 'addFurniture', roomId: 'room-bath', skuId: 'sku-missing', qty: 1 },
        { op: 'removeFurniture', itemId: 'furn-missing' },
      ]),
      { deps: deps() },
    );
    expect(result.changed).toBe(false);
    expect(result.rejected).toHaveLength(5);
    const reasons = result.rejected.map((entry) => entry.reason).join('\n');
    expect(reasons).toContain('房间不存在');
    expect(reasons).toContain('家具不存在');
    expect(reasons).toContain('材质不存在');
    expect(reasons).toContain('找不到家具 SKU');
  });

  it('clamps furniture dimensions into schema bounds', () => {
    const project = testProject();
    const sofaId = project.furniture[0]!.id;
    const result = executeDesignPatch(
      project,
      basePatch([{ op: 'setFurniture', itemId: sofaId, patch: { w: 999_999, d: 1, h: 99_999, rotation: 999 } }]),
      { deps: deps() },
    );
    expect(result.rejected).toEqual([]);
    const sofa = result.project.furniture.find((item) => item.id === sofaId)!;
    expect(sofa.w).toBe(8000);
    expect(sofa.d).toBe(50);
    expect(sofa.h).toBe(4000);
    expect(sofa.rotation).toBeLessThanOrEqual(360);
  });

  it('resolves nearest sku by category / case-insensitive id', () => {
    expect(resolveNearestSkuIn(deps(), { category: 'sofa' })?.id).toBe('sofa-3');
    expect(resolveNearestSkuIn(deps(), { skuId: 'SOFA-3' })?.id).toBe('sofa-3');
    expect(resolveNearestSkuIn(deps(), { skuId: 'tv' })?.id).toBe('tv-cabinet');
    expect(resolveNearestSkuIn(deps(), { category: 'spaceship' })).toBeUndefined();

    const project = testProject();
    const result = executeDesignPatch(
      project,
      basePatch([{ op: 'addFurniture', roomId: 'room-living', skuId: 'SOFA-3', qty: 1 }]),
      { deps: deps() },
    );
    expect(result.rejected).toEqual([]);
    expect(result.diff.furnitureAdded).toHaveLength(1);
  });

  it('removes, replaces and nudges furniture without leaving its room', () => {
    const project = testProject();
    const sofaId = project.furniture[0]!.id;
    const replace = executeDesignPatch(
      project,
      basePatch([{ op: 'replaceFurniture', itemId: sofaId, skuId: 'bed-double' }]),
      { deps: deps() },
    );
    expect(replace.rejected).toEqual([]);
    expect(replace.project.furniture[0]!.skuId).toBe('bed-double');

    const nudge = executeDesignPatch(
      project,
      basePatch([{ op: 'nudgeFurniture', itemId: sofaId, dx: 10_000, dy: 10_000, rotDelta: 0 }]),
      { deps: deps() },
    );
    const nudged = nudge.project.furniture[0]!;
    expect(nudged.x).toBeGreaterThanOrEqual(0);
    expect(nudged.x).toBeLessThanOrEqual(4000);
    expect(nudged.y).toBeGreaterThanOrEqual(0);
    expect(nudged.y).toBeLessThanOrEqual(3000);

    const remove = executeDesignPatch(project, basePatch([{ op: 'removeFurniture', itemId: sofaId }]), {
      deps: deps(),
    });
    expect(remove.project.furniture).toHaveLength(0);
    expect(remove.diff.furnitureRemoved).toHaveLength(1);
  });

  it('adds and removes MEP points and updates circuits', () => {
    const project = testProject();
    const added = executeDesignPatch(
      project,
      basePatch([{ op: 'addMep', roomId: 'room-bath', kinds: ['socket', 'water-cold', 'floor-drain'], count: 2 }]),
      { deps: deps() },
    );
    expect(added.rejected).toEqual([]);
    expect(added.project.mep.devices).toHaveLength(6);
    expect(added.project.mep.devices.every((device) => device.meta?.source === 'ai')).toBe(true);
    for (const device of added.project.mep.devices) {
      expect(device.roomId).toBe('room-bath');
      expect(device.circuitId).toBeTruthy();
    }
    const deviceId = added.project.mep.devices[0]!.id;
    const removed = executeDesignPatch(added.project, basePatch([{ op: 'removeMep', deviceId }]), {
      deps: deps(),
    });
    expect(removed.project.mep.devices).toHaveLength(5);
  });

  it('rejects duplicate circuit ids', () => {
    const project = testProject();
    project.mep.devices = [createMepDevice({ kind: 'socket', x: 10, y: 10, roomId: 'room-living' })];
    const deviceId = project.mep.devices[0]!.id;
    const result = executeDesignPatch(
      project,
      basePatch([
        {
          op: 'setCircuits',
          circuits: [
            { id: 'c1', name: '照明', wire: '1.5', amp: 10, color: '#C98A1C', deviceIds: [deviceId] },
            { id: 'c1', name: '重复', wire: '2.5', amp: 16, color: '#B57A12', deviceIds: [] },
          ],
        },
      ]),
      { deps: deps() },
    );
    expect(result.rejected[0]?.reason).toContain('回路 id 重复');
  });
});

/* ------------------------------------------------------------------ */
/* Brief -> diff                                                      */
/* ------------------------------------------------------------------ */

function testBrief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    id: 'brief-test',
    variantLabel: '测试方案',
    summary: '奶油风整体方案',
    style: { presetId: 'cream', customName: '奶油', tokens: { wall: '#F5EFE4' }, moodKeywords: ['温暖'], rationale: '亮' },
    rooms: [{ roomId: 'room-living', type: 'living', program: ['观影'], priority: 1, notes: '' }],
    furniture: [
      { roomId: 'room-living', skuId: 'sofa-3', category: 'sofa', qty: 1, note: '' },
      { roomId: 'room-master', skuId: 'bed-double', category: 'bed', qty: 1, note: '' },
    ],
    materials: [{ scope: 'floor', roomId: 'room-living', materialId: 'floor-oak', note: '' }],
    mep: [{ roomId: 'room-living', kinds: ['socket'], note: '' }],
    budget: { targetCny: 150_000, estimateCny: 138_000, level: '舒适' },
    constraints: { pets: true, keep: [], avoid: [] },
    questions: [],
    assumptions: ['保留承重墙'],
    ...overrides,
  };
}

describe('executeDesignBrief', () => {
  it('applies style, materials, furniture and MEP through the local fallback engine', () => {
    const project = testProject();
    const result = executeDesignBrief(project, testBrief(), 'replace', { deps: deps() });

    expect(result.diff.styleChanged).toBe(true);
    expect(result.project.style.id).toBe('cream');
    expect(result.diff.materialsUpdated).toBeGreaterThan(0);
    expect(result.diff.furnitureAdded.length).toBeGreaterThanOrEqual(2);
    expect(result.diff.mepAdded).toBeGreaterThanOrEqual(1);
    expect(result.project.rooms.find((room) => room.id === 'room-living')!.floorMaterialId).toBe('floor-oak');
    for (const item of result.project.furniture) {
      expect(item.meta?.source).toBe('ai');
    }
    expect(summarizeDiff(result.diff).join('；')).toContain('新增家具');
  });

  it('style-only mode never touches furniture or MEP', () => {
    const project = testProject();
    const result = executeDesignBrief(project, testBrief(), 'style-only', { deps: deps() });
    expect(result.project.style.id).toBe('cream');
    expect(diffProjects(project, result.project).furnitureAdded).toHaveLength(0);
    expect(result.project.furniture).toHaveLength(project.furniture.length);
    expect(result.project.mep.devices).toHaveLength(0);
  });

  it('replace mode clears furniture only inside the brief scope', () => {
    const project = testProject();
    project.furniture.push(
      createFurnitureItem({
        skuId: 'bed-double',
        name: '双人床',
        x: 5000,
        y: 1400,
        w: 1500,
        d: 2000,
        h: 900,
        roomId: 'room-master',
      }),
    );
    const brief = testBrief({ furniture: [] });
    const result = executeDesignBrief(project, brief, 'replace', { deps: deps() });
    expect(result.project.furniture.some((item) => item.roomId === 'room-living')).toBe(false);
    expect(result.project.furniture.some((item) => item.roomId === 'room-master')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Store commit: exactly one undo step                                */
/* ------------------------------------------------------------------ */

describe('applyPatchToDoc', () => {
  it('writes one undoable history entry and undo restores the document', () => {
    const project = testProject();
    useDocStore.getState().loadProject(structuredClone(project));
    const before = useDocStore.getState().doc.furniture.length;
    const historyBefore = useDocStore.getState().past.length;

    const result = applyPatchToDoc(basePatch([{ op: 'addFurniture', roomId: 'room-living', skuId: 'tv-cabinet', qty: 1 }]));
    expect(result.changed).toBe(true);
    expect(useDocStore.getState().past.length).toBe(historyBefore + 1);
    expect(useDocStore.getState().doc.furniture.length).toBe(before + 1);
    expect(useDocStore.getState().doc.aiMeta.lastPatchSummary).toBe('测试修改');

    expect(undoAppliedAiChange()).toBe(true);
    expect(useDocStore.getState().doc.furniture.length).toBe(before);
  });

  it('does not push history when every op is rejected', () => {
    const project = testProject();
    useDocStore.getState().loadProject(structuredClone(project));
    const historyBefore = useDocStore.getState().past.length;
    const result = applyPatchToDoc(basePatch([{ op: 'removeFurniture', itemId: 'furn-missing' }]));
    expect(result.changed).toBe(false);
    expect(useDocStore.getState().past.length).toBe(historyBefore);
  });
});

/* ------------------------------------------------------------------ */
/* Integration with @hdesign/autolayout (workstream B)                */
/* ------------------------------------------------------------------ */

describe('autolayout integration', () => {
  it('uses generateLayout / generateMep for a brief when the package provides them', async () => {
    const autolayout = (await import('@hdesign/autolayout')) as unknown as Record<string, unknown>;
    if (typeof autolayout.generateLayout !== 'function') return; // skip before B lands
    const { createDemoProjects } = await import('../store/seed');
    const project = createDemoProjects()[0]!;
    const result = executeDesignBrief(project, testBrief(), 'replace');
    expect(result.project.walls).toEqual(project.walls);
    expect(result.project.openings).toEqual(project.openings);
    expect(result.project.rooms.length).toBe(project.rooms.length);
    expect(result.diff.furnitureAdded.length).toBeGreaterThan(0);
    expect(result.project.style.id).toBe('cream');
    // Brief only named room-living / room-master for furniture; other rooms keep theirs.
    expect(result.project.furniture.some((item) => item.roomId === 'room-bedroom-2')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Wall safety                                                        */
/* ------------------------------------------------------------------ */

describe('walls and rooms remain untouched', () => {
  it('never adds/removes walls, openings or rooms', () => {
    const project = testProject();
    const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
    project.walls = [wall];
    project.openings = [createOpening(wall, 'door', 500, 900)];
    const result = executeDesignPatch(
      project,
      basePatch([
        { op: 'addFurniture', roomId: 'room-living', skuId: 'sofa-3', qty: 2 },
        { op: 'addMep', roomId: 'room-living', kinds: ['socket'], count: 4 },
        { op: 'setRoomType', roomId: 'room-master', type: 'kids-room' },
      ]),
      { deps: deps() },
    );
    expect(result.project.walls).toEqual(project.walls);
    expect(result.project.openings).toEqual(project.openings);
    expect(result.project.rooms.map((room) => room.id)).toEqual(project.rooms.map((room) => room.id));
  });
});
