import type { MaterialDef } from './types';

/**
 * Canonical material library.
 * Colours are reference tone colours (used for swatches / 2D fills); `pricePerSqm`
 * is a realistic CNY reference so the BOM can estimate budgets without AI.
 *
 * Seed material ids that MUST exist (referenced by domain room defaults / seed.ts):
 *   floor-oak, floor-oak-walnut, floor-tile-600, floor-tile-anti-slip, wall-latex-warm
 */
export const MATERIALS: MaterialDef[] = [
  /* ---------------------------------------------------------------- */
  /* Floor                                                            */
  /* ---------------------------------------------------------------- */
  {
    id: 'floor-oak',
    name: '橡木复合地板',
    scope: 'floor',
    color: '#C9A97D',
    pricePerSqm: 168,
    type: 'wood',
    tags: ['modern-minimal', 'japandi', 'nordic', 'cream', 'wabi-sabi'],
  },
  {
    id: 'floor-oak-walnut',
    name: '胡桃木地板',
    scope: 'floor',
    color: '#8A6242',
    pricePerSqm: 238,
    type: 'wood',
    tags: ['mid-century', 'new-chinese', 'american-retro', 'loft'],
  },
  {
    id: 'floor-oak-cream',
    name: '奶油色木地板',
    scope: 'floor',
    color: '#DCC7A8',
    pricePerSqm: 198,
    type: 'wood',
    tags: ['cream', 'light-luxury', 'japandi'],
  },
  {
    id: 'floor-wood-herringbone',
    name: '人字拼木地板',
    scope: 'floor',
    color: '#B08A5E',
    pricePerSqm: 328,
    type: 'wood',
    tags: ['light-luxury', 'american-retro', 'mid-century'],
  },
  {
    id: 'floor-ash',
    name: '白蜡木地板',
    scope: 'floor',
    color: '#D6C3A5',
    pricePerSqm: 208,
    type: 'wood',
    tags: ['nordic', 'japandi', 'modern-minimal'],
  },
  {
    id: 'floor-tile-800',
    name: '800 柔光地砖',
    scope: 'floor',
    color: '#DCDAD3',
    pricePerSqm: 158,
    type: 'tile',
    tags: ['modern-minimal', 'cream', 'mono'],
  },
  {
    id: 'floor-tile-600',
    name: '600 哑光地砖',
    scope: 'floor',
    color: '#C7C4BC',
    pricePerSqm: 128,
    type: 'tile',
    tags: ['modern-minimal', 'loft'],
  },
  {
    id: 'floor-tile-anti-slip',
    name: '防滑地砖',
    scope: 'floor',
    color: '#B6B2A8',
    pricePerSqm: 138,
    type: 'tile',
    tags: ['modern-minimal', 'loft'],
  },
  {
    id: 'floor-tile-wood',
    name: '木纹砖',
    scope: 'floor',
    color: '#C0A27F',
    pricePerSqm: 148,
    type: 'tile',
    tags: ['cream', 'japandi', 'wabi-sabi'],
  },
  {
    id: 'floor-marble',
    name: '大理石地面',
    scope: 'floor',
    color: '#E7E4DC',
    pricePerSqm: 520,
    type: 'stone',
    tags: ['light-luxury', 'mono'],
  },
  {
    id: 'floor-terrazzo',
    name: '水磨石地面',
    scope: 'floor',
    color: '#B9B6AC',
    pricePerSqm: 268,
    type: 'stone',
    tags: ['loft', 'dopamine', 'wabi-sabi'],
  },
  {
    id: 'floor-microcement',
    name: '微水泥地面',
    scope: 'floor',
    color: '#B9B3A6',
    pricePerSqm: 388,
    type: 'microcement',
    tags: ['wabi-sabi', 'loft', 'modern-minimal'],
  },
  {
    id: 'floor-carpet-full',
    name: '满铺地毯',
    scope: 'floor',
    color: '#BFAE98',
    pricePerSqm: 158,
    type: 'carpet',
    tags: ['japandi', 'wabi-sabi', 'mid-century'],
  },
  {
    id: 'floor-vinyl',
    name: 'SPC 石塑地板',
    scope: 'floor',
    color: '#CDB99A',
    pricePerSqm: 118,
    type: 'vinyl',
    tags: ['modern-minimal', 'nordic'],
  },

  /* ---------------------------------------------------------------- */
  /* Wall                                                             */
  /* ---------------------------------------------------------------- */
  {
    id: 'wall-latex-warm',
    name: '暖白乳胶漆',
    scope: 'wall',
    color: '#F3EEE4',
    pricePerSqm: 38,
    type: 'paint',
    tags: ['modern-minimal', 'cream', 'japandi', 'nordic'],
  },
  {
    id: 'wall-latex-cream',
    name: '奶油乳胶漆',
    scope: 'wall',
    color: '#EAD9C3',
    pricePerSqm: 42,
    type: 'paint',
    tags: ['cream', 'light-luxury'],
  },
  {
    id: 'wall-latex-greige',
    name: '灰调乳胶漆',
    scope: 'wall',
    color: '#D6D2C8',
    pricePerSqm: 42,
    type: 'paint',
    tags: ['modern-minimal', 'mono', 'loft'],
  },
  {
    id: 'wall-latex-sage',
    name: '鼠尾草绿乳胶漆',
    scope: 'wall',
    color: '#C3CCB8',
    pricePerSqm: 46,
    type: 'paint',
    tags: ['nordic', 'dopamine', 'japandi'],
  },
  {
    id: 'wall-latex-clay',
    name: '陶土色乳胶漆',
    scope: 'wall',
    color: '#D8B49B',
    pricePerSqm: 46,
    type: 'paint',
    tags: ['wabi-sabi', 'mid-century', 'american-retro'],
  },
  {
    id: 'wall-microcement',
    name: '微水泥墙面',
    scope: 'wall',
    color: '#BDB7AA',
    pricePerSqm: 268,
    type: 'microcement',
    tags: ['wabi-sabi', 'loft'],
  },
  {
    id: 'wall-tile-matte',
    name: '哑光墙砖',
    scope: 'wall',
    color: '#D6D3CA',
    pricePerSqm: 168,
    type: 'tile',
    tags: ['modern-minimal', 'loft'],
  },
  {
    id: 'wall-tile-mosaic',
    name: '马赛克墙砖',
    scope: 'wall',
    color: '#C9CFC6',
    pricePerSqm: 228,
    type: 'tile',
    tags: ['light-luxury', 'dopamine'],
  },
  {
    id: 'wall-wood-panel',
    name: '木饰面墙板',
    scope: 'wall',
    color: '#A9825C',
    pricePerSqm: 328,
    type: 'wood',
    tags: ['japandi', 'new-chinese', 'mid-century'],
  },
  {
    id: 'wall-concrete',
    name: '清水混凝土',
    scope: 'wall',
    color: '#A9A8A2',
    pricePerSqm: 218,
    type: 'microcement',
    tags: ['loft'],
  },
  {
    id: 'wall-wallpaper',
    name: '肌理壁纸',
    scope: 'wall',
    color: '#E4DCCB',
    pricePerSqm: 88,
    type: 'paint',
    tags: ['light-luxury', 'american-retro', 'new-chinese'],
  },

  /* ---------------------------------------------------------------- */
  /* Ceiling                                                          */
  /* ---------------------------------------------------------------- */
  {
    id: 'ceiling-latex-white',
    name: '白色乳胶漆顶面',
    scope: 'ceiling',
    color: '#FAFAF7',
    pricePerSqm: 32,
    type: 'paint',
    tags: ['modern-minimal', 'cream', 'japandi', 'nordic'],
  },
  {
    id: 'ceiling-gypsum',
    name: '石膏板吊顶',
    scope: 'ceiling',
    color: '#F5F3EC',
    pricePerSqm: 128,
    type: 'paint',
    tags: ['modern-minimal', 'light-luxury'],
  },
  {
    id: 'ceiling-wood',
    name: '木格栅吊顶',
    scope: 'ceiling',
    color: '#C0A27F',
    pricePerSqm: 288,
    type: 'wood',
    tags: ['japandi', 'new-chinese'],
  },

  /* ---------------------------------------------------------------- */
  /* Joinery                                                          */
  /* ---------------------------------------------------------------- */
  {
    id: 'joinery-oak',
    name: '橡木饰面柜体',
    scope: 'joinery',
    color: '#C9A97D',
    pricePerSqm: 680,
    type: 'wood',
    tags: ['japandi', 'nordic', 'wabi-sabi'],
  },
  {
    id: 'joinery-walnut',
    name: '胡桃木饰面柜体',
    scope: 'joinery',
    color: '#7A5A3C',
    pricePerSqm: 880,
    type: 'wood',
    tags: ['new-chinese', 'mid-century', 'american-retro'],
  },
  {
    id: 'joinery-cream-lacquer',
    name: '奶油烤漆柜体',
    scope: 'joinery',
    color: '#EFE3D0',
    pricePerSqm: 720,
    type: 'laminate',
    tags: ['cream', 'light-luxury'],
  },
  {
    id: 'joinery-white-lacquer',
    name: '白色烤漆柜体',
    scope: 'joinery',
    color: '#F3F2EE',
    pricePerSqm: 760,
    type: 'laminate',
    tags: ['modern-minimal', 'mono', 'nordic'],
  },
  {
    id: 'joinery-grey-lacquer',
    name: '高级灰柜体',
    scope: 'joinery',
    color: '#9A9891',
    pricePerSqm: 780,
    type: 'laminate',
    tags: ['loft', 'mono', 'modern-minimal'],
  },
  {
    id: 'joinery-ash',
    name: '白蜡木柜体',
    scope: 'joinery',
    color: '#D6C3A5',
    pricePerSqm: 720,
    type: 'wood',
    tags: ['nordic', 'japandi'],
  },
  {
    id: 'joinery-bamboo',
    name: '竹木柜体',
    scope: 'joinery',
    color: '#C9B08D',
    pricePerSqm: 560,
    type: 'wood',
    tags: ['japandi', 'wabi-sabi'],
  },

  /* ---------------------------------------------------------------- */
  /* Countertop / stone                                               */
  /* ---------------------------------------------------------------- */
  {
    id: 'countertop-quartz-white',
    name: '白色石英石台面',
    scope: 'countertop',
    color: '#EDEBE4',
    pricePerSqm: 680,
    type: 'stone',
    tags: ['modern-minimal', 'cream'],
  },
  {
    id: 'countertop-quartz-grey',
    name: '灰色石英石台面',
    scope: 'countertop',
    color: '#C4C3BD',
    pricePerSqm: 720,
    type: 'stone',
    tags: ['loft', 'mono', 'modern-minimal'],
  },
  {
    id: 'countertop-sintered',
    name: '岩板台面',
    scope: 'countertop',
    color: '#DDD8CC',
    pricePerSqm: 1280,
    type: 'stone',
    tags: ['light-luxury', 'new-chinese'],
  },
  {
    id: 'countertop-marble',
    name: '天然大理石台面',
    scope: 'countertop',
    color: '#E6E2D8',
    pricePerSqm: 1580,
    type: 'stone',
    tags: ['light-luxury', 'american-retro'],
  },
  {
    id: 'countertop-stainless',
    name: '不锈钢台面',
    scope: 'countertop',
    color: '#B9BEBD',
    pricePerSqm: 880,
    type: 'metal',
    tags: ['loft'],
  },
  {
    id: 'countertop-wood',
    name: '实木台面',
    scope: 'countertop',
    color: '#B08A5E',
    pricePerSqm: 960,
    type: 'wood',
    tags: ['japandi', 'wabi-sabi'],
  },

  /* ---------------------------------------------------------------- */
  /* Metal / hardware                                                 */
  /* ---------------------------------------------------------------- */
  {
    id: 'metal-black',
    name: '哑光黑金属',
    scope: 'metal',
    color: '#2F3330',
    pricePerSqm: 180,
    type: 'metal',
    tags: ['modern-minimal', 'loft', 'mono'],
  },
  {
    id: 'metal-brass',
    name: '拉丝黄铜',
    scope: 'metal',
    color: '#B08A5E',
    pricePerSqm: 320,
    type: 'metal',
    tags: ['light-luxury', 'new-chinese'],
  },
  {
    id: 'metal-stainless',
    name: '拉丝不锈钢',
    scope: 'metal',
    color: '#B9BEBD',
    pricePerSqm: 220,
    type: 'metal',
    tags: ['modern-minimal', 'loft'],
  },
  {
    id: 'metal-brushed-nickel',
    name: '拉丝镍',
    scope: 'metal',
    color: '#A8A9A4',
    pricePerSqm: 260,
    type: 'metal',
    tags: ['cream', 'light-luxury'],
  },
  {
    id: 'metal-white',
    name: '白色金属',
    scope: 'metal',
    color: '#EDEDE8',
    pricePerSqm: 160,
    type: 'metal',
    tags: ['nordic', 'cream', 'modern-minimal'],
  },

  /* ---------------------------------------------------------------- */
  /* Fabric / leather                                                 */
  /* ---------------------------------------------------------------- */
  {
    id: 'fabric-linen',
    name: '亚麻布艺',
    scope: 'fabric',
    color: '#C9BCA6',
    pricePerSqm: 128,
    type: 'fabric',
    tags: ['japandi', 'wabi-sabi', 'nordic'],
  },
  {
    id: 'fabric-boucle',
    name: '羊羔绒布艺',
    scope: 'fabric',
    color: '#E0D6C4',
    pricePerSqm: 168,
    type: 'fabric',
    tags: ['cream', 'light-luxury', 'dopamine'],
  },
  {
    id: 'fabric-cotton-grey',
    name: '棉麻浅灰布艺',
    scope: 'fabric',
    color: '#B9B7AE',
    pricePerSqm: 118,
    type: 'fabric',
    tags: ['modern-minimal', 'nordic', 'mono'],
  },
  {
    id: 'fabric-velvet-green',
    name: '墨绿丝绒',
    scope: 'fabric',
    color: '#3E5A4B',
    pricePerSqm: 198,
    type: 'fabric',
    tags: ['mid-century', 'american-retro', 'light-luxury'],
  },
  {
    id: 'fabric-velvet-rust',
    name: '锈红丝绒',
    scope: 'fabric',
    color: '#A9523A',
    pricePerSqm: 198,
    type: 'fabric',
    tags: ['dopamine', 'american-retro', 'mid-century'],
  },
  {
    id: 'fabric-leather-cognac',
    name: '干邑色皮革',
    scope: 'fabric',
    color: '#8A5A34',
    pricePerSqm: 428,
    type: 'fabric',
    tags: ['mid-century', 'american-retro', 'light-luxury'],
  },
  {
    id: 'fabric-wool',
    name: '羊毛呢',
    scope: 'fabric',
    color: '#9E9A8C',
    pricePerSqm: 238,
    type: 'fabric',
    tags: ['wabi-sabi', 'japandi', 'mono'],
  },
];

const MATERIAL_BY_ID = new Map(MATERIALS.map((material) => [material.id, material]));

export function getMaterial(id: string): MaterialDef | undefined {
  return MATERIAL_BY_ID.get(id);
}

export function materialsByScope(scope: MaterialDef['scope']): MaterialDef[] {
  return MATERIALS.filter((material) => material.scope === scope);
}

/** Materials compatible with a style id (by tag), falling back to the whole scope list. */
export function materialsForStyle(styleId: string, scope?: MaterialDef['scope']): MaterialDef[] {
  const pool = scope ? materialsByScope(scope) : MATERIALS;
  const tagged = pool.filter((material) => material.tags.includes(styleId));
  return tagged.length > 0 ? tagged : pool;
}
