import { SHEET_KIND_LABELS, type SheetSpec } from '@hdesign/domain';
import { slug } from '@hdesign/drawing';
import { downloadBlob } from '../../services/export/svg';

/** Downloads a rendered sheet SVG string with the conventional file name. */
export function downloadSvgFromString(
  svg: string,
  projectName: string,
  sheet: SheetSpec,
  floorName?: string,
): string {
  const parts = [slug(projectName, 'hdesign')];
  if (floorName) parts.push(slug(floorName, 'floor'));
  parts.push(slug(SHEET_KIND_LABELS[sheet.kind], 'sheet'));
  const filename = `${parts.join('-')}.svg`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
  return filename;
}
