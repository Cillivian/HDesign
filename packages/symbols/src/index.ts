export * from './types';
export * from './furniture';
export * from './mep';

import type { SymbolDef } from './types';
import { FURNITURE_SYMBOLS } from './furniture';
import { MEP_SYMBOLS } from './mep';

/**
 * Single lookup entry point for consumers that do not care about the group.
 * Returns undefined when neither library knows the key.
 */
export function getSymbol(key: string): SymbolDef | undefined {
  return FURNITURE_SYMBOLS.get(key) ?? MEP_SYMBOLS.get(key);
}
