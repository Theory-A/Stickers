import {
 appearanceCount,
 exactNameMatches,
 matchesKeywordQuery,
 type Person,
 type TabEvent
} from './people.ts';

export interface BadgeTier {
 id: string;
 minimum: number;
 name: string;
 zh: string;
 lightText: boolean;
 image: string;
}

export interface BadgeInfo {
 count: number;
 tier: BadgeTier;
 next: BadgeTier | null;
 description: string;
 image: string;
}

export const BADGE_TIERS: readonly BadgeTier[] = [
 { id: 'copper', minimum: 1, name: 'Copper', zh: '赤铜', lightText: false, image: '/tab-thursday/badges/copper.webp' },
 { id: 'steel', minimum: 2, name: 'Steel', zh: '精钢', lightText: false, image: '/tab-thursday/badges/steel.webp' },
 { id: 'enamel', minimum: 3, name: 'Enamel', zh: '珐琅', lightText: true, image: '/tab-thursday/badges/enamel.webp' },
 { id: 'gold', minimum: 4, name: 'Gold', zh: '鎏金', lightText: true, image: '/tab-thursday/badges/gold.webp' },
 { id: 'crystal', minimum: 6, name: 'Crystal', zh: '晶石', lightText: false, image: '/tab-thursday/badges/crystal.webp' },
 { id: 'prismatic', minimum: 8, name: 'Prismatic', zh: '虹彩', lightText: false, image: '/tab-thursday/badges/prismatic.webp' },
 { id: 'obsidian', minimum: 10, name: 'Obsidian', zh: '曜石', lightText: true, image: '/tab-thursday/badges/obsidian.webp' },
 { id: 'anchor', minimum: 12, name: 'Community Anchor', zh: '社区锚点', lightText: false, image: '/tab-thursday/badges/centennial.webp' }
] as const;

export const EVENT_COLORS = ['#1f725b', '#b8562b', '#3561a3', '#864886'] as const;

export function eventColor(index: number): string {
 return EVENT_COLORS[((index % EVENT_COLORS.length) + EVENT_COLORS.length) % EVENT_COLORS.length];
}

export function formatShortDate(isoDate: string): string {
 return isoDate.slice(5).replace('-', '.');
}

export function badgeForCount(count: number): BadgeInfo {
 if (!Number.isSafeInteger(count) || count < 1) {
  throw new RangeError('Badge count must be a positive safe integer');
 }
 let tierIndex = 0;
 for (let i = BADGE_TIERS.length - 1; i >= 0; i--) {
  if (count >= BADGE_TIERS[i].minimum) {
   tierIndex = i;
   break;
  }
 }
 const tier = BADGE_TIERS[tierIndex];
 const next = BADGE_TIERS[tierIndex + 1] ?? null;
 const description = `${count} 场记录 · ${tier.zh} ${tier.name}${
  next ? ` · ${next.minimum} 场解锁${next.zh}` : ' · 最高徽章，继续累积'
 }`;
 return {
  count,
  tier,
  next,
  description,
  image: tier.image
 };
}

export interface TimelineStop {
 index: number;
 event: TabEvent;
 color: string;
 people: Person[];
 firstCount: number;
 returningCount: number;
 cumulativeCount: number;
}

export function buildTimelineStops(events: readonly TabEvent[], allPeople: readonly Person[]): TimelineStop[] {
 const seen = new Set<string>();
 const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));
 return ordered.map((event, index) => {
  const presenters = allPeople.filter(person => person.appearances.some(a => a.eventId === event.id));
  const returningCount = presenters.filter(person => seen.has(person.id)).length;
  for (const person of presenters) seen.add(person.id);
  return {
   index,
   event,
   color: eventColor(index),
   people: presenters,
   firstCount: presenters.length - returningCount,
   returningCount,
   cumulativeCount: seen.size
  };
 });
}

export function firstEventIdForPerson(person: Person, stops: readonly TimelineStop[]): string | undefined {
 return stops.find(stop => person.appearances.some(a => a.eventId === stop.event.id))?.event.id;
}

export type SortMode = 'appearances' | 'name' | 'recent';

export interface FilterState {
 query: string;
 eventId: string;
 repeatsOnly: boolean;
 sort: SortMode;
}

export const DEFAULT_FILTER_STATE: FilterState = {
 query: '',
 eventId: '',
 repeatsOnly: false,
 sort: 'appearances'
};

export function hasActiveFilters(state: FilterState): boolean {
 return Boolean(state.query.trim() || state.eventId || state.repeatsOnly);
}

export function filterAndSortPeople(
 allPeople: readonly Person[],
 state: FilterState,
 semanticIds?: ReadonlySet<string>
): Person[] {
 const trimmed = state.query.trim();
 const exact = trimmed && !semanticIds ? exactNameMatches(trimmed, allPeople) : [];
 const exactIds = exact.length ? new Set(exact.map(person => person.id)) : undefined;

 const filtered = allPeople.filter(person => {
  if (state.repeatsOnly && appearanceCount(person) < 2) return false;
  if (state.eventId && !person.appearances.some(a => a.eventId === state.eventId)) return false;
  if (!trimmed) return true;
  if (semanticIds) return semanticIds.has(person.id);
  if (exactIds) return exactIds.has(person.id);
  return matchesKeywordQuery(person, trimmed);
 });

 const sorted = filtered.sort((a, b) => {
  if (state.sort === 'name') {
   return a.name.localeCompare(b.name, 'zh-CN');
  }
  if (state.sort === 'recent') {
   const latest = (person: Person) =>
    person.appearances.map(appearance => appearance.eventId).sort().at(-1) ?? '';
   const diff = latest(b).localeCompare(latest(a));
   if (diff !== 0) return diff;
  }
  return appearanceCount(b) - appearanceCount(a) || a.id.localeCompare(b.id);
 });

 if (state.sort !== 'name') {
  const owenIndex = sorted.findIndex(person => person.id === 'p001');
  const haitaoIndex = sorted.findIndex(person => person.id === 'p007');
  if (owenIndex >= 0 && haitaoIndex >= 0 && haitaoIndex !== owenIndex + 1) {
   const [haitao] = sorted.splice(haitaoIndex, 1);
   sorted.splice(sorted.findIndex(person => person.id === 'p001') + 1, 0, haitao);
  }
 }

 return sorted;
}

export interface ContinuitySpan {
 indices: number[];
 hasConnector: boolean;
 hasGap: boolean;
 lineStartPct: number;
 lineWidthPct: number;
}

export function continuitySpan(person: Person, stops: readonly TimelineStop[]): ContinuitySpan {
 const indices = stops.flatMap((stop, index) =>
  person.appearances.some(a => a.eventId === stop.event.id) ? [index] : []
 );
 if (indices.length <= 1 || stops.length === 0) {
  return { indices, hasConnector: false, hasGap: false, lineStartPct: 0, lineWidthPct: 0 };
 }
 const first = indices[0];
 const last = indices[indices.length - 1];
 return {
  indices,
  hasConnector: true,
  hasGap: indices.length !== last - first + 1,
  lineStartPct: ((first + 0.5) / stops.length) * 100,
  lineWidthPct: ((last - first) / stops.length) * 100
 };
}

export function totalAppearances(allPeople: readonly Person[]): number {
 return allPeople.reduce((sum, person) => sum + appearanceCount(person), 0);
}

export function repeatPresenterCount(allPeople: readonly Person[]): number {
 return allPeople.filter(person => appearanceCount(person) >= 2).length;
}

export function dateRangeKicker(stops: readonly TimelineStop[]): string {
 if (!stops.length) return 'TAB THURSDAY';
 const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
 const first = stops[0].event.date;
 const last = stops[stops.length - 1].event.date;
 const [y1, m1] = first.split('-').map(Number);
 const [y2, m2] = last.split('-').map(Number);
 const m1Name = months[(m1 ?? 1) - 1] ?? '';
 const m2Name = months[(m2 ?? 1) - 1] ?? '';
 if (y1 === y2) {
  return m1 === m2 ? `${y1} / ${m1Name}` : `${y1} / ${m1Name} — ${m2Name}`;
 }
 return `${y1} ${m1Name} — ${y2} ${m2Name}`;
}
