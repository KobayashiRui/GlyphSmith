import { chmod, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const cliEntry = resolve(root, "apps/cli/src/index.ts");
const cliOutput = resolve(root, "apps/cli/dist/index.js");

const internalPackageEntries = new Map([
  ["@glyphsmith/ast", "packages/ast/src/index.ts"],
  ["@glyphsmith/editor", "packages/editor/src/index.ts"],
  ["@glyphsmith/kernel", "packages/kernel/src/index.ts"],
  ["@glyphsmith/mcp", "packages/mcp/src/index.ts"],
  ["@glyphsmith/svg", "packages/svg/src/index.ts"]
]);

const internalWorkspacePlugin = {
  name: "glyphsmith-internal-workspace",
  setup(builder) {
    builder.onResolve({ filter: /^@glyphsmith\/[a-z-]+$/ }, (args) => {
      const entry = internalPackageEntries.get(args.path);

      if (!entry) {
        return undefined;
      }

      return { path: resolve(root, entry) };
    });
  }
};

await rm(resolve(root, "apps/cli/dist"), { force: true, recursive: true });

await build({
  bundle: true,
  entryPoints: [cliEntry],
  format: "esm",
  logLevel: "info",
  outfile: cliOutput,
  platform: "node",
  plugins: [internalWorkspacePlugin],
  sourcemap: true,
  target: "node18"
});

await chmod(cliOutput, 0o755);
