import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Render.com serves from the build directory
			pages: 'build',
			assets: 'build',
			fallback: 'index.html', // SPA mode
			precompress: false,
			strict: true
		})
	}
};

export default config;
