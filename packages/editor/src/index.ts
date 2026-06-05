import type {
  Bounds,
  GeometryDocument,
  GeometryNode,
  InsertPatch,
  LineNode,
  NodeId,
  NodeStyle,
  PathNode,
  Point,
  PolygonNode,
  RectNode,
  Segment,
  UpdatePatch
} from "@glyphsmith/ast";

export type Tool = "select" | "rect" | "ellipse" | "triangle" | "path";
export type PathSegmentMode = "line" | "quadratic" | "cubic" | "arc";

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type RenderOptions = {
  selectedNodeIds?: NodeId[];
  background?: string;
  pixelRatio?: number;
  showEditHandles?: boolean;
};

export type HitTestOptions = {
  tolerance?: number;
};

export type EditHandleKind =
  | "bbox-top-left"
  | "bbox-top"
  | "bbox-top-right"
  | "bbox-right"
  | "bbox-bottom-right"
  | "bbox-bottom"
  | "bbox-bottom-left"
  | "bbox-left"
  | "rect-top-left"
  | "rect-top-right"
  | "rect-bottom-right"
  | "rect-bottom-left"
  | "line-start"
  | "line-end"
  | "path-start"
  | "path-segment-end"
  | "path-quadratic-control"
  | "path-cubic-control-1"
  | "path-cubic-control-2"
  | "ellipse-left"
  | "ellipse-top"
  | "ellipse-right"
  | "ellipse-bottom"
  | "polygon-point";

export type EditHandle = {
  nodeId: NodeId;
  kind: EditHandleKind;
  point: Point;
  segmentIndex?: number;
  pointIndex?: number;
};

export type SnapPoint = {
  nodeId: NodeId;
  point: Point;
};

export const defaultStyle: NodeStyle = {
  fill: "none",
  stroke: "#111827",
  strokeWidth: 2
};

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom
  };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y
  };
}

export function panViewport(viewport: Viewport, delta: Point): Viewport {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y
  };
}

export function zoomViewportAtPoint(
  viewport: Viewport,
  screenPoint: Point,
  nextZoom: number
): Viewport {
  const zoom = clamp(nextZoom, 0.1, 8);
  const worldPoint = screenToWorld(screenPoint, viewport);

  return {
    x: screenPoint.x - worldPoint.x * zoom,
    y: screenPoint.y - worldPoint.y * zoom,
    zoom
  };
}

export function fitViewportToDocument(
  document: GeometryDocument,
  viewportSize: ViewportSize,
  padding = 48
): Viewport {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const zoom = clamp(
    Math.min(availableWidth / document.width, availableHeight / document.height),
    0.1,
    8
  );

  return {
    x: (viewportSize.width - document.width * zoom) / 2,
    y: (viewportSize.height - document.height * zoom) / 2,
    zoom
  };
}

export function renderDocument(
  context: CanvasRenderingContext2D,
  document: GeometryDocument,
  viewport: Viewport,
  options: RenderOptions = {}
): void {
  const canvas = context.canvas;
  const pixelRatio = options.pixelRatio ?? 1;
  const width = canvas.width / pixelRatio;
  const height = canvas.height / pixelRatio;

  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = options.background ?? "#f8fafc";
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  context.setTransform(
    viewport.zoom * pixelRatio,
    0,
    0,
    viewport.zoom * pixelRatio,
    viewport.x * pixelRatio,
    viewport.y * pixelRatio
  );
  drawPage(context, document);

  for (const child of document.root.children) {
    drawNode(context, child);
  }

  context.restore();

  for (const nodeId of options.selectedNodeIds ?? []) {
    const bounds = getNodeBounds(document, nodeId);

    if (bounds) {
      drawSelection(context, bounds, viewport, pixelRatio);
    }
  }

  if (options.showEditHandles) {
    drawEditHandles(context, getEditHandles(document, options.selectedNodeIds ?? []), viewport, pixelRatio);
  }
}

export function hitTest(
  document: GeometryDocument,
  point: Point,
  options: HitTestOptions = {}
): NodeId | undefined {
  const tolerance = options.tolerance ?? 6;

  for (let index = document.root.children.length - 1; index >= 0; index -= 1) {
    const hit = hitTestNode(document.root.children[index], point, tolerance);

    if (hit) {
      return hit;
    }
  }

  return undefined;
}

export function createRectInsertPatch(input: {
  id: NodeId;
  parentId?: NodeId;
  start: Point;
  end: Point;
  style?: NodeStyle;
}): InsertPatch {
  const bounds = normalizeBounds(input.start, input.end);

  return {
    op: "insert",
    parentId: input.parentId ?? "root",
    node: {
      id: input.id,
      type: "rect",
      name: "Rectangle",
      ...bounds,
      style: input.style ?? defaultStyle
    }
  };
}

export function createEllipseInsertPatch(input: {
  id: NodeId;
  parentId?: NodeId;
  start: Point;
  end: Point;
  style?: NodeStyle;
}): InsertPatch {
  const bounds = normalizeBounds(input.start, input.end);

  return {
    op: "insert",
    parentId: input.parentId ?? "root",
    node: {
      id: input.id,
      type: "ellipse",
      name: "Ellipse",
      cx: bounds.x + bounds.width / 2,
      cy: bounds.y + bounds.height / 2,
      rx: bounds.width / 2,
      ry: bounds.height / 2,
      style: input.style ?? defaultStyle
    }
  };
}

export function createTriangleInsertPatch(input: {
  id: NodeId;
  parentId?: NodeId;
  start: Point;
  end: Point;
  style?: NodeStyle;
}): InsertPatch {
  return {
    op: "insert",
    parentId: input.parentId ?? "root",
    node: {
      id: input.id,
      type: "polygon",
      name: "Triangle",
      points: trianglePointsFromBounds(input.start, input.end),
      style: input.style ?? defaultStyle
    }
  };
}

export function trianglePointsFromBounds(start: Point, end: Point): Point[] {
  const bounds = normalizeBounds(start, end);

  return [
    { x: bounds.x + bounds.width / 2, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height }
  ];
}

export function createLineInsertPatch(input: {
  id: NodeId;
  parentId?: NodeId;
  start: Point;
  end: Point;
  style?: NodeStyle;
}): InsertPatch {
  return {
    op: "insert",
    parentId: input.parentId ?? "root",
    node: {
      id: input.id,
      type: "line",
      name: "Line",
      x1: input.start.x,
      y1: input.start.y,
      x2: input.end.x,
      y2: input.end.y,
      style: input.style ?? defaultStyle
    }
  };
}

export function createLinePathInsertPatch(input: {
  id: NodeId;
  parentId?: NodeId;
  start: Point;
  end: Point;
  segmentMode?: PathSegmentMode;
  style?: NodeStyle;
}): InsertPatch {
  return {
    op: "insert",
    parentId: input.parentId ?? "root",
    node: {
      id: input.id,
      type: "path",
      name: "Path",
      start: input.start,
      closed: false,
      segments: [createSegment(input.start, input.end, input.segmentMode ?? "line")],
      style: input.style ?? defaultStyle
    }
  };
}

export function createAppendPathSegmentPatch(
  document: GeometryDocument,
  nodeId: NodeId,
  end: Point,
  segmentMode: PathSegmentMode
): UpdatePatch | undefined {
  const node = findNodeInTree(document.root, nodeId);

  if (!node || node.type !== "path") {
    return undefined;
  }

  const start = getPathEndPoint(node);

  return {
    op: "update",
    target: nodeId,
    changes: {
      segments: [...node.segments, createSegment(start, end, segmentMode)]
    }
  };
}

export function createAppendLineSegmentPatch(
  document: GeometryDocument,
  nodeId: NodeId,
  end: Point
): UpdatePatch | undefined {
  return createAppendPathSegmentPatch(document, nodeId, end, "line");
}

export function createPathClosedUpdatePatch(
  document: GeometryDocument,
  nodeId: NodeId,
  closed: boolean
): UpdatePatch | undefined {
  const node = findNodeInTree(document.root, nodeId);

  if (!node || node.type !== "path") {
    return undefined;
  }

  return {
    op: "update",
    target: nodeId,
    changes: {
      closed
    }
  };
}

export function getNodeBounds(document: GeometryDocument, nodeId: NodeId): Bounds | undefined {
  return getNodeBoundsInTree(document.root, nodeId);
}

export function getEditHandles(document: GeometryDocument, nodeIds: NodeId[]): EditHandle[] {
  return nodeIds.flatMap((nodeId) => {
    const node = findNodeInTree(document.root, nodeId);

    if (!node) {
      return [];
    }

    return handlesForNode(node);
  });
}

export function hitTestEditHandle(
  document: GeometryDocument,
  nodeIds: NodeId[],
  point: Point,
  tolerance: number
): EditHandle | undefined {
  const handles = getEditHandles(document, nodeIds);

  for (let index = handles.length - 1; index >= 0; index -= 1) {
    const handle = handles[index];

    if (handle && distance(handle.point, point) <= tolerance) {
      return handle;
    }
  }

  return undefined;
}

export function getSnapPoints(document: GeometryDocument): SnapPoint[] {
  return snapPointsForNode(document.root);
}

export function snapPointToExistingVertex(
  document: GeometryDocument,
  point: Point,
  tolerance: number
): SnapPoint | undefined {
  let nearest: SnapPoint | undefined;
  let nearestDistance = tolerance;

  for (const snapPoint of getSnapPoints(document)) {
    const candidateDistance = distance(point, snapPoint.point);

    if (candidateDistance <= nearestDistance) {
      nearest = snapPoint;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

export function createEditHandleUpdatePatch(
  document: GeometryDocument,
  handle: EditHandle,
  point: Point
): UpdatePatch | undefined {
  const node = findNodeInTree(document.root, handle.nodeId);

  if (!node) {
    return undefined;
  }

  if (isBBoxHandleKind(handle.kind)) {
    return createBBoxResizeUpdatePatch(node, handle.kind, point);
  }

  if (node.type === "rect") {
    return createRectHandleUpdatePatch(node, handle.kind, point);
  }

  if (node.type === "line") {
    return createLineHandleUpdatePatch(node, handle.kind, point);
  }

  if (node.type === "path") {
    return createPathHandleUpdatePatch(node, handle, point);
  }

  if (node.type === "ellipse") {
    return createEllipseHandleUpdatePatch(node, handle.kind, point);
  }

  if (node.type === "polygon" || node.type === "polyline") {
    return createPolygonHandleUpdatePatch(node, handle, point);
  }

  return undefined;
}

export function normalizeBounds(start: Point, end: Point): Bounds {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);

  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function drawPage(context: CanvasRenderingContext2D, document: GeometryDocument): void {
  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#d1d5db";
  context.lineWidth = 1;
  context.fillRect(0, 0, document.width, document.height);
  context.strokeRect(0, 0, document.width, document.height);
  context.restore();
}

function drawNode(context: CanvasRenderingContext2D, node: GeometryNode): void {
  if (node.visible === false) {
    return;
  }

  context.save();
  applyStyle(context, node.style);

  switch (node.type) {
    case "group":
      for (const child of node.children) {
        drawNode(context, child);
      }
      break;
    case "rect":
      drawRect(context, node);
      break;
    case "circle":
      context.beginPath();
      context.arc(node.cx, node.cy, node.r, 0, Math.PI * 2);
      paintCurrentPath(context, node.style);
      break;
    case "ellipse":
      context.beginPath();
      context.ellipse(node.cx, node.cy, node.rx, node.ry, 0, 0, Math.PI * 2);
      paintCurrentPath(context, node.style);
      break;
    case "line":
      context.beginPath();
      context.moveTo(node.x1, node.y1);
      context.lineTo(node.x2, node.y2);
      context.stroke();
      break;
    case "polygon":
    case "polyline":
      drawPoints(context, node.points, node.type === "polygon", node.style);
      break;
    case "path":
      drawPath(context, node);
      paintCurrentPath(context, node.style);
      break;
  }

  context.restore();
}

function drawRect(context: CanvasRenderingContext2D, node: RectNode): void {
  context.beginPath();

  if ((node.rx ?? 0) > 0 || (node.ry ?? 0) > 0) {
    context.roundRect(node.x, node.y, node.width, node.height, [
      node.rx ?? 0,
      node.ry ?? node.rx ?? 0
    ]);
  } else {
    context.rect(node.x, node.y, node.width, node.height);
  }

  paintCurrentPath(context, node.style);
}

function drawPoints(
  context: CanvasRenderingContext2D,
  points: Point[],
  closed: boolean,
  style: NodeStyle | undefined
): void {
  if (points.length === 0 || !points[0]) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  if (closed) {
    context.closePath();
  }

  paintCurrentPath(context, style);
}

function drawPath(context: CanvasRenderingContext2D, node: PathNode): void {
  context.beginPath();
  context.moveTo(node.start.x, node.start.y);

  let current = node.start;

  for (const segment of node.segments) {
    switch (segment.type) {
      case "line":
        context.lineTo(segment.to.x, segment.to.y);
        break;
      case "quadratic":
        context.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y);
        break;
      case "cubic":
        context.bezierCurveTo(
          segment.control1.x,
          segment.control1.y,
          segment.control2.x,
          segment.control2.y,
          segment.to.x,
          segment.to.y
        );
        break;
      case "arc":
        drawArcSegment(context, current, segment);
        break;
    }

    current = segment.to;
  }

  if (node.closed) {
    context.closePath();
  }
}

function drawArcSegment(
  context: CanvasRenderingContext2D,
  start: Point,
  segment: Extract<Segment, { type: "arc" }>
): void {
  const rx = Math.max(Math.abs(segment.rx), 0.001);
  const ry = Math.max(Math.abs(segment.ry), 0.001);
  const phi = (segment.xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start.x - segment.to.x) / 2;
  const dy = (start.y - segment.to.y) / 2;
  let x1p = cosPhi * dx + sinPhi * dy;
  let y1p = -sinPhi * dx + cosPhi * dy;
  let adjustedRx = rx;
  let adjustedRy = ry;
  const lambda = (x1p * x1p) / (adjustedRx * adjustedRx) + (y1p * y1p) / (adjustedRy * adjustedRy);

  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    adjustedRx *= scale;
    adjustedRy *= scale;
  }

  const sign = segment.largeArc === segment.sweep ? -1 : 1;
  const numerator =
    adjustedRx * adjustedRx * adjustedRy * adjustedRy -
    adjustedRx * adjustedRx * y1p * y1p -
    adjustedRy * adjustedRy * x1p * x1p;
  const denominator = adjustedRx * adjustedRx * y1p * y1p + adjustedRy * adjustedRy * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coef * adjustedRx * y1p) / adjustedRy;
  const cyp = (-coef * adjustedRy * x1p) / adjustedRx;
  const cx =
    cosPhi * cxp - sinPhi * cyp + (start.x + segment.to.x) / 2;
  const cy =
    sinPhi * cxp + cosPhi * cyp + (start.y + segment.to.y) / 2;
  const startAngle = vectorAngle(1, 0, (x1p - cxp) / adjustedRx, (y1p - cyp) / adjustedRy);
  let deltaAngle = vectorAngle(
    (x1p - cxp) / adjustedRx,
    (y1p - cyp) / adjustedRy,
    (-x1p - cxp) / adjustedRx,
    (-y1p - cyp) / adjustedRy
  );

  if (!segment.sweep && deltaAngle > 0) {
    deltaAngle -= Math.PI * 2;
  }

  if (segment.sweep && deltaAngle < 0) {
    deltaAngle += Math.PI * 2;
  }

  context.ellipse(
    cx,
    cy,
    adjustedRx,
    adjustedRy,
    phi,
    startAngle,
    startAngle + deltaAngle,
    !segment.sweep
  );
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = ux * vx + uy * vy;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);

  return sign * Math.acos(clamp(dot / length, -1, 1));
}

function applyStyle(context: CanvasRenderingContext2D, style: NodeStyle | undefined): void {
  context.fillStyle = style?.fill && style.fill !== "none" ? style.fill : "transparent";
  context.strokeStyle = style?.stroke && style.stroke !== "none" ? style.stroke : "transparent";
  context.lineWidth = style?.strokeWidth ?? 2;
  context.globalAlpha = style?.opacity ?? 1;
}

function paintCurrentPath(context: CanvasRenderingContext2D, style: NodeStyle | undefined): void {
  if (style?.fill && style.fill !== "none") {
    context.fill();
  }

  if (style?.stroke !== "none") {
    context.stroke();
  }
}

function drawSelection(
  context: CanvasRenderingContext2D,
  bounds: Bounds,
  viewport: Viewport,
  pixelRatio: number
): void {
  const topLeft = worldToScreen({ x: bounds.x, y: bounds.y }, viewport);
  const bottomRight = worldToScreen(
    {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height
    },
    viewport
  );

  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.strokeStyle = "#2563eb";
  context.lineWidth = 1;
  context.setLineDash([4, 3]);
  context.strokeRect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y
  );

  context.restore();
}

function drawEditHandles(
  context: CanvasRenderingContext2D,
  handles: EditHandle[],
  viewport: Viewport,
  pixelRatio: number
): void {
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = "#60a5fa";
  context.strokeStyle = "#0f172a";
  context.lineWidth = 1;

  for (const handle of handles) {
    const screenPoint = worldToScreen(handle.point, viewport);

    context.beginPath();
    context.rect(screenPoint.x - 4, screenPoint.y - 4, 8, 8);
    context.fill();
    context.stroke();
  }

  context.restore();
}

function hitTestNode(
  node: GeometryNode | undefined,
  point: Point,
  tolerance: number
): NodeId | undefined {
  if (!node || node.visible === false) {
    return undefined;
  }

  if (node.type === "group") {
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const hit = hitTestNode(node.children[index], point, tolerance);

      if (hit) {
        return hit;
      }
    }

    return undefined;
  }

  if (isPointNearNode(node, point, tolerance)) {
    return node.id;
  }

  return undefined;
}

function isPointNearNode(node: GeometryNode, point: Point, tolerance: number): boolean {
  switch (node.type) {
    case "rect":
      return isPointInsideBounds(point, node) || isPointNearBounds(point, node, tolerance);
    case "circle":
      return Math.abs(distance(point, { x: node.cx, y: node.cy }) - node.r) <= tolerance;
    case "ellipse":
      return isPointInsideBounds(point, {
        x: node.cx - node.rx,
        y: node.cy - node.ry,
        width: node.rx * 2,
        height: node.ry * 2
      });
    case "line":
      return distanceToSegment(point, { x: node.x1, y: node.y1 }, { x: node.x2, y: node.y2 }) <= tolerance;
    case "polygon":
    case "polyline":
      return isPointNearPolyline(point, node.points, node.type === "polygon", tolerance);
    case "path":
      return isPointNearPath(point, node, tolerance);
    case "group":
      return false;
  }
}

function getNodeBoundsInTree(node: GeometryNode, nodeId: NodeId): Bounds | undefined {
  if (node.id === nodeId) {
    return boundsForNode(node);
  }

  if (node.type !== "group") {
    return undefined;
  }

  for (const child of node.children) {
    const bounds = getNodeBoundsInTree(child, nodeId);

    if (bounds) {
      return bounds;
    }
  }

  return undefined;
}

function findNodeInTree(current: GeometryNode, nodeId: NodeId): GeometryNode | undefined {
  if (current.id === nodeId) {
    return current;
  }

  if (current.type !== "group") {
    return undefined;
  }

  for (const child of current.children) {
    const match = findNodeInTree(child, nodeId);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function handlesForNode(node: GeometryNode): EditHandle[] {
  if (node.type === "rect") {
    return handlesForBounds(node.id, {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    });
  }

  if (node.type === "line") {
    return [
      { nodeId: node.id, kind: "line-start", point: { x: node.x1, y: node.y1 } },
      { nodeId: node.id, kind: "line-end", point: { x: node.x2, y: node.y2 } }
    ];
  }

  if (node.type === "path") {
    const handles: EditHandle[] = [
      { nodeId: node.id, kind: "path-start", point: node.start },
      ...node.segments.map((segment, segmentIndex) => ({
        nodeId: node.id,
        kind: "path-segment-end" as const,
        point: segment.to,
        segmentIndex
      }))
    ];

    node.segments.forEach((segment, segmentIndex) => {
      if (segment.type === "quadratic") {
        handles.push({
          nodeId: node.id,
          kind: "path-quadratic-control",
          point: segment.control,
          segmentIndex
        });
      }

      if (segment.type === "cubic") {
        handles.push(
          {
            nodeId: node.id,
            kind: "path-cubic-control-1",
            point: segment.control1,
            segmentIndex
          },
          {
            nodeId: node.id,
            kind: "path-cubic-control-2",
            point: segment.control2,
            segmentIndex
          }
        );
      }
    });

    return handles;
  }

  if (node.type === "ellipse") {
    return handlesForBounds(node.id, {
      x: node.cx - node.rx,
      y: node.cy - node.ry,
      width: node.rx * 2,
      height: node.ry * 2
    });
  }

  if (node.type === "polygon" || node.type === "polyline") {
    const pointHandles: EditHandle[] = node.points.map((point, pointIndex) => ({
      nodeId: node.id,
      kind: "polygon-point",
      point,
      pointIndex
    }));
    const bounds = boundsForNode(node);

    return bounds ? [...pointHandles, ...handlesForBounds(node.id, bounds)] : pointHandles;
  }

  return [];
}

function handlesForBounds(nodeId: NodeId, bounds: Bounds): EditHandle[] {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  return [
    { nodeId, kind: "bbox-top-left", point: { x: bounds.x, y: bounds.y } },
    { nodeId, kind: "bbox-top", point: { x: centerX, y: bounds.y } },
    { nodeId, kind: "bbox-top-right", point: { x: right, y: bounds.y } },
    { nodeId, kind: "bbox-right", point: { x: right, y: centerY } },
    { nodeId, kind: "bbox-bottom-right", point: { x: right, y: bottom } },
    { nodeId, kind: "bbox-bottom", point: { x: centerX, y: bottom } },
    { nodeId, kind: "bbox-bottom-left", point: { x: bounds.x, y: bottom } },
    { nodeId, kind: "bbox-left", point: { x: bounds.x, y: centerY } }
  ];
}

function snapPointsForNode(node: GeometryNode): SnapPoint[] {
  if (node.visible === false) {
    return [];
  }

  if (node.type === "group") {
    return node.children.flatMap(snapPointsForNode);
  }

  return vertexPointsForNode(node).map((point) => ({
    nodeId: node.id,
    point
  }));
}

function vertexPointsForNode(node: GeometryNode): Point[] {
  switch (node.type) {
    case "rect":
      return [
        { x: node.x, y: node.y },
        { x: node.x + node.width, y: node.y },
        { x: node.x + node.width, y: node.y + node.height },
        { x: node.x, y: node.y + node.height }
      ];
    case "circle":
      return [
        { x: node.cx - node.r, y: node.cy },
        { x: node.cx, y: node.cy - node.r },
        { x: node.cx + node.r, y: node.cy },
        { x: node.cx, y: node.cy + node.r }
      ];
    case "ellipse":
      return [
        { x: node.cx - node.rx, y: node.cy },
        { x: node.cx, y: node.cy - node.ry },
        { x: node.cx + node.rx, y: node.cy },
        { x: node.cx, y: node.cy + node.ry }
      ];
    case "line":
      return [
        { x: node.x1, y: node.y1 },
        { x: node.x2, y: node.y2 }
      ];
    case "polygon":
    case "polyline":
      return node.points;
    case "path":
      return [node.start, ...node.segments.map((segment) => segment.to)];
    case "group":
      return [];
  }
}

function createRectHandleUpdatePatch(
  node: RectNode,
  kind: EditHandleKind,
  point: Point
): UpdatePatch | undefined {
  const right = node.x + node.width;
  const bottom = node.y + node.height;

  switch (kind) {
    case "rect-top-left":
      return createRectBoundsUpdatePatch(node.id, point, { x: right, y: bottom });
    case "rect-top-right":
      return createRectBoundsUpdatePatch(node.id, { x: node.x, y: bottom }, point);
    case "rect-bottom-right":
      return createRectBoundsUpdatePatch(node.id, { x: node.x, y: node.y }, point);
    case "rect-bottom-left":
      return createRectBoundsUpdatePatch(node.id, { x: right, y: node.y }, point);
    default:
      return undefined;
  }
}

function isBBoxHandleKind(kind: EditHandleKind): boolean {
  return (
    kind === "bbox-top-left" ||
    kind === "bbox-top" ||
    kind === "bbox-top-right" ||
    kind === "bbox-right" ||
    kind === "bbox-bottom-right" ||
    kind === "bbox-bottom" ||
    kind === "bbox-bottom-left" ||
    kind === "bbox-left"
  );
}

function createRectBoundsUpdatePatch(nodeId: NodeId, start: Point, end: Point): UpdatePatch {
  return {
    op: "update",
    target: nodeId,
    changes: normalizeBounds(start, end)
  };
}

function createBBoxResizeUpdatePatch(
  node: GeometryNode,
  kind: EditHandleKind,
  point: Point
): UpdatePatch | undefined {
  const bounds = boundsForNode(node);

  if (!bounds) {
    return undefined;
  }

  const nextBounds = resizeBounds(bounds, kind, point);

  if (node.type === "rect") {
    return {
      op: "update",
      target: node.id,
      changes: nextBounds
    };
  }

  if (node.type === "ellipse") {
    return {
      op: "update",
      target: node.id,
      changes: {
        cx: nextBounds.x + nextBounds.width / 2,
        cy: nextBounds.y + nextBounds.height / 2,
        rx: nextBounds.width / 2,
        ry: nextBounds.height / 2
      }
    };
  }

  if (node.type === "polygon" || node.type === "polyline") {
    return {
      op: "update",
      target: node.id,
      changes: {
        points: scalePointsToBounds(node.points, bounds, nextBounds)
      }
    };
  }

  return undefined;
}

function resizeBounds(bounds: Bounds, kind: EditHandleKind, point: Point): Bounds {
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  switch (kind) {
    case "bbox-top":
      return normalizeNonEmptyBounds({ x: left, y: point.y }, { x: right, y: bottom });
    case "bbox-right":
      return normalizeNonEmptyBounds({ x: left, y: top }, { x: point.x, y: bottom });
    case "bbox-bottom":
      return normalizeNonEmptyBounds({ x: left, y: top }, { x: right, y: point.y });
    case "bbox-left":
      return normalizeNonEmptyBounds({ x: point.x, y: top }, { x: right, y: bottom });
    case "bbox-top-left":
      return resizeBoundsFromCorner({ x: right, y: bottom }, point, bounds);
    case "bbox-top-right":
      return resizeBoundsFromCorner({ x: left, y: bottom }, point, bounds);
    case "bbox-bottom-right":
      return resizeBoundsFromCorner({ x: left, y: top }, point, bounds);
    case "bbox-bottom-left":
      return resizeBoundsFromCorner({ x: right, y: top }, point, bounds);
    default:
      return bounds;
  }
}

function resizeBoundsFromCorner(anchor: Point, point: Point, originalBounds: Bounds): Bounds {
  const ratio = originalBounds.width / Math.max(originalBounds.height, 0.001);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const widthFromX = Math.max(1, Math.abs(dx));
  const heightFromY = Math.max(1, Math.abs(dy));
  let width = widthFromX;
  let height = width / ratio;

  if (height < heightFromY) {
    height = heightFromY;
    width = height * ratio;
  }

  const nextPoint = {
    x: anchor.x + Math.sign(dx || 1) * width,
    y: anchor.y + Math.sign(dy || 1) * height
  };

  return normalizeNonEmptyBounds(anchor, nextPoint);
}

function normalizeNonEmptyBounds(start: Point, end: Point): Bounds {
  const bounds = normalizeBounds(start, end);

  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height)
  };
}

function scalePointsToBounds(points: Point[], fromBounds: Bounds, toBounds: Bounds): Point[] {
  const width = Math.max(fromBounds.width, 0.001);
  const height = Math.max(fromBounds.height, 0.001);

  return points.map((point) => ({
    x: toBounds.x + ((point.x - fromBounds.x) / width) * toBounds.width,
    y: toBounds.y + ((point.y - fromBounds.y) / height) * toBounds.height
  }));
}

function createLineHandleUpdatePatch(
  node: LineNode,
  kind: EditHandleKind,
  point: Point
): UpdatePatch | undefined {
  if (kind === "line-start") {
    return {
      op: "update",
      target: node.id,
      changes: {
        x1: point.x,
        y1: point.y
      }
    };
  }

  if (kind === "line-end") {
    return {
      op: "update",
      target: node.id,
      changes: {
        x2: point.x,
        y2: point.y
      }
    };
  }

  return undefined;
}

function createPathHandleUpdatePatch(
  node: PathNode,
  handle: EditHandle,
  point: Point
): UpdatePatch | undefined {
  if (handle.kind === "path-start") {
    return {
      op: "update",
      target: node.id,
      changes: {
        start: point
      }
    };
  }

  if (handle.kind === "path-segment-end" && handle.segmentIndex !== undefined) {
    return {
      op: "update",
      target: node.id,
      changes: {
        segments: node.segments.map((segment, segmentIndex) =>
          segmentIndex === handle.segmentIndex ? { ...segment, to: point } : segment
        )
      }
    };
  }

  if (handle.segmentIndex !== undefined) {
    return {
      op: "update",
      target: node.id,
      changes: {
        segments: node.segments.map((segment, segmentIndex) => {
          if (segmentIndex !== handle.segmentIndex) {
            return segment;
          }

          if (handle.kind === "path-quadratic-control" && segment.type === "quadratic") {
            return { ...segment, control: point };
          }

          if (handle.kind === "path-cubic-control-1" && segment.type === "cubic") {
            return { ...segment, control1: point };
          }

          if (handle.kind === "path-cubic-control-2" && segment.type === "cubic") {
            return { ...segment, control2: point };
          }

          return segment;
        })
      }
    };
  }

  return undefined;
}

function createEllipseHandleUpdatePatch(
  node: Extract<GeometryNode, { type: "ellipse" }>,
  kind: EditHandleKind,
  point: Point
): UpdatePatch | undefined {
  switch (kind) {
    case "ellipse-left":
    case "ellipse-right":
      return {
        op: "update",
        target: node.id,
        changes: {
          rx: Math.max(0.5, Math.abs(point.x - node.cx))
        }
      };
    case "ellipse-top":
    case "ellipse-bottom":
      return {
        op: "update",
        target: node.id,
        changes: {
          ry: Math.max(0.5, Math.abs(point.y - node.cy))
        }
      };
    default:
      return undefined;
  }
}

function createPolygonHandleUpdatePatch(
  node: PolygonNode | Extract<GeometryNode, { type: "polyline" }>,
  handle: EditHandle,
  point: Point
): UpdatePatch | undefined {
  if (handle.kind !== "polygon-point" || handle.pointIndex === undefined) {
    return undefined;
  }

  return {
    op: "update",
    target: node.id,
    changes: {
      points: node.points.map((currentPoint, pointIndex) =>
        pointIndex === handle.pointIndex ? point : currentPoint
      )
    }
  };
}

function createSegment(start: Point, end: Point, mode: PathSegmentMode): Segment {
  switch (mode) {
    case "quadratic":
      return {
        type: "quadratic",
        control: midpoint(start, end, -0.35),
        to: end
      };
    case "cubic":
      return {
        type: "cubic",
        control1: lerpPoint(start, end, 1 / 3),
        control2: lerpPoint(start, end, 2 / 3),
        to: end
      };
    case "arc":
      return {
        type: "arc",
        rx: Math.max(1, Math.abs(end.x - start.x) / 2),
        ry: Math.max(1, Math.abs(end.y - start.y) / 2),
        xAxisRotation: 0,
        largeArc: false,
        sweep: true,
        to: end
      };
    case "line":
      return {
        type: "line",
        to: end
      };
  }
}

function getPathEndPoint(node: PathNode): Point {
  return node.segments.at(-1)?.to ?? node.start;
}

function lerpPoint(start: Point, end: Point, amount: number): Point {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount
  };
}

function midpoint(start: Point, end: Point, perpendicularScale: number): Point {
  const mid = lerpPoint(start, end, 0.5);

  return {
    x: mid.x - (end.y - start.y) * perpendicularScale,
    y: mid.y + (end.x - start.x) * perpendicularScale
  };
}

function boundsForNode(node: GeometryNode): Bounds | undefined {
  switch (node.type) {
    case "group":
      return mergeBounds(node.children.map(boundsForNode).filter(isBounds));
    case "rect":
      return {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      };
    case "circle":
      return {
        x: node.cx - node.r,
        y: node.cy - node.r,
        width: node.r * 2,
        height: node.r * 2
      };
    case "ellipse":
      return {
        x: node.cx - node.rx,
        y: node.cy - node.ry,
        width: node.rx * 2,
        height: node.ry * 2
      };
    case "line":
      return normalizeBounds({ x: node.x1, y: node.y1 }, { x: node.x2, y: node.y2 });
    case "polygon":
    case "polyline":
      return mergeBounds(node.points.map((point) => ({ ...point, width: 0, height: 0 })));
    case "path":
      return mergeBounds(pathPoints(node).map((point) => ({ ...point, width: 0, height: 0 })));
  }
}

function pathPoints(node: PathNode): Point[] {
  const points = [node.start];

  for (const segment of node.segments) {
    if (segment.type === "quadratic") {
      points.push(segment.control);
    }

    if (segment.type === "cubic") {
      points.push(segment.control1, segment.control2);
    }

    points.push(segment.to);
  }

  return points;
}

function mergeBounds(boundsList: Bounds[]): Bounds | undefined {
  if (boundsList.length === 0) {
    return undefined;
  }

  const minX = Math.min(...boundsList.map((bounds) => bounds.x));
  const minY = Math.min(...boundsList.map((bounds) => bounds.y));
  const maxX = Math.max(...boundsList.map((bounds) => bounds.x + bounds.width));
  const maxY = Math.max(...boundsList.map((bounds) => bounds.y + bounds.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function isBounds(bounds: Bounds | undefined): bounds is Bounds {
  return Boolean(bounds);
}

function isPointInsideBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function isPointNearBounds(point: Point, bounds: Bounds, tolerance: number): boolean {
  const top = distanceToSegment(point, { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y });
  const right = distanceToSegment(
    point,
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  );
  const bottom = distanceToSegment(
    point,
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  );
  const left = distanceToSegment(point, { x: bounds.x, y: bounds.y }, { x: bounds.x, y: bounds.y + bounds.height });

  return Math.min(top, right, bottom, left) <= tolerance;
}

function isPointNearPolyline(
  point: Point,
  points: Point[],
  closed: boolean,
  tolerance: number
): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];

    if (current && next && distanceToSegment(point, current, next) <= tolerance) {
      return true;
    }
  }

  const first = points[0];
  const last = points.at(-1);

  return Boolean(closed && first && last && distanceToSegment(point, last, first) <= tolerance);
}

function isPointNearPath(point: Point, node: PathNode, tolerance: number): boolean {
  let current = node.start;

  for (const segment of node.segments) {
    if (distanceToSegment(point, current, segment.to) <= tolerance) {
      return true;
    }

    current = segment.to;
  }

  return node.closed && distanceToSegment(point, current, node.start) <= tolerance;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );

  return distance(point, {
    x: start.x + t * dx,
    y: start.y + t * dy
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
