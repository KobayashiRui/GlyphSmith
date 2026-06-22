<p align="center">
  <img src="docs/images/app-icon.svg" alt="GlyphSmith" width="72" height="72" />
</p>

<h1 align="center">GlyphSmith</h1>

<p align="center">
  Geometry AST と patch-based editing で動く、agent-native な SVG エディタ。
</p>

<p align="center">
  <a href="README.md">English</a> | 日本語
</p>

GlyphSmith は、手作業での編集と AI エージェントによる編集の両方を前提にした SVG エディタです。
エージェントに SVG 文字列全体を書き換えさせるのではなく、SVG を Geometry AST に import し、
対象を絞った patch operation を適用し、境界部分でだけ SVG として export します。

![GlyphSmith editor](docs/images/editor.png)

```txt
SVG
↓ Import
Geometry AST
↓ Patch Operations
Geometry AST
↓ Export
SVG
```

## Status

GlyphSmith は開発初期段階です。現在のリリースは CLI-first で、ローカルの editor session、project file、SVG export、MCP ベースの agent workflow にフォーカスしています。

## Quick Start

依存関係をインストールします。

```sh
pnpm install
```

新規プロジェクトを開始します。

```sh
pnpm --filter glyphsmith run build
node apps/cli/dist/index.js my-logo
```

これは `./my-logo.gs.json` を開きます。ファイルが存在しない場合、GlyphSmith が自動で作成します。

デフォルトの開発用プロジェクトを起動します。

```sh
pnpm run dev
```

開発時のデフォルト:

```txt
Project: examples/playground.gs.json
UI:      http://localhost:6201
Host:    ws://localhost:6202/ws
MCP:     http://localhost:6202/mcp
```

公式 GlyphSmith icon project を起動します。

```sh
pnpm run dev:icons
```

## Export Icons

icon project を web app の static directory に export します。

```sh
pnpm run export:icons
```

生成された SVG ファイルはここに出力されます。

```txt
apps/web/static/icons
```

同じコマンドを再実行すると、生成済みの icon output は上書きされます。

## Agent Workflow

GlyphSmith では Geometry AST が source of truth です。AI エージェントは SVG ファイル全体を再生成するのではなく、patch operation または MCP tool を通じて project を変更します。

デフォルトのローカル MCP endpoint:

```txt
http://127.0.0.1:6202/mcp
```

ローカル MCP endpoint を登録します。

```sh
glyphsmith mcp install codex --url http://127.0.0.1:6202/mcp
glyphsmith mcp install claude --url http://127.0.0.1:6202/mcp
```

GlyphSmith skill をインストールします。

```sh
glyphsmith skills install codex
glyphsmith skills install claude
```

## Project Files

GlyphSmith の project file は `.gs.json` 拡張子を使い、複数ページを含められます。1ページは1つの SVG-equivalent な Geometry AST document に対応します。

Examples:

```txt
examples/playground.gs.json
examples/glyphsmith.gs.json
```

CLI の path resolution は決定的です。

```txt
glyphsmith              -> ./glyphsmith.gs.json
glyphsmith logo         -> ./logo.gs.json
glyphsmith logo.gs.json -> ./logo.gs.json
```

解決された project file が存在しない場合、CLI はそのファイルを作成して処理を続行します。

## Repository Layout

```txt
apps/
├ cli/  Local host, CLI entrypoint, MCP coordination
└ web/  SvelteKit editor UI

packages/
├ ast/     Geometry AST definitions
├ editor/  Reusable editor interaction logic
├ kernel/  Geometry operations
├ mcp/     MCP server implementation
└ svg/     SVG import/export
```

## README Assets

README 用の画像は `docs/images` に置きます。アプリ実行時の asset は `apps/web/static` に置きます。

現在の README assets:

```txt
docs/images/app-icon.svg
docs/images/editor.png
```
