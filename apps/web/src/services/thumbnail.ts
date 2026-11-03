import { renderSheet, type SheetRenderOptions } from '@hdesign/drawing';
import type { Project } from '@hdesign/domain';
import { setThumbnail } from '../store/persistence';
import { rasterizeSvg } from './export/svg';

/**
 * Project thumbnails for the project list.
 *
 * Renders a furniture-plan sheet at 1:50, then crops the raster to the plan
 * viewport (dropping the title block/notes strip) and downsizes it to ~640px.
 * The result reads like a plan preview and stays small in IndexedDB.
 */

export const THUMBNAIL_WIDTH = 640;

export interface ThumbnailResult {
  dataUrl: string;
  width: number;
  height: number;
}

export function hasDrawableGeometry(project: Project): boolean {
  return project.rooms.length > 0 || project.walls.length > 0 || project.furniture.length > 0;
}

export function thumbnailSourceSheet(project: Project) {
  const preferred = project.sheets.find((sheet) => sheet.kind === 'furniture-plan');
  return (
    preferred ??
    project.sheets.find((sheet) => sheet.kind !== 'bom') ?? {
      id: `thumb-${project.id}`,
      kind: 'furniture-plan' as const,
      name: '平面图',
      size: 'A3' as const,
      scale: 50 as const,
      layerIds: [],
      titleBlock: { projectName: project.name, sheetNo: 'A-01', designer: '', date: '', notes: '' },
      includeDimensions: false,
      notes: '',
    }
  );
}

const THUMB_OPTIONS: SheetRenderOptions = {
  size: 'A3',
  scale: 50,
  includeTitleBlock: false,
  includeNotes: false,
  includeLegend: false,
  includeDimensions: false,
  includeNorthArrow: false,
  includeScaleBar: false,
  aiBadge: false,
  notes: [],
  idPrefix: 'hdesign-thumb',
};

export async function renderThumbnailDataUrl(project: Project, width = THUMBNAIL_WIDTH): Promise<ThumbnailResult | null> {
  if (!hasDrawableGeometry(project)) return null;
  const sheet = thumbnailSourceSheet(project);
  const render = renderSheet(project, sheet, THUMB_OPTIONS);
  // Crop to the plan viewport (with a small breathing margin) so the card does
  // not show the blank title-block strip.
  const plan = render.frame.plan;
  const margin = 4;
  const crop = {
    x: Math.max(0, plan.x - margin),
    y: Math.max(0, plan.y - margin),
    w: Math.min(render.widthMm, plan.w + margin * 2),
    h: Math.min(render.heightMm, plan.h + margin * 2),
  };
  // Render the source only as large as the crop needs (keeps thumbnail
  // generation cheap enough to run for every project card on first load).
  const fullWidth = Math.max(640, Math.round(width * (render.widthMm / crop.w)));
  const fullHeight = Math.round(fullWidth * (render.heightMm / render.widthMm));
  const source = await rasterizeSvg(render.svg, fullWidth, fullHeight);
  const pxPerMm = fullWidth / render.widthMm;
  const sx = Math.round(crop.x * pxPerMm);
  const sy = Math.round(crop.y * pxPerMm);
  const sw = Math.max(1, Math.round(crop.w * pxPerMm));
  const sh = Math.max(1, Math.round(crop.h * pxPerMm));
  const outputWidth = Math.min(width, sw);
  const outputHeight = Math.max(1, Math.round((sh / sw) * outputWidth));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持 Canvas 2D，无法生成缩略图');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, width: canvas.width, height: canvas.height };
}

/** Generates and persists a thumbnail; returns undefined when the project is empty. */
export async function refreshProjectThumbnail(project: Project, width = THUMBNAIL_WIDTH): Promise<string | undefined> {
  const result = await renderThumbnailDataUrl(project, width);
  if (!result) return undefined;
  await setThumbnail(project.id, result.dataUrl);
  return result.dataUrl;
}
