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
* CLI Host Server
* MCP Server

Example:

```bash
npx glyphsmith
```

Expected behavior:

```txt
✓ UI running on http://127.0.0.1:6001
✓ Host running on ws://127.0.0.1:6002/ws
✓ MCP running on http://127.0.0.1:6002/mcp
```

The initial release is CLI-first.

No hosted web application is required.

The CLI host is the local coordination process for editor sessions, project file updates, WebSocket sync, and MCP calls.
The web editor should connect to the CLI host through WebSocket and exchange Geometry AST project snapshots or patch-based updates.
MCP shares the same host process so agent edits and manual editor edits stay synchronized.

Project file paths passed to the CLI may omit `.gs.json`.

Examples:

```bash
glyphsmith
glyphsmith logo
glyphsmith logo.gs.json
glyphsmith init logo
```

Expected path resolution:

```txt
glyphsmith          -> ./glyphsmith.gs.json
glyphsmith logo     -> ./logo.gs.json
glyphsmith logo.gs.json -> ./logo.gs.json
```

If the resolved project file does not exist, the CLI should create it and continue without prompting.

Keep CLI behavior deterministic and non-interactive so installed agent skills can launch GlyphSmith reliably.

The repository-level `pnpm run dev` command should use Turborepo to run `apps/cli` and `apps/web` as separate dev processes.

Development defaults:

```txt
Project: /private/tmp/glyphsmith-dev.gs.json
UI:      http://localhost:6201
Host:    ws://localhost:6202/ws
MCP:     http://localhost:6202/mcp
```

The dev command should use a scratch project under `/private/tmp` so development startup does not create a root `glyphsmith.gs.json`.

Development ports should be strict. If `6201` or `6202` is unavailable, fail clearly instead of falling back to another port, because web and host are launched as separate processes.

In monorepo development, `apps/web` owns the Vite dev server and `apps/cli` should run only the CLI host through:

```bash
glyphsmith host /private/tmp/glyphsmith-dev --host-port 6202 --strict-ports
```

MCP registration commands:

```bash
glyphsmith mcp install codex --url http://127.0.0.1:6002/mcp
glyphsmith mcp install claude --url http://127.0.0.1:6002/mcp
```

When Claude Code CLI registration is unavailable, pass `--project <project-dir>` to write a project-local `.mcp.json`.

Skill installation commands:

```bash
glyphsmith skills install codex
glyphsmith skills install claude
```

Codex skills are installed into `$CODEX_HOME/skills` or `~/.codex/skills`.

Claude skills are installed into `$CLAUDE_HOME/skills` or `~/.claude/skills`.

For project-local Claude skills, pass `--project <project-dir>` to install into `<project-dir>/.claude/skills`.

Use `--force` to replace existing GlyphSmith skills.

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

Exposed resources:

* glyphsmith://project
* glyphsmith://pages
* glyphsmith://active-document
* glyphsmith://document/{pageId}
* glyphsmith://comments
* glyphsmith://selection
* glyphsmith://skill-guide

Exposed tools:

* project_get
* pages_list
* document_get
* selection_get
* comments_get
* patch_apply
* patches_apply
* node_insert
* node_update
* node_delete
* node_move
* document_update
* path_create
* path_segment_append
* path_segment_update
* path_segment_delete
* path_set_closed
* page_add
* page_duplicate
* page_delete
* page_set_active
* svg_export
* project_save

Mutation tools should accept `revision` when possible and should support `dryRun` for edits that can be previewed.
MCP mutations must write through the CLI ProjectStore so WebSocket clients receive project snapshot updates.
When an active CLI host is running, agents should not edit `.gs.json` directly. Direct project file edits are acceptable only for offline workflows where no active editor/MCP host is available.

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

## Project Files

GlyphSmith project files use the `.gs.json` extension.

Project files may contain multiple pages.

```txt
GlyphSmithProject
└ Page[]
  └ GeometryDocument
    └ SVG-equivalent Geometry AST
```

Treat one page as one SVG.

The active editor canvas renders one active page at a time.

The bottom page strip should show page thumbnails rendered from each page's GeometryDocument, not static placeholder boxes.

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

---

# Future Work

Keep these as follow-up tasks unless the user explicitly asks to implement them:

* Optimize page thumbnail rendering so only changed pages redraw.
* Add page rename and drag-to-reorder in the bottom page strip.
* Add project-level dirty-state handling for `.gs.json`.
* Add a UI affordance to copy the current MCP URL and install commands.
* Add authenticated MCP mode for non-default deployment contexts.
* Preserve project/page metadata when importing or exporting multiple SVG files.
