---
name: glyphsmith
description: GlyphSmith project authoring, editing, MCP coordination, Geometry AST, patch workflows, examples, and CLI development guidance. Use when working with GlyphSmith projects, drawing or modifying SVG-equivalent geometry, configuring agent skills/MCP, or deciding whether to use MCP versus offline .gs.json edits.
---

# GlyphSmith

Use this skill when working on a GlyphSmith project, especially through an active GlyphSmith MCP/editor session.

GlyphSmith is a Geometry AST based SVG editor. Treat SVG text as import/export format only.

## Rules

* Read and write Geometry AST project data, not raw SVG strings.
* Prefer patch operations for small edits.
* Keep one page equivalent to one SVG document.
* Check `projectPrompt` before creating or editing generated artwork, and follow it as the project-wide art direction when present.
* Use MCP tools for an active editor session when they are available.
* Default rule: do not directly edit `.gs.json`.
* While the GlyphSmith CLI host or MCP server is running, always use MCP tools so the editor, revision, autosave, and WebSocket sync stay consistent.
* Direct `.gs.json` edits are fallback-only for offline workflows, such as examples, fixtures, migrations, or cases where no active editor/MCP host is available.
* If offline direct edits are unavoidable, preserve project/page metadata, make minimal Geometry AST changes, and avoid rewriting the whole project.

## Related Skills

Use these focused GlyphSmith skills when the task needs their details:

* `glyphsmith-mcp`: active editor sessions, MCP resources/tools, patch application, selection, page operations, and SVG export through the host.
* `glyphsmith-ast`: Geometry AST schema, node fields, path segments, text, groups, and project/page structure.
* `glyphsmith-patch`: patch operation shapes and small edit patterns for Geometry AST changes.

For active editor work, prefer `glyphsmith-mcp` first, then load `glyphsmith-ast` or `glyphsmith-patch` only when schema or patch details are needed.

## Examples

Examples are first-class projects:

```txt
examples/playground.gs.json
examples/glyphsmith.gs.json
```

Use `pnpm run dev` for the playground project.
Use `pnpm run dev:icons` for the official GlyphSmith icon set.
Do not hardcode assumptions about a specific example project.

## Installation

Install GlyphSmith skills into agent skill directories with:

```bash
glyphsmith skills install codex
glyphsmith skills install claude
```

Use `glyphsmith skills install claude --project <project-dir>` for project-local Claude skills.

Register the default local MCP endpoint with:

```bash
glyphsmith mcp install codex --url http://127.0.0.1:6202/mcp
glyphsmith mcp install claude --url http://127.0.0.1:6202/mcp
```
