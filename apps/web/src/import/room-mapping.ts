import type { RoomType } from '@hdesign/domain';

/**
 * Recognised labels are usually Chinese room names; samples/tests and some imported
 * drawings are in English. Map both to the domain RoomType enum without guessing wildly.
 */

const RULES: Array<{ pattern: RegExp; type: RoomType }> = [
  { pattern: /主卧|主卧室|MASTER/i, type: 'master-bedroom' },
  { pattern: /次卧|客卧|BEDROOM|BED\b/i, type: 'bedroom' },
  { pattern: /儿童房|KIDS/i, type: 'kids-room' },
  { pattern: /客厅|起居|LIVING|LOUNGE/i, type: 'living' },
  { pattern: /餐厅|DINING/i, type: 'dining' },
  { pattern: /厨房|KITCHEN/i, type: 'kitchen' },
  { pattern: /卫生间|卫浴|洗手间|主卫|客卫|BATH|TOILET|WC/i, type: 'bath' },
  { pattern: /阳台|BALCONY/i, type: 'balcony' },
  { pattern: /玄关|入户|ENTRY|FOYER/i, type: 'entry' },
  { pattern: /书房|STUDY|OFFICE/i, type: 'study' },
  { pattern: /走廊|过道|CORRIDOR|HALL/i, type: 'corridor' },
  { pattern: /衣帽间|储物|CLOSET/i, type: 'other' },
];

export function inferRoomType(label?: string): RoomType {
  if (!label) return 'other';
  const cleaned = label.trim();
  if (!cleaned) return 'other';
  for (const rule of RULES) {
    if (rule.pattern.test(cleaned)) return rule.type;
  }
  return 'other';
}

const TYPE_NAMES: Record<RoomType, string> = {
  living: '客厅',
  'master-bedroom': '主卧',
  bedroom: '次卧',
  'kids-room': '儿童房',
  dining: '餐厅',
  kitchen: '厨房',
  bath: '卫生间',
  balcony: '阳台',
  entry: '玄关',
  study: '书房',
  corridor: '走廊',
  other: '房间',
};

export function roomDisplayName(label: string | undefined, index: number): string {
  const trimmed = label?.trim();
  if (!trimmed) return `${TYPE_NAMES.other} ${index + 1}`;
  // Keep Chinese labels as-is; normalise English sample labels to Chinese type names.
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 20);
  const type = inferRoomType(trimmed);
  return type === 'other' ? trimmed.slice(0, 20) : TYPE_NAMES[type];
}
