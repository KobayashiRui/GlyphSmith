import type {
  GeometryDocument,
  GeometryNode,
  GroupNode,
  MovePatch,
  PatchOperation,
  Point
} from "@glyphsmith/ast";

export function applyPatch(document: GeometryDocument, patch: PatchOperation): GeometryDocument {
  switch (patch.op) {
    case "updateDocument":
      return {
        ...document,
        ...patch.changes,
        width: patch.changes.width === undefined ? document.width : clampDimension(patch.changes.width),
        height: patch.changes.height === undefined ? document.height : clampDimension(patch.changes.height)
      };
    case "insert":
      return {
        ...document,
        root: insertNode(document.root, patch.parentId, patch.node, patch.index) as GroupNode
      };
    case "update":
      return {
        ...document,
        root: updateNode(document.root, patch.target, (node) => ({
          ...node,
          ...patch.changes,
          id: node.id,
          type: node.type
        }) as GeometryNode) as GroupNode
      };
    case "delete":
      if (patch.target === document.root.id) {
        return document;
      }

      return {
        ...document,
        root: deleteNode(document.root, patch.target) as GroupNode
      };
    case "move":
      return {
        ...document,
        root: updateNode(document.root, patch.target, (node) => moveNode(node, patch)) as GroupNode
      };
  }
}

export function applyPatches(
  document: GeometryDocument,
  patches: PatchOperation[]
): GeometryDocument {
  return patches.reduce((current, patch) => applyPatch(current, patch), document);
}

export function findNode(document: GeometryDocument, nodeId: string): GeometryNode | undefined {
  return findNodeInTree(document.root, nodeId);
}

function insertNode(
  current: GeometryNode,
  parentId: string,
  node: GeometryNode,
  index?: number
): GeometryNode {
  if (current.id === parentId && current.type === "group") {
    const children = [...current.children];
    const insertAt = index === undefined ? children.length : clamp(index, 0, children.length);

    children.splice(insertAt, 0, node);

    return {
      ...current,
      children
    };
  }

  if (current.type !== "group") {
    return current;
  }

  return {
    ...current,
    children: current.children.map((child) => insertNode(child, parentId, node, index))
  };
}

function updateNode(
  current: GeometryNode,
  targetId: string,
  updater: (node: GeometryNode) => GeometryNode
): GeometryNode {
  if (current.id === targetId) {
    return updater(current);
  }

  if (current.type !== "group") {
    return current;
  }

  return {
    ...current,
    children: current.children.map((child) => updateNode(child, targetId, updater))
  };
}

function deleteNode(current: GeometryNode, targetId: string): GeometryNode {
  if (current.type !== "group") {
    return current;
  }

  return {
    ...current,
    children: current.children
      .filter((child) => child.id !== targetId)
      .map((child) => deleteNode(child, targetId))
  };
}

function findNodeInTree(current: GeometryNode, nodeId: string): GeometryNode | undefined {
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

function moveNode(node: GeometryNode, patch: MovePatch): GeometryNode {
  const delta: Point = { x: patch.dx, y: patch.dy };

  switch (node.type) {
    case "group":
      return {
        ...node,
        children: node.children.map((child) => moveNode(child, patch))
      };
    case "rect":
      return { ...node, x: node.x + delta.x, y: node.y + delta.y };
    case "circle":
    case "ellipse":
      return { ...node, cx: node.cx + delta.x, cy: node.cy + delta.y };
    case "line":
      return {
        ...node,
        x1: node.x1 + delta.x,
        y1: node.y1 + delta.y,
        x2: node.x2 + delta.x,
        y2: node.y2 + delta.y
      };
    case "polygon":
    case "polyline":
      return {
        ...node,
        points: node.points.map((point) => translatePoint(point, delta))
      };
    case "path":
      return {
        ...node,
        start: translatePoint(node.start, delta),
        segments: node.segments.map((segment) => {
          switch (segment.type) {
            case "line":
              return { ...segment, to: translatePoint(segment.to, delta) };
            case "quadratic":
              return {
                ...segment,
                control: translatePoint(segment.control, delta),
                to: translatePoint(segment.to, delta)
              };
            case "cubic":
              return {
                ...segment,
                control1: translatePoint(segment.control1, delta),
                control2: translatePoint(segment.control2, delta),
                to: translatePoint(segment.to, delta)
              };
            case "arc":
              return { ...segment, to: translatePoint(segment.to, delta) };
          }
        })
      };
  }
}

function translatePoint(point: Point, delta: Point): Point {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampDimension(value: number): number {
  return Math.max(1, Math.round(value));
}
