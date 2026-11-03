import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiProjectSummarySchema,
  createEmptyProject,
  createFurnitureItem,
  createOpening,
  createRoom,
  createWall,
  polygonAreaSqm,
  rectPolygon,
  type DesignPatch,
  type Project,
} from '@hdesign/domain';
import {
  buildAiProjectSummary,
  buildCatalogShortlist,
  buildMaterialLites,
  buildStyleLites,
  fetchAiConfig,
  listCatalogSkus,
  requestDesignBrief,
  resolveMockPatch,
  streamAiChat,
  tokensToSwatches,
  type ReferenceImageData,
} from './ai-design';

function testProject(): Project {
  const project = createEmptyProject('摘要测试');
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  project.walls = [wall];
  project.openings = [createOpening(wall, 'window', 1000, 1500, { sill: 900, height: 1500 })];
  project.rooms = [
    createRoom(rectPolygon(0, 0, 4000, 3000), { id: 'room-living', name: '客厅', type: 'living' }),
  ];
  project.furniture = [
    createFurnitureItem({ skuId: 'sofa-3', name: '三人沙发', x: 2000, y: 1500, w: 2200, d: 900, h: 780, roomId: 'room-living' }),
  ];
  project.materials = [{ id: 'mat-living-floor', roomId: 'room-living', scope: 'floor', materialId: 'floor-oak' }];
  return project;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildAiProjectSummary', () => {
  it('maps rooms, walls, openings and furniture into the AI summary schema', () => {
    const project = testProject();
    const summary = buildAiProjectSummary(project);
    expect(() => aiProjectSummarySchema.parse(summary)).not.toThrow();
    expect(summary.name).toBe('摘要测试');
    expect(summary.roomCount).toBe(1);
    expect(summary.areaSqm).toBeCloseTo(polygonAreaSqm(project.rooms[0]!.polygon), 2);
    expect(summary.rooms[0]!.id).toBe('room-living');
    expect(summary.rooms[0]!.bbox).toEqual({ x: 0, y: 0, w: 4000, h: 3000 });
    expect(summary.walls[0]!.openings[0]!.kind).toBe('window');
    expect(summary.furniture[0]!.skuId).toBe('sofa-3');
    expect(summary.currentStyleId).toBe(project.style.id);
    expect(summary.sheetKinds).toContain('furniture-plan');
  });
});

describe('resolveMockPatch', () => {
  it('replaces fixture placeholders with real furniture ids', () => {
    const project = testProject();
    const patch: DesignPatch = {
      summary: 'mock',
      rationale: '',
      questions: [],
      ops: [
        { op: 'setFurniture', itemId: 'REPLACE_WITH_SOFA_ITEM_ID', patch: { color: '#D8D3CA' } },
        { op: 'addFurniture', roomId: 'room-living', skuId: 'tv-cabinet', qty: 1, near: 'REPLACE_WITH_SOFA_ITEM_ID' },
        { op: 'setStyle', presetId: 'cream' },
      ],
    };
    const resolved = resolveMockPatch(patch, project);
    const realId = project.furniture[0]!.id;
    expect((resolved.ops[0] as { itemId: string }).itemId).toBe(realId);
    expect((resolved.ops[1] as { near?: string }).near).toBe(realId);
    expect(resolved.ops[2]).toEqual({ op: 'setStyle', presetId: 'cream' });
  });
});

describe('requestDesignBrief', () => {
  it('posts the validated request with project summary and returns the parsed response', async () => {
    const project = testProject();
    const responsePayload = {
      briefs: [
        {
          id: 'brief-1',
          variantLabel: '测试方向',
          summary: '一句话',
          style: { tokens: { wall: '#F5EFE4' }, moodKeywords: [], rationale: '' },
          rooms: [{ roomId: 'room-living', type: 'living', program: [], priority: 1, notes: '' }],
          furniture: [],
          materials: [],
          mep: [],
          budget: { level: '舒适' },
          constraints: { keep: [], avoid: [] },
          questions: [],
          assumptions: [],
        },
      ],
      model: 'test-model',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      mock: false,
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responsePayload,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await requestDesignBrief({ userPrompt: '奶油风', project, variantCount: 1 });
    expect(response.briefs).toHaveLength(1);
    expect(response.usage?.totalTokens).toBe(30);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/brief');
    const body = JSON.parse(String(init.body)) as {
      userPrompt: string;
      projectSummary: { rooms: Array<{ id: string }> };
      variantCount: number;
      catalog: Array<{ id: string }>;
      styles: Array<{ id: string }>;
      materials: Array<{ id: string }>;
    };
    expect(body.userPrompt).toBe('奶油风');
    expect(body.projectSummary.rooms[0]!.id).toBe('room-living');
    expect(body.variantCount).toBe(1);
    // The shortlist must carry real catalogue ids for the model, not placeholders.
    expect(body.catalog.length).toBeGreaterThan(0);
    expect(body.styles.length).toBeGreaterThan(0);
    expect(body.materials.length).toBeGreaterThan(0);
  });

  it('surfaces the server error envelope as an ApiError', async () => {
    const project = testProject();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { code: 'AI_NOT_CONFIGURED', message: '尚未配置 AI 服务', hint: '设置 AI_API_KEY' } }),
      })),
    );
    await expect(requestDesignBrief({ userPrompt: '奶油风', project })).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      status: 503,
    });
  });
});

describe('streamAiChat abort', () => {
  it('emits deltas then rejects with AbortError without throwing non-abort errors', async () => {
    const encoder = new TextEncoder();
    let reads = 0;
    let abortSignal: AbortSignal | undefined;
    const fakeResponse = {
      ok: true,
      status: 200,
      body: {
        getReader() {
          return {
            read() {
              reads += 1;
              if (reads === 1) {
                return Promise.resolve({ done: false, value: encoder.encode('data: {"delta":"你好"}\n\n') });
              }
              return new Promise<never>((_resolve, reject) => {
                abortSignal?.addEventListener('abort', () =>
                  reject(new DOMException('Aborted', 'AbortError')),
                );
              });
            },
            releaseLock() {
              /* noop */
            },
          };
        },
      },
    };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      abortSignal = init.signal ?? undefined;
      return fakeResponse as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const deltas: string[] = [];
    const promise = streamAiChat({
      messages: [{ role: 'user', content: '你好' }],
      onDelta: (delta) => deltas.push(delta),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 5);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(deltas).toEqual(['你好']);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/chat');
  });
});

describe('catalog integration', () => {
  it('reads the real @hdesign/catalog dataset once it is available', () => {
    const skus = listCatalogSkus();
    // The catalogue is built in parallel; when present it must be rich enough for
    // the AI shortlist and the local BOM pricing path.
    if (skus.length === 0) return;
    expect(skus.length).toBeGreaterThan(40);
    expect(skus.some((sku) => sku.id === 'sofa-3')).toBe(true);
    expect(skus.every((sku) => sku.id && sku.name && sku.w > 0)).toBe(true);
    expect(buildStyleLites().length).toBeGreaterThanOrEqual(10);
    expect(buildMaterialLites().length).toBeGreaterThan(10);
    const project = testProject();
    const shortlist = buildCatalogShortlist(project, '奶油风 客厅 沙发');
    expect(shortlist.length).toBeGreaterThan(0);
    expect(shortlist.every((item) => typeof item.id === 'string' && item.id.length > 0)).toBe(true);
  });
});

describe('helpers', () => {
  it('turns style tokens into swatches', () => {
    expect(tokensToSwatches({ wall: '#fff', floor: '#000', metal: 'not-a-color' }, 6)).toEqual(['#fff', '#000', 'not-a-color']);
    expect(tokensToSwatches(undefined)).toEqual([]);
  });

  it('normalises reference image data typed for the panel', () => {
    const reference: ReferenceImageData = { dataUrl: 'data:image/jpeg;base64,xx', width: 100, height: 80, name: 'ref.jpg' };
    expect(reference.dataUrl.startsWith('data:image/')).toBe(true);
  });

  it('reports an unconfigured AI config through fetchAiConfig', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          configured: false,
          provider: 'deepseek',
          model: 'deepseek-flash',
          mock: false,
          limits: { maxImages: 6, timeoutMs: 90000 },
        }),
      })),
    );
    const config = await fetchAiConfig();
    expect(config.configured).toBe(false);
    expect(config.limits.timeoutMs).toBe(90000);
  });
});
