#!/usr/bin/env node
/* global console, fetch, Buffer */
/**
 * Vendors the optional OCR assets (tesseract.js worker, wasm core, Chinese + English
 * language packs) into apps/web/public/ocr.
 *
 *   node scripts/fetch-ocr-assets.mjs
 *
 * The wasm core ships inside `node_modules/tesseract.js-core`, so only the traineddata
 * language packs need the network. If the download is blocked the script warns and exits
 * successfully: OCR stays optional, the import wizard falls back to CV + manual tracing.
 */
import { copyFile, mkdir, writeFile, readdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'apps/web/public/ocr');
// tesseract.js is a dependency of apps/web, so resolve from there.
const require = createRequire(resolve(repoRoot, 'apps/web/package.json'));

const LANG_PACKAGES = [
  { code: 'chi_sim', packageName: '@tesseract.js-data/chi_sim', version: '1.0.0' },
  { code: 'eng', packageName: '@tesseract.js-data/eng', version: '1.0.0' },
];

const CORE_FILES = [
  // LSTM core variants: Chromium with relaxed SIMD asks for relaxedsimd first.
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
];

const CDN_TEMPLATES = [
  (pkg, version, file) => `https://cdn.jsdelivr.net/npm/${pkg}@${version}/4.0.0_best_int/${file}`,
  (pkg, version, file) => `https://unpkg.com/${pkg}@${version}/4.0.0_best_int/${file}`,
  (_pkg, _version, file) =>
    `https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best/${file}`,
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findLocalFile(moduleId, fileName) {
  try {
    const entry = require.resolve(moduleId);
    const directory = dirname(entry);
    const candidate = resolve(directory, fileName);
    return (await exists(candidate)) ? candidate : null;
  } catch {
    return null;
  }
}

async function downloadFirst(candidates) {
  const errors = [];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1024) {
        errors.push(`${url} -> 响应过小（${buffer.length} B）`);
        continue;
      }
      return { buffer, url };
    } catch (error) {
      errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { buffer: null, errors };
}

async function findCoreDirectory() {
  try {
    return dirname(require.resolve('tesseract.js-core'));
  } catch {
    /* transitive: resolve next to the tesseract.js package */
  }
  try {
    const tesseractEntry = require.resolve('tesseract.js');
    const packageDirectory = dirname(tesseractEntry);
    const requireFromTesseract = createRequire(resolve(packageDirectory, 'package.json'));
    return dirname(requireFromTesseract.resolve('tesseract.js-core'));
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const files = [];
  const copied = [];

  /* 1. Worker script from the installed tesseract.js package. */
  const workerSource =
    (await findLocalFile('tesseract.js', 'dist/worker.min.js')) ??
    resolve(dirname(require.resolve('tesseract.js')), '../dist/worker.min.js');
  if (await exists(workerSource)) {
    await copyFile(workerSource, resolve(outDir, 'worker.min.js'));
    files.push('worker.min.js');
    copied.push('worker.min.js');
  } else {
    console.warn('[ocr] 未在 node_modules 中找到 tesseract.js worker.min.js');
  }

  /* 2. Wasm core from tesseract.js-core (transitive dep, may live beside tesseract.js). */
  const coreDirectory = await findCoreDirectory();
  if (!coreDirectory) {
    console.warn('[ocr] 未找到 tesseract.js-core wasm 资产');
  }
  for (const file of CORE_FILES) {
    if (!coreDirectory) break;
    const source = resolve(coreDirectory, file);
    if (!(await exists(source))) continue;
    await copyFile(source, resolve(outDir, file));
    files.push(file);
    copied.push(file);
  }

  /* 3. Language packs (the only network step). */
  let langsOk = true;
  for (const language of LANG_PACKAGES) {
    const file = `${language.code}.traineddata.gz`;
    const local = await findLocalFile(language.packageName, `4.0.0_best_int/${file}`);
    if (local) {
      await copyFile(local, resolve(outDir, file));
      files.push(file);
      copied.push(file);
      continue;
    }
    const candidates = CDN_TEMPLATES.map((template) =>
      template(language.packageName, language.version, file),
    );
    const { buffer, errors } = await downloadFirst(candidates);
    if (buffer) {
      await writeFile(resolve(outDir, file), buffer);
      files.push(file);
      copied.push(file);
      console.log(`[ocr] 下载 ${file}（${(buffer.length / 1024 / 1024).toFixed(1)} MB）`);
      continue;
    }
    langsOk = false;
    console.warn(`[ocr] 无法获取 ${file}：`);
    for (const message of errors ?? []) console.warn(`  - ${message}`);
  }

  /* 4. Manifest is the availability gate for the wizard. */
  if (langsOk && files.includes('worker.min.js') && files.some((file) => file.endsWith('.wasm'))) {
    await writeFile(
      resolve(outDir, 'manifest.json'),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          engine: 'tesseract.js',
          version: '7.0.0',
          langs: LANG_PACKAGES.map((language) => language.code),
          files,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`[ocr] OCR 资源已就绪：${copied.length} 个文件 -> ${outDir}`);
    return;
  }

  // Keep the wizard graceful: no manifest means "OCR unavailable".
  try {
    const stale = await readdir(outDir);
    if (stale.includes('manifest.json')) {
      await writeFile(
        resolve(outDir, 'manifest.json'),
        `${JSON.stringify({ generatedAt: new Date().toISOString(), langs: [], files: [] }, null, 2)}\n`,
      );
    }
  } catch {
    /* ignore */
  }
  console.warn(
    '[ocr] 语言包不完整，OCR 将保持关闭（不影响本地识别、比例校准与手工描图）。\n' +
      '      联网后重试：pnpm setup:ocr\n' +
      '      或手动把 chi_sim.traineddata.gz / eng.traineddata.gz 放入 apps/web/public/ocr/。',
  );
}

main().catch((error) => {
  console.warn('[ocr] 生成 OCR 资源失败（OCR 保持可选/关闭）：', error instanceof Error ? error.message : error);
});
