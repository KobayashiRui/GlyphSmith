import type { GeometryDocument, GeometryNode, NodeStyle, Point, Segment } from "@glyphsmith/ast";

export function exportToSvg(document: GeometryDocument): string {
  const children = document.root.children.map(renderNode).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(document.width)}" height="${formatNumber(document.height)}" viewBox="0 0 ${formatNumber(document.width)} ${formatNumber(document.height)}">`,
    children,
    "</svg>"
  ].join("");
}

export function importFromSvg(_svgText: string): GeometryDocument {
  throw new Error("SVG import is not implemented yet.");
}

function renderNode(node: GeometryNode): string {
  if (node.visible === false) {
    return "";
  }

  const common = `${renderId(node.id)}${renderName(node.name)}${renderStyle(node.style)}`;

  switch (node.type) {
    case "group":
      return `<g${common}>${node.children.map(renderNode).join("")}</g>`;
    case "rect":
      return `<rect${common} x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}"${optionalNumber("rx", node.rx)}${optionalNumber("ry", node.ry)} />`;
    case "circle":
      return `<circle${common} cx="${formatNumber(node.cx)}" cy="${formatNumber(node.cy)}" r="${formatNumber(node.r)}" />`;
    case "ellipse":
      return `<ellipse${common} cx="${formatNumber(node.cx)}" cy="${formatNumber(node.cy)}" rx="${formatNumber(node.rx)}" ry="${formatNumber(node.ry)}" />`;
    case "line":
      return `<line${common} x1="${formatNumber(node.x1)}" y1="${formatNumber(node.y1)}" x2="${formatNumber(node.x2)}" y2="${formatNumber(node.y2)}" />`;
    case "polygon":
      return `<polygon${common} points="${renderPoints(node.points)}" />`;
    case "polyline":
      return `<polyline${common} points="${renderPoints(node.points)}" />`;
    case "path":
      return `<path${common} d="${renderPathData(node.start, node.segments, node.closed)}" />`;
  }
}

function renderPathData(start: Point, segments: Segment[], closed: boolean): string {
  const commands = [`M ${formatNumber(start.x)} ${formatNumber(start.y)}`];

  for (const segment of segments) {
    switch (segment.type) {
      case "line":
        commands.push(`L ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`);
        break;
      case "quadratic":
        commands.push(
          `Q ${formatNumber(segment.control.x)} ${formatNumber(segment.control.y)} ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`
        );
        break;
      case "cubic":
        commands.push(
          `C ${formatNumber(segment.control1.x)} ${formatNumber(segment.control1.y)} ${formatNumber(segment.control2.x)} ${formatNumber(segment.control2.y)} ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`
        );
        break;
      case "arc":
        commands.push(
          `A ${formatNumber(segment.rx)} ${formatNumber(segment.ry)} ${formatNumber(segment.xAxisRotation)} ${segment.largeArc ? 1 : 0} ${segment.sweep ? 1 : 0} ${formatNumber(segment.to.x)} ${formatNumber(segment.to.y)}`
        );
        break;
    }
  }

  if (closed) {
    commands.push("Z");
  }

  return commands.join(" ");
}

function renderStyle(style: NodeStyle | undefined): string {
  const fill = style?.fill ?? "none";
  const stroke = style?.stroke ?? "#111827";
  const strokeWidth = style?.strokeWidth ?? 2;
  const strokeLinecap = style?.strokeLinecap;
  const strokeLinejoin = style?.strokeLinejoin;
  const strokeMiterlimit = style?.strokeMiterlimit;
  const strokeDasharray = style?.strokeDasharray;
  const strokeDashoffset = style?.strokeDashoffset;
  const opacity = style?.opacity;

  return [
    ` fill="${escapeAttribute(fill)}"`,
    ` stroke="${escapeAttribute(stroke)}"`,
    ` stroke-width="${formatNumber(strokeWidth)}"`,
    strokeLinecap === undefined ? "" : ` stroke-linecap="${escapeAttribute(strokeLinecap)}"`,
    strokeLinejoin === undefined ? "" : ` stroke-linejoin="${escapeAttribute(strokeLinejoin)}"`,
    strokeMiterlimit === undefined ? "" : ` stroke-miterlimit="${formatNumber(strokeMiterlimit)}"`,
    strokeDasharray === undefined ? "" : ` stroke-dasharray="${escapeAttribute(strokeDasharray)}"`,
    strokeDashoffset === undefined ? "" : ` stroke-dashoffset="${formatNumber(strokeDashoffset)}"`,
    opacity === undefined ? "" : ` opacity="${formatNumber(opacity)}"`
  ].join("");
}

function renderPoints(points: Point[]): string {
  return points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(" ");
}

function renderId(id: string): string {
  return ` id="${escapeAttribute(id)}"`;
}

function renderName(name: string | undefined): string {
  return name ? ` data-name="${escapeAttribute(name)}"` : "";
}

function optionalNumber(name: string, value: number | undefined): string {
  return value === undefined ? "" : ` ${name}="${formatNumber(value)}"`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
