import {
  STROKE,
  circlePath,
  filled,
  insetRectPath,
  linePath,
  normalizeBox,
  p,
  rectPath,
  roundRectPath,
  type SymbolDef,
  type SymbolPath,
} from './types';

/**
 * Furniture plan symbols.
 *
 * All shapes are authored in a normalised box (longest nominal side = 100) with
 * y pointing down, so a renderer can map them onto a furniture footprint with
 * independent x/y scale. `currentColor` is used for stroke/fill so the 2D editor,
 * drawing sheets and thumbnails can all theme them.
 */

type Draw = (w: number, d: number) => SymbolPath[];
type WallSide = SymbolDef['wallSide'];

const SYMBOLS = new Map<string, SymbolDef>();

function define(
  key: string,
  label: string,
  nominalW: number,
  nominalD: number,
  draw: Draw,
  wallSide?: WallSide,
): void {
  const viewBox = normalizeBox(nominalW, nominalD);
  SYMBOLS.set(key, {
    key,
    label,
    group: 'furniture',
    nominal: { w: nominalW, d: nominalD },
    viewBox,
    paths: draw(viewBox.w, viewBox.d),
    labelAnchor: { x: viewBox.w / 2, y: viewBox.d / 2 },
    wallSide,
  });
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                      */
/* ------------------------------------------------------------------ */

function bedDraw(pillows: number): Draw {
  return (w, d) => {
    const paths: SymbolPath[] = [p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline')];
    paths.push(p(linePath(1, d * 0.3, w - 1, d * 0.3)));
    const pillowWidth = (w - 6) / Math.max(1, pillows);
    for (let index = 0; index < pillows; index += 1) {
      paths.push(
        p(
          roundRectPath(3 + index * pillowWidth, 3, pillowWidth - 2, d * 0.16, 1.5),
          'detail',
        ),
      );
    }
    paths.push(p(linePath(1, d * 0.72, w - 1, d * 0.72)));
    return paths;
  };
}

function sofaDraw(seats: number, corner = false): Draw {
  return (w, d) => {
    const arm = Math.min(w * 0.1, 9);
    const paths: SymbolPath[] = [p(roundRectPath(1, 1, w - 2, d - 2, 2.5), 'outline')];
    paths.push(p(roundRectPath(1, 1, w - 2, d * 0.33, 2), 'detail'));
    paths.push(p(roundRectPath(1, 1, arm, d - 2, 1.5), 'detail'));
    paths.push(p(roundRectPath(w - arm - 1, 1, arm, d - 2, 1.5), 'detail'));
    if (corner) {
      paths.push(p(roundRectPath(w - arm * 1.8 - 1, d * 0.45, arm * 0.9, d * 0.5, 1.5), 'detail'));
      paths.push(p(linePath(w * 0.55, d * 0.33, w * 0.55, d - 2)));
    } else {
      const usable = w - arm * 2 - 2;
      for (let index = 1; index < seats; index += 1) {
        const x = arm + 1 + (usable / seats) * index;
        paths.push(p(linePath(x, d * 0.38, x, d - 2)));
      }
    }
    return paths;
  };
}

function chairDraw(w: number, d: number): SymbolPath[] {
  return [
    p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
    p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.16)),
    p(linePath(2.5, d * 0.3, w - 2.5, d * 0.3)),
  ];
}

function tableDraw(w: number, d: number, round = false): SymbolPath[] {
  if (round) {
    const radius = Math.min(w, d) / 2 - 1;
    return [
      p(circlePath(w / 2, d / 2, radius), 'outline'),
      p(circlePath(w / 2, d / 2, radius * 0.72)),
    ];
  }
  return [
    p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
    p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.08)),
  ];
}

function storageDraw(dividers: number, shelfLines = 0, sliding = false): Draw {
  return (w, d) => {
    const paths: SymbolPath[] = [p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline')];
    if (dividers > 0) {
      for (let index = 1; index <= dividers; index += 1) {
        const x = 1 + ((w - 2) / (dividers + 1)) * index;
        paths.push(p(linePath(x, 1, x, d - 1)));
        if (sliding) {
          paths.push(p(linePath(x - 1.5, 2.5, x - 1.5, d - 2.5)));
        }
      }
    }
    for (let index = 1; index <= shelfLines; index += 1) {
      const y = 1 + ((d - 2) / (shelfLines + 1)) * index;
      paths.push(p(linePath(1, y, w - 1, y)));
    }
    return paths;
  };
}

function rugDraw(round = false): Draw {
  return (w, d) => {
    if (round) {
      const radius = Math.min(w, d) / 2 - 1;
      return [
        p(circlePath(w / 2, d / 2, radius), 'outline'),
        p(circlePath(w / 2, d / 2, radius * 0.72)),
        filled(circlePath(w / 2, d / 2, radius * 0.55), 0.05),
      ];
    }
    return [
      p(roundRectPath(1, 1, w - 2, d - 2, 1), 'outline'),
      p(insetRectPath(1, 1, w - 2, d - 2, Math.max(2, Math.min(w, d) * 0.06))),
      filled(roundRectPath(1, 1, w - 2, d - 2, 1), 0.04),
    ];
  };
}

function plantDraw(size: number): Draw {
  return (w, d) => {
    const cx = w / 2;
    const cy = d / 2;
    const radius = Math.min(w, d) * size;
    const paths: SymbolPath[] = [];
    paths.push(p(circlePath(cx, cy - radius * 0.15, radius), 'outline'));
    paths.push(p(circlePath(cx - radius * 0.45, cy + radius * 0.15, radius * 0.55)));
    paths.push(p(circlePath(cx + radius * 0.45, cy + radius * 0.15, radius * 0.55)));
    paths.push(filled(circlePath(cx, cy - radius * 0.15, radius), 0.08));
    paths.push(p(linePath(cx, cy + radius * 0.35, cx, d - 2)));
    return paths;
  };
}

function lightDraw(kind: 'floor' | 'table' | 'pendant' | 'chandelier' | 'wall' | 'fan' | 'track'): Draw {
  return (w, d) => {
    const cx = w / 2;
    const cy = d / 2;
    switch (kind) {
      case 'pendant':
        return [
          p(circlePath(cx, cy, Math.min(w, d) / 2 - 1), 'outline'),
          p(circlePath(cx, cy, Math.min(w, d) * 0.18)),
          p(linePath(cx - w * 0.3, cy, cx - w * 0.12, cy)),
          p(linePath(cx + w * 0.12, cy, cx + w * 0.3, cy)),
        ];
      case 'chandelier':
        return [
          p(circlePath(cx, cy, Math.min(w, d) / 2 - 1), 'outline'),
          p(circlePath(cx, cy, Math.min(w, d) * 0.22)),
          p(circlePath(cx - w * 0.26, cy, Math.min(w, d) * 0.07)),
          p(circlePath(cx + w * 0.26, cy, Math.min(w, d) * 0.07)),
          p(circlePath(cx, cy - d * 0.26, Math.min(w, d) * 0.07)),
          p(circlePath(cx, cy + d * 0.26, Math.min(w, d) * 0.07)),
        ];
      case 'wall':
        return [
          p(`M${cx - w * 0.3} ${d - 2} A${w * 0.3} ${d * 0.7} 0 0 1 ${cx + w * 0.3} ${d - 2}Z`, 'outline'),
          p(linePath(cx, 2, cx, d - 2)),
          p(linePath(cx - w * 0.18, d * 0.45, cx + w * 0.18, d * 0.45)),
        ];
      case 'fan':
        return [
          p(circlePath(cx, cy, Math.min(w, d) * 0.18), 'outline'),
          p(linePath(cx - w * 0.38, cy - d * 0.2, cx - w * 0.1, cy - d * 0.03)),
          p(linePath(cx + w * 0.38, cy - d * 0.2, cx + w * 0.1, cy - d * 0.03)),
          p(linePath(cx - w * 0.38, cy + d * 0.2, cx - w * 0.1, cy + d * 0.03)),
          p(linePath(cx + w * 0.38, cy + d * 0.2, cx + w * 0.1, cy + d * 0.03)),
        ];
      case 'track':
        return [
          p(linePath(1, cy, w - 1, cy), 'outline'),
          p(circlePath(w * 0.25, cy + d * 0.18, Math.min(w, d) * 0.1)),
          p(circlePath(w * 0.5, cy + d * 0.18, Math.min(w, d) * 0.1)),
          p(circlePath(w * 0.75, cy + d * 0.18, Math.min(w, d) * 0.1)),
        ];
      case 'floor':
      default:
        return [
          p(circlePath(cx, cy + d * 0.18, Math.min(w, d) * 0.26), 'outline'),
          p(`M${cx - w * 0.16} ${cy - d * 0.05} L${cx} ${cy - d * 0.15} L${cx + w * 0.16} ${cy - d * 0.05}Z`, 'outline'),
          p(linePath(cx, cy - d * 0.1, cx, cy + d * 0.32)),
        ];
    }
  };
}

/* ------------------------------------------------------------------ */
/* Beds                                                               */
/* ------------------------------------------------------------------ */
define('bed-double', '双人床', 1500, 2000, bedDraw(2), 'top');
define('bed-king', '大床', 1800, 2000, bedDraw(2), 'top');
define('bed-single', '单人床', 1200, 1900, bedDraw(1), 'top');
define('kids-bed', '儿童床', 1200, 1900, bedDraw(1), 'top');
define('bunk-bed', '上下铺', 1000, 2000, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(linePath(1, d * 0.5, w - 1, d * 0.5)),
  p(linePath(1, d * 0.25, w - 1, d * 0.25)),
  p(linePath(1, d * 0.75, w - 1, d * 0.75)),
  p(linePath(w * 0.12, 1, w * 0.12, d * 0.24)),
  p(linePath(w * 0.12, d * 0.26, w * 0.12, d * 0.49)),
], 'top');
define('crib', '婴儿床', 700, 1300, (w, d) => {
  const paths: SymbolPath[] = [p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline')];
  for (let index = 1; index <= 6; index += 1) {
    const x = 1 + ((w - 2) / 7) * index;
    paths.push(p(linePath(x, 2, x, d - 2)));
  }
  paths.push(p(linePath(2, d * 0.62, w - 2, d * 0.62)));
  return paths;
}, 'top');

/* ------------------------------------------------------------------ */
/* Sofas / lounge                                                     */
/* ------------------------------------------------------------------ */
define('sofa', '三人沙发', 2300, 950, sofaDraw(3), 'top');
define('sofa-2', '双人沙发', 1700, 900, sofaDraw(2), 'top');
define('sofa-l', '转角沙发', 2800, 1700, sofaDraw(2, true), 'top');
define('armchair', '休闲单椅', 800, 850, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(roundRectPath(1, 1, w - 2, d * 0.3, 2), 'detail'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.16)),
], 'top');
define('recliner', '躺椅', 900, 950, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 3), 'outline'),
  p(roundRectPath(1, 1, w - 2, d * 0.34, 3), 'detail'),
  p(linePath(w * 0.16, d * 0.36, w * 0.16, d - 2)),
  p(linePath(w * 0.84, d * 0.36, w * 0.84, d - 2)),
  p(linePath(1, d * 0.72, w - 1, d * 0.72)),
], 'top');
define('ottoman', '脚凳', 600, 500, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 3), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.14)),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.06)),
]);
define('bench', '长凳', 1200, 400, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(linePath(1, d * 0.5, w - 1, d * 0.5)),
  p(linePath(w * 0.12, 2, w * 0.12, d - 2)),
  p(linePath(w * 0.88, 2, w * 0.88, d - 2)),
], 'top');

/* ------------------------------------------------------------------ */
/* Tables / desks                                                     */
/* ------------------------------------------------------------------ */
define('coffee-table', '茶几', 1000, 550, (w, d) => tableDraw(w, d));
define('coffee-table-round', '圆茶几', 800, 800, (w, d) => tableDraw(w, d, true));
define('dining-table', '餐桌', 1400, 800, (w, d) => tableDraw(w, d));
define('dining-table-round', '圆餐桌', 1200, 1200, (w, d) => tableDraw(w, d, true));
define('desk', '书桌', 1200, 600, (w, d) => tableDraw(w, d));
define('side-table', '边几', 450, 450, (w, d) => [
  p(circlePath(w / 2, d / 2, Math.min(w, d) / 2 - 1), 'outline'),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.26)),
]);
define('console-table', '玄关桌', 1200, 350, (w, d) => tableDraw(w, d));
define('dresser', '梳妆台', 1000, 450, (w, d) => [
  ...storageDraw(2, 0)(w, d),
  p(circlePath(w * 0.85, d * 0.35, Math.min(w, d) * 0.16)),
], 'top');
define('bath-vanity-table', '卫浴台', 900, 500, (w, d) => tableDraw(w, d));

/* ------------------------------------------------------------------ */
/* Chairs / stools                                                    */
/* ------------------------------------------------------------------ */
define('chair', '椅子', 480, 520, chairDraw);
define('desk-chair', '办公椅', 650, 650, (w, d) => [
  p(circlePath(w / 2, d / 2, Math.min(w, d) / 2 - 1), 'outline'),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.28)),
  p(`M${w * 0.2} ${d * 0.18} A${Math.min(w, d) * 0.32} ${Math.min(w, d) * 0.32} 0 0 1 ${w * 0.8} ${d * 0.18}`, 'detail'),
  p(linePath(w * 0.2, d * 0.3, w * 0.2, d * 0.32)),
  p(linePath(w * 0.8, d * 0.3, w * 0.8, d * 0.32)),
]);
define('bar-stool', '吧凳', 400, 400, (w, d) => [
  p(circlePath(w / 2, d / 2, Math.min(w, d) / 2 - 1), 'outline'),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.24)),
  p(linePath(w * 0.25, d * 0.2, w * 0.75, d * 0.2)),
]);
define('stool', '圆凳', 350, 350, (w, d) => [
  p(circlePath(w / 2, d / 2, Math.min(w, d) / 2 - 1), 'outline'),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.3)),
]);
define('lounge-chair-symbol', '休闲椅', 750, 800, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(roundRectPath(1, 1, w - 2, d * 0.28, 2)),
  p(linePath(w * 0.14, d * 0.3, w * 0.14, d - 2)),
  p(linePath(w * 0.86, d * 0.3, w * 0.86, d - 2)),
], 'top');

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/* ------------------------------------------------------------------ */
define('nightstand', '床头柜', 450, 400, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(linePath(1, d * 0.45, w - 1, d * 0.45)),
  p(circlePath(w / 2, d * 0.72, Math.min(w, d) * 0.06)),
]);
define('wardrobe', '衣柜', 1800, 600, storageDraw(2, 0), 'top');
define('wardrobe-sliding', '推拉门衣柜', 2000, 650, storageDraw(1, 0, true), 'top');
define('mirror', '镜子', 700, 120, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(linePath(3, 3, w - 3, d - 3)),
  p(linePath(3, d - 3, w - 3, 3)),
], 'bottom');
define('tv-cabinet', '电视柜', 1800, 400, storageDraw(2, 0), 'top');
define('sideboard', '餐边柜', 1400, 420, storageDraw(2, 1), 'top');
define('bookshelf', '书架', 900, 350, storageDraw(1, 3), 'top');
define('cabinet', '收纳柜', 800, 400, storageDraw(1, 1), 'top');
define('shoe-cabinet', '鞋柜', 1000, 350, storageDraw(2, 2), 'top');
define('shelf', '置物架', 900, 250, storageDraw(2, 1), 'top');
define('coat-rack', '衣帽架', 500, 500, (w, d) => [
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.1), 'outline'),
  p(circlePath(w / 2, d / 2, Math.min(w, d) / 2 - 2)),
  p(linePath(w * 0.5, d * 0.12, w * 0.5, d * 0.88)),
  p(linePath(w * 0.12, d * 0.5, w * 0.88, d * 0.5)),
  p(linePath(w * 0.25, d * 0.25, w * 0.75, d * 0.75)),
  p(linePath(w * 0.75, d * 0.25, w * 0.25, d * 0.75)),
]);
define('wine-cabinet', '酒柜', 900, 450, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(linePath(1, d * 0.5, w - 1, d * 0.5)),
  p(circlePath(w * 0.25, d * 0.25, Math.min(w, d) * 0.08)),
  p(circlePath(w * 0.5, d * 0.25, Math.min(w, d) * 0.08)),
  p(circlePath(w * 0.75, d * 0.25, Math.min(w, d) * 0.08)),
  p(circlePath(w * 0.25, d * 0.75, Math.min(w, d) * 0.08)),
  p(circlePath(w * 0.5, d * 0.75, Math.min(w, d) * 0.08)),
  p(circlePath(w * 0.75, d * 0.75, Math.min(w, d) * 0.08)),
], 'top');
define('display-cabinet', '展示柜', 900, 400, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.1)),
  p(linePath(1, d * 0.5, w - 1, d * 0.5)),
], 'top');
define('laundry-cabinet', '洗衣柜', 1200, 600, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(circlePath(w * 0.3, d * 0.5, Math.min(w, d) * 0.2)),
  p(circlePath(w * 0.72, d * 0.5, Math.min(w, d) * 0.2)),
  p(linePath(w * 0.3, d * 0.3, w * 0.3, d * 0.7)),
], 'top');
define('safe', '保险柜', 450, 450, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.12)),
  p(circlePath(w * 0.36, d * 0.5, Math.min(w, d) * 0.1)),
]);

/* ------------------------------------------------------------------ */
/* Kitchen / appliances                                               */
/* ------------------------------------------------------------------ */
define('kitchen-counter', '橱柜地柜', 2400, 600, (w, d) => {
  const paths: SymbolPath[] = [p(roundRectPath(1, 1, w - 2, d - 2, 1), 'outline')];
  for (let index = 1; index <= 3; index += 1) {
    const x = 1 + ((w - 2) / 4) * index;
    paths.push(p(linePath(x, 1, x, d - 1)));
  }
  paths.push(p(linePath(1, d * 0.28, w - 1, d * 0.28)));
  return paths;
}, 'top');
define('kitchen-island', '中岛台', 1600, 900, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.12)),
  p(linePath(w * 0.2, d * 0.2, w * 0.8, d * 0.2)),
]);
define('sink', '水槽', 800, 500, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.12)),
  p(circlePath(w * 0.5, d * 0.5, Math.min(w, d) * 0.08)),
  p(linePath(w * 0.5, d * 0.18, w * 0.5, d * 0.4)),
], 'top');
define('stove', '灶台', 750, 450, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(circlePath(w * 0.3, d * 0.35, Math.min(w, d) * 0.16)),
  p(circlePath(w * 0.7, d * 0.35, Math.min(w, d) * 0.16)),
  p(circlePath(w * 0.3, d * 0.72, Math.min(w, d) * 0.16)),
  p(circlePath(w * 0.7, d * 0.72, Math.min(w, d) * 0.16)),
], 'top');
define('range-hood', '油烟机', 900, 500, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.16)),
  p(linePath(w * 0.2, d * 0.5, w * 0.8, d * 0.5)),
], 'top');
define('fridge', '冰箱', 700, 650, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(linePath(1, d * 0.38, w - 1, d * 0.38)),
  p(linePath(1, d * 0.62, w - 1, d * 0.62)),
  p(linePath(w * 0.14, d * 0.44, w * 0.14, d * 0.56)),
], 'top');
define('oven', '烤箱', 600, 550, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.1)),
  p(linePath(w * 0.1, d * 0.2, w * 0.9, d * 0.2)),
], 'top');
define('dishwasher', '洗碗机', 600, 600, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(linePath(w * 0.12, d * 0.24, w * 0.88, d * 0.24)),
  p(linePath(w * 0.3, d * 0.12, w * 0.7, d * 0.12)),
], 'top');
define('washing-machine', '洗衣机', 600, 600, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(circlePath(w / 2, d * 0.56, Math.min(w, d) * 0.26)),
  p(circlePath(w / 2, d * 0.56, Math.min(w, d) * 0.16)),
  p(linePath(w * 0.2, d * 0.16, w * 0.8, d * 0.16)),
], 'top');
define('dryer', '烘干机', 600, 600, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(circlePath(w / 2, d * 0.56, Math.min(w, d) * 0.26)),
  p(linePath(w * 0.26, d * 0.3, w * 0.74, d * 0.82)),
  p(linePath(w * 0.74, d * 0.3, w * 0.26, d * 0.82)),
], 'top');
define('water-heater', '热水器', 500, 350, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(circlePath(w * 0.5, d * 0.5, Math.min(w, d) * 0.28)),
  p(linePath(w * 0.5, d * 0.22, w * 0.5, d * 0.78)),
], 'top');

/* ------------------------------------------------------------------ */
/* TV / audio                                                         */
/* ------------------------------------------------------------------ */
define('tv', '电视', 1450, 120, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1), 'outline'),
  p(linePath(w * 0.1, d * 0.5, w * 0.9, d * 0.5)),
], 'bottom');

/* ------------------------------------------------------------------ */
/* Bath                                                               */
/* ------------------------------------------------------------------ */
define('shower', '淋浴房', 900, 900, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(linePath(1, 1, w - 1, d - 1)),
  p(linePath(w - 1, 1, 1, d - 1)),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.09)),
]);
define('bathtub', '浴缸', 1600, 750, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.2), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.16)),
  p(circlePath(w * 0.12, d * 0.5, Math.min(w, d) * 0.06)),
], 'top');
define('toilet', '马桶', 400, 650, (w, d) => [
  p(roundRectPath(w * 0.1, 1, w * 0.8, d * 0.28, 1.5), 'outline'),
  p(circlePath(w / 2, d * 0.66, Math.min(w, d) * 0.28), 'outline'),
  p(circlePath(w / 2, d * 0.66, Math.min(w, d) * 0.17)),
], 'top');
define('vanity', '浴室柜', 900, 500, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(circlePath(w / 2, d * 0.55, Math.min(w, d) * 0.24)),
  p(circlePath(w / 2, d * 0.55, Math.min(w, d) * 0.08)),
  p(linePath(w * 0.2, d * 0.2, w * 0.8, d * 0.2)),
], 'top');

/* ------------------------------------------------------------------ */
/* Textiles                                                           */
/* ------------------------------------------------------------------ */
define('rug', '地毯', 2600, 2000, rugDraw(false));
define('rug-round', '圆形地毯', 2000, 2000, rugDraw(true));
define('curtain', '窗帘', 3000, 160, (w, d) => {
  const paths: SymbolPath[] = [p(linePath(1, d * 0.3, w - 1, d * 0.3), 'outline')];
  for (let index = 1; index < 8; index += 1) {
    const x = 1 + ((w - 2) / 8) * index;
    paths.push(
      p(
        `M${x} ${d * 0.35} Q${x + w * 0.014} ${d * 0.65} ${x} ${d * 0.95}`,
        'detail',
      ),
    );
  }
  paths.push(filled(rectPath(1, d * 0.32, w - 2, d * 0.6), 0.05));
  return paths;
}, 'bottom');
define('cushion', '抱枕', 450, 450, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.16), 'outline'),
  p(linePath(w * 0.2, d * 0.2, w * 0.8, d * 0.8)),
  p(linePath(w * 0.8, d * 0.2, w * 0.2, d * 0.8)),
]);
define('blanket', '床品', 1500, 1200, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1.5), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.05)),
  p(linePath(1, d * 0.3, w - 1, d * 0.3)),
]);

/* ------------------------------------------------------------------ */
/* Lighting                                                           */
/* ------------------------------------------------------------------ */
define('floor-lamp', '落地灯', 400, 400, lightDraw('floor'));
define('table-lamp', '台灯', 300, 300, lightDraw('table'));
define('pendant-light', '吊灯', 600, 600, lightDraw('pendant'));
define('chandelier', '水晶吊灯', 800, 800, lightDraw('chandelier'));
define('wall-light', '壁灯', 260, 180, lightDraw('wall'));
define('ceiling-fan', '风扇灯', 1100, 1100, lightDraw('fan'));
define('track-light', '轨道灯', 1200, 160, lightDraw('track'));

/* ------------------------------------------------------------------ */
/* Plants / decor                                                     */
/* ------------------------------------------------------------------ */
define('plant', '绿植', 500, 500, plantDraw(0.42));
define('plant-large', '大型绿植', 800, 800, plantDraw(0.5));
define('plant-small', '小盆栽', 250, 250, plantDraw(0.36));
define('painting', '装饰画', 700, 100, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.2)),
  p(linePath(w * 0.2, d * 0.7, w * 0.5, d * 0.3)),
  p(linePath(w * 0.5, d * 0.3, w * 0.8, d * 0.7)),
], 'bottom');
define('vase', '花瓶摆件', 300, 300, (w, d) => [
  p(`M${w * 0.36} ${d * 0.85} L${w * 0.42} ${d * 0.45} L${w * 0.58} ${d * 0.45} L${w * 0.64} ${d * 0.85}Z`, 'outline'),
  p(linePath(w * 0.42, d * 0.45, w * 0.58, d * 0.45)),
  p(linePath(w * 0.5, d * 0.45, w * 0.5, d * 0.15)),
  p(linePath(w * 0.5, d * 0.3, w * 0.36, d * 0.22)),
  p(linePath(w * 0.5, d * 0.3, w * 0.64, d * 0.22)),
]);
define('pet-bed', '宠物窝', 600, 500, (w, d) => [
  p(`M${w * 0.1} ${d * 0.3} Q${w * 0.5} ${d * 0.05} ${w * 0.9} ${d * 0.3} L${w * 0.9} ${d * 0.75} Q${w * 0.5} ${d * 0.98} ${w * 0.1} ${d * 0.75}Z`, 'outline'),
  p(circlePath(w * 0.5, d * 0.55, Math.min(w, d) * 0.2)),
]);
define('ac', '空调', 900, 300, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(linePath(w * 0.08, d * 0.42, w * 0.92, d * 0.42)),
  p(linePath(w * 0.08, d * 0.68, w * 0.92, d * 0.68)),
  p(linePath(w * 0.2, d * 0.84, w * 0.8, d * 0.84)),
], 'top');
define('appliance', '小家电', 350, 350, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.12), 'outline'),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.26)),
  p(circlePath(w / 2, d / 2, Math.min(w, d) * 0.1)),
]);
define('treadmill', '跑步机', 1700, 800, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(insetRectPath(1, 1, w - 2, d - 2, Math.min(w, d) * 0.14)),
  p(linePath(w * 0.14, d * 0.5, w * 0.86, d * 0.5)),
  p(linePath(w * 0.85, d * 0.2, w * 0.85, d * 0.8)),
]);
define('piano', '钢琴', 1500, 600, (w, d) => {
  const paths: SymbolPath[] = [
    p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
    p(linePath(1, d * 0.42, w - 1, d * 0.42)),
  ];
  for (let index = 1; index <= 10; index += 1) {
    const x = 1 + ((w - 2) / 11) * index;
    paths.push(p(linePath(x, d * 0.42, x, d - 1)));
  }
  return paths;
}, 'top');
define('bunk-bed-symbol', '上下铺', 1000, 2000, bedDraw(1), 'top');
define('mirror-decor-symbol', '装饰镜', 600, 60, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 1), 'outline'),
  p(linePath(w * 0.2, d / 2, w * 0.8, d / 2)),
], 'bottom');

/* ------------------------------------------------------------------ */
/* Fallback                                                           */
/* ------------------------------------------------------------------ */
define('box', '未知家具', 1000, 1000, (w, d) => [
  p(roundRectPath(1, 1, w - 2, d - 2, 2), 'outline'),
  p(linePath(w * 0.25, d * 0.25, w * 0.75, d * 0.75)),
  p(linePath(w * 0.75, d * 0.25, w * 0.25, d * 0.75)),
]);

export const FURNITURE_SYMBOLS: ReadonlyMap<string, SymbolDef> = SYMBOLS;

export const FURNITURE_SYMBOL_KEYS: string[] = Array.from(SYMBOLS.keys());

export function getFurnitureSymbol(key: string): SymbolDef {
  return SYMBOLS.get(key) ?? SYMBOLS.get('box')!;
}

export function hasFurnitureSymbol(key: string): boolean {
  return SYMBOLS.has(key);
}

export { STROKE as SYMBOL_STROKE };
