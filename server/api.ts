import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { createSearchService } from './search.ts';
import { createPeopleSearchService } from './peopleSearch.ts';
import { people } from '../src/people.ts';
import type { Sticker } from '../src/types.ts';

export function createApi(
 env: Record<string, string | undefined>,
 catalogPath: string | URL = new URL('../public/stickers/catalog.json', import.meta.url)
) {
 let catalogVersion = '';
 let stickerCount = 0;
 const apiKey = env.TYPESAFE_API_KEY?.trim();
 const client = apiKey
  ? new TypeSafeClient({ apiKey, defaultModel: env.TYPESAFE_DEFAULT_MODEL || 'jev-latest', timeout: 12000, retry: { maxRetries: 1 } })
  : undefined;
 const searchPeople = createPeopleSearchService(people, client);
 let search: ReturnType<typeof createSearchService> | undefined;

 const reloadCatalog = () => {
  const stat = statSync(catalogPath);
  const version = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  if (version === catalogVersion && search) return;
  const stickers: Sticker[] = JSON.parse(readFileSync(catalogPath, 'utf8'));
  search = createSearchService(stickers, client); // A new catalog also invalidates cached answers.
  stickerCount = stickers.length;
  catalogVersion = version;
 };

 // Best-effort warm load so a missing sticker catalog cannot break /api/people-search.
 try { reloadCatalog(); } catch { /* Loaded lazily on sticker routes. */ }

 let active = 0;
 return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return next();
  const send = (status: number, data: unknown) => {
   if (res.destroyed) return;
   res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
   res.end(JSON.stringify(data));
  };

  if (url.pathname === '/api/status' && req.method === 'GET') {
   try { reloadCatalog(); } catch { /* Report peopleCount even if sticker catalog is temporarily unavailable. */ }
   return send(200, { mode: client ? 'jev' : 'local', stickerCount, peopleCount: people.length, catalogVersion });
  }

  if (url.pathname !== '/api/search' && url.pathname !== '/api/people-search') {
   return send(404, { error: 'Not found' });
  }
  if (req.method !== 'POST') return send(405, { error: 'Use POST' });

  if (url.pathname === '/api/search') {
   try { reloadCatalog(); } catch { return send(503, { error: 'The sticker catalog is updating. Please try again.' }); }
  }

  if (active >= 8) return send(429, { error: 'Search is busy. Please try again.' });
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', abort);
  active++;
  try {
   // Vercel parses the body before invoking a Node function; local Node/Vite
   // requests still expose the raw stream.
   const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
   let body = '';
   if (parsedBody !== undefined) {
    body = typeof parsedBody === 'string'
     ? parsedBody
     : Buffer.isBuffer(parsedBody)
      ? parsedBody.toString('utf8')
      : JSON.stringify(parsedBody);
   } else {
    for await (const chunk of req) {
     body += chunk;
     if (Buffer.byteLength(body) > 4096) {
      send(413, { error: 'Request too large' });
      return;
     }
    }
   }
   if (Buffer.byteLength(body) > 4096) return send(413, { error: 'Request too large' });
   let data: unknown;
   try { data = JSON.parse(body); } catch { return send(400, { error: 'Invalid JSON' }); }
   const query = (data as { query?: unknown })?.query;
   if (typeof query !== 'string' || query.length > 240) {
    return send(400, { error: 'Search must be text of at most 240 characters.' });
   }
   const result = await (url.pathname === '/api/people-search' ? searchPeople : search!)(query, controller.signal);
   send(200, result);
  } catch (error) {
   if (!controller.signal.aborted) {
    console.error('Search request failed:', error instanceof Error ? error.name : 'Unknown error');
    send(502, { error: 'Search is unavailable. Please try again.' });
   }
  } finally {
   active--;
   res.off('close', abort);
  }
 };
}
