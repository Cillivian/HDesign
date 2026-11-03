import { z } from 'zod';
import {
  DomainValidationError,
  createDefaultSheets,
  createId,
  normalizeProject,
  type Project,
} from '@hdesign/domain';
import {
  HDZ_MAX_BYTES,
  HdzError,
  createHdzDocument,
  hdzFileName,
  parseHdzDocument,
} from '@hdesign/drawing';
import { getAssetBytes, getProject, hasAsset, putAssetBytes } from '../store/persistence';
import { downloadBlob } from './export/svg';

/**
 * Project `.hdz` package import/export.
 *
 * Envelope: JSON with `format: 'hdesign-hdz'`, `formatVersion`, `schemaVersion`,
 * the normalised project document and base64-embedded assets. Validation layers:
 * 1. file size guard (50 MB),
 * 2. zod envelope schema,
 * 3. `normalizeProject` (domain zod schema + migrations),
 * 4. per-asset base64 decoding with warnings instead of hard failures.
 */

export const HDZ_ACCEPT = '.hdz,application/json';

const envelopeSchema = z.object({
  format: z.literal('hdesign-hdz'),
  formatVersion: z.number().int().min(1),
  schemaVersion: z.number().int().optional(),
  exportedAt: z.string().optional(),
  app: z.string().optional(),
  project: z.unknown(),
  assets: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        mime: z.string().optional(),
        size: z.number().optional(),
        base64: z.string(),
      }),
    )
    .optional(),
});

export interface ExportProjectResult {
  blob: Blob;
  filename: string;
  assetCount: number;
  bytes: number;
  warnings: string[];
}

function readErrorMessage(error: unknown): string {
  if (error instanceof HdzError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Packs a project (and the referenced underlay asset) into a `.hdz` blob. */
export async function exportProjectFile(project: Project): Promise<ExportProjectResult> {
  const warnings: string[] = [];
  const assets: Array<{ id: string; mime: string; bytes: Uint8Array }> = [];
  const assetId = project.reference?.assetId;
  if (assetId) {
    const record = await getAssetBytes(assetId);
    if (record) {
      assets.push({ id: record.id, mime: record.mime, bytes: record.bytes });
    } else {
      warnings.push('底图资源不在本机，项目包将不包含原始底图文件');
    }
  }
  let text: string;
  try {
    text = createHdzDocument({ project, assets });
  } catch (error) {
    throw new Error(`导出失败：${readErrorMessage(error)}`, { cause: error });
  }
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  return {
    blob,
    filename: hdzFileName(project.name),
    assetCount: assets.length,
    bytes: blob.size,
    warnings,
  };
}

export async function downloadProjectFile(project: Project): Promise<ExportProjectResult> {
  const result = await exportProjectFile(project);
  downloadBlob(result.blob, result.filename);
  return result;
}

export interface ImportProjectResult {
  project: Project;
  warnings: string[];
  assetCount: number;
  exportedAt?: string;
  renamed: boolean;
}

async function uniqueImportedName(project: Project): Promise<string> {
  const base = project.name.trim() || '导入方案';
  return base.includes('（导入）') ? base : `${base}（导入）`;
}

/** Imports a `.hdz` file: validates, applies migrations, restores embedded assets. */
export async function importProjectFile(file: File): Promise<ImportProjectResult> {
  if (!file.size) throw new Error('文件为空，无法导入');
  if (file.size > HDZ_MAX_BYTES) {
    throw new Error(`文件超过 ${Math.round(HDZ_MAX_BYTES / 1024 / 1024)}MB 上限，无法导入`);
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('无法读取文件，请确认文件未被占用');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('项目文件不是有效的 JSON，可能已损坏或不是 .hdz 项目包');
  }
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    const path = issue?.path.join('.') || '文件';
    throw new Error(`不是有效的 HDesign 项目包（${path}：${issue?.message ?? '格式错误'}）`);
  }

  let parsed;
  try {
    parsed = parseHdzDocument(envelope.data);
  } catch (error) {
    throw new Error(`导入失败：${readErrorMessage(error)}`, { cause: error });
  }
  const warnings = [...parsed.warnings];

  let normalized;
  try {
    normalized = normalizeProject(parsed.project);
  } catch (error) {
    if (error instanceof DomainValidationError) {
      const detail = error.issues.slice(0, 3).join('；');
      throw new Error(`项目数据校验失败：${detail || error.message}`, { cause: error });
    }
    throw error;
  }
  warnings.push(...normalized.warnings);
  const project = normalized.project;

  // Keep imports non-destructive: if the id already exists, import as a copy.
  let renamed = false;
  const existing = await getProject(project.id);
  if (existing) {
    project.id = createId('prj');
    project.name = await uniqueImportedName(project);
    project.createdAt = new Date().toISOString();
    renamed = true;
    warnings.push('本机已存在同 ID 项目，已作为副本导入');
  }
  project.updatedAt = new Date().toISOString();

  let assetCount = 0;
  for (const asset of parsed.assets) {
    try {
      await putAssetBytes(asset.id, asset.mime, asset.bytes);
      assetCount += 1;
    } catch (error) {
      warnings.push(`底图资源 ${asset.id} 保存失败：${readErrorMessage(error)}`);
    }
  }
  if (project.reference?.assetId) {
    const present =
      parsed.assets.some((asset) => asset.id === project.reference!.assetId) ||
      (await hasAsset(project.reference.assetId));
    if (!present) {
      warnings.push('底图文件缺失：平面图仍可编辑，但背景底图需要重新导入');
    }
  }
  if (project.sheets.length === 0) {
    project.sheets = createDefaultSheets(project.name);
    warnings.push('项目包没有图纸，已补充默认图纸集');
  }

  return {
    project,
    warnings,
    assetCount,
    exportedAt: parsed.exportedAt,
    renamed,
  };
}

/** Human readable byte size for UI copy. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
