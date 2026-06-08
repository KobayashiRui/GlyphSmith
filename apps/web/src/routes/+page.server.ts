import { isGlyphSmithProject } from '@glyphsmith/ast';
import { existsSync, readFileSync } from 'node:fs';

export function load() {
	const isDevelopment = process.env.NODE_ENV !== 'production';
	const projectFile =
		process.env.GLYPHSMITH_PROJECT_FILE ?? (isDevelopment ? '/private/tmp/glyphsmith-dev.gs.json' : undefined);
	const hostWebSocketUrl =
		process.env.GLYPHSMITH_HOST_WS_URL ?? (isDevelopment ? 'ws://localhost:6202/ws' : undefined);

	if (!projectFile || !existsSync(projectFile)) {
		return {
			hostWebSocketUrl
		};
	}

	try {
		const project = JSON.parse(readFileSync(projectFile, 'utf8'));

		if (!isGlyphSmithProject(project)) {
			return {
				hostWebSocketUrl,
				projectFile
			};
		}

		return {
			initialProject: project,
			hostWebSocketUrl,
			projectFile
		};
	} catch {
		return {
			hostWebSocketUrl,
			projectFile
		};
	}
}
