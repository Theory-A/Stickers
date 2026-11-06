import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApi } from './server/api.ts';

// Vite's HTML fallback only resolves nested index pages with a trailing slash.
function thursdayRoute(req: IncomingMessage, _res: ServerResponse, next: () => void) {
 const url = new URL(req.url || '/', 'http://localhost');
 if (url.pathname === '/tab-thursday' || url.pathname === '/tab-thursday/') {
  req.url = `/tab-thursday/index.html${url.search}`;
 }
 next();
}

export default defineConfig(({ mode }) => {
 const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
 return {
  build: { rolldownOptions: { input: {
   main: fileURLToPath(new URL('./index.html', import.meta.url)),
   thursday: fileURLToPath(new URL('./tab-thursday/index.html', import.meta.url))
  } } },
  plugins: [{
   name: 'sticker-api',
   configureServer(server) {
    server.middlewares.use(createApi(env));
    server.middlewares.use(thursdayRoute);
   },
   configurePreviewServer(server) {
    server.middlewares.use(createApi(env));
    server.middlewares.use(thursdayRoute);
   }
  }]
 };
});
