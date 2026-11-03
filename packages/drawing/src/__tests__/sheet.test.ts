import { describe, expect, it } from 'vitest';
import {
  buildBomCsv,
  furnitureInfo,
  materialInfo,
  buildMepPointsCsv,
  computeBom,
  countFurniture,
  countMepByKind,
  csvEscape,
  formatScale,
  renderSheet,
  renderSheetSvg,
  summarizeCircuits,
  toCsv,
} from '../index';
import type { SheetKind } from '@hdesign/domain';
import { fixtureProject, fixtureSheet } from './fixtures';

const KINDS: SheetKind[] = ['furniture-plan', 'floor-plan', 'ceiling-plan', 'water-plan', 'electric-plan', 'bom'];

function assertNoBrokenTokens(svg: string) {
  expect(svg).not.toMatch(/NaN/);
  expect(svg).not.toMatch(/undefined/);
  expect(svg).not.toMatch(/Infinity/);
  const openGroups = (svg.match(/<g[\s>]/g) ?? []).length;
  const closeGroups = (svg.match(/<\/g>/g) ?? []).length;
  expect(openGroups).toBe(closeGroups);
}

describe('renderSheetSvg', () => {
  it('renders an A3 landscape furniture plan with title block, scale and notes', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    const result = renderSheet(project, sheet);
    expect(result.svg.startsWith('<?xml')).toBe(true);
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.svg).toContain('width="420mm"');
    expect(result.svg).toContain('height="297mm"');
    expect(result.svg).toContain('viewBox="0 0 420 297"');
    expect(result.widthMm).toBe(420);
    expect(result.heightMm).toBe(297);
    expect(result.scale).toBe(50);
    expect(result.paper).toBe('A3');
    // Title block fields.
    expect(result.svg).toContain('测试户型');
    expect(result.svg).toContain('平面布置图');
    expect(result.svg).toContain('A-01');
    expect(result.svg).toContain('1:50');
    expect(result.svg).toContain('李工');
    expect(result.svg).toContain('2026-01-02');
    // Required sheet furniture: north arrow, scale bar, room name + area, dimensions.
    expect(result.svg).toContain('>N<');
    expect(result.svg).toContain('客厅');
    expect(result.svg).toContain('12.0 ㎡');
    expect(result.svg).toContain('厨房');
    expect(result.svg).toContain('9.0 ㎡');
    expect(result.svg).toContain('4000');
    expect(result.svg).toContain('三人沙发');
    // Disclaimers.
    expect(result.svg).toContain('方案参考');
    expect(result.svg).toContain('未校准');
    assertNoBrokenTokens(result.svg);
  });

  it('renders every sheet kind without broken markup', () => {
    const project = fixtureProject();
    for (const kind of KINDS) {
      const sheet = fixtureSheet(project, kind);
      const result = renderSheet(project, sheet);
      expect(result.kind).toBe(kind);
      assertNoBrokenTokens(result.svg);
      expect(result.svg.length).toBeGreaterThan(3000);
    }
  });

  it('supports A4/A2 paper sizes with matching viewBox', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    const a4 = renderSheet(project, sheet, { size: 'A4' });
    const a2 = renderSheet(project, sheet, { size: 'A2' });
    expect(a4.widthMm).toBe(297);
    expect(a4.heightMm).toBe(210);
    expect(a4.svg).toContain('viewBox="0 0 297 210"');
    expect(a2.widthMm).toBe(594);
    expect(a2.heightMm).toBe(420);
    expect(a2.svg).toContain('viewBox="0 0 594 420"');
  });

  it('honours the requested scale and auto-fits oversized models', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    expect(renderSheet(project, sheet, { scale: 50 }).scale).toBe(50);
    expect(renderSheet(project, sheet, { scale: 150 }).scale).toBe(150);

    const huge = fixtureProject();
    huge.walls = huge.walls.map((wall) => ({
      ...wall,
      a: { x: wall.a.x * 8, y: wall.a.y * 8 },
      b: { x: wall.b.x * 8, y: wall.b.y * 8 },
    }));
    huge.rooms = huge.rooms.map((room) => ({ ...room, polygon: room.polygon.map((point) => ({ x: point.x * 8, y: point.y * 8 })) }));
    const result = renderSheet(huge, sheet, { scale: 50 });
    expect(result.scale).toBeGreaterThan(200);
    expect(result.warnings.join(' ')).toContain('适配');
    expect(renderSheet(project, sheet, { scale: 50 }).warnings).toHaveLength(0);
  });

  it('is deterministic and reacts to layer inclusion', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    const a = renderSheetSvg(project, sheet, { idPrefix: 'test' });
    const b = renderSheetSvg(project, sheet, { idPrefix: 'test' });
    expect(a).toBe(b);
    expect(a).toContain('三人沙发');

    const hidden = renderSheetSvg(project, sheet, {
      idPrefix: 'test',
      layerIds: sheet.layerIds.filter((id) => id !== 'layer-furniture'),
    });
    expect(hidden).not.toContain('三人沙发');
    expect(hidden).toContain('客厅');
  });

  it('renders the AI badge only when AI metadata exists', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    expect(renderSheetSvg(project, sheet)).not.toContain('AI 方案');
    project.aiMeta = { lastBriefId: 'brief-1', lastBriefLabel: '奶油风' };
    expect(renderSheetSvg(project, sheet)).toContain('AI 方案');
    expect(renderSheetSvg(project, sheet, { aiBadge: false })).not.toContain('AI 方案');
  });

  it('escapes XML special characters from user supplied names', () => {
    const project = fixtureProject();
    project.name = 'A&B <script>"x"</script>';
    const sheet = fixtureSheet(project, 'furniture-plan');
    const svg = renderSheetSvg(project, sheet, { titleBlock: { projectName: project.name } });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('A&amp;B &lt;script&gt;');
    expect(svg).toContain('&quot;x&quot;');
    // Raw ampersands must never leak into the document.
    expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(svg)).toBe(false);
  });

  it('renders empty projects with an actionable empty state', () => {
    const project = fixtureProject();
    project.walls = [];
    project.rooms = [];
    project.furniture = [];
    project.mep = { circuits: [], devices: [] };
    project.openings = [];
    const sheet = fixtureSheet(project, 'furniture-plan');
    const svg = renderSheetSvg(project, sheet);
    expect(svg).toContain('暂无可出图的平面数据');
    expect(svg).toContain('请先在 2D 画布绘制墙体');
    assertNoBrokenTokens(svg);
  });

  it('renders MEP sheets with counts, heights and circuits', () => {
    const project = fixtureProject();
    const electric = renderSheetSvg(project, fixtureSheet(project, 'electric-plan'));
    expect(electric).toContain('电位点位');
    expect(electric).toContain('五孔插座');
    expect(electric).toContain('H=300');
    expect(electric).toContain('普通插座');
    expect(electric).toContain('2.5mm²');
    const water = renderSheetSvg(project, fixtureSheet(project, 'water-plan'));
    expect(water).toContain('给排水点位');
    expect(water).toContain('冷水给水');
    expect(water).toContain('1 处');
    const ceiling = renderSheetSvg(project, fixtureSheet(project, 'ceiling-plan'));
    expect(ceiling).toContain('天花做法');
    expect(ceiling).toContain('灯具统计');
    expect(ceiling).toContain('平顶 H=2800');
    const floor = renderSheetSvg(project, fixtureSheet(project, 'floor-plan'));
    expect(floor).toContain('地面材质');
    expect(floor).toContain(materialInfo('floor-oak').name);
    expect(floor).toContain(materialInfo('floor-tile-600').name);
  });

  it('renders the BOM sheet as a table with totals', () => {
    const project = fixtureProject();
    const svg = renderSheetSvg(project, fixtureSheet(project, 'bom'));
    expect(svg).toContain('物料清单');
    expect(svg).toContain('BILL OF MATERIALS');
    expect(svg).toContain('合计');
    expect(svg).toContain('三人沙发');
    expect(svg).toContain('橡木复合地板');
    expect(svg).toContain('五孔插座');
    assertNoBrokenTokens(svg);
  });

  it('honours preview/chrome options (legend, north arrow, scale bar, room labels)', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    const bare = renderSheetSvg(project, sheet, {
      includeLegend: false,
      includeNorthArrow: false,
      includeScaleBar: false,
      includeRoomLabels: false,
      includeTitleBlock: false,
      includeNotes: false,
    });
    expect(bare).not.toContain('家具统计');
    expect(bare).not.toContain('>N<');
    expect(bare).not.toContain('3m</text>');
    expect(bare).not.toContain('客厅');
    expect(bare).not.toContain('图纸说明');
    // The geometry is still rendered.
    expect(bare).toContain('<polygon');
  });

  it('exposes the resolved paper frame for previews and thumbnails', () => {
    const project = fixtureProject();
    const sheet = fixtureSheet(project, 'furniture-plan');
    const result = renderSheet(project, sheet);
    expect(result.frame.paper.id).toBe('A3');
    expect(result.frame.plan.w).toBeGreaterThan(200);
    expect(result.frame.plan.h).toBeGreaterThan(150);
    expect(result.frame.titleBlock.y).toBeGreaterThan(result.frame.plan.y);
    expect(result.frame.notes.x).toBe(result.frame.frame.x);
  });

  it('formats scale labels without trailing decimals', () => {
    expect(formatScale(100)).toBe('1:100');
    expect(formatScale(222.333)).toBe('1:222.3');
  });
});

describe('BOM math', () => {
  it('computes material, furniture and MEP quantities from fixture geometry', () => {
    const bom = computeBom(fixtureProject());
    expect(bom.areaSqm).toBe(21);
    expect(bom.roomCount).toBe(2);
    const byKey = new Map(bom.materials.map((line) => [line.key, line]));
    // Floor: 12㎡ × 1.05 oak wastage, 9㎡ × 1.08 tile wastage.
    expect(byKey.get('floor|floor-oak')!.quantity).toBeCloseTo(12.6, 2);
    expect(byKey.get('floor|floor-tile-600')!.quantity).toBeCloseTo(9.72, 2);
    // Wall: (14m + 12m) × 2.8m, minus one door (900×2100) and one window (1500×1500), ×1.02 paint wastage.
    const rawWall = 14 * 2.8 + 12 * 2.8;
    const openings = (900 * 2100 + 1500 * 1500) / 1_000_000;
    const expectedWall = rawWall * (1 - openings / rawWall) * 1.02;
    expect(byKey.get('wall|wall-latex-warm')!.quantity).toBeCloseTo(expectedWall, 1);
    // Ceilings: living room paint (12㎡), kitchen aluminium (9㎡).
    expect(byKey.get('ceiling|ceiling-paint')!.quantity).toBeCloseTo(12, 2);
    expect(byKey.get('ceiling|ceiling-aluminium')!.quantity).toBeCloseTo(9, 2);
    // Furniture comes from the catalog adapter (workstream B); assert counts and
    // arithmetic rather than hard-coding catalog prices which are still evolving.
    const furniture = countFurniture(fixtureProject());
    expect(furniture.find((line) => line.skuId === 'dining-chair')!.count).toBe(2);
    expect(furniture.find((line) => line.skuId === 'sofa-3')!.count).toBe(1);
    expect(furniture.find((line) => line.skuId === 'sofa-3')!.name).toBe(furnitureInfo('sofa-3', '三人沙发').name);
    expect(bom.totals.furniture).toBeGreaterThan(0);
    expect(bom.totals.mep).toBeGreaterThan(0);
    expect(bom.totals.total).toBeCloseTo(bom.totals.materials + bom.totals.furniture + bom.totals.mep, 1);
    for (const line of bom.materials) {
      expect(line.amount).toBeCloseTo(line.quantity * line.unitPrice, 1);
    }
    for (const line of [...bom.furniture, ...bom.mep]) {
      expect(line.amount).toBeCloseTo(line.count * line.unitPrice, 1);
    }
    expect(bom.materials.find((line) => line.key === 'floor|floor-oak')!.unitPrice).toBeGreaterThan(0);
  });

  it('delegates furniture names and prices to the catalog adapter', () => {
    const lines = countFurniture(fixtureProject());
    const sofa = lines.find((line) => line.skuId === 'sofa-3')!;
    const adapter = furnitureInfo('sofa-3', '三人沙发');
    expect(sofa.price).toBe(adapter.price);
    expect(sofa.name).toBe(adapter.name);
  });

  it('applies panel overrides to quantities, prices and totals', () => {
    const project = fixtureProject();
    const base = computeBom(project);
    const edited = computeBom(project, {
      materials: { 'floor|floor-oak': { quantity: 20, unitPrice: 100 } },
      furniture: { 'sofa-3': { unitPrice: 6000 } },
      mep: { socket: { count: 4 } },
    });
    const oak = edited.materials.find((line) => line.key === 'floor|floor-oak')!;
    expect(oak.quantity).toBe(20);
    expect(oak.amount).toBe(2000);
    expect(edited.furniture.find((line) => line.skuId === 'sofa-3')!.amount).toBe(6000);
    expect(edited.mep.find((line) => line.kind === 'socket')!.count).toBe(4);
    expect(edited.totals.total).not.toBe(base.totals.total);
  });

  it('counts MEP devices per kind and circuit', () => {
    const project = fixtureProject();
    const electric = countMepByKind(project, 'electric');
    expect(electric.find((line) => line.kind === 'socket')!.count).toBe(2);
    expect(electric.find((line) => line.kind === 'socket')!.heights).toEqual([300]);
    const circuits = summarizeCircuits(project);
    expect(circuits.find((circuit) => circuit.id === 'circuit-general')!.deviceCount).toBe(2);
    expect(circuits.find((circuit) => circuit.id === 'circuit-lighting')!.deviceCount).toBe(1);
  });

  it('warns when the project cannot produce a meaningful BOM', () => {
    const project = fixtureProject();
    project.rooms = [];
    project.furniture = [];
    project.reference = {
      assetId: 'asset-1',
      widthPx: 1000,
      heightPx: 800,
      mmPerPx: 10,
      offset: { x: 0, y: 0 },
      rotationDeg: 0,
      opacity: 0.5,
      visible: true,
      locked: true,
      calibrated: false,
      calibrationSource: 'assumed',
    };
    const bom = computeBom(project);
    expect(bom.warnings.join(' ')).toContain('没有房间');
    expect(bom.warnings.join(' ')).toContain('未校准');
  });
});

describe('CSV export', () => {
  it('escapes commas, quotes and newlines per RFC 4180', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
    expect(csvEscape(null)).toBe('');
  });

  it('serialises rows with CRLF line endings', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('builds a BOM csv with header, lines and totals', () => {
    const csv = buildBomCsv(fixtureProject());
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('类别,名称,空间,数量,单位,单价（元）,金额（元）,备注');
    expect(csv).toContain('橡木复合地板');
    expect(csv).toContain('三人沙发');
    expect(csv).toContain('五孔插座');
    expect(csv).toContain('合计');
    expect(csv).toContain('方案参考');
    // No raw CR without LF.
    expect(/(?<!\r)\n/.test(csv)).toBe(false);
  });

  it('builds a MEP point schedule with one row per device', () => {
    const csv = buildMepPointsCsv(fixtureProject());
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('安装高度（mm）');
    expect(lines).toHaveLength(5); // header + 4 devices
    expect(csv).toContain('客厅');
    expect(csv).toContain('厨房');
    expect(csv).toContain('未分配');
  });
});
