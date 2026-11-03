import {
  MEP_META,
  SHEET_KIND_LABELS,
  formatSqm,
  polygonAreaSqm,
  type Project,
  type SheetSpec,
  type TitleBlock,
} from '@hdesign/domain';
import { computeBom, formatCurrency, formatNumber, type BomOverrides } from '../bom';
import { materialInfo } from '../catalog-adapter';
import { fitScale, formatScale, niceScaleBarLength, paperScaleFactor, paperSpec } from '../papers';
import {
  attr,
  defs,
  escapeXml,
  group,
  line,
  num,
  rect,
  svgDocument,
  text,
} from '../svg';
import type { LayoutFrame, RectMm, SheetRenderOptions, SheetRenderResult } from '../types';
import {
  buildCeilingPattern,
  buildFloorHatches,
  createPlanContext,
  drawDimensions,
  drawFurniture,
  drawMep,
  drawNorthArrow,
  drawOpenings,
  drawPlanEmptyState,
  drawRooms,
  drawRoomLabels,
  drawScaleBar,
  drawWalls,
  planGroupTransform,
  type PlanContext,
} from './plan';

const INK = '#23261F';
const MUTED = '#5B635C';
const FAINT = '#8A928A';
const LINE = '#C3C9BF';
const ACCENT = '#C4442B';
const WATER = '#2E6FA3';
const WATER_LABELS: Record<string, string> = {
  'water-cold': '冷水给水',
  'water-hot': '热水给水',
  drain: '排水口',
  'floor-drain': '地漏',
  gas: '燃气点位',
  'floor-heat': '地暖分水器',
};
const ELECTRIC_LABELS: Record<string, string> = {
  socket: '五孔插座',
  'socket-16a': '16A 插座',
  switch: '单控开关',
  'switch-double': '双控开关',
  light: '主灯',
  'light-spot': '筒灯',
  ac: '空调插座',
  'weak-current': '弱电插座',
};
const ELECTRIC = '#A96F0B';

/* ------------------------------------------------------------------ */
/* Layout                                                             */
/* ------------------------------------------------------------------ */

function computeLayout(project: Project, sheet: SheetSpec, size: LayoutFrame['paper']['id']): LayoutFrame {
  const paper = paperSpec(size);
  const margin = paper.marginMm;
  const frame: RectMm = {
    x: margin,
    y: margin,
    w: paper.widthMm - margin * 2,
    h: paper.heightMm - margin * 2,
  };
  const titleH = 36;
  const titleW = Math.min(170, Math.max(120, frame.w * 0.6));
  const titleBlock: RectMm = {
    x: frame.x + frame.w - titleW,
    y: frame.y + frame.h - titleH,
    w: titleW,
    h: titleH,
  };
  const notes: RectMm = { x: frame.x, y: titleBlock.y, w: frame.w - titleW, h: titleH };
  const drawing: RectMm = { x: frame.x + 1, y: frame.y + 1, w: frame.w - 2, h: frame.h - titleH - 2 };
  const isBom = sheet.kind === 'bom';
  const legendW = isBom
    ? 0
    : Math.min(sheet.kind === 'water-plan' || sheet.kind === 'electric-plan' ? 78 : 64, drawing.w * 0.24);
  const legend: RectMm = isBom
    ? { x: 0, y: 0, w: 0, h: 0 }
    : { x: drawing.x + drawing.w - legendW - 3, y: drawing.y + 4, w: legendW, h: drawing.h - 10 };
  const plan: RectMm = isBom
    ? { x: drawing.x, y: drawing.y, w: drawing.w, h: drawing.h }
    : { x: drawing.x + 3, y: drawing.y + 3, w: drawing.w - legendW - 8, h: drawing.h - 6 };
  return { paper, page: { x: 0, y: 0, w: paper.widthMm, h: paper.heightMm }, frame, titleBlock, notes, drawing, plan, legend };
}

/* ------------------------------------------------------------------ */
/* Title block & notes                                                */
/* ------------------------------------------------------------------ */

function titleBlockText(value: string | undefined, fallback = '—'): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

function truncate(value: string, maxChars: number): string {
  const chars = [...value];
  if (chars.length <= maxChars) return value;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`;
}

function drawCellLabel(x: number, y: number, label: string): string {
  return text(x, y, label, { fontSize: 1.9, fill: FAINT });
}

function drawCellValue(x: number, y: number, value: string, size = 3.1, fill = INK, weight?: 'bold'): string {
  return text(x, y, truncate(value, 40), { fontSize: size, fill, weight });
}

export interface TitleBlockInput {
  project: Project;
  sheet: SheetSpec;
  titleBlock: TitleBlock;
  scaleDenominator: number;
  aiBadge: boolean;
  sheetIndex: number;
  sheetTotal: number;
  frame: LayoutFrame;
}

function renderTitleBlock(input: TitleBlockInput): string {
  const { titleBlock: block, frame } = input;
  const { x, y, w, h } = frame.titleBlock;
  const rowH = h / 3;
  const projectW = w * 0.4;
  const rest = w - projectW;
  const cellW = rest / 3;
  const content: string[] = [];
  const grid: string[] = [];

  const verticals = [x, x + projectW, x + projectW + cellW, x + projectW + cellW * 2, x + w];
  for (const value of verticals) {
    grid.push(line(value, y, value, y + h, { stroke: INK, strokeWidth: 0.3 }));
  }
  for (let row = 0; row <= 3; row += 1) {
    grid.push(line(x, y + row * rowH, x + w, y + row * rowH, { stroke: INK, strokeWidth: row === 0 || row === 3 ? 0.5 : 0.22 }));
  }
  grid.push(line(x + projectW, y, x + projectW, y + h, { stroke: INK, strokeWidth: 0.5 }));

  content.push(
    drawCellLabel(x + 2, y + 3.2, '工程名称 / PROJECT'),
    drawCellValue(x + 2, y + 8.2, titleBlockText(block.projectName || input.project.name, '未命名方案'), 3.6, INK, 'bold'),
    `<line x1="${num(x + 2)}" y1="${num(y + rowH + 3)}" x2="${num(x + projectW - 2)}" y2="${num(y + rowH + 3)}" stroke="${LINE}" stroke-width="0.14"/>`,
    drawCellLabel(x + 2, y + rowH + 8.2, '图名 / SHEET'),
    drawCellValue(x + 2, y + rowH + 13.2, titleBlockText(input.sheet.name), 3.4, INK, 'bold'),
    drawCellLabel(x + 2, y + rowH * 2 + 8.2, '说明 / NOTE'),
    text(x + 2, y + rowH * 2 + 13.2, truncate(titleBlockText(block.notes, input.sheet.notes || '方案参考 · 未校准'), 24), {
      fontSize: 2.2,
      fill: MUTED,
    }),
  );

  const columns: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: '图号', value: titleBlockText(block.sheetNo, 'A-01') },
    { label: '比例', value: formatScale(input.scaleDenominator) },
    { label: '日期', value: titleBlockText(block.date, input.project.updatedAt.slice(0, 10)) },
    { label: '设计', value: titleBlockText(block.designer) },
    { label: '校核', value: '—' },
    { label: '版本', value: 'V1.0' },
    { label: '张次', value: `${input.sheetIndex + 1}/${input.sheetTotal}` },
    { label: 'AI', value: input.aiBadge ? 'AI 方案' : '—', accent: input.aiBadge },
  ];
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index]!;
    const col = index % 3;
    const row = Math.floor(index / 3);
    const cellX = x + projectW + cellW * col;
    const cellY = y + row * rowH;
    content.push(
      drawCellLabel(cellX + 2, cellY + 3.2, column.label),
      drawCellValue(cellX + 2, cellY + 8.2, column.value, column.label === 'AI' ? 2.6 : 3.1, column.accent ? ACCENT : INK, column.label === '图号' || column.label === '比例' ? 'bold' : undefined),
    );
  }

  // Bottom-right disclaimer band.
  const disclaimerY = y + h - 1.4;
  content.push(
    text(x + w - 2, disclaimerY, '方案参考 · 未校准 · 不作为施工依据', {
      fontSize: 1.8,
      anchor: 'end',
      fill: ACCENT,
      weight: 'bold',
    }),
  );
  return [...grid, ...content].join('');
}

function renderNotes(frame: LayoutFrame, lines: string[]): string {
  const { x, y, w, h } = frame.notes;
  const content: string[] = [
    rect(x, y, w, h, { fill: '#FBFAF6', stroke: INK, strokeWidth: 0.4 }),
    text(x + 3, y + 5.4, '图纸说明 / NOTES', { fontSize: 2.2, fill: MUTED, weight: 'bold' }),
  ];
  const usable = Math.max(1, lines.length);
  const lineHeight = Math.min(4.4, (h - 9) / usable);
  lines.forEach((value, index) => {
    content.push(
      text(x + 3, y + 9.6 + index * lineHeight, truncate(value, Math.max(14, Math.floor((w - 8) / 2.3))), {
        fontSize: Math.min(2.4, lineHeight * 0.62),
        fill: MUTED,
      }),
    );
  });
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* Legend                                                             */
/* ------------------------------------------------------------------ */

export interface LegendRow {
  color?: string;
  label: string;
  value?: string;
  muted?: boolean;
}

export interface LegendBlock {
  title: string;
  rows: LegendRow[];
  footer?: string;
}

function renderLegendBlock(block: LegendBlock, x: number, y: number, width: number, maxRows: number): { content: string; height: number } {
  const content: string[] = [];
  const rowHeight = 4.5;
  content.push(
    rect(x, y, width, 5.4, { fill: '#ECEEE8', stroke: LINE, strokeWidth: 0.2 }),
    text(x + 2, y + 3.8, block.title, { fontSize: 2.4, fill: INK, weight: 'bold' }),
  );
  let cursor = y + 5.4;
  const rows = block.rows.slice(0, maxRows);
  for (const row of rows) {
    if (row.color) {
      content.push(
        rect(x + 2, cursor + 1, 3, 3, { fill: row.color, stroke: INK, strokeWidth: 0.1, opacity: 0.85 }),
      );
    }
    content.push(
      text(x + (row.color ? 7 : 2.4), cursor + 3.4, truncate(row.label, Math.max(6, Math.floor((width - 26) / 2.1))), {
        fontSize: 2.2,
        fill: row.muted ? FAINT : INK,
      }),
      text(x + width - 2, cursor + 3.4, truncate(row.value ?? '', 12), {
        fontSize: 2.1,
        fill: MUTED,
        anchor: 'end',
      }),
    );
    content.push(line(x + 1, cursor + rowHeight - 0.6, x + width - 1, cursor + rowHeight - 0.6, { stroke: '#E4E6DF', strokeWidth: 0.1 }));
    cursor += rowHeight;
  }
  if (block.rows.length > maxRows) {
    content.push(
      text(x + 2.4, cursor + 3.2, `… 另有 ${block.rows.length - maxRows} 项`, { fontSize: 2.1, fill: FAINT }),
    );
    cursor += rowHeight;
  }
  if (block.footer) {
    content.push(
      text(x + 2.4, cursor + 3.4, truncate(block.footer, Math.max(10, Math.floor((width - 5) / 2.1))), {
        fontSize: 2,
        fill: MUTED,
      }),
    );
    cursor += 4.5;
  }
  content.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(cursor - y)}" fill="none" stroke="${LINE}" stroke-width="0.22"/>`,
  );
  return { content: content.join(''), height: cursor - y };
}

function renderLegend(blocks: LegendBlock[], frame: LayoutFrame): string {
  const { x, y, w, h } = frame.legend;
  const content: string[] = [];
  let cursor = y;
  for (const block of blocks) {
    if (cursor > y + h - 10) break;
    const maxRows = Math.max(3, Math.floor((h - (cursor - y) - 8) / 4.5));
    const rendered = renderLegendBlock(block, x, cursor, w, maxRows);
    content.push(rendered.content);
    cursor += rendered.height + 4;
  }
  return content.join('');
}

/* ------------------------------------------------------------------ */
/* Legend models per sheet kind                                       */
/* ------------------------------------------------------------------ */

function uniqueMaterialArea(project: Project): Array<{ materialId: string; name: string; color: string; area: number; rooms: string[] }> {
  const map = new Map<string, { name: string; color: string; area: number; rooms: string[] }>();
  for (const room of project.rooms) {
    const info = materialInfo(room.floorMaterialId);
    const entry = map.get(room.floorMaterialId) ?? { name: info.name, color: info.color, area: 0, rooms: [] };
    entry.area += polygonAreaSqm(room.polygon);
    entry.rooms.push(room.name);
    map.set(room.floorMaterialId, entry);
  }
  return [...map.entries()].map(([materialId, entry]) => ({ materialId, ...entry }));
}

function planLegendBlocks(context: PlanContext, project: Project): LegendBlock[] {
  const blocks: LegendBlock[] = [];
  // Legends follow layer inclusion so hiding a layer removes its statistics too.
  const rooms = project.rooms.filter((room) => context.isVisible(room.layerId));
  const furniture = project.furniture.filter((item) => context.isVisible(item.layerId));
  const devices = project.mep.devices.filter((device) => context.isVisible(device.layerId));
  const totalArea = rooms.reduce((sum, room) => sum + polygonAreaSqm(room.polygon), 0);
  switch (context.kind) {
    case 'furniture-plan': {
      const counts = new Map<string, number>();
      for (const item of furniture) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
      const rows = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value: `${value} 件` }));
      blocks.push({
        title: '家具统计',
        rows: rows.length ? rows : [{ label: '暂无家具', value: '0 件', muted: true }],
        footer: `共 ${furniture.length} 件家具 · 套内 ${formatSqm(totalArea)}`,
      });
      blocks.push({
        title: '图例',
        rows: [
          { label: '承重墙', value: '实心' },
          { label: '隔墙', value: '深灰' },
          { label: '门 / 窗', value: '弧线 / 双线' },
          { label: '尺寸单位', value: 'mm' },
        ],
      });
      break;
    }
    case 'floor-plan': {
      const materials = uniqueMaterialArea({ ...project, rooms });
      blocks.push({
        title: '地面材质',
        rows: materials.map((material) => ({
          color: material.color,
          label: material.name,
          value: formatSqm(material.area),
        })),
        footer: `铺装面积 ${formatSqm(totalArea)} · 含损耗量见物料清单`,
      });
      blocks.push({
        title: '空间索引',
        rows: rooms.map((room) => ({ label: room.name, value: formatSqm(polygonAreaSqm(room.polygon)) })),
        footer: `共 ${rooms.length} 个空间`,
      });
      break;
    }
    case 'ceiling-plan': {
      blocks.push({
        title: '天花做法',
        rows: rooms.map((room) => ({
          label: room.name,
          value: room.ceiling.type === 'none' ? '无吊顶' : `${room.ceiling.type === 'coffered' ? '造型' : '平顶'} H=${room.ceiling.height}`,
        })),
        footer: '吊顶高度为完成面至结构面（mm）',
      });
      const lights = devices
        .filter((device) => device.kind === 'light' || device.kind === 'light-spot')
        .reduce<Map<string, number>>((map, device) => {
          const label = device.kind === 'light' ? '主灯' : '筒灯';
          map.set(label, (map.get(label) ?? 0) + 1);
          return map;
        }, new Map());
      blocks.push({
        title: '灯具统计',
        rows: lights.size
          ? [...lights.entries()].map(([label, count]) => ({ label, value: `${count} 盏` }))
          : [{ label: '暂无灯具点位', value: '0 盏', muted: true }],
        footer: lights.size ? '灯具位置见电位图' : '可在水电面板按房间生成点位',
      });
      break;
    }
    case 'water-plan': {
      const counts = devices
        .filter((device) => ['water-cold', 'water-hot', 'drain', 'floor-drain', 'gas', 'floor-heat'].includes(device.kind))
        .reduce<Map<string, { label: string; count: number; heights: Set<number> }>>((map, device) => {
          const entry = map.get(device.kind) ?? {
            label: (WATER_LABELS[device.kind] ?? device.kind) as string,
            count: 0,
            heights: new Set<number>(),
          };
          entry.count += 1;
          entry.heights.add(Math.round(device.height));
          map.set(device.kind, entry);
          return map;
        }, new Map());
      blocks.push({
        title: '给排水点位',
        rows: counts.size
          ? [...counts.values()].map((entry) => ({
              color: WATER,
              label: `${entry.label} ${[...entry.heights].map((height) => `H=${height}`).join('/')}`,
              value: `${entry.count} 处`,
            }))
          : [{ label: '暂无给排水点位', value: '0 处', muted: true }],
        footer: '点位高度为距地完成面（mm），现场需复核',
      });
      blocks.push({
        title: '说明',
        rows: [
          { label: '给水管径', value: 'DN20/25' },
          { label: '排水管径', value: 'DN50/75' },
          { label: '防水区域', value: '厨卫/阳台' },
        ],
      });
      break;
    }
    case 'electric-plan': {
      const kinds = new Map<string, { label: string; count: number; heights: Set<number> }>();
      for (const device of devices) {
        if (!['socket', 'socket-16a', 'switch', 'switch-double', 'light', 'light-spot', 'ac', 'weak-current'].includes(device.kind)) continue;
        const entry = kinds.get(device.kind) ?? {
          label: (ELECTRIC_LABELS[device.kind] ?? device.kind) as string,
          count: 0,
          heights: new Set<number>(),
        };
        entry.count += 1;
        entry.heights.add(Math.round(device.height));
        kinds.set(device.kind, entry);
      }
      blocks.push({
        title: '电位点位',
        rows: kinds.size
          ? [...kinds.values()].map((entry) => ({
              color: ELECTRIC,
              label: `${entry.label} ${[...entry.heights].map((height) => `H=${height}`).join('/')}`,
              value: `${entry.count} 个`,
            }))
          : [{ label: '暂无电位点位', value: '0 个', muted: true }],
        footer: '点位高度为距地完成面（mm）',
      });
      const assignedCircuits = project.mep.circuits
        .map((circuit) => ({
          circuit,
          count: devices.filter((device) => device.circuitId === circuit.id).length,
        }))
        .filter((entry) => entry.count > 0);
      blocks.push({
        title: '回路',
        rows: assignedCircuits.length
          ? assignedCircuits.map((entry) => ({
              color: entry.circuit.color,
              label: `${entry.circuit.name} · ${entry.circuit.wire}mm² · ${entry.circuit.amp}A`,
              value: `${entry.count} 点`,
            }))
          : [{ label: '暂无回路分配', value: '0 点', muted: true }],
      });
      break;
    }
    default:
      break;
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* BOM table                                                          */
/* ------------------------------------------------------------------ */

interface TableColumn {
  label: string;
  width: number;
  anchor: 'start' | 'end' | 'middle';
}

interface TableRow {
  cells: string[];
  emphasis?: boolean;
  separatorBefore?: boolean;
}

function buildBomRows(project: Project, overrides: BomOverrides): { rows: TableRow[]; summary: string; warnings: string[] } {
  const bom = computeBom(project, overrides);
  const rows: TableRow[] = [];
  const pushRow = (cells: string[], emphasis = false) => rows.push({ cells, emphasis });
  const scopeLabels: Record<string, string> = {
    floor: '地面',
    wall: '墙面',
    ceiling: '顶面',
    joinery: '定制',
    countertop: '台面',
  };
  for (const line of bom.materials) {
    pushRow([
      scopeLabels[line.scope] ?? line.scope,
      line.name,
      line.rooms.join('/'),
      formatNumber(line.quantity, 2),
      line.unit,
      formatNumber(line.unitPrice, 0),
      formatNumber(line.amount, 0),
      line.note,
    ]);
  }
  for (const line of bom.furniture) {
    pushRow([
      '家具',
      line.name,
      '—',
      String(line.count),
      line.unit,
      formatNumber(line.unitPrice, 0),
      formatNumber(line.amount, 0),
      line.note,
    ]);
  }
  for (const line of bom.mep) {
    pushRow([
      line.group === 'water' ? '水位' : '电位',
      `${line.label}${line.heights.length ? ` (H=${line.heights.join('/')})` : ''}`,
      '—',
      String(line.count),
      line.unit,
      formatNumber(line.unitPrice, 0),
      formatNumber(line.amount, 0),
      line.group === 'water' ? '给排水点位' : '强弱电点位',
    ]);
  }
  rows.push({ cells: [], separatorBefore: false });
  pushRow(['小计', '材质合计', '', '', '', '', formatNumber(bom.totals.materials, 0), ''], true);
  pushRow(['小计', '家具合计', '', '', '', '', formatNumber(bom.totals.furniture, 0), ''], true);
  pushRow(['小计', '水电点位合计', '', '', '', '', formatNumber(bom.totals.mep, 0), ''], true);
  pushRow(['合计', '物料清单总价', '', '', '', '', formatNumber(bom.totals.total, 0), '参考价 · 以实际采购为准'], true);
  const summary = `套内面积 ${formatNumber(bom.areaSqm, 1)} ㎡ · ${bom.roomCount} 个空间 · 家具 ${project.furniture.length} 件 · 水电点位 ${bom.deviceCount} 个 · 合计 ${formatCurrency(bom.totals.total)}`;
  return { rows, summary, warnings: bom.warnings };
}

function renderBomTable(
  project: Project,
  frame: LayoutFrame,
  paperSize: LayoutFrame['paper']['id'],
  overrides: BomOverrides,
  rowsPerColumnOverride?: number,
): { content: string; warnings: string[] } {
  const { rows, summary, warnings } = buildBomRows(project, overrides);
  const drawing = frame.drawing;
  const pad = 4;
  const titleH = 13;
  const headerH = 7;
  const rowH = paperSize === 'A4' ? 5.4 : 6.1;
  const footerH = 9;
  const titleY = drawing.y + 7;
  const tableTop = drawing.y + titleH + 2;
  const availableH = drawing.h - titleH - footerH - 4;
  const capacity = Math.max(4, Math.floor((availableH - headerH) / rowH));
  // Use the paper width well: one wide table when it fits, otherwise split into
  // readable columns (max 3 on A2, 2 on A3, 1 on A4).
  const maxColsByWidth = Math.max(1, Math.floor((drawing.w - pad * 2 + 8) / 165));
  const maxColumns = Math.min(paperSize === 'A4' ? 1 : paperSize === 'A2' ? 3 : 2, maxColsByWidth);
  const columns = Math.max(1, Math.min(maxColumns, Math.ceil(rows.length / capacity)));
  const tableWidth = (drawing.w - pad * 2 - (columns - 1) * 8) / columns;
  const rowsPerColumn = Math.max(
    4,
    Math.min(rowsPerColumnOverride ?? capacity, Math.ceil(rows.length / columns)),
  );
  const visibleRows = rows.slice(0, rowsPerColumn * columns);
  const truncated = rows.length - visibleRows.length;

  const columnDefs: TableColumn[] = [
    { label: '类别', width: tableWidth * 0.09, anchor: 'start' },
    { label: '名称', width: tableWidth * 0.28, anchor: 'start' },
    { label: '空间', width: tableWidth * 0.14, anchor: 'start' },
    { label: '数量', width: tableWidth * 0.09, anchor: 'end' },
    { label: '单位', width: tableWidth * 0.07, anchor: 'middle' },
    { label: '单价', width: tableWidth * 0.09, anchor: 'end' },
    { label: '金额', width: tableWidth * 0.11, anchor: 'end' },
    { label: '备注', width: tableWidth * 0.13, anchor: 'start' },
  ];

  const content: string[] = [
    text(drawing.x + pad, titleY, '物料清单 / BILL OF MATERIALS', { fontSize: 3.4, weight: 'bold', fill: INK }),
    text(drawing.x + drawing.w - pad, titleY, summary, { fontSize: 2.2, fill: MUTED, anchor: 'end' }),
    line(drawing.x + pad, titleY + 3.2, drawing.x + drawing.w - pad, titleY + 3.2, { stroke: LINE, strokeWidth: 0.2 }),
  ];

  const baseY = tableTop;
  const columnCount = Math.min(columns, Math.max(1, Math.ceil(visibleRows.length / rowsPerColumn)));
  for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
    const columnX = drawing.x + pad + columnIndex * (tableWidth + 8);
    if (columnIndex >= columnCount) break;
    let y = baseY;
    // header
    content.push(rect(columnX, y, tableWidth, headerH, { fill: '#ECEEE8', stroke: INK, strokeWidth: 0.22 }));
    let cursorX = columnX;
    for (const column of columnDefs) {
      const align = column.anchor;
      const textX =
        align === 'end' ? cursorX + column.width - 1.5 : align === 'middle' ? cursorX + column.width / 2 : cursorX + 1.5;
      content.push(
        text(textX, y + headerH - 2.2, column.label, {
          fontSize: 2.2,
          fill: INK,
          weight: 'bold',
          anchor: align,
        }),
        line(cursorX, y, cursorX, y + headerH, { stroke: LINE, strokeWidth: 0.14 }),
      );
      cursorX += column.width;
    }
    content.push(line(cursorX, y, cursorX, y + headerH, { stroke: LINE, strokeWidth: 0.14 }));
    y += headerH;

    const start = columnIndex * rowsPerColumn;
    const chunk = visibleRows.slice(start, start + rowsPerColumn);
    for (const row of chunk) {
      if (row.cells.length === 0) {
        y += 1.6;
        continue;
      }
      if (row.emphasis) {
        content.push(rect(columnX, y, tableWidth, rowH, { fill: '#F6EFEC', stroke: 'none' }));
      }
      let x = columnX;
      columnDefs.forEach((column, cellIndex) => {
        const value = row.cells[cellIndex] ?? '';
        const align = column.anchor;
        const textX =
          align === 'end' ? x + column.width - 1.5 : align === 'middle' ? x + column.width / 2 : x + 1.5;
        content.push(
          text(textX, y + rowH - 2.1, truncate(value, Math.max(4, Math.floor(column.width / 2.05))), {
            fontSize: 2.05,
            fill: row.emphasis ? INK : '#2B2F29',
            weight: row.emphasis ? 'bold' : undefined,
            anchor: align,
          }),
        );
        x += column.width;
      });
      content.push(
        line(columnX, y + rowH, columnX + tableWidth, y + rowH, { stroke: '#E0E3DA', strokeWidth: 0.1 }),
      );
      y += rowH;
    }
    content.push(rect(columnX, baseY, tableWidth, y - baseY, { fill: 'none', stroke: INK, strokeWidth: 0.22 }));
    for (let guide = 1; guide < columnDefs.length; guide += 1) {
      const guideX = columnX + columnDefs.slice(0, guide).reduce((sum, column) => sum + column.width, 0);
      content.push(line(guideX, baseY, guideX, y, { stroke: '#E0E3DA', strokeWidth: 0.1 }));
    }
  }

  const footerY = drawing.y + drawing.h - footerH + 3;
  content.push(
    line(drawing.x + pad, footerY - 2, drawing.x + drawing.w - pad, footerY - 2, { stroke: LINE, strokeWidth: 0.18 }),
    text(drawing.x + pad, footerY + 2.4, truncated > 0 ? `共 ${rows.length} 行，图面显示 ${visibleRows.length} 行，其余 ${truncated} 行请导出 CSV 查看。` : `共 ${rows.length} 行，数据来自当前方案；数量与价格需人工复核。`, {
      fontSize: 2.1,
      fill: truncated > 0 ? ACCENT : MUTED,
    }),
    text(drawing.x + drawing.w - pad, footerY + 2.4, '价格基准：本地材质库参考价 · 未含税运', {
      fontSize: 2.1,
      fill: MUTED,
      anchor: 'end',
    }),
  );
  return { content: content.join(''), warnings };
}

/* ------------------------------------------------------------------ */
/* Main renderer                                                      */
/* ------------------------------------------------------------------ */

function buildNoteLines(input: {
  project: Project;
  sheet: SheetSpec;
  titleBlock: TitleBlock;
  options: SheetRenderOptions;
  bomWarnings: string[];
  extraWarnings: string[];
}): string[] {
  const lines: string[] = [];
  lines.push('注：本图为方案参考，尺寸与点位需现场复核；未校准图纸不得作为施工依据。');
  if (input.project.reference && !input.project.reference.calibrated) {
    lines.push('底图比例未校准（assumed），图中面积与尺寸为识别估算值，需现场核对。');
  }
  if (input.project.aiMeta?.lastBriefId) {
    lines.push('AI 生成方案已由本地引擎落地，家具/点位为参考布置，需设计师确认。');
  }
  for (const note of input.options.notes ?? []) {
    if (note.trim()) lines.push(note.trim());
  }
  if (input.sheet.notes.trim()) lines.push(input.sheet.notes.trim());
  if (input.titleBlock.notes.trim()) lines.push(input.titleBlock.notes.trim());
  for (const warning of [...input.extraWarnings, ...input.bomWarnings]) {
    if (warning.trim()) lines.push(`提示：${warning.trim()}`);
  }
  if (input.sheet.kind !== 'bom') {
    lines.push('图幅单位：mm · 线宽按出图比例设定，打印请选择「实际尺寸/100%」。');
  }
  return lines.slice(0, 7);
}

export function buildSheetRender(
  project: Project,
  sheet: SheetSpec,
  options: SheetRenderOptions = {},
): SheetRenderResult {
  const size = options.size ?? sheet.size;
  const paper = paperSpec(size);
  const frame = computeLayout(project, sheet, size);
  const idPrefix = options.idPrefix ?? `hdesign-sheet-${sheet.id}`;
  const requestedScale = options.scale ?? sheet.scale;
  const titleBlock: TitleBlock = {
    ...sheet.titleBlock,
    ...options.titleBlock,
    projectName: options.titleBlock?.projectName ?? sheet.titleBlock.projectName ?? project.name,
  };
  const aiBadge = options.aiBadge ?? Boolean(project.aiMeta?.lastBriefId);
  const warnings: string[] = [];
  const defsContent: string[] = [];
  const content: string[] = [];

  /* frame */
  content.push(
    rect(frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h, {
      fill: 'none',
      stroke: INK,
      strokeWidth: 0.6,
    }),
    rect(frame.frame.x + 1.4, frame.frame.y + 1.4, frame.frame.w - 2.8, frame.frame.h - 2.8, {
      fill: 'none',
      stroke: INK,
      strokeWidth: 0.18,
    }),
  );

  const layerIds = options.layerIds ?? sheet.layerIds;
  const includeDimensions = options.includeDimensions ?? sheet.includeDimensions;
  const includeRoomLabels = options.includeRoomLabels !== false;

  let effectiveScale: number = requestedScale;
  let bomWarnings: string[] = [];

  if (sheet.kind === 'bom') {
    const bom = renderBomTable(project, frame, size, options.bomOverrides ?? {}, options.bomRowsPerColumn);
    content.push(bom.content);
    bomWarnings = bom.warnings;
  } else {
    // Reserve a little breathing space for the scale bar and north arrow.
    const innerPlan: RectMm = {
      x: frame.plan.x + 8,
      y: frame.plan.y + 10,
      w: frame.plan.w - 16,
      h: frame.plan.h - 26,
    };
    const modelPoints = project.walls.length + project.rooms.length + project.furniture.length + project.mep.devices.length;
    if (modelPoints === 0) {
      content.push(drawPlanEmptyState(frame.plan, '暂无可出图的平面数据'));
    } else {
      const probe = createPlanContext({
        project,
        planRect: innerPlan,
        scaleDenominator: requestedScale,
        includeDimensions,
        layerIds,
        idPrefix,
        kind: sheet.kind,
      });
      const modelBox = probe.transform.modelBox;
      const fitted = fitScale(modelBox.w, modelBox.h, innerPlan.w, innerPlan.h, requestedScale);
      effectiveScale = fitted.scale;
      if (fitted.autoFitted) {
        warnings.push(`图形超出图幅，已按 ${formatScale(effectiveScale)} 适配打印`);
      }
      const context = createPlanContext({
        project,
        planRect: innerPlan,
        scaleDenominator: effectiveScale,
        includeDimensions,
        layerIds,
        idPrefix,
        kind: sheet.kind,
      });
      const walls = project.walls.filter((wall) => context.isVisible(wall.layerId));
      const planParts: string[] = [];
      const planDefs: string[] = [];

      if (sheet.kind === 'floor-plan') {
        const hatches = buildFloorHatches(context, project.rooms.map((room) => room.floorMaterialId));
        planDefs.push(hatches.defsContent);
        planParts.push(group(drawRooms(context, 'floor', hatches), planGroupTransform(context.transform)));
        planParts.push(group(drawWalls(context, walls, 'dark'), planGroupTransform(context.transform)));
        planParts.push(group(drawOpenings(context, walls), planGroupTransform(context.transform)));
        if (includeRoomLabels) planParts.push(group(drawRoomLabels(context, { area: true }), planGroupTransform(context.transform)));
      } else if (sheet.kind === 'ceiling-plan') {
        const ceiling = buildCeilingPattern(context);
        planDefs.push(ceiling.defsContent);
        planParts.push(group(drawRooms(context, 'ceiling', undefined, ceiling.id), planGroupTransform(context.transform)));
        planParts.push(group(drawWalls(context, walls, 'light'), planGroupTransform(context.transform)));
        planParts.push(group(drawOpenings(context, walls), planGroupTransform(context.transform)));
        planParts.push(group(drawMep(context, 'electric'), ''));
        if (includeRoomLabels) {
          planParts.push(
            group(
              drawRoomLabels(context, { area: true, ceiling: true, avoidPoints: project.mep.devices }),
              planGroupTransform(context.transform),
            ),
          );
        }
      } else if (sheet.kind === 'water-plan') {
        planParts.push(group(drawRooms(context, 'furniture'), planGroupTransform(context.transform)));
        planParts.push(group(drawWalls(context, walls, 'light'), planGroupTransform(context.transform)));
        planParts.push(group(drawOpenings(context, walls), planGroupTransform(context.transform)));
        planParts.push(group(drawFurniture(context), planGroupTransform(context.transform)));
        planParts.push(drawMep(context, 'water'));
        if (includeRoomLabels) {
          planParts.push(
            group(
              drawRoomLabels(context, {
                area: true,
                avoidPoints: project.mep.devices.filter((device) => MEP_META[device.kind].group === 'water'),
              }),
              planGroupTransform(context.transform),
            ),
          );
        }
      } else if (sheet.kind === 'electric-plan') {
        planParts.push(group(drawRooms(context, 'furniture'), planGroupTransform(context.transform)));
        planParts.push(group(drawWalls(context, walls, 'light'), planGroupTransform(context.transform)));
        planParts.push(group(drawOpenings(context, walls), planGroupTransform(context.transform)));
        planParts.push(group(drawFurniture(context), planGroupTransform(context.transform)));
        planParts.push(drawMep(context, 'electric'));
        if (includeRoomLabels) {
          planParts.push(
            group(
              drawRoomLabels(context, {
                area: true,
                avoidPoints: project.mep.devices.filter((device) => MEP_META[device.kind].group === 'electric'),
              }),
              planGroupTransform(context.transform),
            ),
          );
        }
      } else {
        // furniture-plan
        planParts.push(group(drawRooms(context, 'furniture'), planGroupTransform(context.transform)));
        planParts.push(group(drawWalls(context, walls, 'dark'), planGroupTransform(context.transform)));
        planParts.push(group(drawOpenings(context, walls), planGroupTransform(context.transform)));
        planParts.push(group(drawFurniture(context), planGroupTransform(context.transform)));
        if (includeRoomLabels) planParts.push(group(drawRoomLabels(context, { area: true }), planGroupTransform(context.transform)));
      }

      if (includeDimensions) {
        planParts.push(group(drawDimensions(context, walls), planGroupTransform(context.transform)));
      }

      if (options.includeNorthArrow !== false) {
        planParts.push(drawNorthArrow(frame.plan.x + 15, frame.plan.y + 18, 7.4));
      }
      if (options.includeScaleBar !== false) {
        const barModel = niceScaleBarLength(effectiveScale, 38);
        const barPaper = barModel * paperScaleFactor(effectiveScale);
        planParts.push(
          drawScaleBar(frame.plan.x + 8, frame.plan.y + frame.plan.h - 22, effectiveScale, barModel, barPaper),
        );
      }
      if (aiBadge) {
        const badgeW = 29;
        const badgeH = 8;
        const badgeX = frame.plan.x + frame.plan.w - badgeW - 4;
        const badgeY = frame.plan.y + 5;
        planParts.push(
          rect(badgeX, badgeY, badgeW, badgeH, { fill: '#F7E7E2', stroke: ACCENT, strokeWidth: 0.25 }),
          text(badgeX + badgeW / 2, badgeY + 5.4, 'AI 方案 · 参考', {
            fontSize: 2.4,
            fill: ACCENT,
            anchor: 'middle',
            weight: 'bold',
          }),
        );
      }
      if (project.reference && !project.reference.calibrated) {
        planParts.push(
          text(frame.plan.x + frame.plan.w - 4, frame.plan.y + frame.plan.h - 5, '底图未校准 · 尺寸仅供参考', {
            fontSize: 2.1,
            fill: ACCENT,
            anchor: 'end',
          }),
        );
      }
      defsContent.push(...planDefs);
      content.push(planParts.join(''));
      if (options.includeLegend !== false) {
        content.push(renderLegend(planLegendBlocks(context, project), frame));
      }
      content.push(
        text(frame.plan.x + 4, frame.plan.y + 5.6, `${SHEET_KIND_LABELS[sheet.kind]} · ${formatScale(effectiveScale)}`, {
          fontSize: 2.4,
          fill: MUTED,
        }),
      );
    }
  }

  /* title block & notes */
  if (options.includeTitleBlock !== false) {
    const sheetIndex = Math.max(0, project.sheets.findIndex((item) => item.id === sheet.id));
    content.push(
      renderTitleBlock({
        project,
        sheet,
        titleBlock,
        scaleDenominator: effectiveScale,
        aiBadge,
        sheetIndex,
        sheetTotal: Math.max(1, project.sheets.length),
        frame,
      }),
    );
  }

  const notes = buildNoteLines({
    project,
    sheet,
    titleBlock,
    options,
    bomWarnings,
    extraWarnings: warnings,
  });
  if (options.includeNotes !== false) {
    content.push(renderNotes(frame, notes));
  }

  const defsMarkup = defsContent.length ? defs(defsContent.join('')) : '';
  const svg = svgDocument(paper.widthMm, paper.heightMm, `${defsMarkup}${content.join('')}`);

  return {
    svg,
    frame,
    widthMm: paper.widthMm,
    heightMm: paper.heightMm,
    paper: size,
    scale: effectiveScale,
    requestedScale,
    kind: sheet.kind,
    sheet,
    titleBlock,
    warnings,
  };
}

export { escapeXml, attr };
