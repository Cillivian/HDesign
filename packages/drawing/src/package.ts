import type { Project } from '@hdesign/domain';

/**
 * `.hdz` project package format (pure, DOM-free).
 *
 * A package is a JSON document with a small envelope, the project document and
 * every referenced binary asset embedded as base64. The web layer converts
 * File/Blob <-> Uint8Array and lets `normalizeProject` perform the final schema
 * validation/upgrade; this module owns the envelope shape, size limits and
 * base64 (de)serialisation so the format can be unit-tested without a browser.
 */

export const HDZ_FORMAT = 'hdesign-hdz';
export const HDZ_FORMAT_VERSION = 1;
/** 50 MB total payload limit (decoded bytes, including the JSON envelope). */
export const HDZ_MAX_BYTES = 50 * 1024 * 1024;
/** Individual asset cap: 32 MB (a single floor-plan scan is far below this). */
export const HDZ_MAX_ASSET_BYTES = 32 * 1024 * 1024;

export interface HdzAsset {
  id: string;
  mime: string;
  size: number;
  base64: string;
}

export interface HdzPackage {
  format: typeof HDZ_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  app: string;
  project: Project;
  assets: HdzAsset[];
}

export interface HdzAssetBytes {
  id: string;
  mime: string;
  bytes: Uint8Array;
}

export class HdzError extends Error {
  readonly code: 'empty' | 'invalid-json' | 'invalid-format' | 'future-version' | 'too-large' | 'invalid-asset';

  constructor(code: HdzError['code'], message: string) {
    super(message);
    this.name = 'HdzError';
    this.code = code;
  }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Deterministic base64 encoder (no DOM / Buffer dependency). */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const byteA = bytes[index] ?? 0;
    const byteB = bytes[index + 1];
    const byteC = bytes[index + 2];
    const triple = (byteA << 16) | ((byteB ?? 0) << 8) | (byteC ?? 0);
    out += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    out += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    out += byteB === undefined ? '=' : BASE64_ALPHABET[(triple >> 6) & 0x3f];
    out += byteC === undefined ? '=' : BASE64_ALPHABET[triple & 0x3f];
  }
  return out;
}

/** Decodes base64, tolerating whitespace and URL-safe characters. */
export function decodeBase64(text: string): Uint8Array {
  const cleaned = text.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*$/.test(cleaned)) {
    throw new HdzError('invalid-asset', '资产数据不是有效的 base64');
  }
  const length = Math.floor((cleaned.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let cursor = 0;
  for (const char of cleaned) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) throw new HdzError('invalid-asset', '资产数据包含非法字符');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[cursor] = (buffer >> bits) & 0xff;
      cursor += 1;
    }
  }
  return bytes.subarray(0, cursor);
}

export interface HdzExportInput {
  project: Project;
  assets?: HdzAssetBytes[];
  /** ISO date; injectable for deterministic tests. */
  exportedAt?: string;
}

/** Builds the `.hdz` JSON text (deterministic for a given input). */
export function createHdzDocument(input: HdzExportInput): string {
  const inputs = input.assets ?? [];
  const total = inputs.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
  if (total > HDZ_MAX_BYTES) {
    throw new HdzError('too-large', `内嵌资产超过 ${Math.round(HDZ_MAX_BYTES / 1024 / 1024)}MB 上限`);
  }
  const assets: HdzAsset[] = inputs.map((asset) => ({
    id: asset.id,
    mime: asset.mime || 'application/octet-stream',
    size: asset.bytes.byteLength,
    base64: encodeBase64(asset.bytes),
  }));
  const pkg: HdzPackage = {
    format: HDZ_FORMAT,
    formatVersion: HDZ_FORMAT_VERSION,
    schemaVersion: input.project.schemaVersion,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    app: 'HDesign 0.1.0',
    project: input.project,
    assets,
  };
  const text = JSON.stringify(pkg);
  if (utf8Length(text) > HDZ_MAX_BYTES) {
    throw new HdzError('too-large', `项目包超过 ${Math.round(HDZ_MAX_BYTES / 1024 / 1024)}MB 上限`);
  }
  return text;
}

export interface ParsedHdz {
  project: Project;
  /** Raw project is returned untouched; callers must run `normalizeProject`. */
  assets: HdzAssetBytes[];
  warnings: string[];
  exportedAt?: string;
  schemaVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses + validates the envelope.
 *
 * Accepts either the raw JSON text or an already parsed object (the web layer
 * parses once and runs zod validation before calling this). Project schema
 * validation is deliberately left to `normalizeProject` in @hdesign/domain.
 */
export function parseHdzDocument(input: string | unknown): ParsedHdz {
  let raw: unknown;
  if (typeof input === 'string') {
    if (!input.trim()) throw new HdzError('empty', '项目文件为空');
    if (utf8Length(input) > HDZ_MAX_BYTES) {
      throw new HdzError('too-large', `项目文件超过 ${Math.round(HDZ_MAX_BYTES / 1024 / 1024)}MB 上限`);
    }
    try {
      raw = JSON.parse(input);
    } catch {
      throw new HdzError('invalid-json', '项目文件不是有效的 JSON，可能已损坏');
    }
  } else {
    raw = input;
  }
  if (!isRecord(raw)) throw new HdzError('invalid-format', '项目文件根节点必须是对象');
  if (raw.format !== HDZ_FORMAT) {
    throw new HdzError('invalid-format', '不是 HDesign 项目包（缺少 .hdz 标识）');
  }
  const formatVersion = Number(raw.formatVersion ?? 1);
  if (formatVersion > HDZ_FORMAT_VERSION) {
    throw new HdzError('future-version', `项目包版本 ${formatVersion} 高于当前支持的 ${HDZ_FORMAT_VERSION}`);
  }
  const projectRaw = raw.project;
  if (!isRecord(projectRaw)) throw new HdzError('invalid-format', '项目包缺少项目数据');
  const warnings: string[] = [];
  const assets: HdzAssetBytes[] = [];
  const rawAssets = Array.isArray(raw.assets) ? raw.assets : [];
  for (const entry of rawAssets) {
    if (!isRecord(entry)) {
      warnings.push('已忽略一个格式错误的资产');
      continue;
    }
    const id = typeof entry.id === 'string' ? entry.id : '';
    const base64 = typeof entry.base64 === 'string' ? entry.base64 : '';
    if (!id || !base64) {
      warnings.push('已忽略一个缺少 id 或数据的资产');
      continue;
    }
    try {
      const bytes = decodeBase64(base64);
      if (bytes.byteLength > HDZ_MAX_ASSET_BYTES) {
        warnings.push(`资产 ${id} 超过单个 ${Math.round(HDZ_MAX_ASSET_BYTES / 1024 / 1024)}MB 限制，已忽略`);
        continue;
      }
      assets.push({
        id,
        mime: typeof entry.mime === 'string' ? entry.mime : 'application/octet-stream',
        bytes,
      });
    } catch (error) {
      warnings.push(`资产 ${id} 解码失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    project: projectRaw as unknown as Project,
    assets,
    warnings,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : Number(projectRaw.schemaVersion ?? 1),
  };
}

/** UTF-8 byte length without TextEncoder (keeps the module DOM/Buffer free). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Suggests a safe `.hdz` file name for a project. */
export function hdzFileName(projectName: string, date = new Date()): string {
  const base = projectName
    .trim()
    .replace(/[\\/:*?"<>|#%\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${base || 'hdesign-project'}-${stamp}.hdz`;
}
