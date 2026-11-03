import type { FurnitureItem, MepKind } from '@hdesign/domain';
import * as symbolsPkg from '@hdesign/symbols';
import { furnitureInfo } from './catalog-adapter';
import { localFurnitureSymbol, localMepSymbol, type SymbolDef, type SymbolPathDef } from './symbols-local';

/**
 * Single adapter between the drawing engine and `@hdesign/symbols` (workstream B).
 *
 * The shared package is being written in parallel; until it exposes
 * `getFurnitureSymbol` / `getMepSymbol` this adapter transparently falls back to
 * the local symbol library. Swapping to the shared package later therefore needs
 * no changes outside this file.
 */

interface ExternalSymbolModule {
  getFurnitureSymbol?: (key: string) => unknown;
  getMepSymbol?: (kind: string) => unknown;
  hasFurnitureSymbol?: (key: string) => boolean;
  hasMepSymbol?: (key: string) => boolean;
  FURNITURE_SYMBOLS?: unknown;
  MEP_SYMBOLS?: unknown;
}

const external = symbolsPkg as unknown as ExternalSymbolModule;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const FILL_TOKEN = 'body';
const STROKE_TOKEN = 'outline';

function normalizePaths(raw: unknown): SymbolPathDef[] | null {
  if (!Array.isArray(raw)) return null;
  const paths: SymbolPathDef[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry.trim()) paths.push({ d: entry });
      continue;
    }
    if (!isRecord(entry)) continue;
    const d = entry.d ?? entry.path ?? entry.data;
    if (typeof d !== 'string' || !d.trim()) continue;
    const path: SymbolPathDef = { d };
    const fill = entry.fill;
    if (typeof fill === 'string') {
      path.fill = fill === 'currentColor' ? FILL_TOKEN : fill;
    }
    const stroke = entry.stroke;
    if (typeof stroke === 'string') {
      path.stroke = stroke === 'currentColor' ? STROKE_TOKEN : stroke;
    }
    if (typeof entry.strokeWidth === 'number') path.strokeWidth = entry.strokeWidth;
    if (typeof entry.opacity === 'number') path.opacity = entry.opacity;
    paths.push(path);
  }
  return paths.length > 0 ? paths : null;
}

function normalizeSymbol(raw: unknown, key: string): SymbolDef | null {
  if (!isRecord(raw)) return null;
  const paths = normalizePaths(raw.paths);
  if (!paths) return null;
  // Shared symbols expose a normalised `viewBox`; older drafts may use w/d.
  const box = isRecord(raw.viewBox) ? raw.viewBox : raw;
  const width = Number(box.w ?? box.width ?? raw.w ?? 1000);
  const depth = Number(box.d ?? box.depth ?? box.height ?? raw.d ?? 1000);
  return {
    key,
    w: Number.isFinite(width) && width > 0 ? width : 1000,
    d: Number.isFinite(depth) && depth > 0 ? depth : 1000,
    paths,
    origin: 'shared',
  };
}

export function symbolsAvailable(): boolean {
  return typeof external.getFurnitureSymbol === 'function' || typeof external.getMepSymbol === 'function';
}

/**
 * Resolves a furniture plan symbol, preferring the shared library.
 *
 * The catalogue (workstream B) carries the authoritative `symbol` key; older
 * seed data may not, so the raw skuId is tried before falling back to the local
 * fuzzy alias table.
 */
export function resolveFurnitureSymbol(item: FurnitureItem): SymbolDef {
  if (typeof external.getFurnitureSymbol === 'function') {
    const info = furnitureInfo(item.skuId, item.name);
    const candidates = [info.symbol, item.skuId].filter((key): key is string => Boolean(key));
    for (const key of candidates) {
      try {
        const has = typeof external.hasFurnitureSymbol === 'function' ? external.hasFurnitureSymbol(key) : true;
        if (!has) continue;
        const shared = normalizeSymbol(external.getFurnitureSymbol(key), key);
        if (shared) return shared;
      } catch {
        /* try the next candidate */
      }
    }
  }
  return localFurnitureSymbol(item.skuId);
}

/** Resolves an MEP glyph, preferring the shared library. */
export function resolveMepSymbol(kind: MepKind): SymbolDef {
  if (typeof external.getMepSymbol === 'function') {
    try {
      const has = typeof external.hasMepSymbol === 'function' ? external.hasMepSymbol(kind) : true;
      if (has) {
        const shared = normalizeSymbol(external.getMepSymbol(kind), kind);
        if (shared) return shared;
      }
    } catch {
      /* fall through to the local library */
    }
  }
  return localMepSymbol(kind);
}

export type { SymbolDef, SymbolPathDef };
