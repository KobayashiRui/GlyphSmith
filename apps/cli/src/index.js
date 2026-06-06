#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = "6001";
const cliDirectory = fileURLToPath(new URL(".", import.meta.url));

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const projectFile = resolveProjectFile(options.projectFile);

  ensureProjectFile(projectFile);

  if (options.command === "init") {
    console.log(`✓ Project created at ${projectFile}`);
    return;
  }

  const port = options.port ?? DEFAULT_PORT;

  console.log(`✓ Project: ${projectFile}`);
  console.log(`✓ UI running on http://127.0.0.1:${port}`);

  const child = spawn("pnpm", ["--filter", "web", "dev", "--host", "127.0.0.1"], {
    cwd: resolve(cliDirectory, "../../.."),
    env: {
      ...process.env,
      GLYPHSMITH_PROJECT_FILE: projectFile,
      PORT: port
    },
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
}

function ensureProjectFile(projectFile) {
  if (existsSync(projectFile)) {
    return;
  }

  writeFileSync(projectFile, `${JSON.stringify(createProject(projectFile), null, 2)}\n`, "utf8");
}

function resolveProjectFile(projectFile) {
  const rawPath = projectFile ?? "glyphsmith.gs.json";
  const trimmedPath = rawPath.replace(/[\\/]+$/, "");
  const filePath = /\.gs\.json$/i.test(trimmedPath) ? trimmedPath : `${trimmedPath}.gs.json`;

  return resolve(process.cwd(), filePath);
}

function createProject(projectFile) {
  const now = new Date().toISOString();
  const name = basename(projectFile).replace(/\.gs\.json$/i, "") || "GlyphSmith Project";

  return {
    schemaVersion: 1,
    id: "project-1",
    name,
    activePageId: "page-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        document: {
          id: "page-1-document",
          name: "Page 1",
          width: 256,
          height: 256,
          root: {
            id: "root",
            type: "group",
            name: "Root",
            children: []
          },
          comments: []
        }
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

function parseArgs(args) {
  const options = {
    command: "open",
    help: false,
    port: undefined,
    projectFile: undefined
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "init" && options.command === "open" && options.projectFile === undefined) {
      options.command = "init";
      continue;
    }

    if (arg === "--port") {
      const value = args[index + 1];

      if (!value || value.startsWith("-")) {
        throw new Error("--port requires a value.");
      }

      options.port = parsePort(value);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--port=")) {
      options.port = parsePort(arg.slice("--port=".length));
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.projectFile !== undefined) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    options.projectFile = arg;
  }

  return options;
}

function parsePort(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid port: ${value}`);
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return String(port);
}

function printHelp() {
  console.log(`GlyphSmith

Usage:
  glyphsmith [project]
  glyphsmith init [project]

Project paths may omit .gs.json:
  glyphsmith logo       -> logo.gs.json
  glyphsmith logo.gs.json

Options:
  --port <port>  Web UI port. Defaults to ${DEFAULT_PORT}.
`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
