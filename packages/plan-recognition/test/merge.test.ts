import { describe, expect, it } from 'vitest';
import { parseDraftSchema, type ParseDraft, type ParseDimension } from '@hdesign/domain';
import { estimateScaleFromDimensionSpans, mergeDrafts } from '../src/index';

function draft(overrides: Record<string, unknown> = {}): ParseDraft {
  return parseDraftSchema.parse({
    image: { width: 1000, height: 800 },
    walls: [],
    openings: [],
    rooms: [],
    labels: [],
    dimensions: [],
    scale: { mmPerPx: 10, source: 'assumed' },
    ...overrides,
  });
}

const localWalls = [
  { id: 'w1', a: { x: 100, y: 100 }, b: { x: 900, y: 100 }, thicknessPx: 12, confidence: 0.9 },
  { id: 'w2', a: { x: 100, y: 100 }, b: { x: 100, y: 700 }, thicknessPx: 12, confidence: 0.9 },
];

const local: ParseDraft = draft({
  walls: localWalls,
  rooms: [
    {
      label: '客厅',
      polygon: [
        { x: 120, y: 120 },
        { x: 880, y: 120 },
        { x: 880, y: 680 },
        { x: 120, y: 680 },
      ],
      confidence: 0.8,
    },
  ],
  labels: [{ text: '客厅', at: { x: 500, y: 400 }, confidence: 0.8 }],
  confidence: { overall: 0.8, walls: 0.9, rooms: 0.8, labels: 0.8 },
  diagnostics: ['本地识别'],
});

describe('mergeDrafts (local CV primary, vision adds hints)', () => {
  it('keeps local geometry and adds missing AI walls/openings/labels', () => {
    const ai = draft({
      walls: [
        ...localWalls,
        { a: { x: 900, y: 100 }, b: { x: 900, y: 700 }, thicknessPx: 12, confidence: 0.8 },
      ],
      openings: [{ kind: 'door', center: { x: 100, y: 400 }, widthPx: 80, confidence: 0.7 }],
      labels: [{ text: '客厅', at: { x: 505, y: 395 }, confidence: 0.9 }],
      scale: { mmPerPx: 10, source: 'ai' },
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(3);
    expect(merged.draft.openings).toHaveLength(1);
    expect(merged.draft.rooms).toHaveLength(1);
    // Duplicate label was not added twice.
    expect(merged.draft.labels).toHaveLength(1);
    expect(merged.notes.length).toBeGreaterThan(0);
  });

  it('does not duplicate AI walls that overlap local ones', () => {
    const ai = draft({
      walls: [
        { a: { x: 102, y: 101 }, b: { x: 899, y: 100 }, thicknessPx: 12, confidence: 0.8 },
      ],
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(2);
  });

  it('ignores AI walls that re-split an existing local wall', () => {
    const ai = draft({
      walls: [
        { a: { x: 100, y: 100 }, b: { x: 500, y: 100 }, thicknessPx: 12, confidence: 0.8 },
        { a: { x: 500, y: 100 }, b: { x: 900, y: 100 }, thicknessPx: 12, confidence: 0.8 },
      ],
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(2);
  });

  it('ignores AI walls that are contained in a longer local wall', () => {
    const ai = draft({
      walls: [
        { a: { x: 300, y: 100 }, b: { x: 700, y: 100 }, thicknessPx: 12, confidence: 0.9 },
      ],
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(2);
  });

  it('falls back to AI geometry when local CV failed', () => {
    const empty = draft();
    const ai = draft({
      walls: [
        { a: { x: 100, y: 100 }, b: { x: 900, y: 100 }, thicknessPx: 12, confidence: 0.8 },
        { a: { x: 100, y: 100 }, b: { x: 100, y: 700 }, thicknessPx: 12, confidence: 0.8 },
      ],
      scale: { mmPerPx: 9.8, source: 'ai' },
      rooms: [
        {
          polygon: [
            { x: 120, y: 120 },
            { x: 880, y: 120 },
            { x: 880, y: 680 },
          ],
          confidence: 0.7,
        },
      ],
    });
    const merged = mergeDrafts(empty, ai);
    expect(merged.draft.walls).toHaveLength(2);
    expect(merged.draft.rooms).toHaveLength(1);
    expect(merged.draft.scale.source).toBe('ai');
    expect(merged.notes.join(' ')).toContain('回退');
  });

  it('returns the local draft when the vision model is unavailable', () => {
    const merged = mergeDrafts(local, null);
    expect(merged.draft).toBe(local);
    expect(merged.notes[0]).toContain('本地识别');
  });
});

/* ------------------------------------------------------------------ */
/* Annotation lines must not become walls                             */
/* ------------------------------------------------------------------ */

describe('mergeDrafts annotation-line guard for AI-only walls', () => {
  it('drops AI-only walls that are implausibly thin vs the local wall band', () => {
    const ai = draft({
      // 2 px stroke inside the envelope: a dimension/axis line, not a wall.
      walls: [{ a: { x: 100, y: 300 }, b: { x: 900, y: 300 }, thicknessPx: 2, confidence: 0.7 }],
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(2);
    expect(merged.notes.join(' ')).toContain('已忽略 1 段疑似标注线的视觉墙体');
    expect(merged.draft.diagnostics.join(' ')).toContain('已忽略 1 段疑似标注线的视觉墙体');
  });

  it('drops AI-only walls whose midpoint sits outside the local building envelope', () => {
    const ai = draft({
      // Thick enough, but the annotation chain runs above the building outline.
      walls: [{ a: { x: 100, y: 20 }, b: { x: 900, y: 20 }, thicknessPx: 12, confidence: 0.7 }],
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(2);
    expect(merged.notes.join(' ')).toContain('已忽略 1 段疑似标注线的视觉墙体');
  });

  it('keeps a plausible AI wall inside the envelope', () => {
    const ai = draft({
      walls: [{ a: { x: 500, y: 100 }, b: { x: 500, y: 700 }, thicknessPx: 12, confidence: 0.8 }],
    });
    const merged = mergeDrafts(local, ai);
    expect(merged.draft.walls).toHaveLength(3);
    expect(merged.notes.join(' ')).toContain('视觉模型补充了 1 段本地未识别的墙体');
    expect(merged.notes.join(' ')).not.toContain('疑似标注线');
  });

  it('never drops local walls, however thin they look', () => {
    const thinLocal = draft({
      walls: [
        { a: { x: 100, y: 100 }, b: { x: 900, y: 100 }, thicknessPx: 2, confidence: 0.9 },
        { a: { x: 100, y: 100 }, b: { x: 100, y: 700 }, thicknessPx: 2, confidence: 0.9 },
      ],
    });
    const merged = mergeDrafts(thinLocal, draft());
    expect(merged.draft.walls).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Scale from dimension spans                                         */
/* ------------------------------------------------------------------ */

function spanDimension(valueMm: number, lengthPx: number, at = { x: 10, y: 10 }): ParseDimension {
  return {
    text: String(valueMm),
    valueMm,
    at,
    span: { a: { x: 0, y: 0 }, b: { x: lengthPx, y: 0 } },
    confidence: 0.8,
  };
}

const largerPlan = draft({
  image: { width: 1600, height: 1200 },
  walls: localWalls,
  scale: { mmPerPx: 10, source: 'assumed' },
});

/** Reference-drawing frame: 2400 px long edge, 1600 px overview at factor 1.5. */
const referenceFrame = { width: 2400, height: 1696 };

describe('estimateScaleFromDimensionSpans', () => {
  it('computes valueMm / |span| from chain spans', () => {
    const estimate = estimateScaleFromDimensionSpans(
      [spanDimension(14700, 1470), spanDimension(6000, 600)],
      { width: 1600, height: 1200 },
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mmPerPx).toBeCloseTo(10, 2);
    expect(estimate!.samples).toBe(2);
    expect(estimate!.longestSpanPx).toBe(1470);
    expect(estimate!.trusted).toBe(true);
  });

  it('rejects tiny stubs and out-of-range ratios', () => {
    const estimate = estimateScaleFromDimensionSpans(
      [
        spanDimension(14700, 5), // tiny stub, below 3% of the diagonal
        spanDimension(100, 1000), // 0.1 mm/px, physically absurd
        spanDimension(200_000, 1000), // 200 mm/px, physically absurd
      ],
      { width: 1600, height: 1200 },
    );
    expect(estimate).toBeNull();
  });

  it('rejects an outlier span and keeps the tight cluster', () => {
    const estimate = estimateScaleFromDimensionSpans(
      [
        spanDimension(14700, 1470),
        spanDimension(14100, 1410),
        spanDimension(147_000, 1470), // misread digits: 100 mm/px
      ],
      { width: 1600, height: 1200 },
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mmPerPx).toBeCloseTo(10, 2);
    expect(estimate!.samples).toBe(2);
  });

  it('rejects the noisy vertical chain spans of the reference drawing', () => {
    // Horizontal chain is accurate (8.05 raster mm/px); the model mis-measures the
    // 8100 vertical total as 432–512 px (18.75 / 15.82 mm/px). Long-span weighting
    // plus the weighted-MAD band must ignore those instead of averaging axes.
    const estimate = estimateScaleFromDimensionSpans(
      [
        spanDimension(14700, 1825, { x: 0, y: 0 }),
        spanDimension(6000, 745, { x: 10, y: 0 }),
        spanDimension(2800, 348, { x: 20, y: 0 }),
        spanDimension(8100, 432, { x: 30, y: 0 }),
        spanDimension(8100, 512, { x: 40, y: 0 }),
      ],
      referenceFrame,
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.mmPerPx).toBeCloseTo(8.055, 2);
    expect(estimate!.samples).toBe(3);
    expect(estimate!.trusted).toBe(true);
  });

  it('trusts a single very long total span but not a lone short span', () => {
    const longTotal = estimateScaleFromDimensionSpans(
      [spanDimension(14700, 1825)],
      referenceFrame,
    );
    expect(longTotal).not.toBeNull();
    expect(longTotal!.samples).toBe(1);
    expect(longTotal!.trusted).toBe(true);

    const loneShort = estimateScaleFromDimensionSpans(
      [spanDimension(14700, 300)],
      referenceFrame,
    );
    expect(loneShort).not.toBeNull();
    expect(loneShort!.samples).toBe(1);
    expect(loneShort!.trusted).toBe(false);
  });
});

describe('mergeDrafts span-based scale', () => {
  it('adopts the span-derived scale when the local scale is assumed', () => {
    const ai = draft({
      image: { width: 1600, height: 1200 },
      dimensions: [spanDimension(14700, 1470)],
      // The old prompt-style image-width guess would be wrong (14700 / 2120).
      scale: { mmPerPx: 6.93, source: 'ai' },
    });
    const merged = mergeDrafts(largerPlan, ai);
    expect(merged.draft.scale.mmPerPx).toBeCloseTo(10, 2);
    expect(merged.draft.scale.source).toBe('ai');
    expect(merged.notes.join(' ')).toContain('已按尺寸标注跨度校准比例尺');
  });

  it('adopts the reference drawing scale from accurate horizontal spans despite noisy vertical ones', () => {
    const referenceLocal = draft({
      image: referenceFrame,
      walls: localWalls,
      scale: { mmPerPx: 10, source: 'assumed' },
    });
    const ai = draft({
      image: referenceFrame,
      dimensions: [
        spanDimension(14700, 1825, { x: 0, y: 0 }),
        spanDimension(6000, 745, { x: 10, y: 0 }),
        spanDimension(2800, 348, { x: 20, y: 0 }),
        spanDimension(8100, 432, { x: 30, y: 0 }),
        spanDimension(8100, 512, { x: 40, y: 0 }),
      ],
      scale: { mmPerPx: 8.07, source: 'ai' },
    });
    const merged = mergeDrafts(referenceLocal, ai);
    // 14700 mm over the 1825 px horizontal total → 8.05 raster mm/px (12.08 overview).
    expect(merged.draft.scale.mmPerPx).toBeCloseTo(8.055, 2);
    expect(merged.draft.scale.source).toBe('ai');
    expect(merged.notes.join(' ')).toContain('已按尺寸标注跨度校准比例尺');
  });

  it('does not override the assumed scale with a single short noisy span', () => {
    const ai = draft({
      image: { width: 1600, height: 1200 },
      dimensions: [spanDimension(14700, 300)], // 49 mm/px, untrusted short span
      scale: { mmPerPx: 10, source: 'assumed' },
    });
    const merged = mergeDrafts(largerPlan, ai);
    expect(merged.draft.scale).toEqual({ mmPerPx: 10, source: 'assumed' });
    expect(merged.notes.join(' ')).not.toContain('已按尺寸标注跨度校准比例尺');
  });

  it('never overrides a two-point calibration', () => {
    const calibrated = draft({
      image: { width: 1600, height: 1200 },
      walls: localWalls,
      scale: { mmPerPx: 8, source: 'calibration' },
    });
    const ai = draft({
      image: { width: 1600, height: 1200 },
      dimensions: [spanDimension(14700, 1470)],
      scale: { mmPerPx: 10, source: 'ai' },
    });
    const merged = mergeDrafts(calibrated, ai);
    expect(merged.draft.scale).toEqual({ mmPerPx: 8, source: 'calibration' });
    expect(merged.notes.join(' ')).not.toContain('已按尺寸标注跨度校准比例尺');
  });

  it('corrects an OCR scale that is off by more than 10% with >= 2 spans', () => {
    const ocrScaled = draft({
      image: { width: 1600, height: 1200 },
      walls: localWalls,
      scale: { mmPerPx: 8, source: 'ocr' },
    });
    const ai = draft({
      image: { width: 1600, height: 1200 },
      dimensions: [spanDimension(14700, 1470), spanDimension(6000, 600)],
      scale: { mmPerPx: 8, source: 'ai' },
    });
    const merged = mergeDrafts(ocrScaled, ai);
    expect(merged.draft.scale.mmPerPx).toBeCloseTo(10, 2);
    expect(merged.draft.scale.source).toBe('ai');
    expect(merged.notes.join(' ')).toContain('尺寸标注跨度与本地比例相差 25%');
  });

  it('keeps a local OCR scale that already agrees within 10%', () => {
    const ocrScaled = draft({
      image: { width: 1600, height: 1200 },
      walls: localWalls,
      scale: { mmPerPx: 10.2, source: 'ocr' },
    });
    const ai = draft({
      image: { width: 1600, height: 1200 },
      dimensions: [spanDimension(14700, 1470), spanDimension(6000, 600)],
      scale: { mmPerPx: 10.2, source: 'ai' },
    });
    const merged = mergeDrafts(ocrScaled, ai);
    expect(merged.draft.scale).toEqual({ mmPerPx: 10.2, source: 'ocr' });
  });

  it('still falls back to the AI scale when no span is available', () => {
    const ai = draft({
      image: { width: 1600, height: 1200 },
      scale: { mmPerPx: 8.05, source: 'ai' },
    });
    const merged = mergeDrafts(largerPlan, ai);
    expect(merged.draft.scale).toEqual({ mmPerPx: 8.05, source: 'ai' });
  });
});

/* ------------------------------------------------------------------ */
/* Leaked local room segmentation falls back to AI room polygons      */
/* ------------------------------------------------------------------ */

describe('mergeDrafts room leak detection', () => {
  const leakedLocalRoom = {
    label: '父母房',
    polygon: [
      { x: 100, y: 100 },
      { x: 900, y: 100 },
      { x: 900, y: 700 },
      { x: 100, y: 700 },
    ],
    confidence: 0.85,
  };
  const aiRooms = [
    // Three real rooms swallowed by the single local flood fill.
    {
      label: '父母房',
      polygon: [
        { x: 110, y: 110 },
        { x: 400, y: 110 },
        { x: 400, y: 400 },
        { x: 110, y: 400 },
      ],
      confidence: 0.75,
    },
    {
      label: '客厅',
      polygon: [
        { x: 410, y: 110 },
        { x: 880, y: 110 },
        { x: 880, y: 400 },
        { x: 410, y: 400 },
      ],
      confidence: 0.75,
    },
    {
      label: '主卧',
      polygon: [
        { x: 110, y: 410 },
        { x: 880, y: 410 },
        { x: 880, y: 680 },
        { x: 110, y: 680 },
      ],
      confidence: 0.75,
    },
  ];

  it('replaces a leaked local room with the vision model room split', () => {
    const localLeaked = draft({ walls: localWalls, rooms: [leakedLocalRoom] });
    const ai = draft({ walls: localWalls, rooms: aiRooms, scale: { mmPerPx: 10, source: 'ai' } });
    const merged = mergeDrafts(localLeaked, ai);
    expect(merged.draft.rooms).toHaveLength(3);
    expect(merged.draft.rooms.map((room) => room.label)).toEqual(['父母房', '客厅', '主卧']);
    expect(merged.notes.join(' ')).toContain('渗漏');
  });

  it('keeps local rooms when each local room holds one AI room', () => {
    const localFine = draft({
      walls: localWalls,
      rooms: aiRooms.map((room) => ({ ...room, confidence: 0.9 })),
    });
    const ai = draft({ walls: localWalls, rooms: aiRooms, scale: { mmPerPx: 10, source: 'ai' } });
    const merged = mergeDrafts(localFine, ai);
    expect(merged.draft.rooms).toHaveLength(3);
    expect(merged.notes.join(' ')).not.toContain('渗漏');
  });

  it('does not second-guess local rooms when the model returned too few rooms', () => {
    const localLeaked = draft({ walls: localWalls, rooms: [leakedLocalRoom] });
    const ai = draft({ walls: localWalls, rooms: aiRooms.slice(0, 1) });
    const merged = mergeDrafts(localLeaked, ai);
    expect(merged.draft.rooms).toHaveLength(1);
    expect(merged.notes.join(' ')).not.toContain('渗漏');
  });
});
