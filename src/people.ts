import rawDirectory from '../tt.json' with { type: 'json' };
import rawPreviews from '../assets/tt-previews.json' with { type: 'json' };

export interface DirectoryLink {
 label: string;
 href: string;
}

export interface LinkPreview {
 url: string;
 image?: string;
 imageAlt: string;
 title?: string;
 siteName: string;
}

export interface Appearance {
 eventId: string;
 sourceName: string;
 title: string;
 summary: string;
 links: DirectoryLink[];
}

export interface PersonProfile {
 summary: string;
 roles: string[];
 focus_areas: string[];
 notable_projects: string[];
 sources_checked: string[];
 status: 'verified' | 'partial' | 'appearances_only';
}

export interface Person {
 id: string;
 name: string;
 aliases: string[];
 website: string | null;
 profile?: PersonProfile;
 appearances: Appearance[];
}

export interface TabEvent {
 id: string;
 date: string;
 venue: string;
 source: string;
 presenterCount: number;
}

export interface TabDirectory {
 updated: string;
 events: TabEvent[];
 people: Person[];
}

export const directory: TabDirectory = rawDirectory as TabDirectory;
export const updated: string = directory.updated;
export const events: TabEvent[] = [...directory.events].sort((a, b) => a.date.localeCompare(b.date));
export const eventById: ReadonlyMap<string, TabEvent> = new Map(events.map(event => [event.id, event]));
export const people: Person[] = directory.people;
export const personById: ReadonlyMap<string, Person> = new Map(people.map(person => [person.id, person]));

export function appearanceCount(person: Person): number {
 return new Set(person.appearances.map(appearance => appearance.eventId)).size;
}

export function appearanceForEvent(person: Person, eventId: string): Appearance | undefined {
 return person.appearances.find(appearance => appearance.eventId === eventId);
}

export function personSearchText(person: Person): string {
 return [
  person.name,
  ...person.aliases,
  ...(person.profile
   ? [
    person.profile.summary,
    ...person.profile.roles,
    ...person.profile.focus_areas,
    ...person.profile.notable_projects
   ]
   : []),
  ...person.appearances.flatMap(appearance => [
   appearance.sourceName,
   appearance.title,
   appearance.summary,
   `#${appearance.eventId}`,
   ...appearance.links.map(link => link.label)
  ])
 ].join(' ').normalize('NFKC').toLowerCase();
}

export function exactNameMatches(query: string, allPeople: readonly Person[]): Person[] {
 const normalized = query.trim().normalize('NFKC').toLowerCase();
 if (!normalized) return [];
 return allPeople.filter(person => {
  const names = [
   person.name,
   ...person.aliases,
   ...person.appearances.map(appearance => appearance.sourceName)
  ];
  return names.some(name => name.normalize('NFKC').toLowerCase() === normalized);
 });
}

export function matchesKeywordQuery(person: Person, query: string): boolean {
 const terms = query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
 if (!terms.length) return false;
 const text = personSearchText(person);
 const words = new Set(text.match(/[\p{L}\p{N}]+/gu));
 return terms.every(term =>
  /\p{Script=Han}/u.test(term)
   ? text.includes(term)
   : words.has(term) || words.has(term.replace(/s$/, '')) || words.has(`${term}s`) || text.includes(term)
 );
}

export function avatarInitials(name: string): string {
 const trimmed = name.trim();
 if (/\p{Script=Han}/u.test(trimmed)) return Array.from(trimmed).slice(0, 2).join('');
 const words = trimmed.split(/\s+/).filter(Boolean);
 return (words.length > 1
  ? words.map(word => Array.from(word)[0]).slice(0, 2).join('')
  : Array.from(trimmed).slice(0, 2).join('')
 ).toUpperCase();
}

export function safeUrl(value: string | null | undefined): string | undefined {
 if (!value) return undefined;
 try {
  const url = new URL(value);
  if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
 } catch {
  // Ignore invalid or non-HTTP URLs.
 }
 return undefined;
}

interface RawPreviewEntry {
 url?: string;
 image?: string | null;
 imageAlt?: string | null;
 title?: string | null;
 siteName?: string | null;
 status?: string;
}

const SAFE_PREVIEW_IMAGE_RE = /^\/people-previews\/[a-z0-9-]+\.webp$/;
const previewEntries = rawPreviews as Record<string, RawPreviewEntry>;

export function normalizePreviewUrl(rawUrl: string | null | undefined): string | undefined {
 const safe = safeUrl(rawUrl);
 if (!safe) return undefined;
 const parsed = new URL(safe);
 const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
 const port = parsed.port ? `:${parsed.port}` : '';
 const path = parsed.pathname.replace(/\/+$/, '');
 return `${parsed.protocol}//${host}${port}${path}${parsed.search}`;
}

function fallbackSiteName(rawUrl: string): string {
 try {
  return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
 } catch {
  return rawUrl;
 }
}

export function linkPreview(rawUrl: string | null | undefined): LinkPreview | undefined {
 const normalized = normalizePreviewUrl(rawUrl);
 if (!normalized) return undefined;
 const entry = previewEntries[normalized];
 if (!entry) return undefined;
 const image = typeof entry.image === 'string' && SAFE_PREVIEW_IMAGE_RE.test(entry.image)
  ? entry.image
  : undefined;
 const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined;
 if (!image && !title) return undefined;
 const canonicalUrl = safeUrl(entry.url) ?? safeUrl(rawUrl)!;
 const siteName = typeof entry.siteName === 'string' && entry.siteName.trim()
  ? entry.siteName.trim()
  : fallbackSiteName(canonicalUrl);
 const imageAlt = typeof entry.imageAlt === 'string' && entry.imageAlt.trim()
  ? entry.imageAlt.trim()
  : (title ?? siteName);
 return {
  url: canonicalUrl,
  ...(image ? { image } : {}),
  imageAlt,
  ...(title ? { title } : {}),
  siteName
 };
}

export function appearancePreview(appearance: Appearance): LinkPreview | undefined {
 let fallback: LinkPreview | undefined;
 for (const link of appearance.links) {
  const preview = linkPreview(link.href);
  if (!preview) continue;
  if (preview.image) return preview;
  fallback ??= preview;
 }
 return fallback;
}

export function personPreview(person: Person): LinkPreview | undefined {
 const websitePreview = linkPreview(person.website);
 if (websitePreview?.image) return websitePreview;
 let fallback: LinkPreview | undefined = websitePreview;
 for (const appearance of person.appearances) {
  const preview = appearancePreview(appearance);
  if (!preview) continue;
  if (preview.image) return preview;
  fallback ??= preview;
 }
 return fallback;
}
