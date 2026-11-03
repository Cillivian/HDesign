import {
  circlePath,
  filled,
  linePath,
  normalizeBox,
  p,
  rectPath,
  roundRectPath,
  type SymbolDef,
  type SymbolPath,
} from './types';

/**
 * MEP (water / electric) plan symbols.
 * Keyed by domain MepKind plus the generic `electric` / `water` groups used by
 * sheet legends. All symbols are square 100×100 boxes.
 */

const SYMBOLS = new Map<string, SymbolDef>();

function mepDefine(key: string, label: string, draw: () => SymbolPath[]): void {
  SYMBOLS.set(key, {
    key,
    label,
    group: 'mep',
    nominal: { w: 300, d: 300 },
    viewBox: normalizeBox(300, 300),
    paths: draw(),
    labelAnchor: { x: 50, y: 50 },
  });
}

const RING = (r = 32) => circlePath(50, 50, r);

/* ------------------------------------------------------------------ */
/* Electric                                                           */
/* ------------------------------------------------------------------ */

mepDefine('socket', '五孔插座', () => [
  p(RING(), 'outline'),
  p(linePath(42, 36, 42, 64)),
  p(linePath(58, 36, 58, 64)),
  p(linePath(42, 50, 58, 50)),
]);

mepDefine('socket-16a', '16A 插座', () => [
  p(RING(), 'outline'),
  p(circlePath(50, 50, 24)),
  p(linePath(42, 40, 42, 60)),
  p(linePath(58, 40, 58, 60)),
  p(linePath(42, 50, 58, 50)),
]);

mepDefine('switch', '单控开关', () => [
  p(RING(28), 'outline'),
  p(linePath(50, 50, 70, 32)),
  p(circlePath(50, 50, 4), 'detail', { fill: 'currentColor' }),
]);

mepDefine('switch-double', '双控开关', () => [
  p(RING(30), 'outline'),
  p(linePath(40, 50, 32, 30)),
  p(linePath(60, 50, 68, 30)),
  p(circlePath(50, 50, 4), 'detail', { fill: 'currentColor' }),
]);

mepDefine('light', '主灯', () => [
  p(RING(30), 'outline'),
  p(linePath(28, 28, 72, 72)),
  p(linePath(72, 28, 28, 72)),
]);

mepDefine('light-spot', '筒灯', () => [
  p(RING(30), 'outline'),
  p(circlePath(50, 50, 13)),
  p(circlePath(50, 50, 4), 'detail', { fill: 'currentColor' }),
]);

mepDefine('ac', '空调点位', () => [
  p(roundRectPath(12, 22, 76, 56, 6), 'outline'),
  p(linePath(20, 40, 80, 40)),
  p(linePath(20, 52, 80, 52)),
  p(linePath(20, 64, 80, 64)),
]);

mepDefine('weak-current', '弱电插座', () => [
  p(circlePath(50, 50, 32), 'outline'),
  p(`M50 24 L74 66 H26Z`, 'detail'),
  p(circlePath(50, 52, 4), 'detail', { fill: 'currentColor' }),
]);

mepDefine('electric', '电位', () => [
  p(RING(32), 'outline'),
  p(`M56 24 L38 52 H50 L44 76 L64 46 H51Z`, 'detail'),
]);

/* ------------------------------------------------------------------ */
/* Water                                                              */
/* ------------------------------------------------------------------ */

mepDefine('water-cold', '冷水给水', () => [
  p(circlePath(50, 50, 32), 'outline'),
  p(`M50 26 C62 42 64 50 64 56 A14 14 0 1 1 36 56 C36 50 38 42 50 26Z`, 'detail', {
    fill: 'currentColor',
    opacity: 0.14,
  }),
  p(linePath(50, 36, 50, 68)),
]);

mepDefine('water-hot', '热水给水', () => [
  p(circlePath(50, 50, 32), 'outline'),
  p(`M50 26 C62 42 64 50 64 56 A14 14 0 1 1 36 56 C36 50 38 42 50 26Z`, 'detail', {
    fill: 'currentColor',
    opacity: 0.14,
  }),
  p(linePath(50, 36, 50, 68)),
  p(linePath(42, 44, 58, 44)),
]);

mepDefine('drain', '排水口', () => [
  p(circlePath(50, 50, 32), 'outline'),
  p(circlePath(50, 50, 14)),
  p(linePath(50, 64, 50, 82)),
  p(`M40 72 L50 82 L60 72`, 'detail'),
]);

mepDefine('floor-drain', '地漏', () => [
  p(roundRectPath(24, 24, 52, 52, 3), 'outline'),
  p(linePath(32, 32, 68, 68)),
  p(linePath(68, 32, 32, 68)),
  p(circlePath(50, 50, 6), 'detail', { fill: 'currentColor' }),
]);

mepDefine('gas', '燃气点位', () => [
  p(RING(32), 'outline'),
  p(`M50 26 C58 38 62 44 62 52 A12 12 0 1 1 38 52 C38 44 42 38 50 26Z`, 'detail'),
  p(linePath(50, 44, 50, 64)),
]);

mepDefine('floor-heat', '地暖分水器', () => [
  p(rectPath(18, 26, 64, 48), 'outline'),
  p(`M26 50 Q32 40 38 50 T50 50 T62 50 T74 50`, 'detail'),
  p(linePath(26, 68, 74, 68)),
]);

mepDefine('water', '水位', () => [
  p(circlePath(50, 50, 32), 'outline'),
  p(`M50 26 C62 42 64 50 64 56 A14 14 0 1 1 36 56 C36 50 38 42 50 26Z`, 'detail'),
]);

mepDefine('mep-unknown', '未知点位', () => [
  p(RING(32), 'outline'),
  p(circlePath(50, 50, 5), 'detail', { fill: 'currentColor' }),
  p(linePath(50, 56, 50, 72)),
]);

/** Wall-hung MEP symbols (AC, water heater…) so 2D/3D can orient them. */
const WALL_BY_KIND: Record<string, SymbolDef['wallSide']> = {
  ac: 'bottom',
  'range-hood': 'bottom',
};

for (const [key, side] of Object.entries(WALL_BY_KIND)) {
  const symbol = SYMBOLS.get(key);
  if (symbol) symbol.wallSide = side;
}

export const MEP_SYMBOLS: ReadonlyMap<string, SymbolDef> = SYMBOLS;

export const MEP_SYMBOL_KEYS: string[] = Array.from(SYMBOLS.keys());

export function getMepSymbol(kind: string): SymbolDef {
  return SYMBOLS.get(kind) ?? SYMBOLS.get('mep-unknown')!;
}

export function hasMepSymbol(kind: string): boolean {
  return SYMBOLS.has(kind);
}

// `filled` keeps the shared helper tree-shakeable without changing the public API.
export const MEP_FILL_HELPER = filled;
