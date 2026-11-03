import type {
  FurnitureItem,
  MaterialAssignment,
  Project,
  Room,
  StyleAssignment,
  StyleTokenKey,
} from '@hdesign/domain';
import type { FurnitureCategory, MaterialScope, StylePreset, StyleTokens } from './types';
import { STYLE_PRESETS, getStylePreset } from './styles';

/**
 * Pure style application helper shared by the styles panel and the AI patch
 * executor. Returns FULL replacement lists so callers can perform one atomic
 * document commit:
 *
 *   const app = applyStyleToProject(project, 'japandi');
 *   doc.commit((draft) => {
 *     draft.style = app.style;
 *     draft.materials = app.materials;
 *     draft.furniture = app.furniture;
 *     draft.rooms = app.rooms;
 *   });
 */
export interface StyleApplication {
  style: StyleAssignment;
  materials: MaterialAssignment[];
  furniture: FurnitureItem[];
  rooms: Room[];
}

/** Which palette token drives each furniture category. */
const CATEGORY_TOKEN: Record<FurnitureCategory, StyleTokenKey> = {
  bed: 'fabric',
  sofa: 'fabric',
  table: 'joinery',
  chair: 'fabric',
  storage: 'joinery',
  kitchen: 'joinery',
  bath: 'stone',
  appliance: 'metal',
  lighting: 'metal',
  textile: 'fabric',
  decor: 'stone',
  plant: 'plant',
};

/** Which material scope a category should reference (when the style maps it). */
const CATEGORY_SCOPE: Partial<Record<FurnitureCategory, MaterialScope>> = {
  bed: 'fabric',
  sofa: 'fabric',
  table: 'joinery',
  chair: 'fabric',
  storage: 'joinery',
  kitchen: 'countertop',
  bath: 'countertop',
  appliance: 'metal',
  lighting: 'metal',
  textile: 'fabric',
  decor: 'countertop',
};

const ASSIGNMENT_SCOPES: Array<MaterialAssignment['scope']> = [
  'floor',
  'wall',
  'ceiling',
  'joinery',
  'countertop',
];

const FALLBACK_TOKENS: StyleTokens = STYLE_PRESETS[0]!.tokens;

/** Resolve tokens for a style id, including custom styles stored on the project. */
export function resolveStyleTokens(project: Project, styleId: string): StyleTokens {
  const preset = getStylePreset(styleId);
  if (preset) return preset.tokens;
  if (project.style.customTokens && Object.keys(project.style.customTokens).length > 0) {
    const tokens = { ...FALLBACK_TOKENS };
    for (const key of Object.keys(tokens) as StyleTokenKey[]) {
      const value = project.style.customTokens[key];
      if (value) tokens[key] = value;
    }
    return tokens;
  }
  return FALLBACK_TOKENS;
}

function styleAssignmentFor(project: Project, styleId: string, tokens: StyleTokens): StyleAssignment {
  const preset = getStylePreset(styleId);
  const custom = !preset;
  return {
    id: styleId,
    name: preset?.name ?? project.style.name ?? '自定义风格',
    overrides: {},
    ...(custom ? { customTokens: { ...tokens } } : {}),
  };
}

function materialAssignmentsFor(
  project: Project,
  preset: StylePreset | undefined,
): MaterialAssignment[] {
  if (!preset) return project.materials;
  // Drop previous global assignments for the scopes this style defines, keep per-room overrides.
  const scopes = new Set(ASSIGNMENT_SCOPES.filter((scope) => preset.materials[scope]));
  const kept = project.materials.filter(
    (assignment) => assignment.roomId !== undefined || !scopes.has(assignment.scope),
  );
  const added: MaterialAssignment[] = [];
  for (const scope of ASSIGNMENT_SCOPES) {
    const materialId = preset.materials[scope];
    if (!materialId) continue;
    added.push({
      id: `mat-all-${scope}`,
      scope,
      materialId,
      meta: { source: 'style', rationale: `风格「${preset.name}」全局材质` },
    });
  }
  return [...kept, ...added];
}

function recolorFurniture(
  project: Project,
  tokens: StyleTokens,
  preset: StylePreset | undefined,
  styleName: string,
): FurnitureItem[] {
  return project.furniture.map((item) => {
    if (item.locked) return item;
    const category = inferCategory(item);
    const tokenKey = CATEGORY_TOKEN[category] ?? 'fabric';
    const color = tokens[tokenKey] ?? item.color;
    const scope = CATEGORY_SCOPE[category];
    const materialId = (scope ? preset?.materials[scope] : undefined) ?? item.materialId;
    return {
      ...item,
      color,
      ...(materialId ? { materialId } : {}),
      meta: {
        ...item.meta,
        source: 'style',
        rationale: `风格「${styleName}」联动配色`,
      },
    };
  });
}

/**
 * Catalogue category cannot be looked up from a FurnitureItem without importing
 * the catalogue (items only carry skuId/name). Infer a coarse category from the
 * id prefix so style application stays pure and cheap.
 */
const CATEGORY_BY_PREFIX: Array<[RegExp, FurnitureCategory]> = [
  [/^bed|^crib|^bunk/, 'bed'],
  [/^sofa|^armchair|^recliner|^lounge-chair|^ottoman/, 'sofa'],
  [/^dining-table|^coffee-table|^desk|^side-table|^console|^bar-counter|^tea-table/, 'table'],
  [/^dining-chair|^chair|^desk-chair|^bar-stool|^stool|^bench|^pouf|^folding-chair|^kids-chair|^massage/, 'chair'],
  [/^wardrobe|^nightstand|^dresser|^tv-cabinet|^sideboard|^shoe|^bookshelf|^cabinet|^wall-shelf|^coat-rack|^wine|^display|^laundry|^file|^safe|^mirror-cabinet|^toy-box/, 'storage'],
  [/^kitchen|^sink|^stove|^cooktop|^range-hood|^fridge|^oven|^dishwasher|^microwave|^water-purifier|^bar-fridge/, 'kitchen'],
  [/^shower|^bathtub|^toilet|^vanity|^basin|^mirror|^towel-rack|^mop-pool|^washing|^dryer|^water-heater|^bath-cabinet|^towel/, 'bath'],
  [/^ac|^air-purifier|^humidifier|^robot|^tv|^projector|^treadmill|^piano|^safe-box/, 'appliance'],
  [/^floor-lamp|^table-lamp|^pendant|^ceiling-light|^chandelier|^wall-light|^ceiling-fan|^track-light|^desk-lamp/, 'lighting'],
  [/^rug|^curtain|cushion|^blanket|^bed-runner|^doormat/, 'textile'],
  [/^plant/, 'plant'],
];

function inferCategory(item: FurnitureItem): FurnitureCategory {
  for (const [pattern, category] of CATEGORY_BY_PREFIX) {
    if (pattern.test(item.skuId)) return category;
  }
  return 'decor';
}

function syncedRooms(project: Project, preset: StylePreset | undefined): Room[] {
  if (!preset) return project.rooms;
  return project.rooms.map((room) => ({
    ...room,
    ...(preset.materials.floor ? { floorMaterialId: preset.materials.floor } : {}),
    ...(preset.materials.wall ? { wallMaterialId: preset.materials.wall } : {}),
  }));
}

function applyTokens(project: Project, styleId: string, tokens: StyleTokens): StyleApplication {
  const preset = getStylePreset(styleId);
  const style = styleAssignmentFor(project, styleId, tokens);
  const styleName = style.name ?? styleId;
  return {
    style,
    materials: materialAssignmentsFor(project, preset),
    furniture: recolorFurniture(project, tokens, preset, styleName),
    rooms: syncedRooms(project, preset),
  };
}

/** Apply a built-in style preset to a project. Pure; returns new arrays. */
export function applyStyleToProject(project: Project, styleId: string): StyleApplication {
  const tokens = resolveStyleTokens(project, styleId);
  return applyTokens(project, styleId, tokens);
}

/**
 * Apply explicit tokens (AI custom style / reference-image extraction).
 * When `styleId` is omitted the project keeps its current style id and the tokens
 * are stored as `style.customTokens`.
 */
export function applyStyleTokensToProject(
  project: Project,
  tokens: StyleTokens,
  styleId?: string,
): StyleApplication {
  const id = styleId ?? project.style.id ?? 'custom-style';
  const resolved = { ...FALLBACK_TOKENS, ...tokens };
  return applyTokens(project, id, resolved);
}

export { CATEGORY_TOKEN, CATEGORY_SCOPE, inferCategory };
