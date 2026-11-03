import {
  angleOf,
  distance,
  distanceToSegment,
  pointInPolygon,
  polygonAreaSqm,
  polygonCentroid,
  signedPolygonArea,
} from './geometry';
import type { Point, Wall } from './schema';

/**
 * Planar room-face extraction from wall centre lines.
 *
 * The walls are treated as an undirected planar graph: segments are split at
 * T-junctions and crossings, then the half-edge structure is traversed with the
 * "next edge clockwise from the twin" rule. Every bounded (interior) face of the
 * graph becomes a candidate room; the unbounded outer face is discarded because
 * it is wound the opposite way.
 *
 * Units are millimetres, matching the rest of the domain.
 */

export interface WallSegment {
  a: Point;
  b: Point;
}

export interface RoomFace {
  /** Closed polygon, wound so the shoelace area is positive (screen-space clockwise). */
  polygon: Point[];
  areaSqm: number;
  centroid: Point;
}

export interface DetectRoomFacesOptions {
  /** Vertex / junction merge tolerance in mm. */
  tolerance?: number;
  /** Faces below this area are treated as noise (default 0.2 ㎡). */
  minAreaSqm?: number;
}

interface HalfEdge {
  from: number;
  to: number;
  twin: number;
}

interface Vertex {
  point: Point;
  /** Outgoing half-edge ids sorted by angle ascending. */
  outgoing: number[];
}

const DEFAULT_TOLERANCE = 1;
const DEFAULT_MIN_AREA_SQM = 0.2;

function cleanSegments(walls: Array<Wall | WallSegment>, tolerance: number): WallSegment[] {
  const result: WallSegment[] = [];
  for (const wall of walls) {
    const a = { x: wall.a.x, y: wall.a.y };
    const b = { x: wall.b.x, y: wall.b.y };
    if (distance(a, b) <= tolerance) continue;
    result.push({ a, b });
  }
  return result;
}

function segmentLength(segment: WallSegment): number {
  return distance(segment.a, segment.b);
}

function pointAt(segment: WallSegment, t: number): Point {
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * t,
    y: segment.a.y + (segment.b.y - segment.a.y) * t,
  };
}

function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

/**
 * Split every segment at every junction: other segment endpoints lying on it,
 * plus proper crossings. Returns parameter lists in [0, 1] per segment.
 */
function collectSplitParams(segments: WallSegment[], tolerance: number): number[][] {
  const params = segments.map(() => [0, 1]);
  const endpoints = segments.flatMap((segment) => [segment.a, segment.b]);

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const length = segmentLength(segment);
    if (length <= tolerance) continue;
    for (const endpoint of endpoints) {
      const projection = projectT(endpoint, segment);
      if (projection <= 0 || projection >= 1) continue;
      const projected = pointAt(segment, projection);
      if (distance(projected, endpoint) > tolerance) continue;
      params[i]!.push(projection);
    }
  }

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const first = segments[i]!;
      const second = segments[j]!;
      const hit = segmentIntersection(first.a, first.b, second.a, second.b);
      if (!hit) continue;
      const t = projectT(hit, first);
      const u = projectT(hit, second);
      if (t > 0 && t < 1) params[i]!.push(t);
      if (u > 0 && u < 1) params[j]!.push(u);
    }
  }

  return params;
}

function projectT(point: Point, segment: WallSegment): number {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-9) return 0;
  return ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSq;
}

interface BuiltGraph {
  vertices: Vertex[];
  halfEdges: HalfEdge[];
}

function buildGraph(segments: WallSegment[], tolerance: number): BuiltGraph {
  const params = collectSplitParams(segments, tolerance);
  const vertexIndex = new Map<string, number>();
  const vertices: Vertex[] = [];
  const halfEdges: HalfEdge[] = [];
  const edgeKeys = new Set<string>();

  const vertexKey = (point: Point) =>
    `${Math.round(point.x / tolerance)}:${Math.round(point.y / tolerance)}`;

  const internVertex = (point: Point): number => {
    const key = vertexKey(point);
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push({ point: { x: point.x, y: point.y }, outgoing: [] });
    vertexIndex.set(key, index);
    return index;
  };

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const sorted = [...new Set(params[i]!.map((value) => Math.min(1, Math.max(0, value))))].sort(
      (a, b) => a - b,
    );
    let previous = internVertex(pointAt(segment, sorted[0]!));
    for (let k = 1; k < sorted.length; k += 1) {
      const point = pointAt(segment, sorted[k]!);
      const current = internVertex(point);
      if (current === previous) continue;
      if (distance(vertices[previous]!.point, vertices[current]!.point) <= tolerance) continue;
      const low = Math.min(previous, current);
      const high = Math.max(previous, current);
      const edgeKey = `${low}-${high}`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        const forward = halfEdges.length;
        halfEdges.push({ from: low, to: high, twin: forward + 1 });
        halfEdges.push({ from: high, to: low, twin: forward });
      }
      previous = current;
    }
  }

  for (let id = 0; id < halfEdges.length; id += 1) {
    vertices[halfEdges[id]!.from]!.outgoing.push(id);
  }
  for (const vertex of vertices) {
    vertex.outgoing.sort((first, second) => {
      const firstEdge = halfEdges[first]!;
      const secondEdge = halfEdges[second]!;
      return (
        angleOf(vertex.point, vertices[firstEdge.to]!.point) -
        angleOf(vertex.point, vertices[secondEdge.to]!.point)
      );
    });
  }

  return { vertices, halfEdges };
}

/**
 * Detect bounded room faces from wall centre lines.
 *
 * Returns one polygon per enclosed region, largest first. Faces nested entirely
 * inside another face are dropped (they are columns or holes rather than rooms,
 * and the room they carve out of is still reported).
 */
export function detectRoomFaces(
  walls: Array<Wall | WallSegment>,
  options: DetectRoomFacesOptions = {},
): RoomFace[] {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const minAreaSqm = options.minAreaSqm ?? DEFAULT_MIN_AREA_SQM;
  const segments = cleanSegments(walls, tolerance);
  if (segments.length < 3) return [];

  const { vertices, halfEdges } = buildGraph(segments, tolerance);
  if (halfEdges.length === 0) return [];

  const visited = new Array<boolean>(halfEdges.length).fill(false);
  const faces: RoomFace[] = [];

  for (let start = 0; start < halfEdges.length; start += 1) {
    if (visited[start]) continue;
    const cycle: number[] = [];
    let current = start;
    let guard = 0;
    while (!visited[current] && guard <= halfEdges.length + 1) {
      visited[current] = true;
      cycle.push(current);
      const edge = halfEdges[current]!;
      const vertex = vertices[edge.to]!;
      const twin = edge.twin;
      const position = vertex.outgoing.indexOf(twin);
      if (position < 0) break;
      current = vertex.outgoing[(position - 1 + vertex.outgoing.length) % vertex.outgoing.length]!;
      guard += 1;
    }
    if (current !== start || cycle.length < 3) continue;

    const polygon: Point[] = cycle.map((id) => ({ ...vertices[halfEdges[id]!.from]!.point }));
    const signedArea = signedPolygonArea(polygon);
    if (signedArea <= 1e-3) continue;

    const face: RoomFace = {
      polygon,
      areaSqm: polygonAreaSqm(polygon),
      centroid: polygonCentroid(polygon),
    };
    if (face.areaSqm >= minAreaSqm) faces.push(face);
  }

  faces.sort((a, b) => b.areaSqm - a.areaSqm);

  // Drop faces that sit completely inside a larger face (columns / voids).
  return faces.filter((face, index) =>
    faces.every(
      (other, otherIndex) =>
        otherIndex === index ||
        other.areaSqm <= face.areaSqm ||
        !polygonInsidePolygon(face.polygon, other.polygon),
    ),
  );
}

function polygonInsidePolygon(inner: Point[], outer: Point[]): boolean {
  if (inner.length === 0) return false;
  return inner.every((point) => pointInPolygon(point, outer));
}

/** Face containing a world point, preferring the smallest enclosing face. */
export function findRoomFaceAt(faces: RoomFace[], point: Point): RoomFace | undefined {
  let best: RoomFace | undefined;
  for (const face of faces) {
    if (!pointInPolygon(point, face.polygon)) continue;
    if (!best || face.areaSqm < best.areaSqm) best = face;
  }
  return best;
}

/**
 * Distance from a point to the nearest wall segment, used for hit testing and
 * for deciding whether a click belongs to a wall.
 */
export function nearestWallDistance(point: Point, walls: Wall[]): number {
  let best = Infinity;
  for (const wall of walls) {
    best = Math.min(best, distanceToSegment(point, wall.a, wall.b));
  }
  return best;
}
