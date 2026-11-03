#!/usr/bin/env node
/* global console */
/**
 * Generates the synthetic sample plans used by the import wizard and by the
 * plan-recognition accuracy tests.
 *
 *   node fixtures/generate.mjs
 *
 * Outputs:
 *   fixtures/plans/expected/plan-*.json      expected recognition results
 *   apps/web/public/samples/demo-plan-*.png  sample images (committed)
 *   apps/web/public/samples/demo-plan-a.pdf  sample multi-page-ready PDF
 *   apps/web/public/samples/samples.json     manifest consumed by ImportPanel
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, buildExpected } from './plans/plan-defs.mjs';
import { buildPlanRaster, encodePng, buildPdf } from './plans/render-plan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const expectedDir = resolve(repoRoot, 'fixtures/plans/expected');
const samplesDir = resolve(repoRoot, 'apps/web/public/samples');

const manifest = [];

for (const plan of PLANS) {
  const expected = buildExpected(plan);
  const raster = buildPlanRaster(plan);
  const png = await encodePng(raster);
  const slug = `demo-plan-${plan.glyph.toLowerCase()}`;
  const pngPath = resolve(samplesDir, `${slug}.png`);
  const expectedPath = resolve(expectedDir, `${plan.id}.json`);

  await mkdir(samplesDir, { recursive: true });
  await mkdir(expectedDir, { recursive: true });
  await writeFile(pngPath, png);

  let pdfFile = null;
  if (plan.id === 'plan-a') {
    pdfFile = `${slug}.pdf`;
    const pdf = await buildPdf(raster, png, plan.title);
    await writeFile(resolve(samplesDir, pdfFile), pdf);
  }

  await writeFile(expectedPath, `${JSON.stringify(expected, null, 2)}\n`);

  manifest.push({
    id: plan.id,
    title: plan.title,
    image: `/samples/${slug}.png`,
    pdf: pdfFile ? `/samples/${pdfFile}` : null,
    widthPx: raster.width,
    heightPx: raster.height,
    wallCount: expected.wallCount,
    roomCount: expected.roomCount,
    areaSqm: Math.round(expected.rooms.reduce((sum, room) => sum + room.areaSqm, 0) * 10) / 10,
  });
  console.log(
    `[fixtures] ${plan.id}: ${raster.width}x${raster.height} · ${expected.wallCount} walls · ` +
      `${expected.roomCount} rooms · ${(png.length / 1024).toFixed(1)} KB -> ${pngPath}`,
  );
}

await writeFile(
  resolve(samplesDir, 'samples.json'),
  `${JSON.stringify({ samples: manifest }, null, 2)}\n`,
);
console.log(`[fixtures] manifest -> ${resolve(samplesDir, 'samples.json')}`);
