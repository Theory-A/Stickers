export interface Sticker {
 id: string; title: string; source: string; sourceFolder?: string; image: string; downloadImage?: string; width: number; height: number;
 people?: string[]; description: string; subjects: string[]; colors: string[]; clothing: string[];
 objects: string[]; actions: string[]; moods: string[]; tags: string[];
}
export interface SearchMatch { id: string; score: number }
export interface SearchResponse { matches: SearchMatch[]; mode: 'local' | 'jev'; query: string }
export function parseSearchResponse(value: unknown, ids: Set<string>): SearchResponse {
 if (!value || typeof value !== 'object') throw new Error('Invalid search response');
 const data = value as Record<string, unknown>;
 if (!Array.isArray(data.matches) || data.matches.length > 10 || !['local','jev'].includes(String(data.mode)) || typeof data.query !== 'string') throw new Error('Invalid search response');
 const seen = new Set<string>();
 for (const m of data.matches) {
  if (!m || typeof m.id !== 'string' || !ids.has(m.id) || seen.has(m.id) || typeof m.score !== 'number' || !Number.isFinite(m.score) || m.score < 0 || m.score > 1) throw new Error('Invalid match');
  seen.add(m.id);
 }
 return data as unknown as SearchResponse;
}
