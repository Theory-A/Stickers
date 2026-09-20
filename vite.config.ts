import { defineConfig, loadEnv } from 'vite';
import { createApi } from './server/api.ts';
export default defineConfig(({mode}) => {
 const env = {...loadEnv(mode,process.cwd(),''),...process.env};
 return {plugins:[{name:'sticker-api',configureServer(server){server.middlewares.use(createApi(env));},configurePreviewServer(server){server.middlewares.use(createApi(env));}}]};
});
