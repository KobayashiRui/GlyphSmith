import { json } from '@sveltejs/kit';
import { isGlyphSmithProject } from '@glyphsmith/ast';
import { writeFileSync } from 'node:fs';

export async function POST({ request }) {
	const projectFile = process.env.GLYPHSMITH_PROJECT_FILE;

	if (!projectFile) {
		return json({ ok: false, error: 'Project file is not configured.' }, { status: 400 });
	}

	const project = await request.json();

	if (!isGlyphSmithProject(project)) {
		return json({ ok: false, error: 'Invalid GlyphSmith project.' }, { status: 400 });
	}

	writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

	return json({ ok: true });
}
