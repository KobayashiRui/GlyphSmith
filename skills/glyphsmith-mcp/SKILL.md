# GlyphSmith MCP

Use this skill when an active GlyphSmith editor session exposes a local MCP endpoint.

## Workflow

1. Read the active project or page through MCP resources/tools.
2. Generate small patch operations against Geometry AST.
3. Apply patches through MCP.
4. Re-read the affected document to confirm the result.

## Rules

* Do not regenerate a whole SVG when a patch is enough.
* Do not edit raw SVG strings for active editor changes.
* Do not directly edit `.gs.json` while the GlyphSmith CLI host is active. Use MCP tools so project revisions and WebSocket clients stay synchronized.
* Prefer page-scoped operations.
* Keep comments as first-class instructions for agents.

## Expected Local Host

The CLI starts the editor UI and host server locally.

```txt
Editor: http://127.0.0.1:6001
Host:   ws://127.0.0.1:6002/ws
MCP:    http://127.0.0.1:6002/mcp
```

If the default port is unavailable, use the actual MCP URL printed by the CLI.

For monorepo development with `pnpm run dev`, the default ports are:

```txt
Editor: http://localhost:6201
Host:   ws://localhost:6202/ws
MCP:    http://localhost:6202/mcp
```

Register the endpoint with local agents when needed.

```bash
glyphsmith mcp install codex --url http://127.0.0.1:6002/mcp
glyphsmith mcp install claude --url http://127.0.0.1:6002/mcp
```

## Resources

```txt
glyphsmith://project
glyphsmith://pages
glyphsmith://active-document
glyphsmith://document/{pageId}
glyphsmith://comments
glyphsmith://selection
glyphsmith://skill-guide
```

## Tools

```txt
project_get
pages_list
document_get
selection_get
comments_get
patch_apply
patches_apply
node_insert
node_update
node_delete
node_move
document_update
path_create
path_segment_append
path_segment_update
path_segment_delete
path_set_closed
page_add
page_duplicate
page_delete
page_set_active
svg_export
project_save
```

Use `patch_apply` with `dryRun: true` before risky geometry changes.
Use `patches_apply` when drawing multiple shapes in one update.
Use `node_insert`, `node_update`, `node_delete`, and `node_move` for simple create/edit/delete/move operations.
Use `path_create` and `path_segment_*` for path drawing or segment-level curve edits.
Pass `revision` when mutating if the current revision is known.
`glyphsmith://selection` reflects the current editor selection when the web editor is connected to the CLI host.

## Drawing Workflow

When asked to draw SVG content:

1. Call `document_get` to read the active document and revision.
2. Use `document_update` if the requested canvas size differs.
3. Use `patches_apply` or `node_insert` to add Geometry AST nodes.
4. Re-read with `document_get`.
5. Use `svg_export` when the user asks for SVG output.

Example `patches_apply` arguments:

```json
{
  "revision": "<current-revision>",
  "patches": [
    {
      "op": "updateDocument",
      "changes": {
        "width": 512,
        "height": 512,
        "name": "Simple Icon"
      }
    },
    {
      "op": "insert",
      "parentId": "root",
      "node": {
        "id": "icon-bg",
        "type": "rect",
        "x": 48,
        "y": 48,
        "width": 416,
        "height": 416,
        "rx": 48,
        "ry": 48,
        "style": {
          "fill": "#0f172a",
          "stroke": "#38bdf8",
          "strokeWidth": 8
        }
      }
    },
    {
      "op": "insert",
      "parentId": "root",
      "node": {
        "id": "icon-circle",
        "type": "ellipse",
        "cx": 256,
        "cy": 256,
        "rx": 120,
        "ry": 120,
        "style": {
          "fill": "#22c55e",
          "stroke": "none"
        }
      }
    }
  ]
}
```

Example edit arguments:

```json
{
  "target": "icon-circle",
  "changes": {
    "rx": 96,
    "ry": 96,
    "style": {
      "fill": "#f97316",
      "stroke": "#fff7ed",
      "strokeWidth": 6
    }
  }
}
```

Example delete arguments:

```json
{
  "target": "icon-circle"
}
```

## Path Drawing

Create paths with normalized segments, not raw SVG `d` strings.

Example `path_create` arguments:

```json
{
  "id": "logo-curve",
  "start": { "x": 96, "y": 320 },
  "closed": false,
  "style": {
    "fill": "none",
    "stroke": "#38bdf8",
    "strokeWidth": 10
  },
  "segments": [
    {
      "type": "cubic",
      "control1": { "x": 160, "y": 160 },
      "control2": { "x": 320, "y": 480 },
      "to": { "x": 416, "y": 280 }
    }
  ]
}
```

Append a line segment:

```json
{
  "target": "logo-curve",
  "segment": {
    "type": "line",
    "to": { "x": 448, "y": 360 }
  }
}
```

Append a quadratic segment:

```json
{
  "target": "logo-curve",
  "segment": {
    "type": "quadratic",
    "control": { "x": 360, "y": 120 },
    "to": { "x": 448, "y": 240 }
  }
}
```

Append an arc segment:

```json
{
  "target": "logo-curve",
  "segment": {
    "type": "arc",
    "rx": 96,
    "ry": 96,
    "xAxisRotation": 0,
    "largeArc": false,
    "sweep": true,
    "to": { "x": 320, "y": 384 }
  }
}
```

Replace the first segment:

```json
{
  "target": "logo-curve",
  "index": 0,
  "segment": {
    "type": "cubic",
    "control1": { "x": 128, "y": 180 },
    "control2": { "x": 300, "y": 420 },
    "to": { "x": 400, "y": 300 }
  }
}
```

Delete a segment:

```json
{
  "target": "logo-curve",
  "index": 1
}
```

Close a path:

```json
{
  "target": "logo-curve",
  "closed": true
}
```
