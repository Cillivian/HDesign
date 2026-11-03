import { MEP_META, type Project } from '@hdesign/domain';
import { computeBom, formatNumber, type BomOverrides } from './bom';
import { formatScale } from './papers';

/**
 * CSV builders for BOM and MEP point schedules.
 *
 * Pure string output (no DOM/Blob) so the format is unit-testable; the web
 * service wraps the string into a downloadable file. Excel-friendly:
 * RFC 4180 escaping, CRLF line endings and a UTF-8 BOM via `csvWithBom`.
 */

export const CSV_BOM = '\uFEFF';

/** RFC 4180 field escaping. */
export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

/** Prefixes the UTF-8 BOM so Excel on Windows detects the encoding. */
export function csvWithBom(csv: string): string {
  return csv.startsWith(CSV_BOM) ? csv : `${CSV_BOM}${csv}`;
}

function roomName(project: Project, roomId: string | undefined): string {
  if (!roomId) return '—';
  return project.rooms.find((room) => room.id === roomId)?.name ?? '—';
}

/**
 * BOM CSV with one row per material / furniture SKU / MEP point kind followed by
 * subtotal rows. Mirrors exactly what the BOM sheet renders.
 */
export function buildBomCsv(project: Project, overrides: BomOverrides = {}): string {
  const bom = computeBom(project, overrides);
  const rows: Array<Array<string | number | null | undefined>> = [
    ['类别', '名称', '空间', '数量', '单位', '单价（元）', '金额（元）', '备注'],
  ];
  const scopeLabels: Record<string, string> = {
    floor: '地面',
    wall: '墙面',
    ceiling: '顶面',
    joinery: '定制',
    countertop: '台面',
  };
  for (const line of bom.materials) {
    rows.push([
      scopeLabels[line.scope] ?? line.scope,
      line.name,
      line.rooms.join('/'),
      formatNumber(line.quantity, 2),
      line.unit,
      formatNumber(line.unitPrice, 2),
      formatNumber(line.amount, 2),
      line.note,
    ]);
  }
  for (const line of bom.furniture) {
    rows.push([
      '家具',
      line.name,
      '—',
      line.count,
      line.unit,
      formatNumber(line.unitPrice, 2),
      formatNumber(line.amount, 2),
      line.note,
    ]);
  }
  for (const line of bom.mep) {
    rows.push([
      line.group === 'water' ? '水位' : '电位',
      `${line.label}（${line.heights.map((height) => `${height}`).join('/')}mm）`,
      '—',
      line.count,
      line.unit,
      formatNumber(line.unitPrice, 2),
      formatNumber(line.amount, 2),
      line.note,
    ]);
  }
  rows.push([]);
  rows.push(['小计', '材质', '', '', '', '', formatNumber(bom.totals.materials, 2), '']);
  rows.push(['小计', '家具', '', '', '', '', formatNumber(bom.totals.furniture, 2), '']);
  rows.push(['小计', '水电点位', '', '', '', '', formatNumber(bom.totals.mep, 2), '']);
  rows.push(['合计', '', '', '', '', '', formatNumber(bom.totals.total, 2), '参考价，以实际采购为准']);
  rows.push([
    '说明',
    `套内面积 ${formatNumber(bom.areaSqm, 1)} ㎡ · ${bom.roomCount} 个空间 · 图例比例 ${formatScale(100)} · 方案参考，不构成施工依据`,
  ]);
  return toCsv(rows);
}

/** One row per MEP device, suitable for on-site point setting out. */
export function buildMepPointsCsv(project: Project): string {
  const rows: Array<Array<string | number | null | undefined>> = [
    [
      '序号',
      '分组',
      '点位类型',
      '点位名称',
      '空间',
      'X（mm）',
      'Y（mm）',
      '安装高度（mm）',
      '回路',
      '防水',
      '备注',
    ],
  ];
  const circuitName = new Map(project.mep.circuits.map((circuit) => [circuit.id, circuit.name]));
  project.mep.devices.forEach((device, index) => {
    const meta = MEP_META[device.kind];
    rows.push([
      index + 1,
      meta.group === 'water' ? '水位' : '电位',
      device.kind,
      meta.label,
      roomName(project, device.roomId),
      Math.round(device.x),
      Math.round(device.y),
      Math.round(device.height),
      device.circuitId ? (circuitName.get(device.circuitId) ?? device.circuitId) : '未分配',
      device.waterproof ? '是' : '否',
      device.note ?? '',
    ]);
  });
  if (project.mep.devices.length === 0) {
    rows.push(['1', '', '', '暂无点位数据', '', '', '', '', '', '', '请在编辑器或水电面板添加点位']);
  }
  return toCsv(rows);
}

/** Room finish schedule CSV (floor material legend export). */
export function buildRoomScheduleCsv(project: Project): string {
  const rows: Array<Array<string | number | null | undefined>> = [
    ['空间', '类型', '面积（㎡）', '地面材质', '墙面材质', '吊顶类型', '吊顶高度（mm）'],
  ];
  for (const room of project.rooms) {
    rows.push([
      room.name,
      room.type,
      formatNumber(roomPolygonArea(project, room.id), 2),
      room.floorMaterialId,
      room.wallMaterialId,
      room.ceiling.type,
      room.ceiling.height,
    ]);
  }
  return toCsv(rows);
}

function roomPolygonArea(project: Project, roomId: string): number {
  const room = project.rooms.find((item) => item.id === roomId);
  if (!room) return 0;
  let area = 0;
  for (let index = 0; index < room.polygon.length; index += 1) {
    const current = room.polygon[index]!;
    const next = room.polygon[(index + 1) % room.polygon.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2) / 1_000_000;
}
