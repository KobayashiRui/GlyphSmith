import { isGlyphSmithProject } from '@glyphsmith/ast';
import { existsSync, readFileSync } from 'node:fs';

export function load() {
	const projectFile = process.env.GLYPHSMITH_PROJECT_FILE;

	if (!projectFile || !existsSync(projectFile)) {
		return {};
	}

	try {
		const project = JSON.parse(readFileSync(projectFile, 'utf8'));

		if (!isGlyphSmithProject(project)) {
			return {
				projectFile
			};
		}

		return {
			initialProject: project,
			projectFile
		};
	} catch {
		return {
			projectFile
		};
	}
}
