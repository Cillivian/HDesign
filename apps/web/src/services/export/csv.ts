import {
  buildBomCsv,
  buildMepPointsCsv,
  buildRoomScheduleCsv,
  csvWithBom,
  sheetFileName,
  type BomOverrides,
} from '@hdesign/drawing';
import type { Project, SheetSpec } from '@hdesign/domain';
import { downloadText } from './svg';

/**
 * CSV downloads. The CSV text itself is produced by the pure drawing package so
 * escaping and row content are covered by unit tests.
 */

export function bomCsvFilename(project: Project): string {
  const base = project.name
    .trim()
    .replace(/[\\/:*?"<>|#%\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'hdesign'}-物料清单.csv`;
}

export function mepCsvFilename(project: Project): string {
  const base = project.name
    .trim()
    .replace(/[\\/:*?"<>|#%\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'hdesign'}-水电点位.csv`;
}

export function downloadBomCsv(project: Project, overrides: BomOverrides = {}): string {
  const csv = csvWithBom(buildBomCsv(project, overrides));
  downloadText(csv, bomCsvFilename(project), 'text/csv;charset=utf-8');
  return csv;
}

export function downloadMepPointsCsv(project: Project): string {
  const csv = csvWithBom(buildMepPointsCsv(project));
  downloadText(csv, mepCsvFilename(project), 'text/csv;charset=utf-8');
  return csv;
}

export function downloadRoomScheduleCsv(project: Project): string {
  const csv = csvWithBom(buildRoomScheduleCsv(project));
  const base = project.name.trim().replace(/[\\/:*?"<>|#%\s]+/g, '-') || 'hdesign';
  downloadText(csv, `${base}-空间材质表.csv`, 'text/csv;charset=utf-8');
  return csv;
}

/** Sheet-scoped CSV: BOM sheets export the BOM, MEP sheets export point schedules. */
export function downloadSheetCsv(
  project: Project,
  sheet: SheetSpec,
  overrides: BomOverrides = {},
): { csv: string; filename: string } {
  if (sheet.kind === 'water-plan' || sheet.kind === 'electric-plan') {
    const csv = csvWithBom(buildMepPointsCsv(project));
    const filename = sheetFileName(project, sheet.kind, 'csv');
    downloadText(csv, filename, 'text/csv;charset=utf-8');
    return { csv, filename };
  }
  if (sheet.kind === 'floor-plan') {
    const csv = csvWithBom(buildRoomScheduleCsv(project));
    const filename = sheetFileName(project, sheet.kind, 'csv');
    downloadText(csv, filename, 'text/csv;charset=utf-8');
    return { csv, filename };
  }
  const csv = csvWithBom(buildBomCsv(project, overrides));
  const filename = sheetFileName(project, sheet.kind, 'csv');
  downloadText(csv, filename, 'text/csv;charset=utf-8');
  return { csv, filename };
}
