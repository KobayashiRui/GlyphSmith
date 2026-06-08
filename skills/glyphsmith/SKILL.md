# GlyphSmith

Use this skill when working on a GlyphSmith project or editing a `.gs.json` file.

GlyphSmith is a Geometry AST based SVG editor. Treat SVG text as import/export format only.

## Rules

* Read and write Geometry AST project data, not raw SVG strings.
* Prefer patch operations for small edits.
* Keep one page equivalent to one SVG document.
* Preserve `.gs.json` project structure and page metadata.
* Check `projectPrompt` before creating or editing generated artwork, and follow it as the project-wide art direction when present.
* Use MCP tools for an active editor session when they are available.
* Do not directly edit `.gs.json` while the GlyphSmith CLI host is running. Use MCP so the editor, revision, and WebSocket sync stay consistent.
* Direct `.gs.json` edits are acceptable for offline workflows when no active editor/MCP host is available.

## Installation

Install GlyphSmith skills into agent skill directories with:

```bash
glyphsmith skills install codex
glyphsmith skills install claude
```

Use `glyphsmith skills install claude --project <project-dir>` for project-local Claude skills.
