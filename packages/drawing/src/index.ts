import { MEP_META, SHEET_KIND_LABELS, type Project, type SheetKind, type SheetSpec } from '@hdesign/domain';
import { computeBom, type BomOverrides } from './bom';
import { buildSheetRender } from './render/sheet';
import type { SheetRenderOptions } from './types';

export * from './types';
export * from './papers';
export * from './svg';
export * from './bom';
export * from './catalog-adapter';
export * from './symbols';
export * from './csv';
export * from './package';

/**
 * Renders a single construction sheet to a deterministic SVG document.
 *
 * @param project normalised project document
 * @param sheet   sheet specification (kind / size / scale / title block / layers)
 * @param options optional overrides used by the sheets panel and exporters
 */
export function renderSheetSvg(project: Project, sheet: SheetSpec, options: SheetRenderOptions = {}): string {
  return buildSheetRender(project, sheet, options).svg;
}

/** Full render result incl. paper size, effective scale, title block and warnings. */
export function renderSheet(project: Project, sheet: SheetSpec, options: SheetRenderOptions = {}) {
  return buildSheetRender(project, sheet, options);
}

/** Convenience: compute the BOM for a project (used by CSV export and tests). */
export function bomForProject(project: Project, overrides: BomOverrides = {}) {
  return computeBom(project, overrides);
}

/** Default sheet file name, e.g. `样板-A-平面布置图.svg`. */
export function sheetFileName(project: Project, kind: SheetKind, extension: string): string {
  const base = `${project.name}-${SHEET_KIND_LABELS[kind]}`
    .replace(/[\\/:*?"<>|#%\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'sheet'}.${extension.replace(/^\./, '')}`;
}

export function mepKindLabel(kind: string): string {
  const meta = MEP_META[kind as keyof typeof MEP_META];
  return meta?.label ?? kind;
}
