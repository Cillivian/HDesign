import { describe, expect, it } from 'vitest';
import type { AiParseRequest } from '@hdesign/domain';
import { PARSE_PLAN_SYSTEM_PROMPT, buildParsePlanPrompt } from '../src/prompts/parse-plan';

/**
 * Guards the CAD-aware vision prompt from behavioural regressions:
 *  - annotation/dimension lines must be explicitly excluded from walls;
 *  - dimensions must carry a pixel span and scale must be span-derived
 *    (the old "divide by image width" guidance produced 9.2 instead of 12.08);
 *  - calibration hints must render into the user message and stay optional.
 */

const PNG = 'data:image/png;base64,AAAA';

function makeRequest(overrides: Partial<AiParseRequest> = {}): AiParseRequest {
  return {
    images: [
      { dataUrl: PNG, width: 1600, height: 1131 },
      { dataUrl: PNG, width: 992, height: 701, tile: { x: 0, y: 0, w: 992, h: 701 } },
    ],
    imageSize: { width: 2400, height: 1696 },
    locale: 'zh-CN',
    ...overrides,
  };
}

describe('PARSE_PLAN_SYSTEM_PROMPT: line taxonomy', () => {
  it('defines walls as thick drawn bands and lists every non-wall annotation line', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toContain('墙');
    // Walls are poché/double-line bands with drawn thickness.
    expect(system).toMatch(/实体带|poché/);
    // Negative examples required by the bug report.
    for (const term of [
      '尺寸链',
      '尺寸界线',
      '斜短划线',
      '点划线',
      '轴号',
      '引出线',
      '开启弧',
      '虚线',
      '保温层',
      '家具',
      '文字',
    ]) {
      expect(system, `taxonomy must mention ${term}`).toContain(term);
    }
    expect(system).toMatch(/不是墙/);
  });

  it('gives a concrete minimum drawn thickness so 1-2 px annotation lines are dropped', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toContain('thicknessPx < 6');
    expect(system).toMatch(/1[–-]2 px/);
    expect(system).toMatch(/中心线/);
    expect(system).toMatch(/封闭的建筑外轮廓|外圈闭合/);
  });
});

describe('PARSE_PLAN_SYSTEM_PROMPT: dimensions and scale', () => {
  it('requires every chain segment with span and kind', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toContain('span');
    expect(system).toContain('kind');
    expect(system).toMatch(/每一個|每一个/);
    expect(system).toMatch(/'segment'/);
    expect(system).toMatch(/'total'/);
    expect(system).toMatch(/三条尺寸界线|两条尺寸界线/);
    // Never fall back to the image border.
    expect(system).toContain('图片边界');
    // Chain arithmetic guard.
    expect(system).toMatch(/>?3%|3%/);
    expect(system).toMatch(/diagnostics/);
  });

  it('defines mmPerPx from a dimension span and explicitly forbids the image width', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/valueMm\s*÷\s*它自己\s*span/);
    expect(system).toContain('绝对不要用图片宽度');
    // The exact wrong result the old prompt produced must be called out.
    // Generic worked example, not the reference drawing's measurements.
    expect(system).toContain('10400 ÷ 650');
    expect(system).toContain('16.0 mm/px');
    expect(system).toContain('10400 ÷ 图片宽(1600) = 6.5');
    // Sanity ranges.
    expect(system).toMatch(/100[–-]350 mm/);
    expect(system).toMatch(/700[–-]1000 mm/);
  });

  it('requires measured spans, consistent mm/px, and no geometry synthesized from an assumed scale', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    // Measure the chain on the image first; derive the scale from that span.
    expect(system).toMatch(/必须先量后算/);
    expect(system).toMatch(/不允许先用某个比例反推坐标/);
    expect(system).toMatch(/span 长度是否 ≈ valueMm ÷ 这个 mmPerPx/);
    // The worked example must not become a hidden answer key.
    expect(system).toMatch(/绝不要拿示例里的数字/);
    // Reverse-derivation must not become an excuse to move walls.
    expect(system).toMatch(/不要为了凑 span 去移动墙体端点/);
    expect(system).toMatch(/取整成 5 或 10/);
  });

  it('cross-checks the total dimension span against the wall envelope', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/交叉校验/);
    expect(system).toMatch(/水平总尺寸的 span 应与你输出外墙轮廓的宽度接近/);
    expect(system).toMatch(/70[–-]80%/);
  });

  it('asks for collinear wall segments to be merged instead of over-segmented', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/合并共线墙/);
    expect(system).toMatch(/15[–-]30 条/);
  });

  it('separates double-line walls from balcony rails and window lines', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/净距 ≥5 px/);
    expect(system).toMatch(/栏板\/窗\/分隔线/);
  });

  it('covers all four dimension chains and rejects mis-measured total spans', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/上方水平链/);
    expect(system).toMatch(/下方水平链/);
    expect(system).toMatch(/左侧垂直链/);
    expect(system).toMatch(/右侧垂直链/);
    // Vertical spans must be measured along y, not borrowed from a short segment.
    expect(system).toMatch(/垂直尺寸两端 x 相同/);
    expect(system).toMatch(/650 px 时却只量到 250 px/);
  });

  it('requires openings even when the wall centreline is drawn continuous', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/门窗仍要按门弧\/双线窗的位置输出 opening/);
    expect(system).toMatch(/10[–-]20 个门窗/);
  });

  it('does not hardcode the reference drawing anywhere in the system prompt', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    // These are the reference fixture's measurements; the prompt serves every drawing.
    for (const drawingSpecific of ['14700', '1217', '12.1', '8100', '9.19', '1800*2100']) {
      expect(system, `system prompt must not contain the reference value ${drawingSpecific}`).not.toContain(
        drawingSpecific,
      );
    }
    // Generic worked example instead.
    expect(system).toContain('10400');
    expect(system).toContain('650');
    expect(system).toContain('11000');
  });

  it('mentions dividing by the image width only as a forbidden counter-example', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    // No rule of the form "mmPerPx = valueMm / image width".
    expect(system).not.toMatch(/mmPerPx\s*=\s*[^。\n]*图片宽/);
    expect(system).not.toContain('分母用错');
    const warning = system.indexOf('绝对不要用图片宽度');
    const counterExample = system.indexOf('÷ 图片宽(1600)');
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(counterExample).toBeGreaterThan(warning);
  });

  it('does not keep the stale "guess a common scale" guidance', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).not.toContain('按常见比例估计');
    expect(system).not.toContain('用提示中的比例或按常见比例估计');
    // The only allowed division is by the dimension-line span.
    expect(system).toMatch(/不要用图片宽/);
  });
});

describe('PARSE_PLAN_SYSTEM_PROMPT: hints and structure', () => {
  it('explains overviewFactor and every local hint field', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    for (const term of [
      'overviewFactor',
      'hints.local.wallThicknessPx',
      'hints.local.wallCount',
      'hints.local.envelope',
      'hints.local.dimensions',
    ]) {
      expect(system, `system must explain ${term}`).toContain(term);
    }
    expect(system).toMatch(/锚点/);
  });

  it('documents the complete JSON shape including span/kind', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    for (const term of [
      '"image"',
      '"walls"',
      '"openings"',
      '"rooms"',
      '"labels"',
      '"dimensions"',
      '"scale"',
      '"confidence"',
      '"diagnostics"',
      '"thicknessPx"',
      '"widthPx"',
      '"mmPerPx"',
      '"span"',
      '"kind"',
    ]) {
      expect(system, `JSON example must document ${term}`).toContain(term);
    }
    expect(system).toMatch(/空数组也要输出/);
    expect(system).toMatch(/只输出 json/);
  });

  it('ends with the numbered pre-output self-check', () => {
    const system = PARSE_PLAN_SYSTEM_PROMPT;
    expect(system).toMatch(/输出前自检/);
    const tail = system.slice(system.indexOf('输出前自检'));
    for (let index = 1; index <= 6; index += 1) {
      expect(tail, `self-check item ${index}`).toMatch(new RegExp(`^${index}\\. `, 'm'));
    }
  });

  it('stays compact enough for the 6000-token output budget', () => {
    // System prompt is input; keep it under ~7000 chars so the model can still
    // spend its 6000 output tokens on walls + dimensions.
    expect(PARSE_PLAN_SYSTEM_PROMPT.length).toBeLessThan(7000);
  });
});

describe('buildParsePlanPrompt: user message', () => {
  it('declares the overview frame separately from the raster size', () => {
    const { user } = buildParsePlanPrompt(makeRequest());
    expect(user).toContain('2400 × 1696');
    expect(user).toContain('1600 × 1131');
    expect(user).toMatch(/所有输出坐标/);
  });

  it('lists the tile mapping for local crops', () => {
    const { user } = buildParsePlanPrompt(makeRequest());
    expect(user).toContain('x=0, y=0, w=992, h=701');
  });

  it('renders overviewFactor and local calibration hints', () => {
    const { user } = buildParsePlanPrompt(
      makeRequest({
        hints: {
          overviewFactor: 1.5,
          unit: 'mm',
          local: {
            wallThicknessPx: 21.33,
            wallCount: 20,
            envelope: { x: 20, y: 0, w: 1487.3, h: 1130 },
            dimensions: [
              { text: '10400', valueMm: 10400, x: 919, y: 18 },
              { text: '1300', valueMm: 1300, x: 200, y: 45 },
            ],
          },
        },
      }),
    );
    expect(user).toContain('hints.overviewFactor = 1.500');
    expect(user).toContain('hints.local.wallThicknessPx = 21.3 px');
    expect(user).toContain('hints.local.wallCount = 20');
    expect(user).toContain('hints.local.envelope');
    expect(user).toContain('x=20, y=0, w=1487.3, h=1130');
    expect(user).toContain('右边界 x=1507.3');
    expect(user).toContain('hints.local.dimensions');
    expect(user).toContain('"10400"，valueMm=10400 @ (919, 18)');
    expect(user).toContain('@ (200, 45)');
  });

  it('caps the OCR hint list at 40 entries', () => {
    const dimensions = Array.from({ length: 45 }, (_, index) => ({
      text: String(1000 + index),
      valueMm: 1000 + index,
      x: index,
      y: index,
    }));
    const { user } = buildParsePlanPrompt(
      makeRequest({ hints: { local: { dimensions } } }),
    );
    expect(user).toContain('共 45 条');
    expect(user).toContain('仅列前 40 条');
    expect(user).toContain('@ (39, 39)');
    expect(user).not.toContain('@ (40, 40)');
  });

  it('omits the hint section entirely when hints are absent', () => {
    const { user } = buildParsePlanPrompt(makeRequest());
    expect(user).not.toContain('校准提示');
    expect(user).not.toContain('hints.local');
    expect(user).not.toContain('undefined');
    // Still asks for the same output contract.
    expect(user).toMatch(/每个 dimension 都要带 span/);
    expect(user).toMatch(/只输出 json/);
  });

  it('omits the overviewFactor line when the drawing was not downscaled', () => {
    const { user } = buildParsePlanPrompt(
      makeRequest({
        imageSize: { width: 1600, height: 1131 },
        images: [{ dataUrl: PNG, width: 1600, height: 1131 }],
        hints: { overviewFactor: 1, local: { wallThicknessPx: 20, dimensions: [] } },
      }),
    );
    expect(user).not.toContain('hints.overviewFactor');
    expect(user).toContain('hints.local.wallThicknessPx');
  });

  it('keeps the legacy scale hint conditional on agreeing with the annotation', () => {
    const { user } = buildParsePlanPrompt(makeRequest({ hints: { scaleMmPerPx: 7.5 } }));
    expect(user).toContain('7.500 mm/px');
    expect(user).toMatch(/以标注为准/);
  });

  it('returns a system prompt identical to the exported constant', () => {
    expect(buildParsePlanPrompt(makeRequest()).system).toBe(PARSE_PLAN_SYSTEM_PROMPT);
  });
});
