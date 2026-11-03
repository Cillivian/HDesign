import type { RoomType } from '@hdesign/domain';
import type { FurnitureCategory, FurnitureSku } from './types';

/**
 * Furniture catalogue: 120+ SKUs with realistic millimetre footprints.
 *
 * Rows are stored as compact tuples to keep the table reviewable:
 *   [id, name, category, w, d, h, symbol, builder, colour, [priceLow, priceHigh],
 *    styleTags, materialSlots, flags, extraRoomTypes?]
 *
 * - `symbol` is resolved by @hdesign/symbols (getFurnitureSymbol).
 * - `builder` is resolved by apps/web/src/scene3d (3D parametric builder key).
 * - `flags`: 'w' = wall-mounted, 'x' = collision-exempt (rugs, curtains, wall decor…),
 *   'wx' = both.
 * - `priceRange` is CNY reference (low–high).
 * - roomTypes default from the category and are extended by `extraRoomTypes`
 *   (space-separated RoomType ids).
 */
type FurnitureRow = readonly [
  id: string,
  name: string,
  category: FurnitureCategory,
  w: number,
  d: number,
  h: number,
  symbol: string,
  builder: string,
  color: string,
  price: readonly [number, number],
  styleTags: string,
  materialSlots: string,
  flags: string,
  extraRooms?: string,
];

const ROOM_DEFAULTS: Record<FurnitureCategory, RoomType[]> = {
  bed: ['master-bedroom', 'bedroom', 'kids-room'],
  sofa: ['living'],
  table: ['living', 'dining', 'study', 'balcony', 'other'],
  chair: ['living', 'dining', 'study', 'kids-room', 'other'],
  storage: [
    'living',
    'master-bedroom',
    'bedroom',
    'kids-room',
    'dining',
    'study',
    'entry',
    'corridor',
  ],
  kitchen: ['kitchen'],
  bath: ['bath'],
  appliance: ['living', 'kitchen', 'bath', 'balcony', 'study'],
  lighting: [
    'living',
    'master-bedroom',
    'bedroom',
    'kids-room',
    'dining',
    'kitchen',
    'bath',
    'balcony',
    'entry',
    'study',
    'corridor',
    'other',
  ],
  textile: ['living', 'master-bedroom', 'bedroom', 'kids-room', 'dining', 'study', 'entry'],
  decor: ['living', 'master-bedroom', 'bedroom', 'kids-room', 'dining', 'entry', 'study'],
  plant: [
    'living',
    'master-bedroom',
    'bedroom',
    'dining',
    'balcony',
    'entry',
    'study',
    'kitchen',
    'bath',
  ],
};

const ROWS: FurnitureRow[] = [
  /* ---------------------------------------------------------------- */
  /* Beds                                                             */
  /* ---------------------------------------------------------------- */
  ['bed-double', '双人床 1.5m', 'bed', 1500, 2000, 900, 'bed-double', 'bed', '#B7A48C', [3200, 7600], 'modern-minimal cream japandi nordic', 'frame fabric', '', 'living'],
  ['bed-double-wood', '实木双人床', 'bed', 1600, 2050, 1000, 'bed-double', 'bed', '#A9825C', [4200, 9800], 'japandi new-chinese mid-century', 'frame fabric', ''],
  ['bed-king', '大床 1.8m', 'bed', 1800, 2000, 950, 'bed-king', 'bed', '#B7A48C', [4600, 11800], 'modern-minimal light-luxury cream', 'frame fabric', '', 'living'],
  ['bed-king-soft', '软包大床', 'bed', 2000, 2100, 1100, 'bed-king', 'bed', '#D8C8B8', [6800, 16800], 'light-luxury cream american-retro', 'frame fabric leather', ''],
  ['bed-single', '单人床 1.2m', 'bed', 1200, 1900, 850, 'bed-single', 'bed', '#B7A48C', [2200, 5600], 'modern-minimal nordic japandi', 'frame fabric', '', 'living study'],
  ['bed-single-900', '单人床 0.9m', 'bed', 900, 1900, 850, 'bed-single', 'bed', '#B7A48C', [1800, 4200], 'nordic modern-minimal', 'frame fabric', ''],
  ['bed-storage', '储物双人床', 'bed', 1500, 2000, 1100, 'bed-double', 'bed', '#A08A70', [5200, 12600], 'modern-minimal cream', 'frame fabric', ''],
  ['bed-tatami', '榻榻米床', 'bed', 1800, 2000, 450, 'bed-double', 'bed', '#C9B08D', [3200, 8800], 'japandi wabi-sabi new-chinese', 'frame mat', ''],
  ['kids-bed', '儿童床', 'bed', 1200, 1900, 800, 'kids-bed', 'bed', '#D8C3A8', [2200, 6200], 'cream nordic dopamine', 'frame fabric', ''],
  ['bunk-bed', '上下铺儿童床', 'bed', 1000, 2000, 1700, 'bunk-bed', 'bed', '#CBBBA2', [2800, 7600], 'nordic dopamine mid-century', 'frame', '', 'bedroom'],
  ['crib', '婴儿床', 'bed', 700, 1300, 900, 'crib', 'bed', '#E6D5BC', [1600, 3800], 'cream nordic', 'frame', ''],
  ['bed-guest', '客卧床', 'bed', 1350, 1950, 880, 'bed-double', 'bed', '#C9B08D', [2600, 6200], 'modern-minimal nordic', 'frame fabric', ''],

  /* ---------------------------------------------------------------- */
  /* Sofas / lounge                                                   */
  /* ---------------------------------------------------------------- */
  ['sofa-3', '三人沙发', 'sofa', 2300, 950, 780, 'sofa', 'sofa', '#A9A294', [4200, 12800], 'modern-minimal cream japandi', 'frame fabric', ''],
  ['sofa-2', '双人沙发', 'sofa', 1700, 900, 780, 'sofa-2', 'sofa', '#A9A294', [3200, 9600], 'modern-minimal nordic cream', 'frame fabric', '', 'master-bedroom'],
  ['sofa-module', '模块沙发', 'sofa', 1600, 950, 780, 'sofa', 'sofa', '#B9B7AE', [3800, 11800], 'modern-minimal loft', 'frame fabric', ''],
  ['sofa-leather', '皮质沙发', 'sofa', 2200, 950, 820, 'sofa', 'sofa', '#8A5A34', [6800, 19800], 'mid-century american-retro light-luxury', 'frame leather', ''],
  ['sofa-l', '转角沙发', 'sofa', 2800, 1700, 780, 'sofa-l', 'sofa', '#A9A294', [7200, 19800], 'modern-minimal cream light-luxury', 'frame fabric', ''],
  ['sofa-bed', '沙发床', 'sofa', 2000, 950, 900, 'sofa', 'sofa', '#B9B7AE', [3600, 9800], 'nordic modern-minimal', 'frame fabric', ''],
  ['sofa-single', '单人沙发', 'sofa', 950, 900, 800, 'armchair', 'sofa', '#C9BCA6', [1800, 5600], 'cream mid-century japandi', 'frame fabric', ''],
  ['armchair', '休闲单椅', 'sofa', 800, 850, 820, 'armchair', 'sofa', '#C9BCA6', [1600, 4800], 'mid-century japandi', 'frame fabric', ''],
  ['recliner', '电动躺椅', 'sofa', 900, 950, 1050, 'armchair', 'sofa', '#8A8178', [4800, 12800], 'american-retro loft', 'frame leather', ''],
  ['lounge-chair', '休闲躺椅', 'sofa', 750, 800, 780, 'armchair', 'sofa', '#B08A5E', [2200, 6800], 'mid-century japandi', 'frame fabric', '', 'study balcony'],
  ['ottoman', '脚凳', 'sofa', 600, 500, 420, 'ottoman', 'sofa', '#C9BCA6', [600, 2200], 'cream modern-minimal', 'fabric', ''],
  ['sofa-curved', '弧形沙发', 'sofa', 2600, 1400, 760, 'sofa', 'sofa', '#E0D6C4', [8800, 22800], 'light-luxury cream', 'frame fabric', ''],

  /* ---------------------------------------------------------------- */
  /* Tables                                                           */
  /* ---------------------------------------------------------------- */
  ['coffee-table', '茶几', 'table', 1000, 550, 420, 'coffee-table', 'table', '#8C7A63', [800, 4200], 'modern-minimal cream japandi', 'top legs', ''],
  ['coffee-table-round', '圆茶几', 'table', 800, 800, 420, 'coffee-table-round', 'table', '#A08A70', [900, 3800], 'cream nordic mid-century', 'top legs', ''],
  ['coffee-table-marble', '大理石茶几', 'table', 1100, 600, 420, 'coffee-table', 'table', '#DDD8CC', [2200, 8800], 'light-luxury mono', 'top legs', ''],
  ['side-table', '边几', 'table', 450, 450, 550, 'side-table', 'table', '#8C7A63', [400, 2200], 'modern-minimal nordic', 'top legs', ''],
  ['console-table', '玄关桌', 'table', 1200, 350, 800, 'console-table', 'table', '#8C7259', [1200, 4800], 'modern-minimal japandi', 'top legs', '', 'living study'],
  ['dining-table', '餐桌 1.4m', 'table', 1400, 800, 750, 'dining-table', 'table', '#8C7259', [1800, 6800], 'japandi modern-minimal cream', 'top legs', ''],
  ['dining-table-6', '六人餐桌', 'table', 1800, 900, 750, 'dining-table', 'table', '#8C7259', [2600, 8800], 'modern-minimal new-chinese japandi', 'top legs', ''],
  ['dining-table-round', '圆餐桌', 'table', 1200, 1200, 750, 'dining-table-round', 'table', '#A08A70', [2400, 7800], 'cream light-luxury mid-century', 'top legs', ''],
  ['dining-table-fold', '折叠餐桌', 'table', 1200, 800, 750, 'dining-table', 'table', '#B9A88F', [1200, 3800], 'nordic modern-minimal', 'top legs', '', 'kitchen'],
  ['bar-counter', '吧台', 'table', 1800, 500, 1050, 'kitchen-counter', 'counter', '#9A9891', [2800, 9600], 'loft mid-century', 'top body', '', 'kitchen living'],
  ['desk', '书桌 1.2m', 'table', 1200, 600, 750, 'desk', 'desk', '#8C7259', [1200, 4600], 'modern-minimal japandi nordic', 'top legs', ''],
  ['desk-long', '长书桌', 'table', 1600, 700, 750, 'desk', 'desk', '#8C7259', [1800, 6200], 'modern-minimal wabi-sabi', 'top legs', ''],
  ['desk-standing', '升降桌', 'table', 1400, 700, 750, 'desk', 'desk', '#9A9891', [3200, 9600], 'loft modern-minimal', 'top legs', ''],
  ['dressing-table', '梳妆台', 'table', 1000, 450, 750, 'dresser', 'table', '#D6C3A5', [1800, 5600], 'cream light-luxury', 'top body mirror', ''],
  ['tea-table', '茶桌', 'table', 1200, 600, 450, 'coffee-table', 'table', '#A9825C', [1600, 5200], 'new-chinese wabi-sabi', 'top legs', ''],
  ['study-table', '学习桌', 'table', 1000, 550, 750, 'desk', 'desk', '#D6C3A5', [1600, 5200], 'nordic cream', 'top legs', '', 'kids-room'],

  /* ---------------------------------------------------------------- */
  /* Chairs / stools                                                  */
  /* ---------------------------------------------------------------- */
  ['dining-chair', '餐椅', 'chair', 450, 480, 820, 'chair', 'chair', '#A08A70', [280, 1600], 'modern-minimal cream japandi nordic', 'frame fabric', ''],
  ['dining-chair-wood', '实木餐椅', 'chair', 450, 480, 820, 'chair', 'chair', '#A9825C', [380, 1800], 'japandi new-chinese mid-century', 'frame', ''],
  ['chair', '书椅', 'chair', 480, 520, 900, 'chair', 'chair', '#A08A70', [480, 2200], 'modern-minimal japandi', 'frame fabric', ''],
  ['desk-chair', '人体工学椅', 'chair', 650, 650, 1150, 'desk-chair', 'chair', '#5E625E', [1200, 4600], 'modern-minimal loft', 'frame fabric mesh', ''],
  ['bar-stool', '吧凳', 'chair', 400, 400, 750, 'bar-stool', 'chair', '#8C7A63', [360, 1800], 'loft mid-century', 'frame seat', '', 'kitchen living'],
  ['stool', '圆凳', 'chair', 350, 350, 450, 'stool', 'chair', '#A08A70', [200, 900], 'japandi nordic', 'seat frame', ''],
  ['dining-bench', '餐凳', 'chair', 1200, 350, 450, 'bench', 'chair', '#A9825C', [800, 2800], 'japandi wabi-sabi', 'seat frame', ''],
  ['lounge-chair-wood', '木质休闲椅', 'chair', 700, 750, 760, 'armchair', 'chair', '#A9825C', [1600, 4800], 'japandi mid-century', 'frame fabric', ''],
  ['kids-chair', '儿童椅', 'chair', 320, 340, 580, 'chair', 'chair', '#D8C3A8', [160, 700], 'cream nordic dopamine', 'frame', '', 'kids-room'],
  ['folding-chair', '折叠椅', 'chair', 420, 460, 800, 'chair', 'chair', '#9A9891', [120, 600], 'nordic modern-minimal', 'frame', '', 'balcony other'],
  ['bench', '长凳', 'chair', 1200, 400, 450, 'bench', 'chair', '#B9A88F', [800, 2600], 'modern-minimal japandi', 'seat frame', '', 'entry balcony'],
  ['pouf', '蒲团坐垫', 'chair', 550, 550, 350, 'ottoman', 'chair', '#C9BCA6', [360, 1200], 'wabi-sabi japandi', 'fabric', '', 'living'],
  ['massage-chair', '按摩椅', 'chair', 800, 1100, 1150, 'recliner', 'chair', '#5E625E', [6800, 26800], 'light-luxury american-retro', 'frame leather', '', 'living'],

  /* ---------------------------------------------------------------- */
  /* Storage                                                          */
  /* ---------------------------------------------------------------- */
  ['wardrobe', '衣柜 1.8m', 'storage', 1800, 600, 2200, 'wardrobe', 'wardrobe', '#9B8A73', [3800, 12800], 'modern-minimal cream japandi', 'body doors handles', ''],
  ['wardrobe-sliding', '推拉门衣柜', 'storage', 2000, 650, 2400, 'wardrobe-sliding', 'wardrobe', '#C9BCA6', [5200, 15800], 'modern-minimal nordic', 'body doors handles', ''],
  ['wardrobe-walkin', '开放式衣帽间', 'storage', 2400, 600, 2400, 'wardrobe', 'wardrobe', '#B08A5E', [6800, 18800], 'light-luxury wabi-sabi', 'body shelves', '', 'master-bedroom'],
  ['nightstand', '床头柜', 'storage', 450, 400, 500, 'nightstand', 'cabinet', '#8C7259', [520, 2800], 'modern-minimal cream japandi', 'body handles', ''],
  ['dresser', '五斗柜', 'storage', 1000, 450, 1000, 'dresser', 'cabinet', '#9B8A73', [1600, 5600], 'cream mid-century japandi', 'body handles', ''],
  ['tv-cabinet', '电视柜', 'storage', 1800, 400, 450, 'tv-cabinet', 'cabinet', '#7C6A55', [1600, 6800], 'modern-minimal cream japandi', 'body handles', ''],
  ['tv-cabinet-float', '悬空电视柜', 'storage', 2000, 350, 300, 'tv-cabinet', 'cabinet', '#9B8A73', [2200, 7600], 'modern-minimal loft', 'body', 'w'],
  ['sideboard', '餐边柜', 'storage', 1400, 420, 850, 'sideboard', 'cabinet', '#9B8A73', [2200, 7800], 'japandi mid-century new-chinese', 'body handles top', ''],
  ['sideboard-glass', '玻璃餐边柜', 'storage', 1200, 420, 850, 'sideboard', 'cabinet', '#C9BCA6', [2600, 8600], 'light-luxury cream', 'body glass handles', ''],
  ['shoe-cabinet', '鞋柜', 'storage', 1000, 350, 1100, 'shoe-cabinet', 'cabinet', '#B9A88F', [1200, 4200], 'modern-minimal japandi', 'body doors handles', '', 'entry'],
  ['shoe-cabinet-tall', '高柜鞋柜', 'storage', 1200, 400, 2200, 'shoe-cabinet', 'cabinet', '#9B8A73', [2600, 7600], 'modern-minimal nordic', 'body doors', '', 'entry'],
  ['bookshelf', '书架', 'storage', 900, 350, 2000, 'bookshelf', 'bookshelf', '#9B8A73', [1200, 4200], 'modern-minimal japandi wabi-sabi', 'body shelves', ''],
  ['bookshelf-wide', '整墙书架', 'storage', 1800, 350, 2200, 'bookshelf', 'shelf', '#A9825C', [2800, 9200], 'japandi new-chinese mid-century', 'body shelves', '', 'study living'],
  ['cabinet', '收纳柜', 'storage', 800, 400, 1800, 'cabinet', 'cabinet', '#C9BCA6', [1600, 5200], 'modern-minimal cream', 'body doors handles', ''],
  ['wall-shelf', '壁挂置物架', 'storage', 900, 250, 300, 'shelf', 'bookshelf', '#B08A5E', [320, 1600], 'modern-minimal japandi', 'body', 'w'],
  ['coat-rack', '衣帽架', 'storage', 500, 500, 1750, 'coat-rack', 'stand', '#2F3330', [380, 1800], 'modern-minimal nordic', 'frame', '', 'entry living'],
  ['wine-cabinet', '酒柜', 'storage', 900, 450, 1800, 'wine-cabinet', 'cabinet', '#7A5A3C', [3200, 12800], 'light-luxury american-retro', 'body glass', '', 'dining living'],
  ['display-cabinet', '展示柜', 'storage', 900, 400, 1800, 'display-cabinet', 'cabinet', '#B08A5E', [2800, 9800], 'new-chinese light-luxury', 'body glass', '', 'dining living study'],
  ['laundry-cabinet', '洗衣机柜', 'storage', 1200, 600, 2200, 'laundry-cabinet', 'cabinet', '#D6D3CA', [2800, 7800], 'modern-minimal loft', 'body top', '', 'balcony bath'],
  ['file-cabinet', '文件柜', 'storage', 800, 450, 1200, 'cabinet', 'cabinet', '#9A9891', [1200, 3800], 'loft modern-minimal', 'body handles', '', 'study'],
  ['safe', '保险柜', 'storage', 450, 450, 600, 'safe', 'cabinet', '#3A3D3A', [1600, 6800], 'modern-minimal', 'metal', '', 'master-bedroom study'],
  ['mirror-cabinet', '镜柜', 'storage', 800, 150, 800, 'mirror', 'mirror', '#E7E4DC', [800, 3200], 'modern-minimal cream', 'body mirror', 'w', 'bath'],
  ['toy-box', '玩具收纳箱', 'storage', 800, 400, 500, 'cabinet', 'cabinet', '#D8C3A8', [320, 1200], 'cream dopamine nordic', 'body', '', 'kids-room'],
  ['shoe-rack', '简易鞋架', 'storage', 800, 300, 600, 'shoe-cabinet', 'shelf', '#B9A88F', [180, 900], 'nordic modern-minimal', 'shelves', '', 'entry'],

  /* ---------------------------------------------------------------- */
  /* Kitchen                                                          */
  /* ---------------------------------------------------------------- */
  ['kitchen-counter', '厨房地柜 2.4m', 'kitchen', 2400, 600, 850, 'kitchen-counter', 'counter', '#D6D2C6', [3800, 12800], 'modern-minimal cream japandi', 'body top handles', '', 'kitchen'],
  ['kitchen-counter-1800', '厨房地柜 1.8m', 'kitchen', 1800, 600, 850, 'kitchen-counter', 'counter', '#D6D2C6', [3200, 9800], 'modern-minimal japandi', 'body top handles', '', 'kitchen'],
  ['kitchen-counter-3000', '厨房地柜 3m', 'kitchen', 3000, 600, 850, 'kitchen-counter', 'counter', '#C9BCA6', [4800, 15800], 'cream modern-minimal', 'body top handles', '', 'kitchen'],
  ['kitchen-wall-cabinet', '厨房吊柜', 'kitchen', 2400, 350, 700, 'kitchen-counter', 'cabinet', '#EDEDE8', [2600, 8800], 'modern-minimal nordic', 'body doors', 'w', 'kitchen'],
  ['kitchen-island', '厨房中岛', 'kitchen', 1600, 900, 900, 'kitchen-island', 'counter', '#D6D2C6', [6800, 19800], 'loft modern-minimal light-luxury', 'body top', '', 'kitchen dining'],
  ['kitchen-island-small', '小中岛台', 'kitchen', 1200, 700, 900, 'kitchen-island', 'counter', '#C9BCA6', [4800, 13800], 'cream nordic', 'body top', '', 'kitchen'],
  ['sink', '水槽', 'kitchen', 800, 500, 200, 'sink', 'counter', '#B9BEBD', [680, 3800], 'modern-minimal japandi', 'metal', '', 'kitchen bath'],
  ['sink-double', '双槽水槽', 'kitchen', 1000, 500, 200, 'sink', 'counter', '#B9BEBD', [1200, 5600], 'modern-minimal loft', 'metal', '', 'kitchen'],
  ['stove', '燃气灶', 'kitchen', 750, 450, 120, 'stove', 'counter', '#2F3330', [980, 4800], 'modern-minimal japandi', 'metal top', '', 'kitchen'],
  ['cooktop-induction', '电磁炉', 'kitchen', 700, 420, 80, 'stove', 'counter', '#1E1E1C', [1200, 5800], 'loft modern-minimal', 'glass top', '', 'kitchen'],
  ['range-hood', '油烟机', 'kitchen', 900, 500, 600, 'range-hood', 'range-hood', '#B9BEBD', [1800, 6800], 'modern-minimal japandi', 'metal', 'w', 'kitchen'],
  ['fridge', '冰箱', 'kitchen', 700, 650, 1800, 'fridge', 'fridge', '#C9CDCB', [3200, 9800], 'modern-minimal cream', 'metal glass', '', 'kitchen balcony'],
  ['fridge-french', '法式多门冰箱', 'kitchen', 830, 700, 1900, 'fridge', 'fridge', '#B9BEBD', [6800, 18800], 'light-luxury modern-minimal', 'metal glass', '', 'kitchen'],
  ['oven', '嵌入式烤箱', 'kitchen', 600, 550, 600, 'oven', 'appliance', '#3A3D3A', [2200, 8800], 'modern-minimal loft', 'glass metal', '', 'kitchen'],
  ['dishwasher', '洗碗机', 'kitchen', 600, 600, 850, 'dishwasher', 'appliance', '#C9CDCB', [3800, 10800], 'modern-minimal light-luxury', 'metal', '', 'kitchen'],
  ['microwave', '微波炉', 'kitchen', 500, 400, 300, 'oven', 'appliance', '#B9BEBD', [480, 2200], 'modern-minimal', 'glass metal', 'w', 'kitchen'],
  ['water-purifier', '净水器', 'kitchen', 300, 300, 450, 'cabinet', 'appliance', '#EDEDE8', [1200, 4800], 'modern-minimal', 'metal', '', 'kitchen'],
  ['kitchen-rack', '厨房置物架', 'kitchen', 800, 300, 1200, 'shelf', 'shelf', '#B9BEBD', [280, 1200], 'loft modern-minimal', 'metal', '', 'kitchen'],
  ['bar-fridge', '酒柜冰箱', 'kitchen', 600, 600, 850, 'fridge', 'fridge', '#3A3D3A', [2800, 8800], 'light-luxury loft', 'glass metal', '', 'kitchen dining'],

  /* ---------------------------------------------------------------- */
  /* Bath                                                             */
  /* ---------------------------------------------------------------- */
  ['shower', '淋浴房', 'bath', 900, 900, 2000, 'shower', 'shower', '#B9C6C9', [2800, 9800], 'modern-minimal loft', 'glass metal', ''],
  ['shower-screen', '淋浴隔断', 'bath', 900, 100, 2000, 'shower', 'shower', '#C9D6D9', [1600, 5800], 'modern-minimal cream', 'glass metal', '', 'bath'],
  ['bathtub', '浴缸', 'bath', 1600, 750, 600, 'bathtub', 'bathtub', '#E7E4DC', [4800, 16800], 'light-luxury cream', 'body', ''],
  ['toilet', '马桶', 'bath', 400, 650, 780, 'toilet', 'toilet', '#E4E1DA', [1200, 5600], 'modern-minimal cream', 'ceramic', ''],
  ['toilet-wall', '壁挂马桶', 'bath', 380, 600, 400, 'toilet', 'toilet', '#E4E1DA', [3200, 8800], 'modern-minimal loft', 'ceramic', 'w'],
  ['vanity', '浴室柜', 'bath', 900, 500, 850, 'vanity', 'vanity', '#CBBBA2', [2200, 7800], 'cream modern-minimal japandi', 'body top handles', ''],
  ['vanity-double', '双盆浴室柜', 'bath', 1500, 500, 850, 'vanity', 'vanity', '#CBBBA2', [3800, 11800], 'light-luxury modern-minimal', 'body top handles', '', 'bath master-bedroom'],
  ['basin', '台上盆', 'bath', 600, 450, 150, 'sink', 'vanity', '#EDEBE4', [480, 2600], 'modern-minimal cream', 'ceramic', ''],
  ['mirror', '浴室镜', 'bath', 700, 40, 900, 'mirror', 'mirror', '#E7E4DC', [380, 2200], 'modern-minimal cream', 'glass', 'wx'],
  ['towel-rack', '毛巾架', 'bath', 600, 120, 120, 'shelf', 'metal', '#B9BEBD', [180, 880], 'modern-minimal', 'metal', 'w'],
  ['mop-pool', '拖把池', 'bath', 500, 450, 600, 'sink', 'bath', '#E4E1DA', [480, 1600], 'modern-minimal loft', 'ceramic', '', 'balcony'],
  ['washing-machine', '洗衣机', 'bath', 600, 600, 850, 'washing-machine', 'washing-machine', '#E4E1DA', [2200, 6800], 'modern-minimal cream', 'metal', '', 'balcony kitchen'],
  ['dryer', '烘干机', 'bath', 600, 600, 850, 'dryer', 'washing-machine', '#E4E1DA', [2600, 7800], 'modern-minimal', 'metal', '', 'balcony'],
  ['water-heater', '热水器', 'bath', 500, 350, 800, 'water-heater', 'appliance', '#EDEDE8', [1200, 4800], 'modern-minimal', 'metal', 'w', 'bath balcony'],
  ['bath-cabinet', '卫浴收纳柜', 'bath', 600, 300, 1800, 'cabinet', 'cabinet', '#CBBBA2', [1200, 3800], 'cream modern-minimal', 'body', '', 'bath'],

  /* ---------------------------------------------------------------- */
  /* Appliances / climate                                             */
  /* ---------------------------------------------------------------- */
  ['ac', '壁挂空调', 'appliance', 900, 300, 300, 'ac', 'appliance', '#EDEDE8', [2800, 7800], 'modern-minimal cream', 'shell', 'wx'],
  ['ac-floor', '立式空调', 'appliance', 400, 400, 1800, 'ac', 'appliance', '#EDEDE8', [4800, 11800], 'modern-minimal cream', 'shell', '', 'living'],
  ['air-purifier', '空气净化器', 'appliance', 350, 350, 700, 'appliance', 'appliance', '#EDEDE8', [1600, 5800], 'modern-minimal nordic', 'shell', ''],
  ['humidifier', '加湿器', 'appliance', 300, 300, 500, 'appliance', 'appliance', '#EDEDE8', [480, 2200], 'modern-minimal', 'shell', ''],
  ['robot-vacuum', '扫地机器人', 'appliance', 350, 350, 100, 'appliance', 'appliance', '#2F3330', [1200, 4800], 'modern-minimal', 'shell', ''],
  ['tv', '电视', 'appliance', 1450, 80, 850, 'tv', 'tv', '#1E1E1C', [2800, 12800], 'modern-minimal mono', 'screen stand', 'wx', 'living master-bedroom bedroom'],
  ['tv-large', '大屏电视', 'appliance', 1650, 90, 950, 'tv', 'tv', '#1E1E1C', [5800, 19800], 'light-luxury modern-minimal', 'screen stand', 'wx', 'living'],
  ['projector', '投影仪', 'appliance', 300, 250, 120, 'appliance', 'appliance', '#3A3D3A', [2800, 8800], 'loft modern-minimal', 'shell', 'w', 'living master-bedroom'],
  ['treadmill', '跑步机', 'appliance', 1700, 800, 1400, 'treadmill', 'appliance', '#5E625E', [3800, 12800], 'loft modern-minimal', 'frame', '', 'balcony living study'],
  ['piano', '立式钢琴', 'appliance', 1500, 600, 1200, 'piano', 'appliance', '#2F3330', [12800, 38000], 'new-chinese light-luxury', 'body keys', '', 'living study'],
  ['safe-box', '智能保险箱', 'appliance', 400, 400, 550, 'safe', 'appliance', '#5E625E', [1600, 5800], 'modern-minimal', 'metal', '', 'master-bedroom study'],

  /* ---------------------------------------------------------------- */
  /* Lighting                                                         */
  /* ---------------------------------------------------------------- */
  ['floor-lamp', '落地灯', 'lighting', 400, 400, 1550, 'floor-lamp', 'lamp', '#B9AE9A', [380, 2800], 'modern-minimal cream japandi', 'shade base', ''],
  ['table-lamp', '台灯', 'lighting', 300, 300, 500, 'table-lamp', 'lamp', '#C9BCA6', [180, 1600], 'modern-minimal cream', 'shade base', ''],
  ['pendant-light', '吊灯', 'lighting', 600, 600, 300, 'pendant-light', 'lamp', '#EDEDE8', [680, 5800], 'modern-minimal light-luxury', 'shade', 'wx', 'dining living master-bedroom bedroom'],
  ['ceiling-light', '吸顶灯', 'lighting', 500, 500, 120, 'pendant-light', 'lamp', '#EDEDE8', [280, 2600], 'modern-minimal nordic', 'shade', 'wx'],
  ['chandelier', '水晶吊灯', 'lighting', 800, 800, 600, 'chandelier', 'lamp', '#DDD8CC', [3800, 18800], 'light-luxury american-retro', 'shade crystal', 'wx', 'living dining'],
  ['wall-light', '壁灯', 'lighting', 200, 150, 250, 'wall-light', 'lamp', '#B08A5E', [180, 1200], 'modern-minimal cream japandi', 'shade', 'wx'],
  ['ceiling-fan', '风扇灯', 'lighting', 1100, 1100, 400, 'ceiling-fan', 'lamp', '#EDEDE8', [1200, 4800], 'nordic cream', 'shade blades', 'wx', 'living master-bedroom bedroom'],
  ['track-light', '轨道灯', 'lighting', 1200, 100, 100, 'pendant-light', 'lamp', '#2F3330', [480, 2800], 'loft modern-minimal', 'track', 'wx'],
  ['desk-lamp', '护眼台灯', 'lighting', 250, 250, 450, 'table-lamp', 'lamp', '#EDEDE8', [280, 1600], 'nordic modern-minimal', 'shade base', '', 'study kids-room'],

  /* ---------------------------------------------------------------- */
  /* Textiles                                                         */
  /* ---------------------------------------------------------------- */
  ['rug', '客厅地毯', 'textile', 2600, 2000, 12, 'rug', 'rug', '#C9BCA6', [680, 6800], 'modern-minimal cream japandi', 'pile', 'x', 'living master-bedroom bedroom'],
  ['rug-round', '圆形地毯', 'textile', 2000, 2000, 12, 'rug-round', 'rug', '#C9BCA6', [580, 5600], 'cream nordic light-luxury', 'pile', 'x', 'living kids-room'],
  ['rug-runner', '长条地毯', 'textile', 2000, 800, 12, 'rug', 'rug', '#B9A88F', [280, 2600], 'modern-minimal japandi', 'pile', 'x', 'corridor entry'],
  ['rug-bedroom', '卧室地毯', 'textile', 2000, 1600, 12, 'rug', 'rug', '#C9BCA6', [480, 3800], 'cream nordic wabi-sabi', 'pile', 'x', 'bedroom master-bedroom kids-room'],
  ['curtain', '窗帘', 'textile', 3000, 120, 2600, 'curtain', 'curtain', '#E0D6C4', [680, 4800], 'modern-minimal cream japandi', 'fabric', 'wx'],
  ['curtain-sheer', '纱帘', 'textile', 3000, 80, 2600, 'curtain', 'curtain', '#F3EEE4', [480, 3200], 'cream nordic', 'fabric', 'wx'],
  ['cushion', '抱枕', 'textile', 450, 450, 150, 'cushion', 'decor', '#C9BCA6', [68, 480], 'cream modern-minimal dopamine', 'fabric', ''],
  ['blanket', '毛毯', 'textile', 1500, 1200, 50, 'blanket', 'decor', '#B9A88F', [180, 1200], 'wabi-sabi japandi', 'fabric', 'x'],
  ['bed-runner', '床尾巾', 'textile', 1500, 400, 20, 'blanket', 'decor', '#C9BCA6', [120, 980], 'light-luxury cream', 'fabric', 'x'],
  ['doormat', '门垫', 'textile', 900, 600, 20, 'rug', 'rug', '#8A8178', [98, 680], 'modern-minimal nordic', 'pile', 'x', 'entry balcony'],
  ['towel', '毛巾套装', 'textile', 400, 300, 60, 'blanket', 'decor', '#EDEDE8', [98, 680], 'modern-minimal cream', 'fabric', '', 'bath'],

  /* ---------------------------------------------------------------- */
  /* Decor / plants                                                   */
  /* ---------------------------------------------------------------- */
  ['plant', '绿植', 'plant', 500, 500, 1400, 'plant', 'plant', '#5F7A55', [180, 1600], 'japandi wabi-sabi nordic', 'pot foliage', ''],
  ['plant-large', '大型绿植', 'plant', 800, 800, 1800, 'plant-large', 'plant', '#4E6B4A', [480, 3600], 'japandi loft wabi-sabi', 'pot foliage', ''],
  ['plant-small', '小盆栽', 'plant', 250, 250, 400, 'plant-small', 'plant', '#6E8468', [48, 480], 'modern-minimal cream japandi', 'pot foliage', ''],
  ['plant-hanging', '垂吊绿植', 'plant', 400, 400, 1200, 'plant', 'plant', '#5F7A55', [120, 880], 'nordic japandi', 'pot foliage', 'w'],
  ['painting', '装饰画', 'decor', 700, 40, 900, 'painting', 'decor', '#DDD8CC', [280, 3800], 'modern-minimal cream light-luxury', 'frame canvas', 'wx'],
  ['painting-large', '大幅装饰画', 'decor', 1200, 40, 1400, 'painting', 'decor', '#C9BCA6', [680, 6800], 'light-luxury new-chinese', 'frame canvas', 'wx', 'living dining'],
  ['mirror-decor', '全身镜', 'decor', 600, 50, 1700, 'mirror', 'mirror', '#E7E4DC', [380, 2800], 'modern-minimal cream', 'frame glass', 'wx', 'master-bedroom bedroom entry'],
  ['vase', '花瓶', 'decor', 250, 250, 450, 'vase', 'decor', '#B9A88F', [68, 880], 'wabi-sabi japandi cream', 'ceramic', ''],
  ['decor-shelf', '装饰架', 'decor', 900, 300, 300, 'shelf', 'bookshelf', '#A9825C', [280, 1600], 'new-chinese japandi', 'body', 'w'],
  ['pet-bed', '宠物窝', 'decor', 600, 500, 400, 'pet-bed', 'decor', '#C9BCA6', [120, 880], 'cream nordic', 'fabric', '', 'living'],
  ['cat-tree', '猫爬架', 'decor', 500, 500, 1600, 'shelf', 'decor', '#B9A88F', [380, 1800], 'nordic cream', 'frame', '', 'living balcony'],
  ['sculpture', '艺术摆件', 'decor', 300, 300, 500, 'vase', 'decor', '#DDD8CC', [180, 2800], 'wabi-sabi light-luxury', 'ceramic', ''],
];

function parseList(value: string | undefined): string[] {
  return value ? value.split(/\s+/).filter(Boolean) : [];
}

function buildSku(row: FurnitureRow): FurnitureSku {
  const [
    id,
    name,
    category,
    w,
    d,
    h,
    symbol,
    builder,
    color,
    price,
    styleTags,
    materialSlots,
    flags,
    extraRooms,
  ] = row;
  const rooms = new Set<RoomType>(ROOM_DEFAULTS[category]);
  for (const room of parseList(extraRooms)) {
    rooms.add(room as RoomType);
  }
  return {
    id,
    name,
    category,
    w,
    d,
    h,
    symbol,
    builder,
    color,
    priceRange: [price[0], price[1]],
    styleTags: parseList(styleTags),
    materialSlots: parseList(materialSlots),
    wallMounted: flags.includes('w'),
    collisionExempt: flags.includes('x') || undefined,
    roomTypes: Array.from(rooms),
  };
}

export const FURNITURE: FurnitureSku[] = ROWS.map(buildSku);

/**
 * Compatibility aliases: other workstreams' runtime bridges look the array up by
 * one of these names before the package exports stabilise.
 */
export const FURNITURE_SKUS: FurnitureSku[] = FURNITURE;
export const FURNITURE_CATALOG: FurnitureSku[] = FURNITURE;
export const furnitureSkus: FurnitureSku[] = FURNITURE;

const FURNITURE_BY_ID = new Map(FURNITURE.map((sku) => [sku.id, sku]));

export function getFurnitureSku(id: string): FurnitureSku | undefined {
  return FURNITURE_BY_ID.get(id);
}

export function getFurnitureByCategory(category: FurnitureCategory): FurnitureSku[] {
  return FURNITURE.filter((sku) => sku.category === category);
}

/** SKUs usable in a room type, in catalogue order. */
export function furnitureForRoomType(roomType: RoomType): FurnitureSku[] {
  return FURNITURE.filter((sku) => sku.roomTypes.includes(roomType));
}

/** Preferred SKU for a category inside a room given a style preference list. */
export function preferredSku(
  category: FurnitureCategory,
  roomType: RoomType,
  preferredIds: string[] = [],
): FurnitureSku | undefined {
  for (const id of preferredIds) {
    const sku = FURNITURE_BY_ID.get(id);
    if (sku && sku.category === category && sku.roomTypes.includes(roomType)) return sku;
  }
  return FURNITURE.find((sku) => sku.category === category && sku.roomTypes.includes(roomType));
}
