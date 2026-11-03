import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import {
  angleOf,
  cleanPolygon,
  createAnnotation,
  createMepDevice,
  createOpening,
  createRoom,
  createWall,
  detectRoomFaces,
  distance,
  findRoomAt,
  findRoomFaceAt,
  MEP_META,
  polygonAreaSqm,
  type FurnitureItem,
  type MepKind,
  type Opening,
  type OpeningKind,
  type Point,
  type Wall,
} from '@hdesign/domain';
import { readCanvasColors, type CanvasColors } from '../design-system/theme';
import { useDocStore } from '../store/doc-store';
import { useUiStore, type ToolId, type Viewport } from '../store/ui-store';
import { cn } from '../design-system/primitives';
import { EditorOverlay } from './EditorOverlay';
import {
  CalibrationCard,
  CollisionBar,
  CONTEXT_ICONS,
  EditorContextMenu,
  EditorHintBar,
  EditorToolbar,
  EmptyPlanOverlay,
  ScaleBar,
  TextAnnotationInput,
  type ContextMenuItem,
} from './EditorHud';
import { WorldLayers } from './WorldLayers';
import { useStageSize } from './hooks/useStageSize';
import { useUnderlayImage } from './hooks/useUnderlayImage';
import {
  bringSelectionToFront,
  createRoomsFromFaces,
  deleteSelection,
  duplicateSelection,
  makeOpeningForWall,
  nudgeSelection,
  sendSelectionToBack,
  toggleSelectionLock,
} from './lib/commands';
import { computeCalibration } from './lib/calibration';
import {
  collisionSummary as collisionSummaryText,
  findFurnitureCollisions,
  footprintBBox,
} from './lib/collision';
import {
  ensureCatalogLoaded,
  placeFurniture,
  resolveFurniturePreset,
  resizeFurnitureFromCorner,
  rotationFromPointer,
  type ResizeCorner,
} from './lib/furniture';
import {
  hitTestHandle,
  hitTestPoint,
  furnitureInBox,
  roomsInBox,
  selectionHandles,
  wallsInBox,
  type HitResult,
} from './lib/hit-test';
import { resolveVisibleLayerId } from './lib/layers';
import {
  clampOpeningToWall,
  insertOpeningParams,
  nearestWallAt,
  offsetForPointerOnWall,
} from './lib/openings';
import {
  boundsOfItems,
  snapDragBounds,
  snapDrawingPoint,
  snapPoint,
  worldTolerance,
  type SnapContext,
  type SnapGuide,
} from './lib/snapping';
import { documentBBox, fitViewportToBox, screenToWorld, zoomViewportAt } from './lib/transform';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Interaction =
  | { mode: 'pan'; startScreen: Point; startViewport: Viewport }
  | { mode: 'marquee'; from: Point; to: Point; additive: boolean; startScreen: Point }
  | {
      mode: 'move';
      ids: string[];
      startWorld: Point;
      startScreen: Point;
      startPositions: Map<string, Point>;
      startBox: { x: number; y: number; w: number; h: number };
      moved: boolean;
    }
  | {
      mode: 'rotate';
      id: string;
      startItem: FurnitureItem;
      startPointerAngle: number;
      startRotation: number;
      startScreen: Point;
      moved: boolean;
    }
  | {
      mode: 'resize';
      id: string;
      corner: ResizeCorner;
      startItem: FurnitureItem;
      startScreen: Point;
      moved: boolean;
    }
  | {
      mode: 'wall-vertex';
      id: string;
      end: 'a' | 'b';
      startScreen: Point;
      moved: boolean;
    }
  | {
      mode: 'opening-drag';
      id: string;
      startOpening: Opening;
      wall: Wall;
      startScreen: Point;
      moved: boolean;
    }
  | {
      mode: 'room-move';
      ids: string[];
      startWorld: Point;
      startScreen: Point;
      polygons: Map<string, Point[]>;
      moved: boolean;
    }
  | {
      mode: 'mep-move';
      ids: string[];
      startWorld: Point;
      startScreen: Point;
      positions: Map<string, Point>;
      moved: boolean;
    }
  | {
      mode: 'annotation-move';
      ids: string[];
      startWorld: Point;
      startScreen: Point;
      points: Map<string, Point[]>;
      moved: boolean;
    };

const MEP_TOOL_KIND: Partial<Record<ToolId, MepKind>> = {
  'mep-socket': 'socket',
  'mep-switch': 'switch',
  'mep-light': 'light',
  'mep-water': 'water-cold',
  'mep-drain': 'drain',
};

const TOOL_SHORTCUTS: Record<string, ToolId> = {
  v: 'select',
  h: 'pan',
  w: 'wall',
  d: 'door',
  n: 'window',
  s: 'sliding',
  r: 'room',
  f: 'furniture',
  m: 'measure',
  t: 'text',
  c: 'calibrate',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
  );
}

function layerIsInteractive(
  doc: ReturnType<typeof useDocStore.getState>['doc'],
  layerId: string,
): boolean {
  const layer = doc.layers.find((entry) => entry.id === layerId);
  return layer ? layer.visible && !layer.locked : true;
}

/* ------------------------------------------------------------------ */
/* Stage canvas                                                        */
/* ------------------------------------------------------------------ */

export function StageCanvas() {
  const doc = useDocStore((state) => state.doc);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const tool = useUiStore((state) => state.tool);
  const selection = useUiStore((state) => state.selection);
  const theme = useUiStore((state) => state.theme);
  const accent = useUiStore((state) => state.accent);
  const canvasStyle = useUiStore((state) => state.canvasStyle);
  const pendingFurnitureSkuId = useUiStore((state) => state.pendingFurnitureSkuId);
  const pushToast = useUiStore((state) => state.pushToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const size = useStageSize(containerRef);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const [colors, setColors] = useState<CanvasColors>(() => readCanvasColors());
  useEffect(() => {
    setColors(readCanvasColors());
  }, [theme, accent, canvasStyle]);

  const underlayImage = useUnderlayImage(doc.reference?.assetId ?? null);

  /* ----- Editor-local interaction state ----- */

  const [openingKind, setOpeningKind] = useState<OpeningKind>('door');
  const [roomMode, setRoomMode] = useState<'auto' | 'draw'>('auto');
  const [wallDraft, setWallDraft] = useState<Point[]>([]);
  const [draftPreview, setDraftPreview] = useState<Point | null>(null);
  const [roomDraft, setRoomDraft] = useState<Point[]>([]);
  const [roomPreview, setRoomPreview] = useState<Point | null>(null);
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureCurrent, setMeasureCurrent] = useState<Point | null>(null);
  const [calibration, setCalibration] = useState<{ a: Point | null; b: Point | null }>({
    a: null,
    b: null,
  });
  const [calibrationPointer, setCalibrationPointer] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ from: Point; to: Point } | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [snapMarker, setSnapMarker] = useState<Point | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point | null>(null);
  const [hover, setHover] = useState<HitResult | null>(null);
  const [openingPreview, setOpeningPreview] = useState<{ wall: Wall; opening: Opening } | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState<{ world: Point; screen: Point; value: string } | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [collisionDismissed, setCollisionDismissed] = useState(false);

  const interactionRef = useRef<Interaction | null>(null);
  const gestureActiveRef = useRef(false);
  const spaceRef = useRef(false);
  const didInitialFitRef = useRef(false);
  const wallDraftRef = useRef<Point[]>([]);
  const roomDraftRef = useRef<Point[]>([]);
  const measureStartRef = useRef<Point | null>(null);
  const calibrationRef = useRef<{ a: Point | null; b: Point | null }>({ a: null, b: null });
  const openingKindRef = useRef<OpeningKind>('door');
  const roomModeRef = useRef<'auto' | 'draw'>('auto');
  const textDraftRef = useRef<typeof textDraft>(null);
  useEffect(() => {
    wallDraftRef.current = wallDraft;
  }, [wallDraft]);
  useEffect(() => {
    roomDraftRef.current = roomDraft;
  }, [roomDraft]);
  useEffect(() => {
    measureStartRef.current = measureStart;
  }, [measureStart]);
  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);
  useEffect(() => {
    openingKindRef.current = openingKind;
  }, [openingKind]);
  useEffect(() => {
    roomModeRef.current = roomMode;
  }, [roomMode]);
  useEffect(() => {
    textDraftRef.current = textDraft;
  }, [textDraft]);

  /* ----- Helpers ----- */

  const buildSnapContext = useCallback((excludeIds?: string[]): SnapContext => {
    const currentDoc = useDocStore.getState().doc;
    const currentViewport = useUiStore.getState().viewport;
    return {
      doc: currentDoc,
      settings: {
        enabled: currentDoc.settings.snapEnabled,
        gridSize: currentDoc.settings.gridSize,
        tolerance: worldTolerance(currentViewport, 10),
      },
      visibleLayerIds: new Set(
        currentDoc.layers.filter((layer) => layer.visible).map((layer) => layer.id),
      ),
      excludeIds,
    };
  }, []);

  const pointerFromEvent = useCallback((event: { clientX: number; clientY: number }) => {
    const element = containerRef.current;
    const rect = element?.getBoundingClientRect();
    const screen = {
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
    };
    const currentViewport = useUiStore.getState().viewport;
    return { screen, world: screenToWorld(screen, currentViewport) };
  }, []);

  const ensureGesture = useCallback(() => {
    if (gestureActiveRef.current) return;
    useDocStore.getState().beginGesture();
    gestureActiveRef.current = true;
  }, []);

  const endGestureIfActive = useCallback(() => {
    if (!gestureActiveRef.current) return;
    useDocStore.getState().endGesture();
    gestureActiveRef.current = false;
  }, []);

  const fitToView = useCallback(() => {
    const currentSize = sizeRef.current;
    if (currentSize.width < 20 || currentSize.height < 20) return;
    const currentDoc = useDocStore.getState().doc;
    useUiStore.getState().setViewport(fitViewportToBox(documentBBox(currentDoc), currentSize));
  }, []);

  const finishWallChain = useCallback(() => {
    if (wallDraftRef.current.length === 0) return;
    setWallDraft([]);
    wallDraftRef.current = [];
    setDraftPreview(null);
    setGuides([]);
    setSnapMarker(null);
    endGestureIfActive();
  }, [endGestureIfActive]);

  const cancelDrafts = useCallback(() => {
    finishWallChain();
    setRoomDraft([]);
    setRoomPreview(null);
    setMeasureStart(null);
    setMeasureCurrent(null);
    setCalibration({ a: null, b: null });
    setCalibrationPointer(null);
    setOpeningPreview(null);
    setTextDraft(null);
    setContextMenu(null);
    setMarquee(null);
    interactionRef.current = null;
    useUiStore.getState().setPendingFurnitureSku(null);
    endGestureIfActive();
  }, [endGestureIfActive, finishWallChain]);

  /* ----- Lifecycle: fit, wheel, space, resize ----- */

  useEffect(() => {
    if (size.width > 0 && size.height > 0 && !didInitialFitRef.current) {
      didInitialFitRef.current = true;
      fitToView();
    }
  }, [size.width, size.height, fitToView]);

  useEffect(() => {
    const handler = () => fitToView();
    window.addEventListener('hdesign:fit', handler);
    return () => window.removeEventListener('hdesign:fit', handler);
  }, [fitToView]);

  useEffect(() => {
    void ensureCatalogLoaded();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const current = useUiStore.getState().viewport;
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.0035 : 0.0016));
      useUiStore.getState().setViewport(zoomViewportAt(current, anchor, current.scale * factor));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return;
      event.preventDefault();
      spaceRef.current = true;
      setSpaceDown(true);
      useUiStore.getState().setSpacePanning(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceDown(false);
      useUiStore.getState().setSpacePanning(false);
    };
    const blur = () => {
      spaceRef.current = false;
      setSpaceDown(false);
      useUiStore.getState().setSpacePanning(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, []);

  useEffect(() => {
    if (tool !== 'wall') finishWallChain();
    if (tool !== 'room') {
      setRoomDraft([]);
      setRoomPreview(null);
    }
    if (tool !== 'measure') {
      setMeasureStart(null);
      setMeasureCurrent(null);
    }
    if (tool !== 'calibrate') {
      setCalibration({ a: null, b: null });
      setCalibrationPointer(null);
    }
    if (tool === 'door' || tool === 'window' || tool === 'sliding') {
      setOpeningKind(tool);
    } else {
      setOpeningPreview(null);
    }
    if (tool !== 'furniture') {
      useUiStore.getState().setPendingFurnitureSku(null);
    }
  }, [tool, finishWallChain]);

  useEffect(
    () => () => {
      if (gestureActiveRef.current) {
        useDocStore.getState().endGesture();
        gestureActiveRef.current = false;
      }
      useUiStore.getState().setSpacePanning(false);
    },
    [],
  );

  /* ----- Actions ----- */

  const reportCollisions = useCallback(
    (ids: string[]) => {
      const currentDoc = useDocStore.getState().doc;
      const pairs = findFurnitureCollisions(currentDoc.furniture).filter(
        (pair) => ids.includes(pair.a.id) || ids.includes(pair.b.id),
      );
      if (pairs.length === 0) return;
      const affected = new Set<string>();
      for (const pair of pairs) {
        affected.add(pair.a.id);
        affected.add(pair.b.id);
      }
      pushToast(`有 ${affected.size} 件家具互相重叠`, 'warning', '可继续调整位置，重叠仅作提醒');
    },
    [pushToast],
  );

  const autoCreateRooms = useCallback(() => {
    const currentDoc = useDocStore.getState().doc;
    if (currentDoc.walls.length === 0) {
      pushToast('还没有墙体，先绘制闭合轮廓', 'warning');
      return;
    }
    const result = createRoomsFromFaces(detectRoomFaces(currentDoc.walls));
    if (result.created > 0) {
      pushToast(`已生成 ${result.created} 个房间`, 'success');
    } else if (result.skipped > 0) {
      pushToast('闭合区域都已生成房间', 'info');
    } else {
      pushToast('没有找到闭合的房间轮廓', 'warning', '请检查墙体是否围合');
    }
  }, [pushToast]);

  const handleOpeningKindChange = useCallback((kind: OpeningKind) => {
    setOpeningKind(kind);
    openingKindRef.current = kind;
  }, []);

  const handleRoomModeChange = useCallback((mode: 'auto' | 'draw') => {
    setRoomMode(mode);
    roomModeRef.current = mode;
    setRoomDraft([]);
    setRoomPreview(null);
  }, []);

  /* ----- Tool actions (pointer down) ----- */

  const placeWallPoint = useCallback(
    (world: Point, shiftKey: boolean) => {
      const context = buildSnapContext();
      const points = wallDraftRef.current;
      let point: Point;
      if (points.length === 0) {
        point = snapPoint(world, context).point;
      } else {
        point = snapDrawingPoint(
          points[points.length - 1]!,
          world,
          context,
          shiftKey ? 0 : 15,
        ).point;
      }
      if (points.length > 0) {
        const last = points[points.length - 1]!;
        if (distance(last, point) < 20) return;
      }
      if (points.length === 0) {
        setWallDraft([point]);
        setSnapMarker(point);
        return;
      }
      const currentDoc = useDocStore.getState().doc;
      ensureGesture();
      const wall = createWall(points[points.length - 1]!, point, {
        layerId: resolveVisibleLayerId(currentDoc, 'structure'),
      });
      useDocStore.getState().addWall(wall);
      const nextPoints = [...points, point];
      const tolerance = worldTolerance(useUiStore.getState().viewport, 12);
      const closed = nextPoints.length >= 3 && distance(nextPoints[0]!, point) <= tolerance;
      if (closed) {
        finishWallChain();
        pushToast('墙体已闭合', 'success', '点击工具栏「识别房间」可生成房间区域');
      } else {
        setWallDraft(nextPoints);
      }
      setSnapMarker(point);
    },
    [buildSnapContext, ensureGesture, finishWallChain, pushToast],
  );

  const placeRoomPoint = useCallback(
    (world: Point) => {
      const currentDoc = useDocStore.getState().doc;
      const context = buildSnapContext();
      if (roomModeRef.current === 'auto') {
        if (currentDoc.walls.length === 0) {
          pushToast('还没有墙体，请先绘制围合轮廓', 'warning');
          return;
        }
        const faces = detectRoomFaces(currentDoc.walls);
        const face = findRoomFaceAt(faces, world);
        if (!face) {
          pushToast('此处没有闭合区域', 'warning', '请先绘制围合的墙体，或切换为手绘轮廓');
          return;
        }
        if (findRoomAt(currentDoc.rooms, face.centroid)) {
          pushToast('该区域已经有房间了', 'info');
          return;
        }
        const room = createRoom(face.polygon, {
          name: `房间 ${currentDoc.rooms.length + 1}`,
          type: 'other',
          meta: { source: 'auto' },
        });
        room.layerId = resolveVisibleLayerId(currentDoc, 'structure', room.layerId);
        useDocStore.getState().addRoom(room);
        useUiStore.getState().selectOne('room', room.id);
        pushToast(`已生成房间 ${polygonAreaSqm(face.polygon).toFixed(1)} ㎡`, 'success');
        return;
      }
      const point = snapPoint(world, context).point;
      const points = roomDraftRef.current;
      if (
        points.length >= 3 &&
        distance(points[0]!, point) <= worldTolerance(useUiStore.getState().viewport, 12)
      ) {
        const polygon = cleanPolygon(points);
        if (polygon.length < 3 || polygonAreaSqm(polygon) < 0.3) {
          pushToast('轮廓太小，请重新绘制', 'warning');
          setRoomDraft([]);
          setRoomPreview(null);
          return;
        }
        const room = createRoom(polygon, {
          name: `房间 ${currentDoc.rooms.length + 1}`,
          type: 'other',
          meta: { source: 'manual' },
        });
        room.layerId = resolveVisibleLayerId(currentDoc, 'structure', room.layerId);
        useDocStore.getState().addRoom(room);
        useUiStore.getState().selectOne('room', room.id);
        setRoomDraft([]);
        setRoomPreview(null);
        setSnapMarker(null);
        pushToast(`已生成房间 ${polygonAreaSqm(polygon).toFixed(1)} ㎡`, 'success');
        return;
      }
      if (points.length > 0 && distance(points[points.length - 1]!, point) < 20) return;
      setRoomDraft([...points, point]);
    },
    [buildSnapContext, pushToast],
  );

  const insertOpeningAt = useCallback(
    (world: Point) => {
      const currentDoc = useDocStore.getState().doc;
      const walls = currentDoc.walls.filter((wall) => layerIsInteractive(currentDoc, wall.layerId));
      const hit = nearestWallAt(walls, world, worldTolerance(useUiStore.getState().viewport, 18));
      if (!hit) {
        pushToast('请点击墙体附近放置门窗', 'warning');
        return;
      }
      const params = insertOpeningParams(hit.wall, openingKindRef.current, world);
      const opening = makeOpeningForWall(hit.wall, params.kind, params.offset, params.width);
      opening.layerId = hit.wall.layerId;
      useDocStore.getState().addOpening(opening);
      useUiStore.getState().selectOne('opening', opening.id);
      setOpeningPreview(null);
    },
    [pushToast],
  );

  const insertFurnitureAt = useCallback(
    (world: Point) => {
      const currentDoc = useDocStore.getState().doc;
      const point = snapPoint(world, buildSnapContext()).point;
      const item = placeFurniture(
        pendingFurnitureSkuId,
        point,
        findRoomAt(currentDoc.rooms, point)?.id,
      );
      item.layerId = resolveVisibleLayerId(currentDoc, 'furniture');
      useDocStore.getState().addFurniture(item);
      useUiStore.getState().selectOne('furniture', item.id);
      if (pendingFurnitureSkuId) {
        pushToast(`已放置「${item.name}」`, 'info');
        useUiStore.getState().setPendingFurnitureSku(null);
        useUiStore.getState().setTool('select');
      }
    },
    [buildSnapContext, pendingFurnitureSkuId, pushToast],
  );

  const insertMepAt = useCallback(
    (world: Point) => {
      const kind = MEP_TOOL_KIND[useUiStore.getState().tool];
      if (!kind) return;
      const currentDoc = useDocStore.getState().doc;
      const context = buildSnapContext();
      const walls = currentDoc.walls.filter((wall) => layerIsInteractive(currentDoc, wall.layerId));
      const wallHit = nearestWallAt(
        walls,
        world,
        worldTolerance(useUiStore.getState().viewport, 18),
      );
      const base = wallHit ? wallHit.point : snapPoint(world, context).point;
      const device = createMepDevice({
        kind,
        x: base.x,
        y: base.y,
        roomId: findRoomAt(currentDoc.rooms, base)?.id,
        wallId: wallHit?.wall.id,
        t: wallHit?.t,
      });
      const group = MEP_META[kind].group;
      device.layerId = resolveVisibleLayerId(
        currentDoc,
        group === 'water' ? 'mep-water' : 'mep-electric',
      );
      useDocStore.getState().addMepDevice(device);
      useUiStore.getState().selectOne('mep', device.id);
    },
    [buildSnapContext],
  );

  const measureClick = useCallback(
    (world: Point) => {
      const point = snapPoint(world, buildSnapContext()).point;
      const start = measureStartRef.current;
      if (!start) {
        setMeasureStart(point);
        setMeasureCurrent(point);
        return;
      }
      const lengthMm = distance(start, point);
      if (lengthMm < 10) {
        setMeasureStart(null);
        setMeasureCurrent(null);
        return;
      }
      const currentDoc = useDocStore.getState().doc;
      const annotation = createAnnotation({
        kind: 'dimension',
        points: [start, point],
        text: `${Math.round(lengthMm)} mm`,
        color: colors.subtle,
        fontSize: 20,
      });
      annotation.layerId = resolveVisibleLayerId(currentDoc, 'dimension');
      useDocStore.getState().addAnnotation(annotation);
      setMeasureStart(null);
      setMeasureCurrent(null);
      setSnapMarker(null);
    },
    [buildSnapContext, colors.subtle],
  );

  const openTextDraft = useCallback((world: Point, screen: Point) => {
    setTextDraft({ world, screen, value: '' });
  }, []);

  const commitTextDraft = useCallback(() => {
    const draft = textDraftRef.current;
    setTextDraft(null);
    if (!draft || !draft.value.trim()) return;
    const currentDoc = useDocStore.getState().doc;
    const annotation = createAnnotation({
      kind: 'text',
      points: [draft.world],
      text: draft.value.trim(),
      color: colors.ink,
      fontSize: 20,
    });
    annotation.layerId = resolveVisibleLayerId(currentDoc, 'annotation');
    useDocStore.getState().addAnnotation(annotation);
    useUiStore.getState().selectOne('annotation', annotation.id);
  }, [colors.ink]);

  const calibrateClick = useCallback(
    (world: Point) => {
      const currentDoc = useDocStore.getState().doc;
      if (!currentDoc.reference) {
        pushToast('请先导入底图，再校准比例', 'warning', '导入入口在左侧「导入」面板');
        return;
      }
      const point = snapPoint(world, buildSnapContext()).point;
      const current = calibrationRef.current;
      if (!current.a) {
        setCalibration({ a: point, b: null });
        return;
      }
      if (!current.b) {
        setCalibration({ a: current.a, b: point });
      } else {
        setCalibration({ a: point, b: null });
      }
    },
    [buildSnapContext, pushToast],
  );

  const confirmCalibration = useCallback(
    (knownMm: number) => {
      const currentDoc = useDocStore.getState().doc;
      const reference = currentDoc.reference;
      const { a, b } = calibrationRef.current;
      if (!reference || !a || !b) {
        setCalibration({ a: null, b: null });
        return;
      }
      const result = computeCalibration({ reference, a, b, knownMm });
      if (!result) {
        pushToast('校准失败：线段太短或长度无效', 'error');
        return;
      }
      useDocStore.getState().updateReference({
        mmPerPx: result.mmPerPx,
        offset: result.offset,
        calibrated: true,
        calibrationSource: 'manual',
      });
      setCalibration({ a: null, b: null });
      setCalibrationPointer(null);
      pushToast('底图比例已校准', 'success', `1 px = ${result.mmPerPx.toFixed(2)} mm`);
      useUiStore.getState().setTool('select');
    },
    [pushToast],
  );

  const selectAllInteractive = useCallback(() => {
    const currentDoc = useDocStore.getState().doc;
    const interactive = new Set(
      currentDoc.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id),
    );
    const furnitureIds = currentDoc.furniture
      .filter((item) => interactive.has(item.layerId))
      .map((item) => item.id);
    if (furnitureIds.length > 0) {
      useUiStore.getState().setSelection('furniture', furnitureIds);
      return;
    }
    const wallIds = currentDoc.walls
      .filter((wall) => interactive.has(wall.layerId))
      .map((wall) => wall.id);
    if (wallIds.length > 0) {
      useUiStore.getState().setSelection('wall', wallIds);
    }
  }, []);

  /* ----- Select-tool interaction start ----- */

  const startHandleInteraction = useCallback(
    (handle: ReturnType<typeof selectionHandles>[number], world: Point) => {
      const currentDoc = useDocStore.getState().doc;
      const currentSelection = useUiStore.getState().selection;
      if (handle.type === 'rotate') {
        const item = currentDoc.furniture.find((entry) => entry.id === currentSelection.ids[0]);
        if (!item) return;
        interactionRef.current = {
          mode: 'rotate',
          id: item.id,
          startItem: item,
          startPointerAngle: angleOf({ x: item.x, y: item.y }, world),
          startRotation: item.rotation,
          startScreen: { x: 0, y: 0 },
          moved: false,
        };
        return;
      }
      if (handle.type === 'resize') {
        const item = currentDoc.furniture.find((entry) => entry.id === currentSelection.ids[0]);
        if (!item) return;
        interactionRef.current = {
          mode: 'resize',
          id: item.id,
          corner: handle.corner,
          startItem: item,
          startScreen: { x: 0, y: 0 },
          moved: false,
        };
        return;
      }
      const wall = currentDoc.walls.find((entry) => entry.id === currentSelection.ids[0]);
      if (!wall) return;
      interactionRef.current = {
        mode: 'wall-vertex',
        id: wall.id,
        end: handle.wallEnd,
        startScreen: { x: 0, y: 0 },
        moved: false,
      };
    },
    [],
  );

  const startSelect = useCallback(
    (screen: Point, world: Point, shiftKey: boolean) => {
      const currentDoc = useDocStore.getState().doc;
      const currentViewport = useUiStore.getState().viewport;
      const currentSelection = useUiStore.getState().selection;
      const handles = selectionHandles(currentDoc, currentSelection, 1 / currentViewport.scale);
      const handle = hitTestHandle(handles, world, 10 / currentViewport.scale);
      if (handle) {
        startHandleInteraction(handle, world);
        return;
      }

      const hit = hitTestPoint(
        currentDoc,
        currentDoc.layers,
        world,
        worldTolerance(currentViewport, 8),
      );
      if (!hit) {
        if (!shiftKey) useUiStore.getState().clearSelection();
        interactionRef.current = {
          mode: 'marquee',
          from: world,
          to: world,
          additive: shiftKey,
          startScreen: screen,
        };
        setMarquee({ from: world, to: world });
        return;
      }

      if (shiftKey) {
        useUiStore.getState().toggleSelection(hit.kind, hit.id);
      } else if (!(currentSelection.kind === hit.kind && currentSelection.ids.includes(hit.id))) {
        useUiStore.getState().selectOne(hit.kind, hit.id);
      }

      const selectionNow = useUiStore.getState().selection;
      if (hit.kind === 'furniture') {
        const item = currentDoc.furniture.find((entry) => entry.id === hit.id);
        if (!item || item.locked) return;
        const ids = selectionNow.kind === 'furniture' ? selectionNow.ids : [hit.id];
        const items = currentDoc.furniture.filter((entry) => ids.includes(entry.id));
        interactionRef.current = {
          mode: 'move',
          ids,
          startWorld: world,
          startScreen: screen,
          startPositions: new Map(items.map((entry) => [entry.id, { x: entry.x, y: entry.y }])),
          startBox: boundsOfItems(items),
          moved: false,
        };
        return;
      }
      if (hit.kind === 'mep') {
        const ids = selectionNow.kind === 'mep' ? selectionNow.ids : [hit.id];
        const devices = currentDoc.mep.devices.filter((entry) => ids.includes(entry.id));
        interactionRef.current = {
          mode: 'mep-move',
          ids,
          startWorld: world,
          startScreen: screen,
          positions: new Map(devices.map((entry) => [entry.id, { x: entry.x, y: entry.y }])),
          moved: false,
        };
        return;
      }
      if (hit.kind === 'room') {
        const ids = selectionNow.kind === 'room' ? selectionNow.ids : [hit.id];
        const rooms = currentDoc.rooms.filter((entry) => ids.includes(entry.id));
        interactionRef.current = {
          mode: 'room-move',
          ids,
          startWorld: world,
          startScreen: screen,
          polygons: new Map(
            rooms.map((entry) => [entry.id, entry.polygon.map((point) => ({ ...point }))]),
          ),
          moved: false,
        };
        return;
      }
      if (hit.kind === 'annotation') {
        const ids = selectionNow.kind === 'annotation' ? selectionNow.ids : [hit.id];
        const annotations = currentDoc.annotations.filter((entry) => ids.includes(entry.id));
        interactionRef.current = {
          mode: 'annotation-move',
          ids,
          startWorld: world,
          startScreen: screen,
          points: new Map(
            annotations.map((entry) => [entry.id, entry.points.map((point) => ({ ...point }))]),
          ),
          moved: false,
        };
        return;
      }
      if (hit.kind === 'opening') {
        const opening = currentDoc.openings.find((entry) => entry.id === hit.id);
        const wall = opening
          ? currentDoc.walls.find((entry) => entry.id === opening.wallId)
          : undefined;
        if (!opening || !wall) return;
        interactionRef.current = {
          mode: 'opening-drag',
          id: opening.id,
          startOpening: opening,
          wall,
          startScreen: screen,
          moved: false,
        };
      }
    },
    [startHandleInteraction],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button === 2) return;
      setCollisionDismissed(false);
      setContextMenu(null);
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      const { screen, world } = pointerFromEvent(event);
      const currentTool = useUiStore.getState().tool;
      const isPan = event.button === 1 || spaceRef.current || currentTool === 'pan';
      if (isPan) {
        interactionRef.current = {
          mode: 'pan',
          startScreen: screen,
          startViewport: useUiStore.getState().viewport,
        };
        return;
      }
      switch (currentTool) {
        case 'select':
          startSelect(screen, world, event.shiftKey);
          break;
        case 'wall':
          placeWallPoint(world, event.shiftKey);
          break;
        case 'door':
        case 'window':
        case 'sliding':
          insertOpeningAt(world);
          break;
        case 'room':
          placeRoomPoint(world);
          break;
        case 'furniture':
          insertFurnitureAt(world);
          break;
        case 'measure':
          measureClick(world);
          break;
        case 'text':
          // handled on pointerup: the pointer click's default focus change would
          // immediately blur an input created during pointerdown.
          break;
        case 'calibrate':
          calibrateClick(world);
          break;
        default:
          insertMepAt(world);
          break;
      }
    },
    [
      calibrateClick,
      insertFurnitureAt,
      insertMepAt,
      insertOpeningAt,
      measureClick,
      placeRoomPoint,
      placeWallPoint,
      pointerFromEvent,
      startSelect,
    ],
  );

  /* ----- Pointer move ----- */

  const updateHover = useCallback((world: Point) => {
    const currentDoc = useDocStore.getState().doc;
    const currentViewport = useUiStore.getState().viewport;
    const hit = hitTestPoint(
      currentDoc,
      currentDoc.layers,
      world,
      worldTolerance(currentViewport, 8),
    );
    setHover((previous) =>
      previous?.id === hit?.id && previous?.kind === hit?.kind ? previous : hit,
    );
    if (useUiStore.getState().hoverId !== (hit?.id ?? null)) {
      useUiStore.getState().setHoverId(hit?.id ?? null);
    }
    setSnapMarker(null);
    setDraftPreview(null);
    setOpeningPreview(null);
    setRoomPreview(null);
    setGuides((previous) => (previous.length === 0 ? previous : []));
  }, []);

  const updateToolPreview = useCallback(
    (currentTool: ToolId, world: Point, shiftKey: boolean) => {
      const currentViewport = useUiStore.getState().viewport;
      if (currentTool === 'wall') {
        const points = wallDraftRef.current;
        if (points.length === 0) {
          setDraftPreview(null);
          setSnapMarker(null);
          return;
        }
        const result = snapDrawingPoint(
          points[points.length - 1]!,
          world,
          buildSnapContext(),
          shiftKey ? 0 : 15,
        );
        setDraftPreview(result.point);
        setSnapMarker(result.point);
        setGuides(result.guides);
        return;
      }
      if (currentTool === 'room') {
        if (roomModeRef.current === 'draw' && roomDraftRef.current.length > 0) {
          const snapped = snapPoint(world, buildSnapContext());
          setRoomPreview(snapped.point);
          setSnapMarker(snapped.point);
        } else {
          setRoomPreview(null);
          setSnapMarker(null);
        }
        return;
      }
      if (currentTool === 'measure') {
        if (measureStartRef.current) {
          const snapped = snapPoint(world, buildSnapContext());
          setMeasureCurrent(snapped.point);
          setSnapMarker(snapped.point);
        }
        return;
      }
      if (currentTool === 'door' || currentTool === 'window' || currentTool === 'sliding') {
        const currentDoc = useDocStore.getState().doc;
        const walls = currentDoc.walls.filter((wall) =>
          layerIsInteractive(currentDoc, wall.layerId),
        );
        const hit = nearestWallAt(walls, world, worldTolerance(currentViewport, 18));
        if (!hit) {
          setOpeningPreview(null);
          return;
        }
        const params = insertOpeningParams(hit.wall, openingKindRef.current, world);
        setOpeningPreview({
          wall: hit.wall,
          opening: createOpening(hit.wall, params.kind, params.offset, params.width),
        });
        return;
      }
      if (currentTool === 'calibrate') {
        const snapped = snapPoint(world, buildSnapContext());
        setCalibrationPointer(snapped.point);
        setSnapMarker(calibrationRef.current.a ? snapped.point : null);
        return;
      }
      // furniture / text / mep: show the snap marker only
      const snapped = snapPoint(world, buildSnapContext());
      setSnapMarker(snapped.kind ? snapped.point : null);
      setOpeningPreview(null);
    },
    [buildSnapContext],
  );

  const moveThresholdReached = useCallback(
    (interaction: { startScreen: Point; moved: boolean }, screen: Point) => {
      if (interaction.moved) return true;
      const screenDistance = Math.hypot(
        screen.x - interaction.startScreen.x,
        screen.y - interaction.startScreen.y,
      );
      if (screenDistance < 3) return false;
      interaction.moved = true;
      ensureGesture();
      return true;
    },
    [ensureGesture],
  );

  const handleInteractionMove = useCallback(
    (interaction: Interaction, screen: Point, world: Point, shiftKey: boolean) => {
      if (interaction.mode === 'pan') {
        setViewport({
          scale: interaction.startViewport.scale,
          x: interaction.startViewport.x + (screen.x - interaction.startScreen.x),
          y: interaction.startViewport.y + (screen.y - interaction.startScreen.y),
        });
        return;
      }
      if (interaction.mode === 'marquee') {
        interaction.to = world;
        setMarquee({ from: interaction.from, to: world });
        return;
      }
      if (!moveThresholdReached(interaction, screen)) return;

      switch (interaction.mode) {
        case 'move': {
          const currentDoc = useDocStore.getState().doc;
          let dx = world.x - interaction.startWorld.x;
          let dy = world.y - interaction.startWorld.y;
          let nextGuides: SnapGuide[] = [];
          if (currentDoc.settings.snapEnabled) {
            const movingBox = {
              x: interaction.startBox.x + dx,
              y: interaction.startBox.y + dy,
              w: interaction.startBox.w,
              h: interaction.startBox.h,
            };
            const others = currentDoc.furniture
              .filter((item) => !interaction.ids.includes(item.id))
              .map(footprintBBox);
            const snapped = snapDragBounds(movingBox, others, {
              enabled: true,
              gridSize: currentDoc.settings.gridSize,
              tolerance: worldTolerance(useUiStore.getState().viewport, 8),
            });
            dx += snapped.dx;
            dy += snapped.dy;
            nextGuides = snapped.guides;
          }
          setGuides(nextGuides);
          useDocStore.getState().commit((draft) => {
            for (const item of draft.furniture) {
              if (!interaction.ids.includes(item.id)) continue;
              const start = interaction.startPositions.get(item.id);
              if (!start) continue;
              item.x = start.x + dx;
              item.y = start.y + dy;
              item.roomId = findRoomAt(draft.rooms, { x: item.x, y: item.y })?.id;
            }
          });
          return;
        }
        case 'rotate': {
          const rotation = rotationFromPointer(
            interaction.startItem,
            world,
            interaction.startPointerAngle,
            interaction.startRotation,
            shiftKey ? 15 : 0,
          );
          useDocStore.getState().commit((draft) => {
            const item = draft.furniture.find((entry) => entry.id === interaction.id);
            if (item) item.rotation = rotation;
          });
          return;
        }
        case 'resize': {
          const resized = resizeFurnitureFromCorner(
            interaction.startItem,
            interaction.corner,
            world,
            {
              preserveAspect: shiftKey,
            },
          );
          useDocStore.getState().commit((draft) => {
            const item = draft.furniture.find((entry) => entry.id === interaction.id);
            if (!item) return;
            item.x = resized.x;
            item.y = resized.y;
            item.w = resized.w;
            item.d = resized.d;
          });
          return;
        }
        case 'wall-vertex': {
          const snapped = snapPoint(world, buildSnapContext([interaction.id]));
          setSnapMarker(snapped.point);
          useDocStore.getState().commit((draft) => {
            const wall = draft.walls.find((entry) => entry.id === interaction.id);
            if (!wall) return;
            wall[interaction.end] = { ...snapped.point };
            for (const opening of draft.openings) {
              if (opening.wallId !== wall.id) continue;
              const clamped = clampOpeningToWall(wall, opening);
              opening.offset = clamped.offset;
              opening.width = clamped.width;
            }
          });
          return;
        }
        case 'opening-drag': {
          const offset = offsetForPointerOnWall(interaction.wall, interaction.startOpening, world);
          useDocStore.getState().commit((draft) => {
            const opening = draft.openings.find((entry) => entry.id === interaction.id);
            if (opening) opening.offset = offset;
          });
          return;
        }
        case 'room-move': {
          const dx = world.x - interaction.startWorld.x;
          const dy = world.y - interaction.startWorld.y;
          useDocStore.getState().commit((draft) => {
            for (const room of draft.rooms) {
              if (!interaction.ids.includes(room.id)) continue;
              const polygon = interaction.polygons.get(room.id);
              if (!polygon) continue;
              room.polygon = polygon.map((point) => ({ x: point.x + dx, y: point.y + dy }));
            }
          });
          return;
        }
        case 'mep-move': {
          const dx = world.x - interaction.startWorld.x;
          const dy = world.y - interaction.startWorld.y;
          useDocStore.getState().commit((draft) => {
            for (const device of draft.mep.devices) {
              if (!interaction.ids.includes(device.id)) continue;
              const start = interaction.positions.get(device.id);
              if (!start) continue;
              device.x = start.x + dx;
              device.y = start.y + dy;
            }
          });
          return;
        }
        case 'annotation-move': {
          const dx = world.x - interaction.startWorld.x;
          const dy = world.y - interaction.startWorld.y;
          useDocStore.getState().commit((draft) => {
            for (const annotation of draft.annotations) {
              if (!interaction.ids.includes(annotation.id)) continue;
              const points = interaction.points.get(annotation.id);
              if (!points) continue;
              annotation.points = points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
            }
          });
          return;
        }
        default:
          return;
      }
    },
    [buildSnapContext, moveThresholdReached, setViewport],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const { screen, world } = pointerFromEvent(event);
      setCursorWorld(world);
      const interaction = interactionRef.current;
      if (interaction) {
        handleInteractionMove(interaction, screen, world, event.shiftKey);
        return;
      }
      const currentTool = useUiStore.getState().tool;
      if (currentTool === 'select') {
        updateHover(world);
        return;
      }
      updateToolPreview(currentTool, world, event.shiftKey);
    },
    [handleInteractionMove, pointerFromEvent, updateHover, updateToolPreview],
  );

  const finalizeMarquee = useCallback((interaction: Extract<Interaction, { mode: 'marquee' }>) => {
    const currentDoc = useDocStore.getState().doc;
    const interactive = new Set(
      currentDoc.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id),
    );
    const visibleDoc = {
      ...currentDoc,
      furniture: currentDoc.furniture.filter((item) => interactive.has(item.layerId)),
      walls: currentDoc.walls.filter((wall) => interactive.has(wall.layerId)),
      rooms: currentDoc.rooms.filter((room) => interactive.has(room.layerId)),
    };
    const furnitureIds = furnitureInBox(visibleDoc, interaction.from, interaction.to);
    const wallIds =
      furnitureIds.length === 0 ? wallsInBox(visibleDoc, interaction.from, interaction.to) : [];
    const roomIds =
      furnitureIds.length === 0 && wallIds.length === 0
        ? roomsInBox(visibleDoc, interaction.from, interaction.to)
        : [];
    const kind = furnitureIds.length
      ? 'furniture'
      : wallIds.length
        ? 'wall'
        : roomIds.length
          ? 'room'
          : null;
    if (!kind) return;
    const ids = kind === 'furniture' ? furnitureIds : kind === 'wall' ? wallIds : roomIds;
    const currentSelection = useUiStore.getState().selection;
    if (interaction.additive && currentSelection.kind === kind) {
      const merged = [...new Set([...currentSelection.ids, ...ids])];
      useUiStore.getState().setSelection(kind, merged);
    } else {
      useUiStore.getState().setSelection(kind, ids);
    }
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      const interaction = interactionRef.current;
      interactionRef.current = null;
      if (!interaction) {
        if (useUiStore.getState().tool === 'text' && !textDraftRef.current) {
          const { screen, world } = pointerFromEvent(event);
          openTextDraft(world, screen);
        }
        return;
      }
      if (interaction.mode === 'marquee') {
        const moved =
          Math.hypot(interaction.to.x - interaction.from.x, interaction.to.y - interaction.from.y) >
          2;
        if (moved) finalizeMarquee(interaction);
      }
      if (interaction.mode === 'move' && interaction.moved) {
        reportCollisions(interaction.ids);
      }
      endGestureIfActive();
      setMarquee(null);
      setGuides([]);
      setSnapMarker(null);
    },
    [endGestureIfActive, finalizeMarquee, openTextDraft, pointerFromEvent, reportCollisions],
  );

  const handlePointerLeave = useCallback(() => {
    if (interactionRef.current) return;
    setHover(null);
    useUiStore.getState().setHoverId(null);
    setDraftPreview(null);
    setOpeningPreview(null);
    setRoomPreview(null);
    setSnapMarker(null);
    setGuides([]);
    setCursorWorld(null);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (useUiStore.getState().tool === 'wall') {
      finishWallChain();
      return;
    }
    if (useUiStore.getState().tool === 'pan') fitToView();
  }, [finishWallChain, fitToView]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (wallDraftRef.current.length > 0) {
        finishWallChain();
        return;
      }
      const { screen, world } = pointerFromEvent(event);
      const currentDoc = useDocStore.getState().doc;
      const hit = hitTestPoint(
        currentDoc,
        currentDoc.layers,
        world,
        worldTolerance(useUiStore.getState().viewport, 8),
      );
      if (hit) useUiStore.getState().selectOne(hit.kind, hit.id);
      setContextMenu({
        x: Math.min(screen.x, Math.max(8, sizeRef.current.width - 196)),
        y: Math.min(screen.y, Math.max(8, sizeRef.current.height - 200)),
      });
    },
    [finishWallChain, pointerFromEvent],
  );

  /* ----- Keyboard ----- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        const result = duplicateSelection();
        if (result.blocked > 0) pushToast('图层已锁定，无法复制', 'warning');
        return;
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAllInteractive();
        return;
      }
      if (meta && event.key === '0') {
        event.preventDefault();
        fitToView();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        const result = deleteSelection();
        if (result.message) pushToast(result.message, 'warning');
        return;
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? 100 : 10;
        if (event.key === 'ArrowLeft') nudgeSelection(-step, 0);
        if (event.key === 'ArrowRight') nudgeSelection(step, 0);
        if (event.key === 'ArrowUp') nudgeSelection(0, -step);
        if (event.key === 'ArrowDown') nudgeSelection(0, step);
        return;
      }
      if (event.key === 'Enter') {
        if (wallDraftRef.current.length > 0) {
          event.preventDefault();
          finishWallChain();
          return;
        }
        if (roomDraftRef.current.length >= 3) {
          event.preventDefault();
          const polygon = cleanPolygon(roomDraftRef.current);
          if (polygon.length >= 3 && polygonAreaSqm(polygon) >= 0.3) {
            const currentDoc = useDocStore.getState().doc;
            const room = createRoom(polygon, {
              name: `房间 ${currentDoc.rooms.length + 1}`,
              type: 'other',
            });
            room.layerId = resolveVisibleLayerId(currentDoc, 'structure', room.layerId);
            useDocStore.getState().addRoom(room);
            useUiStore.getState().selectOne('room', room.id);
          }
          setRoomDraft([]);
          setRoomPreview(null);
          return;
        }
      }
      if (event.key === 'Escape') {
        cancelDrafts();
        return;
      }
      if (!meta && !event.altKey) {
        const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()];
        if (shortcut) {
          event.preventDefault();
          useUiStore.getState().setTool(shortcut);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelDrafts, finishWallChain, fitToView, pushToast, selectAllInteractive]);

  /* ----- Derived render data ----- */

  const orderedLayers = useMemo(
    () => [...doc.layers].sort((first, second) => first.order - second.order),
    [doc.layers],
  );

  const handleList = useMemo(
    () => selectionHandles(doc, selection, 1 / Math.max(viewport.scale, 0.001)),
    [doc, selection, viewport.scale],
  );

  const collisionPairs = useMemo(() => findFurnitureCollisions(doc.furniture), [doc.furniture]);
  const selectedFurnitureIds = useMemo(
    () => (selection.kind === 'furniture' ? selection.ids : []),
    [selection],
  );
  const collisionItems = useMemo(() => {
    if (selectedFurnitureIds.length === 0) return [];
    const items = new Map<string, FurnitureItem>();
    for (const pair of collisionPairs) {
      if (!selectedFurnitureIds.includes(pair.a.id) && !selectedFurnitureIds.includes(pair.b.id)) {
        continue;
      }
      items.set(pair.a.id, pair.a);
      items.set(pair.b.id, pair.b);
    }
    return [...items.values()];
  }, [collisionPairs, selectedFurnitureIds]);
  const collisionSummary = collisionItems.length > 0 ? collisionSummaryText(collisionPairs) : null;

  const emptyPlan =
    doc.walls.length === 0 &&
    doc.rooms.length === 0 &&
    doc.furniture.length === 0 &&
    !doc.reference;

  const contextMenuItems: ContextMenuItem[] = contextMenu ? buildContextMenuItems(selection) : [];

  function buildContextMenuItems(currentSelection: typeof selection): ContextMenuItem[] {
    if (currentSelection.kind === 'none' || currentSelection.ids.length === 0) {
      return [
        {
          label: '适应窗口',
          shortcut: '⌘0',
          onSelect: fitToView,
        },
        {
          label: '识别房间',
          icon: <CONTEXT_ICONS.Copy size={12} />,
          onSelect: autoCreateRooms,
        },
        {
          label: '全选家具',
          shortcut: '⌘A',
          onSelect: selectAllInteractive,
        },
      ];
    }
    return [
      {
        label: '复制',
        shortcut: '⌘D',
        icon: <CONTEXT_ICONS.Copy size={12} />,
        onSelect: () => duplicateSelection(),
      },
      {
        label: '删除',
        shortcut: 'Del',
        icon: <CONTEXT_ICONS.Trash2 size={12} />,
        danger: true,
        onSelect: () => {
          const result = deleteSelection();
          if (result.message) pushToast(result.message, 'warning');
        },
      },
      {
        label: currentSelection.kind === 'furniture' ? '锁定/解锁' : '锁定所在图层',
        icon: <CONTEXT_ICONS.Lock size={12} />,
        onSelect: () => {
          const result = toggleSelectionLock();
          if (result.message) pushToast(result.message, 'info');
        },
      },
      {
        label: '置于顶层',
        icon: <CONTEXT_ICONS.ArrowUpToLine size={12} />,
        onSelect: () => bringSelectionToFront(),
      },
      {
        label: '置于底层',
        icon: <CONTEXT_ICONS.ArrowDownToLine size={12} />,
        onSelect: () => sendSelectionToBack(),
      },
    ];
  }

  const cursor =
    spaceDown || tool === 'pan'
      ? 'grab'
      : tool === 'select'
        ? hover
          ? 'pointer'
          : 'default'
        : 'crosshair';

  const calibrationWorldLength =
    calibration.a && calibration.b ? distance(calibration.a, calibration.b) : 0;
  const calibrationPixelLength = calibrationWorldLength / (doc.reference?.mmPerPx ?? 1);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="2D 平面编辑器"
      className={cn('absolute inset-0 overflow-hidden bg-[var(--canvas-backdrop)]')}
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <span className="sr-only" role="img" aria-label="户型平面预览" />

      {size.width > 1 && size.height > 1 ? (
        <Stage width={size.width} height={size.height} listening={false}>
          <WorldLayers
            doc={doc}
            orderedLayers={orderedLayers}
            colors={colors}
            viewport={viewport}
            size={size}
            showGrid={doc.settings.showGrid}
            showDimensions={doc.settings.showDimensions}
            underlayImage={underlayImage}
          />
          <EditorOverlay
            doc={doc}
            colors={colors}
            viewport={viewport}
            zoom={viewport.scale}
            selection={selection}
            handles={handleList}
            hover={hover}
            wallDraft={wallDraft.length > 0 ? { points: wallDraft, preview: draftPreview } : null}
            roomDraft={roomDraft}
            roomPreview={roomPreview}
            measureDraft={measureStart ? { start: measureStart, current: measureCurrent } : null}
            calibrationDraft={
              calibration.a || calibration.b
                ? { a: calibration.a, b: calibration.b ?? calibrationPointer }
                : null
            }
            marquee={marquee}
            guides={guides}
            snapMarker={snapMarker}
            openingPreview={openingPreview}
            collisionItems={collisionItems}
          />
        </Stage>
      ) : null}

      <EditorToolbar
        tool={tool}
        pendingFurnitureLabel={
          pendingFurnitureSkuId ? resolveFurniturePreset(pendingFurnitureSkuId).name : null
        }
        onClearPendingFurniture={() => useUiStore.getState().setPendingFurnitureSku(null)}
        openingKind={openingKind}
        roomMode={roomMode}
        onOpeningKindChange={handleOpeningKindChange}
        onRoomModeChange={handleRoomModeChange}
        onAutoRooms={autoCreateRooms}
        autoRoomsDisabled={doc.walls.length === 0}
      />

      {emptyPlan && tool === 'select' ? (
        <EmptyPlanOverlay
          onImport={() => useUiStore.getState().setLeftPanel('import')}
          onDrawWalls={() => useUiStore.getState().setTool('wall')}
          onAutoRooms={autoCreateRooms}
          hasWalls={doc.walls.length > 0}
        />
      ) : null}

      <EditorHintBar
        tool={tool}
        cursor={cursorWorld}
        zoom={viewport.scale}
        layerCount={doc.layers.length}
      />
      <ScaleBar zoom={viewport.scale} />

      {collisionSummary && !collisionDismissed ? (
        <CollisionBar summary={collisionSummary} onDismiss={() => setCollisionDismissed(true)} />
      ) : null}

      {calibration.a && calibration.b ? (
        <CalibrationCard
          defaultMm={Math.max(100, Math.round(calibrationWorldLength))}
          pixelLength={calibrationPixelLength}
          onConfirm={confirmCalibration}
          onCancel={() => setCalibration({ a: null, b: null })}
        />
      ) : null}

      {textDraft ? (
        <TextAnnotationInput
          x={textDraft.screen.x}
          y={textDraft.screen.y}
          value={textDraft.value}
          onChange={(value) => setTextDraft((draft) => (draft ? { ...draft, value } : draft))}
          onCommit={commitTextDraft}
          onCancel={() => setTextDraft(null)}
        />
      ) : null}

      {contextMenu ? (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
