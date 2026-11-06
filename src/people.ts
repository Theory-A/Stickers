import directory from '../tt.json' with { type: 'json' };
import previewCache from '../assets/tt-previews.json' with { type: 'json' };

export type Person = typeof directory.people[number];
export const people: Person[] = directory.people;
export const events = directory.events;
interface CachedPreview { url: string; image?: string; imageAlt?: string; title?: string | null; siteName?: string | null }
const previews: Record<string, CachedPreview> = previewCache;
export const links = directory.links.map(link => {
 const cached = previews[link.id]?.url === link.url ? previews[link.id] : undefined;
 const localImage = cached?.image && /^\/people-previews\/link-\d+\.webp$/.test(cached.image) ? cached.image : undefined;
 return {
  id: link.id, url: link.url, label: link.label, type: link.type,
  image: localImage ?? safeUrl(link.thumbnail_url ?? link.preview.image_url ?? link.preview.open_graph.image_url ?? link.preview.twitter_card.image_url),
  imageAlt: link.preview.image_alt ?? cached?.imageAlt ?? link.label,
  previewTitle: link.preview.title ?? cached?.title ?? link.label,
  siteName: link.preview.site_name ?? cached?.siteName ?? new URL(link.url).hostname.replace(/^www\./, '')
 };
});

export function personSearchText(person: Person): string {
 return [person.name, ...person.aliases, person.description, person.public_profile_bio ?? '',
  ...person.tags.map(tag => tag.replaceAll('_', ' ')),
  ...person.projects.flatMap(project => [project.name, project.summary]),
  ...person.event_recap.flatMap(event => [event.title, event.summary, `#${event.event_id}`])
 ].join(' ').normalize('NFKC').toLowerCase();
}

export function avatarInitials(name: string): string {
 const words = name.trim().split(/\s+/);
 return (words.length > 1 ? words.map(word => Array.from(word)[0]).slice(0, 2).join('') : Array.from(name).slice(0, 2).join('')).toUpperCase();
}

export function safeUrl(value: string | null): string | undefined {
 if (!value) return;
 try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') return url.href; } catch { /* Not a web link. */ }
}
