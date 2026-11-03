import { describe, expect, it } from 'vitest';
import { FURNITURE } from '@hdesign/catalog';
import { MEP_KINDS } from '@hdesign/domain';
import {
  FURNITURE_SYMBOLS,
  MEP_SYMBOLS,
  getFurnitureSymbol,
  getMepSymbol,
  getSymbol,
} from '@hdesign/symbols';

function numbersInPath(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function assertSymbolPaths(key: string, options: { group: 'furniture' | 'mep'; allowFallback?: boolean }) {
  const symbol =
    options.group === 'furniture' ? getFurnitureSymbol(key) : getMepSymbol(key);
  expect(symbol, key).toBeDefined();
  if (!options.allowFallback) expect(symbol.key).toBe(key);
  expect(symbol.group).toBe(options.group);
  expect(symbol.label.length).toBeGreaterThan(0);
  expect(symbol.viewBox.w).toBeGreaterThan(0);
  expect(symbol.viewBox.d).toBeGreaterThan(0);
  expect(symbol.paths.length).toBeGreaterThan(0);
  expect(symbol.labelAnchor.x).toBeGreaterThanOrEqual(0);
  expect(symbol.labelAnchor.x).toBeLessThanOrEqual(symbol.viewBox.w);
  expect(symbol.labelAnchor.y).toBeGreaterThanOrEqual(0);
  expect(symbol.labelAnchor.y).toBeLessThanOrEqual(symbol.viewBox.d);
  for (const path of symbol.paths) {
    expect(path.d.startsWith('M'), `${key} path must start with M: ${path.d}`).toBe(true);
    expect(path.d.includes('undefined')).toBe(false);
    expect(path.d.includes('NaN')).toBe(false);
    expect(numbersInPath(path.d).length).toBeGreaterThanOrEqual(2);
    for (const value of numbersInPath(path.d)) expect(Number.isFinite(value)).toBe(true);
    if (path.strokeWidth !== undefined) expect(path.strokeWidth).toBeGreaterThan(0);
  }
}

describe('furniture symbols', () => {
  it('resolves every catalogue symbol key', () => {
    const keys = new Set(FURNITURE.map((sku) => sku.symbol));
    expect(keys.size).toBeGreaterThan(20);
    for (const key of keys) assertSymbolPaths(key, { group: 'furniture' });
  });

  it('exposes the same symbol for duplicate catalogue entries', () => {
    expect(FURNITURE_SYMBOLS.size).toBeGreaterThan(30);
    expect(getSymbol('bed-double')?.group).toBe('furniture');
  });

  it('falls back to a generic box for unknown keys', () => {
    const fallback = getFurnitureSymbol('definitely-not-a-symbol');
    expect(fallback.key).toBe('box');
    assertSymbolPaths('box', { group: 'furniture' });
  });
});

describe('MEP symbols', () => {
  it('resolves every domain MEP kind without falling back', () => {
    for (const kind of MEP_KINDS) {
      assertSymbolPaths(kind, { group: 'mep' });
    }
    expect(MEP_SYMBOLS.size).toBeGreaterThanOrEqual(MEP_KINDS.length + 2);
  });

  it('provides generic electric / water legend symbols', () => {
    assertSymbolPaths('electric', { group: 'mep' });
    assertSymbolPaths('water', { group: 'mep' });
  });

  it('falls back for unknown MEP kinds', () => {
    const fallback = getMepSymbol('not-a-kind');
    expect(fallback.key).toBe('mep-unknown');
  });
});
