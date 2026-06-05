export type NodeId = string;

export type Point = {
  x: number;
  y: number;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Paint = string | "none";

export type NodeStyle = {
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  opacity?: number;
};

export type BaseNode = {
  id: NodeId;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  style?: NodeStyle;
};

export type GroupNode = BaseNode & {
  type: "group";
  children: GeometryNode[];
};

export type RectNode = BaseNode & {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
};

export type CircleNode = BaseNode & {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
};

export type EllipseNode = BaseNode & {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type LineNode = BaseNode & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type PolygonNode = BaseNode & {
  type: "polygon";
  points: Point[];
};

export type PolylineNode = BaseNode & {
  type: "polyline";
  points: Point[];
};

export type LineSegment = {
  type: "line";
  to: Point;
};

export type CubicBezierSegment = {
  type: "cubic";
  control1: Point;
  control2: Point;
  to: Point;
};

export type QuadraticBezierSegment = {
  type: "quadratic";
  control: Point;
  to: Point;
};

export type ArcSegment = {
  type: "arc";
  rx: number;
  ry: number;
  xAxisRotation: number;
  largeArc: boolean;
  sweep: boolean;
  to: Point;
};

export type Segment = LineSegment | CubicBezierSegment | QuadraticBezierSegment | ArcSegment;

export type PathNode = BaseNode & {
  type: "path";
  start: Point;
  closed: boolean;
  segments: Segment[];
};

export type GeometryNode =
  | GroupNode
  | RectNode
  | CircleNode
  | EllipseNode
  | LineNode
  | PolygonNode
  | PolylineNode
  | PathNode;

export type Comment = {
  id: string;
  targetNodeIds: NodeId[];
  text: string;
  resolved?: boolean;
};

export type GeometryDocument = {
  id: string;
  name: string;
  width: number;
  height: number;
  root: GroupNode;
  comments: Comment[];
};

export type InsertPatch = {
  op: "insert";
  parentId: NodeId;
  node: GeometryNode;
  index?: number;
};

export type UpdatePatch = {
  op: "update";
  target: NodeId;
  changes: Partial<GeometryNode>;
};

export type DeletePatch = {
  op: "delete";
  target: NodeId;
};

export type MovePatch = {
  op: "move";
  target: NodeId;
  dx: number;
  dy: number;
};

export type UpdateDocumentPatch = {
  op: "updateDocument";
  changes: Partial<Pick<GeometryDocument, "name" | "width" | "height">>;
};

export type PatchOperation =
  | InsertPatch
  | UpdatePatch
  | DeletePatch
  | MovePatch
  | UpdateDocumentPatch;

export type Selection = {
  nodeIds: NodeId[];
};

export type CreateDocumentOptions = {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
};

export function createDocument(options: CreateDocumentOptions = {}): GeometryDocument {
  return {
    id: options.id ?? "document-1",
    name: options.name ?? "Untitled",
    width: options.width ?? 1024,
    height: options.height ?? 768,
    root: {
      id: "root",
      type: "group",
      name: "Root",
      children: []
    },
    comments: []
  };
}
