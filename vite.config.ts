import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		// Raw import for shader files
		{
			name: 'glsl-loader',
			transform(code, id) {
				if (id.endsWith('.vert') || id.endsWith('.frag') || id.endsWith('.glsl')) {
					return {
						code: `export default ${JSON.stringify(code)};`,
						map: null
					};
				}
			}
		}
	]
});
