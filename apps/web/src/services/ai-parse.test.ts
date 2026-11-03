import { describe, expect, it } from 'vitest';
import { aiParseRequestSchema, parseDraftSchema } from '@hdesign/domain';
import { estimateScaleFromDimensionSpans, type OcrToken } from '@hdesign/plan-recognition';
import { overviewFactorFor, scaledDraft } from './ai-parse';
import { buildLocalVisionHints } from '../import/useImportRecognition';

/**
 * Unit tests for the overview→raster projection and the local calibration hints.
 * No network: `enhanceWithVision` itself is covered by the import flow probes.
 */

function overviewDraft() {
  return parseDraftSchema.parse({
    image: { width: 1600, height: 1200 },
    walls: [
      { a: { x: 100, y: 100 }, b: { x: 1100, y: 100 }, thicknessPx: 24, confidence: 0.8 },
    ],
    openings: [{ kind: 'door', center: { x: 400, y: 100 }, widthPx: 80, confidence: 0.7 }],
    dimensions: [
      {
        text: '12080',
        valueMm: 12080,
        at: { x: 100, y: 50 },
        span: { a: { x: 10, y: 20 }, b: { x: 1010, y: 20 } },
        kind: 'segment',
        confidence: 0.8,
      },
    ],
    scale: { mmPerPx: 12.08, source: 'ai' },
  });
}

describe('overviewFactorFor', () => {
  it('matches the overview long-edge budget and never upscales', () => {
    expect(overviewFactorFor({ width: 2400, height: 1800 })).toBe(1.5);
    expect(overviewFactorFor({ width: 800, height: 600 })).toBe(1);
    expect(overviewFactorFor({ width: 1600, height: 1200 })).toBe(1);
  });
});

describe('scaledDraft (overview px → raster px)', () => {
  it('scales dimension span endpoints exactly like at, keeping valueMm and kind', () => {
    const scaled = scaledDraft(overviewDraft(), 1.5, 2400, 1800);
    expect(scaled.image).toEqual({ width: 2400, height: 1800 });

    const dimension = scaled.dimensions[0]!;
    expect(dimension.at).toEqual({ x: 150, y: 75 });
    expect(dimension.span).toBeDefined();
    expect(dimension.span!.a).toEqual({ x: 15, y: 30 });
    expect(dimension.span!.b).toEqual({ x: 1515, y: 30 });
    // Scale-independent fields survive the projection untouched.
    expect(dimension.valueMm).toBe(12080);
    expect(dimension.kind).toBe('segment');

    // Raster-frame scale is the overview estimate divided by the factor.
    expect(scaled.scale.mmPerPx).toBeCloseTo(8.053, 3);
    // Walls/openings are projected too (unchanged behaviour).
    expect(scaled.walls[0]!.thicknessPx).toBe(36);
    expect(scaled.openings[0]!.widthPx).toBe(120);
  });

  it('leaves a 1:1 draft untouched apart from the image size', () => {
    const draft = overviewDraft();
    const scaled = scaledDraft(draft, 1, 1600, 1200);
    expect(scaled.dimensions[0]!.span).toEqual(draft.dimensions[0]!.span);
    expect(scaled.walls[0]).toEqual(draft.walls[0]);
  });

  it('keeps the span-derived raster scale consistent with the merge estimator', () => {
    const scaled = scaledDraft(overviewDraft(), 1.5, 2400, 1800);
    const dimension = scaled.dimensions[0]!;
    const span = Math.hypot(
      dimension.span!.b.x - dimension.span!.a.x,
      dimension.span!.b.y - dimension.span!.a.y,
    );
    // 12080 mm over a 1500 px raster span: the 12.08 overview mm/px ↔ 8.05 raster mm/px pair.
    expect(dimension.valueMm! / span).toBeCloseTo(8.053, 3);

    // The merge estimator consumes the projected draft directly: one long total span
    // (1500 px ≥ 30% of the 2400 px long edge) is trusted on its own.
    const estimate = estimateScaleFromDimensionSpans(scaled.dimensions, scaled.image);
    expect(estimate).not.toBeNull();
    expect(estimate!.mmPerPx).toBeCloseTo(8.053, 3);
    expect(estimate!.trusted).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* hints.local                                                        */
/* ------------------------------------------------------------------ */

const RASTER_WALLS = [
  { a: { x: 100, y: 100 }, b: { x: 900, y: 100 }, thicknessPx: 12, confidence: 0.9 },
  { a: { x: 100, y: 100 }, b: { x: 100, y: 700 }, thicknessPx: 12, confidence: 0.9 },
];

function rasterDraft() {
  return parseDraftSchema.parse({
    image: { width: 1000, height: 800 },
    walls: RASTER_WALLS,
    scale: { mmPerPx: 10, source: 'assumed' },
  });
}

const TOKENS: OcrToken[] = [
  { text: '3600', x: 300, y: 200, confidence: 0.9 },
  { text: '客厅', x: 500, y: 400, confidence: 0.9 },
  { text: '3.6m', x: 120, y: 760, confidence: 0.8 },
];

describe('buildLocalVisionHints', () => {
  it('sends nothing when the local pass produced no walls', () => {
    const empty = parseDraftSchema.parse({ image: { width: 1000, height: 800 } });
    expect(buildLocalVisionHints(empty, undefined, TOKENS, 1.5)).toBeUndefined();
  });

  it('maps wall thickness, envelope and OCR dimensions into the overview frame', () => {
    const hints = buildLocalVisionHints(rasterDraft(), { medianThicknessPx: 12 }, TOKENS, 1.5);
    expect(hints).toBeDefined();
    expect(hints!.wallCount).toBe(2);
    // 12 raster px / 1.5 = 8 overview px.
    expect(hints!.wallThicknessPx).toBe(8);
    // Centerline bbox (100..900 × 100..700) expanded by half the wall band (6 px), then /1.5.
    expect(hints!.envelope).toEqual({ x: 62.67, y: 62.67, w: 541.33, h: 408 });
    expect(hints!.dimensions).toHaveLength(2);
    expect(hints!.dimensions[0]).toEqual({ text: '3600', valueMm: 3600, x: 200, y: 133.33 });
    expect(hints!.dimensions[1]).toEqual({ text: '3.6m', valueMm: 3600, x: 80, y: 506.67 });
  });

  it('ignores a thick-band debug estimate that disagrees with the emitted walls', () => {
    const hints = buildLocalVisionHints(rasterDraft(), { medianThicknessPx: 40 }, TOKENS, 1);
    expect(hints!.wallThicknessPx).toBe(12);
  });

  it('drops OCR noise so broken digits never become calibration anchors', () => {
    // Real CAD OCR returns fragments like these around dimension chains; only the
    // clean readings may be forwarded to the model as anchors.
    const noisy: OcrToken[] = [
      { text: '10', x: 10, y: 10, confidence: 0.4 },
      { text: '1', x: 20, y: 10, confidence: 0.5 },
      { text: '2', x: 30, y: 10, confidence: 0.55 },
      { text: '1S', x: 40, y: 10, confidence: 0.6 },
      { text: '10 10 | 6 | | ao | 1 | 2 |', x: 50, y: 10, confidence: 0.7 },
      { text: '14700', x: 60, y: 10, confidence: 0.9 },
      { text: '780', x: 70, y: 10, confidence: 0.7 },
    ];
    const hints = buildLocalVisionHints(rasterDraft(), { medianThicknessPx: 12 }, noisy, 1);
    expect(hints!.dimensions!.map((dimension) => dimension.text)).toEqual(['14700', '780']);
  });

  it('caps the dimension hints at 80 tokens', () => {
    const many: OcrToken[] = Array.from({ length: 120 }, (_, index) => ({
      text: String(1000 + index * 10),
      x: index,
      y: index,
    }));
    const hints = buildLocalVisionHints(rasterDraft(), { medianThicknessPx: 12 }, many, 1);
    expect(hints!.dimensions).toHaveLength(80);
  });

  it('produces a payload the server request schema accepts', () => {
    const hints = buildLocalVisionHints(rasterDraft(), { medianThicknessPx: 12 }, TOKENS, 1.5);
    const request = aiParseRequestSchema.parse({
      images: [{ dataUrl: 'data:image/jpeg;base64,AAAA', width: 1000, height: 800 }],
      imageSize: { width: 1000, height: 800 },
      hints: { overviewFactor: 1.5, local: hints },
    });
    expect(request.hints?.overviewFactor).toBe(1.5);
    expect(request.hints?.local?.wallCount).toBe(2);
    expect(request.hints?.local?.dimensions).toHaveLength(2);
  });
});
