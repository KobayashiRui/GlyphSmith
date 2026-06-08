# GlyphSmith AST

Use this skill when inspecting or changing GlyphSmith Geometry AST data.

## Geometry AST

The project file is a `GlyphSmithProject`.

```txt
GlyphSmithProject
└ Page[]
  └ GeometryDocument
    └ GeometryNode tree
```

Supported node concepts include groups, paths, rectangles, circles, ellipses, polygons, polylines, and lines.

Path geometry must be normalized into segments. Do not store only raw SVG path strings.

## Segment Rules

Supported path segment concepts:

* Line
* Cubic Bezier
* Quadratic Bezier
* Arc

Spline-like editor tools may generate cubic Bezier geometry internally.

Segment shapes:

```json
{ "type": "line", "to": { "x": 240, "y": 160 } }
```

```json
{
  "type": "quadratic",
  "control": { "x": 180, "y": 80 },
  "to": { "x": 320, "y": 160 }
}
```

Stroke style supports SVG-style cap and join values:

```json
{
  "fill": "none",
  "stroke": "#111827",
  "strokeWidth": 32,
  "strokeLinecap": "round",
  "strokeLinejoin": "round"
}
```

```json
{
  "type": "cubic",
  "control1": { "x": 160, "y": 80 },
  "control2": { "x": 320, "y": 280 },
  "to": { "x": 400, "y": 160 }
}
```

```json
{
  "type": "arc",
  "rx": 96,
  "ry": 96,
  "xAxisRotation": 0,
  "largeArc": false,
  "sweep": true,
  "to": { "x": 320, "y": 240 }
}
```
