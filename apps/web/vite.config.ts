import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 6001);

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port,
		strictPort: true
	}
});
