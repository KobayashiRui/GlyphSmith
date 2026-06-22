import { copyFile, cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cliDirectory = resolve(root, "apps/cli");

await rm(resolve(cliDirectory, "web"), { force: true, recursive: true });
await cp(resolve(root, "apps/web/build"), resolve(cliDirectory, "web"), { recursive: true });

await rm(resolve(cliDirectory, "skills"), { force: true, recursive: true });
await cp(resolve(root, "skills"), resolve(cliDirectory, "skills"), { recursive: true });

await copyFile(resolve(root, "README.md"), resolve(cliDirectory, "README.md"));
await copyFile(resolve(root, "README.ja.md"), resolve(cliDirectory, "README.ja.md"));
await copyFile(resolve(root, "LICENSE"), resolve(cliDirectory, "LICENSE"));
