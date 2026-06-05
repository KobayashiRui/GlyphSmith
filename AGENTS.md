# GlyphSmith

Agent-native SVG editor powered by Geometry AST and patch-based editing.

GlyphSmith is an open-source SVG editor designed for AI agents such as:

* Codex
* Claude Code
* Gemini CLI

The editor supports both manual editing and AI-driven editing using a shared Geometry AST.

---

# Vision

Traditional AI SVG workflows regenerate entire SVG files.

GlyphSmith takes a different approach.

```txt
SVG
↓ Import

Geometry AST
↓
Patch Operations
↓
Geometry AST

↓ Export
SVG
```

AI agents never directly rewrite SVG strings.

AI agents generate patch operations that modify the Geometry AST.

---

# Core Principles

## Geometry AST is the Source of Truth

SVG is only used for:

* Import
* Export

Internal editing must always operate on Geometry AST.

---

## Patch-based Editing

Never regenerate an entire document when a small modification is sufficient.

Preferred:

```json
{
  "op": "update",
  "target": "node-12",
  "changes": {
    "strokeWidth": 3
  }
}
```

Avoid:

```txt
Generate a completely new SVG.
```

---

## Geometry Kernel

AI should not perform geometry calculations.

AI describes intent.

The Geometry Kernel performs actual geometry modifications.

Examples:

* Move
* Rotate
* Scale
* Offset
* Round Corner
* Smooth
* Mirror

---

## Simplicity Over Abstraction

Avoid introducing:

* Semantic AST
* DSL-first architecture
* Complex reconstruction systems

Geometry AST is sufficient.

Keep the architecture simple.

---

# Repository Structure

```txt
glyphsmith/

apps/
├ cli/
└ web/

packages/
├ ast/
├ svg/
├ kernel/
├ editor/
└ mcp/

skills/
```

---

# apps/web

SvelteKit application.

Responsibilities:

* Editor UI
* Canvas
* Layer Tree
* Properties Panel
* Comments Panel

The editor UI must remain reusable.

Future hosted deployments should reuse this application.

---

# apps/cli

Primary entrypoint for v0.1.

Launches:

* Local Web UI
* MCP Server

Example:

```bash
npx glyphsmith
```

Expected behavior:

```txt
✓ UI running on localhost:3210
✓ MCP running on localhost:3211
```

The initial release is CLI-first.

No hosted web application is required.

---

# packages/ast

Contains Geometry AST definitions.

Examples:

* Document
* Node
* Segment
* Patch

No UI logic.

---

# packages/svg

Responsible for:

```txt
SVG ↔ Geometry AST
```

Contains:

* SVG Parser
* SVG Exporter

---

# packages/kernel

Geometry engine.

Responsible for geometry operations such as:

* Offset
* Round Corner
* Smooth
* Mirror
* Future Boolean Operations

No UI code.

---

# packages/editor

Reusable editor components.

Examples:

* Canvas
* Selection
* Transform Handles
* Comments
* Viewport

Should remain framework-independent where practical.

---

# packages/mcp

MCP server implementation.

Exposed tools:

* getDocument()
* getSelection()
* getComments()
* applyPatch()

AI agents should interact through these APIs.

---

# skills

Contains reusable AI skills and project knowledge.

Structure:

```txt
skills/
├ svg/
├ ast/
├ patch/
├ editor/
└ mcp/
```

Skills are markdown-based references used by AI agents.

Examples:

* SVG import rules
* Geometry AST rules
* Patch operation patterns
* MCP usage patterns
* UI conventions

Keep skills focused and small.

---

# Geometry AST

Geometry AST is the internal representation.

Supported nodes:

* GroupNode
* PathNode
* RectNode
* CircleNode
* EllipseNode
* PolygonNode
* PolylineNode
* LineNode

---

## PathNode

Do not store only raw SVG path strings.

Normalize paths into segments.

Example:

```ts
type PathNode = {
  id: string
  type: "path"

  closed: boolean

  segments: Segment[]
}
```

---

## Segment Types

Supported:

* LineSegment
* CubicBezierSegment
* QuadraticBezierSegment
* ArcSegment

The Geometry AST should be geometry-oriented rather than SVG-string-oriented.

---

# Comments

Comments are first-class objects.

Example:

```json
{
  "targetNodeIds": ["node-12"],
  "text": "Make this corner rounder"
}
```

Comments provide instructions for AI agents.

---

# AI Workflow

User

```txt
Select Shape
↓
Add Comment
```

Agent

```txt
Read AST
↓
Generate Patch
```

Editor

```txt
Apply Patch
↓
Update AST
↓
Render SVG
```

---

# Development Guidelines

Always prefer:

```txt
Geometry AST > SVG Text
Patch Operations > Regeneration
Geometry Kernel > AI Geometry Calculations
Simplicity > Overengineering
```

When uncertain:

Choose the simpler architecture.
