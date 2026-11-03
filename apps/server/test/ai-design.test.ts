import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  aiStyleResponseSchema,
  designBriefSchema,
  designPatchSchema,
  type AiBriefRequest,
  type AiChatRequest,
  type AiPatchRequest,
  type AiStyleRequest,
} from '@hdesign/domain';
import { buildDesignBriefPrompt } from '../src/prompts/design-brief';
import { buildDesignPatchPrompt } from '../src/prompts/design-patch';
import { buildStyleFromImagePrompt } from '../src/prompts/style-from-image';
import { buildChatSystemPrompt } from '../src/prompts/chat-system';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ai/', import.meta.url));

async function readFixture(name: string): Promise<unknown> {
  const raw = await readFile(`${FIXTURES}${name}.json`, 'utf8');
  return JSON.parse(raw) as unknown;
}

/* ------------------------------------------------------------------ */
/* Project summary / request fixtures                                 */
/* ------------------------------------------------------------------ */

const PROJECT_SUMMARY = {
  name: '两室两厅 · 样板 A',
  areaSqm: 89,
  roomCount: 3,
  levelHeight: 2800,
  rooms: [
    { id: 'room-living', name: '客厅 / 餐厅', type: 'living' as const, areaSqm: 36, bbox: { x: 0, y: 0, w: 6000, h: 6000 } },
    { id: 'room-master', name: '主卧', type: 'master-bedroom' as const, areaSqm: 13, bbox: { x: 0, y: 0, w: 2000, h: 2000 } },
  ],
  walls: [
    {
      id: 'wall-1',
      length: 6000,
      thickness: 240,
      isLoadBearing: true,
      openings: [{ kind: 'window', width: 1800, height: 1500, sill: 900 }],
    },
  ],
  furniture: [
    { id: 'furn-1', skuId: 'sofa-3', name: '三人沙发', roomId: 'room-living', w: 2200, d: 900, h: 780, color: '#A9A294' },
  ],
  currentStyleId: 'cream',
  materials: [],
  sheetKinds: ['furniture-plan' as const, 'bom' as const],
};

function briefBody(variantCount = 2): AiBriefRequest {
  return {
    userPrompt: '89㎡两居，奶油风，预算 15 万，有猫，客厅要投影',
    projectSummary: PROJECT_SUMMARY,
    catalog: [{ id: 'sofa-3', name: '三人沙发', category: 'sofa', w: 2200, d: 900, h: 780, tags: [] }],
    styles: [{ id: 'cream', name: '奶油', description: '', tokens: { wall: '#F5EFE4' } }],
    materials: [{ id: 'floor-oak', name: '橡木地板', scope: 'floor', color: '#C9A97D' }],
    variantCount,
    locale: 'zh-CN',
  };
}

function patchBody(): AiPatchRequest {
  return {
    userPrompt: '把客厅沙发换成浅灰布艺',
    projectSummary: PROJECT_SUMMARY,
    catalog: [{ id: 'sofa-3', name: '三人沙发', category: 'sofa', w: 2200, d: 900, h: 780, tags: [] }],
    selection: { roomId: 'room-living', itemIds: ['furn-1'] },
    locale: 'zh-CN',
  };
}

function styleBody(): AiStyleRequest {
  return { image: 'data:image/jpeg;base64,AAAA', hint: '日式松弛感', locale: 'zh-CN' };
}

function chatBody(): AiChatRequest {
  return { messages: [{ role: 'user', content: '客厅采光不好怎么改善？' }], projectSummary: PROJECT_SUMMARY, locale: 'zh-CN' };
}

/**
 * Mount a route with the same AiError -> JSON envelope mapping as server index.ts.
 * Route modules throw AiError; only the root app has onError installed.
 */
function mountWithErrorEnvelope(router: Hono): Hono {
  const app = new Hono();
  app.route('/', router);
  app.onError((error, c) => {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown; hint?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.status === 'number') {
      return c.json(
        {
          error: {
            code: candidate.code,
            message: typeof candidate.message === 'string' ? candidate.message : 'AI 请求失败',
            hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
          },
        },
        candidate.status as 400 | 401 | 403 | 404 | 413 | 429 | 500 | 502 | 503 | 504,
      );
    }
    return c.json({ error: { code: 'INTERNAL', message: '服务端内部错误' } }, 500);
  });
  return app;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

describe('AI fixtures', () => {
  const ROOM_IDS = ['room-living', 'room-master', 'room-bedroom-2', 'room-kitchen', 'room-bath', 'room-study'];
  const SKU_IDS = [
    'sofa-3',
    'sofa-2',
    'coffee-table',
    'tv-cabinet',
    'rug',
    'dining-table',
    'dining-chair',
    'floor-lamp',
    'plant',
    'bed-double',
    'bed-single',
    'nightstand',
    'wardrobe',
    'desk',
    'chair',
    'kitchen-counter',
    'fridge',
    'shower',
    'toilet',
    'vanity',
    'bookshelf',
  ];
  const MATERIAL_IDS = [
    'floor-oak',
    'floor-oak-walnut',
    'floor-tile-600',
    'floor-tile-anti-slip',
    'wall-latex-warm',
  ];
  const STYLE_IDS = [
    'modern-minimal',
    'cream',
    'nordic',
    'japandi',
    'new-chinese',
    'light-luxury',
    'loft',
    'mid-century',
    'wabi-sabi',
    'american-retro',
    'dopamine',
    'mono',
  ];
  const MEP_KINDS = [
    'socket',
    'socket-16a',
    'switch',
    'switch-double',
    'light',
    'light-spot',
    'ac',
    'weak-current',
    'water-cold',
    'water-hot',
    'drain',
    'floor-drain',
    'gas',
    'floor-heat',
  ];

  it('brief.json validates against the response schema and uses real ids', async () => {
    const fixture = (await readFixture('brief')) as { briefs: unknown[] };
    const parsed = z.object({ briefs: z.array(designBriefSchema).min(1).max(3) }).parse(fixture);
    expect(parsed.briefs.length).toBeGreaterThanOrEqual(2);
    for (const brief of parsed.briefs) {
      expect(brief.variantLabel.length).toBeGreaterThan(0);
      if (brief.style.presetId) expect(STYLE_IDS).toContain(brief.style.presetId);
      for (const room of brief.rooms) {
        if (room.roomId) expect(ROOM_IDS).toContain(room.roomId);
      }
      for (const item of brief.furniture) {
        if (item.skuId) expect(SKU_IDS).toContain(item.skuId);
        if (item.roomId) expect(ROOM_IDS).toContain(item.roomId);
      }
      for (const material of brief.materials) {
        if (material.materialId) expect(MATERIAL_IDS).toContain(material.materialId);
      }
      for (const entry of brief.mep) {
        for (const kind of entry.kinds) expect(MEP_KINDS).toContain(kind);
      }
    }
  });

  it('patch.json validates and only references real room/sku/material ids', async () => {
    const fixture = await readFixture('patch');
    const patch = designPatchSchema.parse(fixture);
    expect(patch.ops.length).toBeGreaterThan(0);
    expect(patch.summary.length).toBeGreaterThan(0);
    for (const op of patch.ops) {
      expect(op.op).toBeTruthy();
      // No coordinates in the wire protocol.
      expect(Object.keys(op)).not.toContain('x');
      expect(Object.keys(op)).not.toContain('y');
      if ('roomId' in op) expect(ROOM_IDS).toContain(op.roomId);
      if ('skuId' in op) expect(SKU_IDS).toContain(op.skuId);
      if (op.op === 'setRoomMaterial') expect(MATERIAL_IDS).toContain(op.materialId);
      if (op.op === 'setStyle' && op.presetId) expect(STYLE_IDS).toContain(op.presetId);
    }
  });

  it('style.json validates against the vision response schema', async () => {
    const fixture = await readFixture('style');
    const style = aiStyleResponseSchema.shape.style.parse(fixture);
    expect(style.name.length).toBeGreaterThan(0);
    expect(Object.keys(style.tokens).length).toBeGreaterThan(2);
    for (const value of Object.values(style.tokens)) {
      if (value) expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('chat.json is a plain Chinese answer for the mock streaming provider', async () => {
    const fixture = await readFixture('chat');
    expect(typeof fixture).toBe('string');
    const text = fixture as string;
    expect(text.length).toBeGreaterThan(40);
    expect(text).toMatch(/[\u4e00-\u9fa5]/);
    expect(text).not.toContain('[DONE]');
  });
});

/* ------------------------------------------------------------------ */
/* Prompts                                                            */
/* ------------------------------------------------------------------ */

describe('prompts', () => {
  it('brief prompt is JSON-mode friendly, Chinese and example-driven', () => {
    const prompt = buildDesignBriefPrompt({
      ...briefBody(),
      referenceImage: 'data:image/jpeg;base64,AA',
    });
    expect(prompt.system).toMatch(/json/i);
    expect(prompt.system).toContain('"briefs"');
    expect(prompt.system).toContain('roomId');
    expect(prompt.system).toContain('坐标');
    expect(prompt.system).toContain('questions');
    expect(prompt.system).toContain('budget');
    expect(prompt.user).toContain('参考图');
    expect(prompt.user).toContain('json 上下文');
    expect(prompt.user).toContain('89㎡两居');
    expect(prompt.user).toContain('room-living');
    expect(prompt.system).toContain('示例');
  });

  it('patch prompt documents the op whitelist and forbids coordinates', () => {
    const prompt = buildDesignPatchPrompt(patchBody());
    expect(prompt.system).toMatch(/json/i);
    expect(prompt.system).toContain('"ops"');
    for (const op of [
      'setStyle',
      'setRoomMaterial',
      'setRoomType',
      'setFurniture',
      'addFurniture',
      'replaceFurniture',
      'removeFurniture',
      'nudgeFurniture',
      'regenerateRoom',
      'addMep',
      'removeMep',
      'setCircuits',
    ]) {
      expect(prompt.system).toContain(op);
    }
    expect(prompt.system).toContain('绝不输出坐标');
    expect(prompt.user).toContain('把客厅沙发换成浅灰布艺');
  });

  it('style prompt asks for hex tokens and Chinese material names', () => {
    const prompt = buildStyleFromImagePrompt(styleBody());
    expect(prompt.system).toMatch(/json/i);
    expect(prompt.system).toContain('tokens');
    expect(prompt.system).toContain('#RRGGBB');
    expect(prompt.user).toContain('日式松弛感');
  });

  it('chat prompt embeds the project context without leaking markup', () => {
    const system = buildChatSystemPrompt(PROJECT_SUMMARY);
    expect(system).toContain('客厅 / 餐厅');
    expect(system).toContain('两室两厅');
    // Only the compact context is embedded, never raw project geometry.
    expect(system).not.toContain('bbox');
  });
});

/* ------------------------------------------------------------------ */
/* Routes (AI_MOCK=1)                                                 */
/* ------------------------------------------------------------------ */

describe('AI routes with AI_MOCK=1', () => {
  const originalMock = process.env.AI_MOCK;
  const originalKey = process.env.AI_API_KEY;
  let designRouter: { request: (input: string, init?: RequestInit) => Promise<Response> };
  let chatRouter: { request: (input: string, init?: RequestInit) => Promise<Response> };

  beforeAll(async () => {
    process.env.AI_MOCK = '1';
    vi.resetModules();
    designRouter = mountWithErrorEnvelope(
      (await import('../src/routes/design')).default,
    ) as unknown as typeof designRouter;
    chatRouter = mountWithErrorEnvelope((await import('../src/routes/chat')).default) as unknown as typeof chatRouter;
  });

  afterAll(() => {
    if (originalMock === undefined) delete process.env.AI_MOCK;
    else process.env.AI_MOCK = originalMock;
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const post = (router: typeof designRouter, path: string, body: unknown) =>
    router.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 2 validated brief variants with usage and mock=true', async () => {
    const response = await post(designRouter, '/brief', briefBody(2));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      briefs: Array<{ id: string; variantLabel: string }>;
      model: string;
      mock: boolean;
      usage?: { totalTokens?: number };
    };
    expect(body.briefs).toHaveLength(2);
    expect(new Set(body.briefs.map((brief) => brief.id)).size).toBe(2);
    expect(body.mock).toBe(true);
    expect(body.usage?.totalTokens).toBeGreaterThan(0);
  });

  it('returns a validated design patch', async () => {
    const response = await post(designRouter, '/patch', patchBody());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { patch: { summary: string; ops: unknown[] }; mock: boolean };
    expect(body.patch.ops.length).toBeGreaterThan(0);
    expect(body.patch.summary.length).toBeGreaterThan(0);
    expect(body.mock).toBe(true);
  });

  it('returns validated style tokens from a reference image', async () => {
    const response = await post(designRouter, '/style-from-image', styleBody());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { style: { name: string; tokens: Record<string, string> } };
    expect(body.style.name.length).toBeGreaterThan(0);
    expect(Object.keys(body.style.tokens).length).toBeGreaterThan(0);
  });

  it('streams SSE deltas and terminates with [DONE]', async () => {
    const response = await post(chatRouter, '/chat', chatBody());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('data: {"delta":"');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(text).toContain('data: [DONE]');
  });

  it('validates request bodies before touching the provider (400)', async () => {
    const response = await post(designRouter, '/brief', { userPrompt: '', projectSummary: {} });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
});

/* ------------------------------------------------------------------ */
/* Routes (unconfigured)                                              */
/* ------------------------------------------------------------------ */

describe('AI routes without configuration', () => {
  const originalMock = process.env.AI_MOCK;
  const originalKey = process.env.AI_API_KEY;

  afterAll(() => {
    if (originalMock === undefined) delete process.env.AI_MOCK;
    else process.env.AI_MOCK = originalMock;
    if (originalKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = originalKey;
    vi.resetModules();
  });

  it('returns an explicit 503 envelope for brief/patch/style/chat', async () => {
    process.env.AI_MOCK = '0';
    process.env.AI_API_KEY = '';
    vi.resetModules();
    const designRouter = mountWithErrorEnvelope((await import('../src/routes/design')).default) as unknown as {
      request: (input: string, init?: RequestInit) => Promise<Response>;
    };
    const chatRouter = mountWithErrorEnvelope((await import('../src/routes/chat')).default) as unknown as {
      request: (input: string, init?: RequestInit) => Promise<Response>;
    };
    const request = (router: typeof designRouter, path: string, body: unknown) =>
      router.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    for (const [router, path, body] of [
      [designRouter, '/brief', briefBody()],
      [designRouter, '/patch', patchBody()],
      [designRouter, '/style-from-image', styleBody()],
      [chatRouter, '/chat', chatBody()],
    ] as const) {
      const response = await request(router, path, body);
      expect(response.status).toBe(503);
      const payload = (await response.json()) as { error: { code: string; hint?: string } };
      expect(payload.error.code).toBe('AI_NOT_CONFIGURED');
      expect(payload.error.hint).toContain('AI_API_KEY');
    }
  });
});
