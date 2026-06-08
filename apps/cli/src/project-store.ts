import { createHash } from "node:crypto";
import { existsSync, readFileSync, unwatchFile, watchFile, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createProject, isGlyphSmithProject, type GlyphSmithProject, type Selection } from "@glyphsmith/ast";

export type ProjectChange = {
  project: GlyphSmithProject;
  revision: string;
  source?: unknown;
};

export type ProjectChangeListener = (change: ProjectChange) => void;

export class ProjectStore {
  readonly projectFile: string;

  private lastProjectText: string;
  private listeners = new Set<ProjectChangeListener>();
  private currentSelection: Selection = { nodeIds: [] };

  constructor(projectFile: string) {
    this.projectFile = projectFile;
    this.ensureProjectFile();
    this.lastProjectText = this.readProjectText();

    watchFile(this.projectFile, { interval: 500 }, () => {
      const nextProjectText = this.readProjectText();

      if (nextProjectText === this.lastProjectText) {
        return;
      }

      this.lastProjectText = nextProjectText;
      this.emitChange({ project: this.parseProjectText(nextProjectText), revision: this.revision() });
    });
  }

  close(): void {
    unwatchFile(this.projectFile);
    this.listeners.clear();
  }

  subscribe(listener: ProjectChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  readProject(): GlyphSmithProject {
    return this.parseProjectText(this.lastProjectText);
  }

  writeProject(project: GlyphSmithProject, source?: unknown): ProjectChange {
    const projectText = `${JSON.stringify(project, null, 2)}\n`;

    writeFileSync(this.projectFile, projectText, "utf8");
    this.lastProjectText = projectText;

    const change = {
      project,
      revision: this.revision(),
      source
    };

    this.emitChange(change);

    return change;
  }

  updateProject(mutator: (project: GlyphSmithProject) => GlyphSmithProject, source?: unknown): ProjectChange {
    return this.writeProject(mutator(this.readProject()), source);
  }

  revision(): string {
    return createHash("sha1").update(this.lastProjectText).digest("hex");
  }

  selection(): Selection {
    return this.currentSelection;
  }

  setSelection(selection: Selection): void {
    this.currentSelection = selection;
  }

  private ensureProjectFile(): void {
    if (existsSync(this.projectFile)) {
      return;
    }

    writeFileSync(this.projectFile, `${JSON.stringify(createInitialProject(this.projectFile), null, 2)}\n`, "utf8");
  }

  private readProjectText(): string {
    return readFileSync(this.projectFile, "utf8");
  }

  private parseProjectText(projectText: string): GlyphSmithProject {
    const project = JSON.parse(projectText) as unknown;

    if (!isGlyphSmithProject(project)) {
      throw new Error(`Invalid GlyphSmith project: ${this.projectFile}`);
    }

    return project;
  }

  private emitChange(change: ProjectChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}

export function createInitialProject(projectFile: string): GlyphSmithProject {
  return createProject({
    name: basename(projectFile).replace(/\.gs\.json$/i, "") || "GlyphSmith Project",
    width: 256,
    height: 256
  });
}
