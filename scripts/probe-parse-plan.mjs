#!/usr/bin/env node
/* global console, Buffer, process, fetch */
/**
 * Prompt / vision probe for the floor-plan recognition endpoint.
 *
 *   # 1. start the API (repo root)
 *   pnpm --filter @hdesign/server dev
 *
 *   # 2. push a raster through the current prompt
 *   node scripts/probe-parse-plan.mjs fixtures/reference/cad-plan-2400.png --out /tmp/parse-probe
 *
 * The script mirrors the browser image budget (1600 px overview + up to four
 * 62% crops), forwards the same local hints the app sends, and prints the
 * metrics that expose the classic failure modes of CAD plans: thin annotation
 * lines emitted as walls, walls outside the building envelope, and a scale
 * derived from the image width instead of from the dimension chain.
 *
 * Ground truth for the bundled reference drawing:
 *   top dimension chain (14700 mm) spans x=250..2075 → 8.05 mm/px raster,
 *   12.08 mm/px in the overview frame. See fixtures/reference/README.md.
 * For other drawings pass `--drawing-width-mm <mm>` (or 0 to disable the check).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PNG } from 'pngjs';

const ENDPOINT = process.env.PARSE_PLAN_ENDPOINT ?? 'http://127.0.0.1:8791/api/ai/parse-plan';
const OVERVIEW_LONG_EDGE = 1600;
const TILE_LONG_EDGE = 1600;
const MAX_TILES = 4;
const MAX_THIN_THICKNESS = 3;

/* Raster helpers (pure RGBA, same conventions as the web app). */

/** Flattens alpha over white: the import wizard always renders on #fff. */
function flatten(rgba) {
  const out = new Uint8ClampedArray(rgba.data.length);
  for (let i = 0; i < rgba.data.length; i += 4) {
    const alpha = rgba.data[i + 3] / 255;
    out[i] = rgba.data[i] * alpha + 255 * (1 - alpha);
    out[i + 1] = rgba.data[i + 1] * alpha + 255 * (1 - alpha);
    out[i + 2] = rgba.data[i + 2] * alpha + 255 * (1 - alpha);
    out[i + 3] = 255;
  }
  return { width: rgba.width, height: rgba.height, data: out };
}

function crop(raster, box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(raster.width - x, Math.round(box.w));
  const h = Math.min(raster.height - y, Math.round(box.h));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const from = ((y + row) * raster.width + x) * 4;
    data.set(raster.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

/** Bilinear resample so the long edge equals `maxEdge` (never upscales). */
function within(raster, maxEdge) {
  const longEdge = Math.max(raster.width, raster.height);
  if (longEdge <= maxEdge) return raster;
  const scale = maxEdge / longEdge;
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = ((y + 0.5) / height) * raster.height - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(raster.height - 1, y0 + 1);
    const fy = Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < width; x += 1) {
      const sx = ((x + 0.5) / width) * raster.width - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(raster.width - 1, x0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          raster.data[(y0 * raster.width + x0) * 4 + channel] * (1 - fx) +
          raster.data[(y0 * raster.width + x1) * 4 + channel] * fx;
        const bottom =
          raster.data[(y1 * raster.width + x0) * 4 + channel] * (1 - fx) +
          raster.data[(y1 * raster.width + x1) * 4 + channel] * fx;
        data[target + channel] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { width, height, data };
}

function toDataUrl(raster) {
  const png = new PNG({ width: raster.width, height: raster.height });
  png.data = Buffer.from(raster.data);
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

/** Mirror of apps/web/src/services/ai-parse.ts buildVisionImages. */
function buildVisionImages(raster) {
  const longEdge = Math.max(raster.width, raster.height);
  const factor = Math.max(1, longEdge / OVERVIEW_LONG_EDGE);
  const overview = within(raster, OVERVIEW_LONG_EDGE);
  const images = [{ dataUrl: toDataUrl(overview), width: overview.width, height: overview.height }];
  const tileWidth = Math.max(80, Math.round(overview.width * 0.62));
  const tileHeight = Math.max(80, Math.round(overview.height * 0.62));
  const xs = [0, Math.max(0, overview.width - tileWidth)];
  const ys = [0, Math.max(0, overview.height - tileHeight)];
  let tileCount = 0;
  for (const y of ys) {
    for (const x of xs) {
      if (tileCount >= MAX_TILES) break;
      const box = {
        x,
        y,
        w: Math.min(tileWidth, overview.width - x),
        h: Math.min(tileHeight, overview.height - y),
      };
      const fullBox = { x: box.x * factor, y: box.y * factor, w: box.w * factor, h: box.h * factor };
      const zoomed = within(crop(raster, fullBox), TILE_LONG_EDGE);
      images.push({
        dataUrl: toDataUrl(zoomed),
        width: zoomed.width,
        height: zoomed.height,
        tile: box,
      });
      tileCount += 1;
    }
  }
  return { images, factor };
}

/* Raster measurements (ground-truth-ish). */

/** Full contiguous-run length through every ink pixel (pipeline convention). */
function runLengths(ink, width, height, horizontal) {
  const out = new Int32Array(width * height);
  if (horizontal) {
    for (let y = 0; y < height; y += 1) {
      let x = 0;
      while (x < width) {
        if (!ink[y * width + x]) {
          x += 1;
          continue;
        }
        let end = x;
        while (end < width && ink[y * width + end]) end += 1;
        for (let index = x; index < end; index += 1) out[y * width + index] = end - x;
        x = end;
      }
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      let y = 0;
      while (y < height) {
        if (!ink[y * width + x]) {
          y += 1;
          continue;
        }
        let end = y;
        while (end < height && ink[end * width + x]) end += 1;
        for (let index = y; index < end; index += 1) out[index * width + x] = end - y;
        y = end;
      }
    }
  }
  return out;
}

function inkMask(raster) {
  const { width, height, data } = raster;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    ink[i] =
      0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2] < 128 ? 1 : 0;
  }
  return ink;
}

/** Building envelope from thick axis-aligned runs (wall poche only). */
function measureRaster(raster) {
  const { width, height } = raster;
  const ink = inkMask(raster);
  const hRuns = runLengths(ink, width, height, true);
  const vRuns = runLengths(ink, width, height, false);
  const diagonal = Math.hypot(width, height);
  const longMin = Math.max(28, Math.round(diagonal * 0.02));
  const histogram = new Map();
  for (let i = 0; i < ink.length; i += 1) {
    if (!ink[i]) continue;
    const long_ = Math.max(hRuns[i], vRuns[i]);
    const short = Math.min(hRuns[i], vRuns[i]);
    if (long_ < longMin || short < 4 || short > 90) continue;
    const bucket = Math.floor(short / 2) * 2;
    histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
  }
  let mode = 0;
  let modeCount = 0;
  for (const [bucket, count] of histogram) {
    if (count > modeCount) {
      mode = bucket;
      modeCount = count;
    }
  }
  const minThickness = Math.max(4, Math.round(mode * 0.45));
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!ink[i]) continue;
      const short_ = Math.min(vRuns[i], hRuns[i]);
      const long_ = Math.max(vRuns[i], hRuns[i]);
      if (short_ < minThickness || long_ < longMin) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    histogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]),
    modeThicknessPx: mode,
    minThicknessPx: minThickness,
    envelope: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}

/**
 * Longest thin horizontal run in the upper band: the top dimension chain line.
 * Its span equals the drawing's overall dimension, so it grounds the scale.
 */
function measureChainLine(raster) {
  const { width, height } = raster;
  const ink = inkMask(raster);
  const vRuns = runLengths(ink, width, height, false);
  const bands = Math.max(1, Math.round(height * 0.22));
  let best = { length: 0, y: 0, x0: 0, x1: 0 };
  for (let y = 0; y < bands; y += 1) {
    let x = 0;
    while (x < width) {
      if (!ink[y * width + x]) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < width && ink[y * width + end]) end += 1;
      if (end - x > best.length) {
        const length = end - x;
        const samples = Math.min(24, Math.max(6, Math.round(length / 40)));
        let thin = 0;
        for (let step = 0; step < samples; step += 1) {
          const sampleX = x + Math.round(((length - 1) * step) / (samples - 1));
          if (vRuns[y * width + sampleX] <= MAX_THIN_THICKNESS) thin += 1;
        }
        if (thin / samples >= 0.8) best = { length, y, x0: x, x1: end };
      }
      x = end;
    }
  }
  return best;
}

function summarizeDraft(draft, measurement, overviewScale) {
  const toOverview = (value) => value / overviewScale;
  const env = measurement.envelope;
  const walls = draft.walls.map((wall) => {
    const lengthPx = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    const cx = toOverview((wall.a.x + wall.b.x) / 2);
    const cy = toOverview((wall.a.y + wall.b.y) / 2);
    const outside =
      cx < env.minX - measurement.minThicknessPx * 2 ||
      cx > env.maxX + measurement.minThicknessPx * 2 ||
      cy < env.minY - measurement.minThicknessPx * 2 ||
      cy > env.maxY + measurement.minThicknessPx * 2;
    return { lengthPx, thicknessPx: wall.thicknessPx, outside, confidence: wall.confidence };
  });
  const thicknesses = walls.map((wall) => wall.thicknessPx).sort((a, b) => a - b);
  return {
    walls: walls.length,
    thinLineWalls: walls.filter((wall) => wall.thicknessPx <= 3).length,
    outsideEnvelopeWalls: walls.filter((wall) => wall.outside).length,
    medianThicknessPx: thicknesses.length ? thicknesses[Math.floor(thicknesses.length / 2)] : 0,
    thicknessRangePx: thicknesses.length
      ? [thicknesses[0], thicknesses[thicknesses.length - 1]]
      : [],
    openings: draft.openings.length,
    rooms: draft.rooms.length,
    dimensions: draft.dimensions.length,
    dimensionsWithSpan: draft.dimensions.filter((dimension) => dimension.span).length,
    spans: draft.dimensions
      .filter((dimension) => dimension.span)
      .map((dimension) => ({
        text: dimension.text,
        valueMm: dimension.valueMm,
        spanPx: Math.round(
          Math.hypot(
            dimension.span.b.x - dimension.span.a.x,
            dimension.span.b.y - dimension.span.a.y,
          ),
        ),
      }))
      .sort((left, right) => (right.valueMm ?? 0) - (left.valueMm ?? 0))
      .slice(0, 8),
    dimensionValuesMm: draft.dimensions
      .map((dimension) => dimension.valueMm)
      .filter((value) => typeof value === 'number'),
    scaleMmPerPx: draft.scale.mmPerPx,
    scaleSource: draft.scale.source,
    confidence: draft.confidence,
    diagnostics: draft.diagnostics,
  };
}

/** Minimal overlay: detected walls (red when implausibly thin) + dimension spans. */
function overlaySvg(draft, width, height, summary) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#fff"/>`,
  ];
  for (const room of draft.rooms) {
    const points = room.polygon.map((point) => `${point.x},${point.y}`).join(' ');
    parts.push(`<polygon points="${points}" fill="none" stroke="#2f8f6b" stroke-width="2"/>`);
  }
  for (const wall of draft.walls) {
    const thin = wall.thicknessPx <= summary.medianThicknessPx * 0.6;
    parts.push(
      `<line x1="${wall.a.x}" y1="${wall.a.y}" x2="${wall.b.x}" y2="${wall.b.y}" ` +
        `stroke="${thin ? '#d94841' : '#1a4fd6'}" stroke-width="${Math.max(2, Math.min(12, wall.thicknessPx))}" stroke-opacity="0.65"/>`,
    );
  }
  for (const opening of draft.openings) {
    parts.push(
      `<circle cx="${opening.center.x}" cy="${opening.center.y}" r="6" fill="#e8a13a" fill-opacity="0.8"/>`,
    );
  }
  for (const dimension of draft.dimensions) {
    if (dimension.span) {
      parts.push(
        `<line x1="${dimension.span.a.x}" y1="${dimension.span.a.y}" x2="${dimension.span.b.x}" y2="${dimension.span.b.y}" stroke="#7a4bd0" stroke-width="2" stroke-dasharray="4 3"/>`,
      );
    }
    parts.push(
      `<text x="${dimension.at.x}" y="${dimension.at.y}" font-size="16" fill="#7a4bd0">${String(dimension.valueMm ?? dimension.text)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const imagePath = args.find((arg) => !arg.startsWith('--'));
  if (!imagePath) {
    console.error(
      'usage: node scripts/probe-parse-plan.mjs <plan.png> [--out dir] [--no-ai] [--no-local-hints] [--drawing-width-mm 14700]',
    );
    process.exit(2);
  }
  const outIndex = args.indexOf('--out');
  const outDir = resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : '/tmp/parse-probe');
  await mkdir(outDir, { recursive: true });

  const decoded = PNG.sync.read(await readFile(resolve(imagePath)));
  const raster = flatten({
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  });
  console.log(`[probe] ${basename(imagePath)} ${raster.width}x${raster.height}`);

  const measurement = measureRaster(raster);
  console.log(
    `[probe] raster wall mode=${measurement.modeThicknessPx}px min=${measurement.minThicknessPx}px ` +
      `envelope=${measurement.envelope.width}x${measurement.envelope.height}px`,
  );

  const { images, factor } = buildVisionImages(raster);
  console.log(`[probe] sending ${images.length} images (overview factor ${factor.toFixed(2)})`);

  const chain = measureChainLine(raster);
  const widthIndex = args.indexOf('--drawing-width-mm');
  const drawingWidthMm =
    widthIndex >= 0 && args[widthIndex + 1] ? Number(args[widthIndex + 1]) : 14700;
  const expectedRasterMmPerPx =
    drawingWidthMm > 0 && chain.length > 0 ? drawingWidthMm / chain.length : 0;
  const expectedMmPerPx = expectedRasterMmPerPx * factor;
  if (expectedMmPerPx > 0) {
    console.log(
      `[probe] longest top thin line = ${chain.length}px at y=${chain.y} (x ${chain.x0}..${chain.x1})` +
        ` → truth ≈ ${expectedMmPerPx.toFixed(2)} mm/px overview (${expectedRasterMmPerPx.toFixed(2)} raster)`,
    );
  } else {
    console.log('[probe] expected-scale check disabled (no chain line or --drawing-width-mm 0)');
  }

  const request = {
    images,
    imageSize: { width: raster.width, height: raster.height },
    locale: 'zh-CN',
    hints: {
      overviewFactor: factor,
      local: { wallThicknessPx: measurement.modeThicknessPx / factor, dimensions: [] },
    },
  };
  if (args.includes('--no-local-hints')) request.hints = {};
  if (args.includes('--no-ai')) {
    await writeFile(
      resolve(outDir, 'request.json'),
      JSON.stringify(
        { ...request, images: images.map((image) => ({ ...image, dataUrl: '<omitted>' })) },
        null,
        2,
      ),
    );
    console.log('[probe] --no-ai: request written without calling the API');
    return;
  }

  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await response.json();
  if (!response.ok) {
    console.error(`[probe] HTTP ${response.status}: ${JSON.stringify(body)}`);
    process.exit(1);
  }
  const draft = body.draft;
  const elapsed = Date.now() - started;
  const summary = summarizeDraft(draft, measurement, factor);

  await writeFile(
    resolve(outDir, 'result.json'),
    JSON.stringify(
      {
        endpoint: ENDPOINT,
        image: basename(imagePath),
        model: body.model,
        usage: body.usage,
        mock: body.mock,
        elapsedMs: elapsed,
        raster: {
          size: [raster.width, raster.height],
          modeThicknessPx: measurement.modeThicknessPx,
          minThicknessPx: measurement.minThicknessPx,
          envelope: measurement.envelope,
          histogram: measurement.histogram,
        },
        expectedMmPerPxOverview: expectedMmPerPx || undefined,
        summary,
        draft,
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(outDir, 'overlay.svg'),
    overlaySvg(draft, images[0].width, images[0].height, summary),
  );

  console.log(`[probe] model=${body.model} ${elapsed}ms tokens=${JSON.stringify(body.usage ?? {})}`);
  console.log(
    `[probe] walls=${summary.walls} thinLineWalls=${summary.thinLineWalls} ` +
      `outsideEnvelopeWalls=${summary.outsideEnvelopeWalls} medianThickness=${summary.medianThicknessPx}px`,
  );
  console.log(
    `[probe] rooms=${summary.rooms} openings=${summary.openings} dimensions=${summary.dimensions} ` +
      `dimensionsWithSpan=${summary.dimensionsWithSpan} scale=${summary.scaleMmPerPx} mm/px (${summary.scaleSource})`,
  );
  if (expectedMmPerPx > 0) {
    const error = ((summary.scaleMmPerPx - expectedMmPerPx) / expectedMmPerPx) * 100;
    console.log(
      `[probe] scale error vs dimension chain: ${error >= 0 ? '+' : ''}${error.toFixed(1)}% ` +
        `(truth ≈ ${expectedMmPerPx.toFixed(2)} mm/px overview)`,
    );
  }
  if (summary.spans.length > 0) {
    console.log(
      `[probe] longest spans: ${summary.spans
        .slice(0, 4)
        .map((span) => `${span.text ?? '?'}=${span.valueMm ?? '?'}mm/${span.spanPx}px`)
        .join(', ')}`,
    );
  }
  console.log(`[probe] wrote ${resolve(outDir, 'result.json')} and overlay.svg`);
}

await main();
