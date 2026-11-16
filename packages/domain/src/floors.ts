import { createId } from './ids';
import {
  DEFAULT_FLOOR_HEIGHT,
  type Floor,
  type Level,
  type Project,
  type Reference,
} from './schema';

/* ------------------------------------------------------------------ */
/* Floor helpers                                                       */
/* ------------------------------------------------------------------ */

const ENTITY_KEYS = ['walls', 'openings', 'rooms', 'furniture', 'annotations', 'mep', 'stairwells'] as const;

/** Human-readable storey label: 1F, 2F, 3F … */
export function defaultFloorName(index: number): string {
  return `${index + 1}F`;
}

export function isMultiFloor(project: Project): boolean {
  return project.floors.length > 1;
}

export function activeFloor(project: Project): Floor | undefined {
  return project.floors.find((floor) => floor.id === project.activeFloorId) ?? project.floors[0];
}

export function floorLevel(floor: Floor): Level {
  return { name: floor.name, height: floor.height };
}

function floorIsEmpty(floor: Floor): boolean {
  return (
    floor.walls.length === 0 &&
    floor.openings.length === 0 &&
    floor.rooms.length === 0 &&
    floor.furniture.length === 0 &&
    floor.annotations.length === 0 &&
    floor.mep.devices.length === 0 &&
    floor.stairwells.length === 0 &&
    !floor.reference
  );
}

/** Deep-enough copies so the flat projection and the floor snapshot never alias. */
function copyEntities<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => ({ ...item })) as T;
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = Array.isArray(item) ? item.map((entry) => ({ ...entry })) : item;
    }
    return result as T;
  }
  return value;
}

/**
 * Builds the first storey out of a legacy (v1) flat document. Called by
 * migrations and by doc-store as a defensive guard for hand-built projects.
 */
export function synthesiseFloor(project: Project, id = createId('floor')): Floor {
  return {
    id,
    name: project.level?.name?.trim() || defaultFloorName(0),
    elevation: 0,
    height: project.level?.height || DEFAULT_FLOOR_HEIGHT,
    walls: copyEntities(project.walls),
    openings: copyEntities(project.openings),
    rooms: copyEntities(project.rooms),
    furniture: copyEntities(project.furniture),
    annotations: copyEntities(project.annotations),
    mep: {
      devices: copyEntities(project.mep.devices),
      circuits: copyEntities(project.mep.circuits),
    },
    reference: copyEntities(project.reference),
    stairwells: copyEntities(project.stairwells),
  };
}

/**
 * Guarantees a usable floor stack. Mutates `project` in place so it can run
 * directly on an immer draft. Also heals projects that were hand-edited on the
 * flat arrays (seed data, tests, imported fixtures) by folding those arrays
 * back into the active floor.
 */
export function ensureFloors(project: Project): void {
  if (!project.floors || project.floors.length === 0) {
    project.floors = [synthesiseFloor(project)];
  }
  if (!project.activeFloorId || !project.floors.some((floor) => floor.id === project.activeFloorId)) {
    project.activeFloorId = project.floors[0].id;
  }
  const active = project.floors.find((floor) => floor.id === project.activeFloorId)!;
  // Legacy / hand-built documents carry their data on the flat arrays only.
  const flatHasEntities =
    project.walls.length > 0 ||
    project.openings.length > 0 ||
    project.rooms.length > 0 ||
    project.furniture.length > 0 ||
    project.annotations.length > 0 ||
    project.mep.devices.length > 0 ||
    project.stairwells.length > 0 ||
    Boolean(project.reference);
  if (floorIsEmpty(active) && flatHasEntities) {
    Object.assign(active, synthesiseFloor(project, active.id));
  }
  project.level = floorLevel(active);
}

/** Copy the active floor's snapshot onto the flat projection. */
export function loadActiveFloor(project: Project): void {
  const floor = activeFloor(project);
  if (!floor) return;
  for (const key of ENTITY_KEYS) {
    (project as unknown as Record<string, unknown>)[key] = copyEntities(floor[key]);
  }
  project.reference = copyEntities(floor.reference);
  project.level = floorLevel(floor);
}

/** Fold the flat projection back into the active floor (source of truth). */
export function saveActiveFloor(project: Project): void {
  const floor = project.floors.find((item) => item.id === project.activeFloorId);
  if (!floor) return;
  for (const key of ENTITY_KEYS) {
    (floor as unknown as Record<string, unknown>)[key] = copyEntities(project[key]);
  }
  floor.reference = copyEntities(project.reference);
  project.level = floorLevel(floor);
}

/**
 * Sync projects mutated outside doc-store (demo seeds, import results, tests)
 * so `floors` matches the flat arrays. Safe to call repeatedly.
 */
export function syncProjectFloors(project: Project): void {
  ensureFloors(project);
  saveActiveFloor(project);
}

/**
 * Returns a Floor whose entity arrays are authoritative for rendering. The
 * active floor reads the flat projection, which is what hand-edited projects
 * and tests populate; inactive floors read their own stored snapshot.
 */
export function floorEntities(project: Project, floor: Floor): Floor {
  if (floor.id !== project.activeFloorId) return floor;
  return {
    ...floor,
    walls: project.walls,
    openings: project.openings,
    rooms: project.rooms,
    furniture: project.furniture,
    annotations: project.annotations,
    mep: project.mep,
    reference: project.reference,
    stairwells: project.stairwells,
  };
}

/**
 * Produces a Project-shaped view scoped to one floor, used by the drawing
 * engine and BOM. Sheets without `floorId` keep using the flat projection
 * (the active floor) so v1 documents and tests are unaffected.
 */
export function projectForFloor(project: Project, floorId: string): Project {
  const floor = project.floors.find((item) => item.id === floorId);
  if (!floor) return project;
  if (floor.id === project.activeFloorId) {
    return { ...project, level: floorLevel(floor) };
  }
  return {
    ...project,
    level: floorLevel(floor),
    walls: floor.walls,
    openings: floor.openings,
    rooms: floor.rooms,
    furniture: floor.furniture,
    annotations: floor.annotations,
    mep: floor.mep,
    reference: floor.reference,
    stairwells: floor.stairwells,
  };
}

/** All underlay asset ids used by any floor (for .hdz export/import). */
export function collectReferenceAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  if (project.reference?.assetId) ids.add(project.reference.assetId);
  for (const floor of project.floors) {
    if (floor.reference?.assetId) ids.add(floor.reference.assetId);
  }
  return [...ids];
}

/** Drop references whose asset blob is missing (e.g. a partially copied .hdz). */
export function pruneMissingReferences(project: Project, availableAssetIds: ReadonlySet<string>): void {
  const keep = (reference: Reference | undefined): Reference | undefined =>
    reference && availableAssetIds.has(reference.assetId) ? reference : undefined;
  project.reference = keep(project.reference);
  for (const floor of project.floors) {
    floor.reference = keep(floor.reference);
  }
}

/**
 * Recomputes elevations from storey heights: floor 0 sits at 0, each next
 * floor sits on top of all heights below it. Mutates the array.
 */
export function recalculateElevations(floors: Floor[]): void {
  let elevation = 0;
  for (const floor of floors) {
    floor.elevation = elevation;
    elevation += floor.height;
  }
}

/** Total height of the stack, in millimetres. */
export function floorStackHeight(floors: Floor[]): number {
  return floors.reduce((total, floor) => total + floor.height, 0);
}

/** Next unused storey label, e.g. "3F" when 1F/2F already exist. */
export function nextFloorName(floors: Floor[]): string {
  const used = new Set(floors.map((floor) => floor.name));
  let index = floors.length;
  while (used.has(defaultFloorName(index))) index += 1;
  return defaultFloorName(index);
}
