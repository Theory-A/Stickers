import './style.css';
import './tabThursday.css';
import { avatarInitials, events, links, people, safeUrl, type Person } from './people';
import { parseSearchResponse } from './types';
import { OceanCurrent } from './oceanCurrent';
import { OceanLife } from './oceanLife';
import { BubbleSurfaces } from './bubbleSurface';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLInputElement>('search');
const status = $('search-status');
const ocean = $('ocean');
const grid = $('people-grid');
const surface = $('surface');
const section = document.querySelector('.search-section')!;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ids = new Set(people.map(person => person.id));
const swimmers = new Map<string, HTMLButtonElement>();
const cards = new Map<string, HTMLElement>();
const animations = new Set<Animation>();
const linkMap = new Map(links.map(link => [link.id, link]));
let version = 0;
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let composing = false;
let paused = reduceMotion.matches;
let searchReportedMode = false;
let current: OceanCurrent | undefined;
let surfacedIds: string[] = [];
const oceanLife = new OceanLife($('app'));
const bubbleSurfaces = new BubbleSurfaces((node, held) => current?.setHeld(node, held));

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
 const node = document.createElement(tag);
 node.className = className;
 if (text !== undefined) node.textContent = text;
 return node;
}
function avatar(person: Person, index: number): HTMLElement {
 const face = element('span', 'person-avatar');
 face.append(element('span', 'avatar-initials', avatarInitials(person.name)));
 face.style.setProperty('--avatar-hue', String([163, 24, 201, 77, 339, 246, 43, 185][index % 8]));
 const url = safeUrl(person.avatar?.url ?? null);
 if (url) {
  const image = element('img', 'avatar-image');
  const source = new URL(url);
  if (source.hostname === 'avatars.githubusercontent.com') source.searchParams.set('s', '256');
  image.alt = ''; image.src = source.href; image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.remove(), { once: true });
  face.append(image);
 }
 return face;
}
function webLink(label: string, rawUrl: string | null): HTMLElement {
 const url = safeUrl(rawUrl);
 if (!url) return element('span', '', label);
 const anchor = element('a', '', `${label} ↗`);
 anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
 return anchor;
}
function cardVisual(person: Person, index: number): HTMLElement {
 const projectLinks = person.projects.map(project => project.link_id).filter((id): id is string => !!id);
 const candidates = [...new Set([...projectLinks, ...person.link_ids])].map(id => linkMap.get(id)).filter(link => !!link);
 const link = candidates.find(link => link.image) ?? candidates.find(link => projectLinks.includes(link.id)) ?? candidates[0];
 const title = link?.previewTitle ?? person.projects[0]?.name ?? person.event_recap[0]?.title ?? person.name;
 const visual = link ? webLink('', link.url) : element('div', '');
 visual.replaceChildren();
 visual.className = 'card-visual';
 visual.style.setProperty('--visual-hue', String([162, 210, 31, 270, 340, 73][index % 6]));
 if (link) visual.setAttribute('aria-label', `Visit ${link.label}`);
 const fallback = element('div', 'visual-fallback');
 fallback.append(element('span', 'visual-kicker', person.projects.length ? 'A PROJECT, AN IDEA' : 'FROM THE TALK'), element('span', 'visual-title', title));
 visual.append(fallback);
 if (link?.image) {
  const image = element('img', 'project-preview');
  image.src = link.image; image.alt = link.imageAlt; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => { image.remove(); visual.classList.remove('has-preview'); }, { once: true });
  visual.classList.add('has-preview'); visual.append(image);
 }
 const caption = element('span', 'visual-caption');
 caption.append(element('span', '', link?.siteName ?? 'Tab Thursday'), element('span', '', link ? '↗' : '✳'));
 visual.append(caption);
 return visual;
}
function makeCard(person: Person, index: number): HTMLElement {
 const card = element('article', 'person-card');
 card.id = `card-${person.id}`;
 card.dataset.personId = person.id;
 card.setAttribute('aria-labelledby', `person-${person.id}`);
 const head = element('div', 'person-heading');
 const identity = element('div', 'person-identity');
 const title = element('h3', '', person.name); title.id = `person-${person.id}`;
 identity.append(title, element('p', 'person-editions', person.event_recap.map(event => `THURSDAY #${event.event_id}`).join(' · ')));
 head.append(avatar(person, index), identity);
 const close = element('button', 'card-close', '×');
 close.type = 'button'; close.setAttribute('aria-label', `Close ${person.name}’s card`);
 close.addEventListener('click', () => {
  setMatches(surfacedIds.filter(id => id !== person.id), 'People you’re getting to know.');
  reportOpenCards();
 });
 card.append(close, head, cardVisual(person, index), element('p', 'person-description', person.description));
 const tags = element('div', 'person-tags');
 for (const tag of person.tags) {
  const button = element('button', '', tag.replaceAll('_', ' ')); button.type = 'button';
  button.addEventListener('click', () => { input.value = tag.replaceAll('_', ' '); schedule(true); input.focus({ preventScroll: true }); });
  tags.append(button);
 }
 card.append(tags);
 const projects = element('div', 'person-projects');
 projects.append(element('h4', '', 'Projects & ideas'));
 for (const project of person.projects) {
  const row = element('div', 'project');
  row.append(webLink(project.name, project.url), element('p', '', project.summary));
  projects.append(row);
 }
 if (person.projects.length) card.append(projects);
 const details = element('details', 'person-recaps');
 details.append(element('summary', '', 'Talks & links'));
 if (person.public_profile_bio) details.append(element('p', 'profile-bio', person.public_profile_bio));
 for (const recap of person.event_recap) {
  const event = events[recap.event_id as keyof typeof events];
  const talk = element('div', 'person-talk');
  talk.append(element('p', 'talk-date', `#${recap.event_id} · ${recap.date} · ${event.location}`), element('h4', '', recap.title), element('p', '', recap.summary));
  details.append(talk);
 }
 const resources = element('div', 'person-links');
 for (const id of person.link_ids) {
  const link = linkMap.get(id);
  if (link) resources.append(webLink(link.label, link.url));
 }
 details.append(resources); card.append(details);
 return card;
}

function setMatches(matchedIds: string[], title = 'A few kindred minds.', layout: 'grid' | 'bubble' = 'grid') {
 const previous = new Set(surfacedIds);
 surfacedIds = matchedIds;
 for (const animation of animations) animation.cancel();
 animations.clear();
 const matched = new Set(matchedIds);
 for (const id of previous) if (!matched.has(id)) bubbleSurfaces.close(id);
 // Keep existing cards mounted so their expanded sections and focus are preserved.
 for (const card of [...grid.children] as HTMLElement[]) {
  if (matched.has(card.dataset.personId!)) continue;
  if (card.contains(document.activeElement)) swimmers.get(card.dataset.personId!)?.focus({ preventScroll: true });
  card.remove();
 }
 matchedIds.forEach(id => {
  const card = cards.get(id)!;
  if (bubbleSurfaces.has(id)) return;
  if (layout === 'bubble' && !previous.has(id)) {
   bubbleSurfaces.open(id, swimmers.get(id)!, card, !reduceMotion.matches && !paused);
  } else if (!grid.contains(card)) grid.append(card);
 });
 surface.hidden = !grid.children.length;
 document.body.classList.toggle('has-surface', !!matchedIds.length);
 $('ocean-note').hidden = !!matchedIds.length;
 $('surface-title').textContent = title;
 for (const [id, swimmer] of swimmers) {
  swimmer.classList.toggle('surfaced', matched.has(id));
  swimmer.setAttribute('aria-expanded', String(matched.has(id)));
 }
 current?.refresh();
 if (reduceMotion.matches || paused) return;
 matchedIds.forEach((id, index) => {
  if (previous.has(id) || bubbleSurfaces.has(id)) return;
  const card = cards.get(id)!;
  const animation = card.animate([
   { transform: 'translateY(18px)', opacity: 0 },
   { transform: 'translateY(0)', opacity: 1 }
  ], { duration: 450, delay: Math.min(index * 35, 200), easing: 'ease-out', fill: 'backwards' });
  animations.add(animation); animation.finished.then(() => animations.delete(animation)).catch(() => {});
 });
}
function setLoading(loading: boolean) {
 section.classList.toggle('loading', loading);
 $('search-form').setAttribute('aria-busy', String(loading));
}
function cancelSearch() {
 clearTimeout(timer); controller?.abort(); version++; setLoading(false);
}
function syncInput() {
 $('clear').hidden = !input.value; $('shortcut').hidden = !!input.value;
 document.querySelectorAll<HTMLButtonElement>('[data-query]').forEach(button => button.classList.toggle('active', button.dataset.query === input.value.trim()));
 status.classList.remove('error');
}
async function runSearch(query: string, requestVersion: number) {
 controller = new AbortController(); setLoading(true);
 status.textContent = 'Looking beneath the surface…';
 try {
  const response = await fetch('/api/people-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: controller.signal });
  if (!response.ok) throw new Error('Search unavailable');
  const data = parseSearchResponse(await response.json(), ids, people.length);
  if (requestVersion !== version) return;
  searchReportedMode = true;
  $('mode-label').textContent = data.mode === 'jev' ? 'JEV SEARCH' : 'LOCAL SEARCH';
  const count = data.matches.length;
  setMatches(data.matches.map(match => match.id), count === 1 ? 'A kindred mind.' : 'A few kindred minds.');
  status.textContent = count ? `${count} ${count === 1 ? 'person' : 'people'} surfaced for “${query}”${data.mode === 'local' ? ' · keyword search' : ''}` : 'No one surfaced yet. Try a name, a project, or another interest.';
 } catch (error) {
  if (requestVersion !== version || (error as Error).name === 'AbortError') return;
  status.classList.add('error'); status.textContent = 'Couldn’t search just now. Press Enter to retry, or meet everyone below.';
 } finally { if (requestVersion === version) setLoading(false); }
}
function schedule(immediate = false) {
 cancelSearch(); syncInput();
 const query = input.value.trim();
 // Keep old results from appearing to belong to a new query.
 setMatches([]);
 if (!query) { status.textContent = 'Describe an interest. Watch someone rise.'; return; }
 status.textContent = 'Waiting for you to finish typing…';
 if (composing) return;
 const requestVersion = version;
 timer = setTimeout(() => void runSearch(query, requestVersion), immediate ? 0 : 320);
}
function reportOpenCards() {
 status.classList.remove('error');
 status.textContent = surfacedIds.length ? `${surfacedIds.length} ${surfacedIds.length === 1 ? 'person' : 'people'} above the surface. Open another bubble, or click the water to close.` : 'Drag a bubble. Tap to meet someone.';
}
function dismissSurface() {
 cancelSearch(); input.value = ''; syncInput(); setMatches([]); reportOpenCards();
}
function reset() { dismissSurface(); input.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }

people.forEach((person, index) => {
 const swimmer = element('button', 'swimmer'); swimmer.type = 'button';
 swimmer.setAttribute('aria-label', `Meet ${person.name}`);
 swimmer.setAttribute('aria-expanded', 'false');
 swimmer.setAttribute('aria-controls', `card-${person.id}`);
 const depth = (Math.sin(index * 7.13 + 1) + 1) / 2;
 swimmer.style.setProperty('--depth', `${.65 + depth * .35}`);
 swimmer.style.zIndex = String(Math.round(depth * 10));
 swimmer.append(avatar(person, index), element('span', 'swimmer-name', person.name));
 swimmer.addEventListener('click', () => {
  cancelSearch(); input.value = ''; syncInput();
  if (bubbleSurfaces.has(person.id)) {
   setMatches(surfacedIds.filter(id => id !== person.id), 'People you’re getting to know.');
  } else {
   // A person already visible in search results can still flip open at their bubble.
   if (surfacedIds.includes(person.id)) setMatches(surfacedIds.filter(id => id !== person.id));
   setMatches([...surfacedIds, person.id], 'People you’re getting to know.', 'bubble');
  }
  reportOpenCards();
 });
 swimmers.set(person.id, swimmer); cards.set(person.id, makeCard(person, index)); ocean.append(swimmer);
});
current = new OceanCurrent(ocean, [...swimmers.values()]);
$('people-count').textContent = String(people.length);
input.addEventListener('input', () => schedule());
input.addEventListener('compositionstart', () => { composing = true; cancelSearch(); });
input.addEventListener('compositionend', () => { composing = false; schedule(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); schedule(true); });
$('clear').addEventListener('click', reset); $('dive-back').addEventListener('click', reset);
$('browse').addEventListener('click', () => {
 cancelSearch(); input.value = ''; syncInput(); setMatches([]); setMatches(people.map(person => person.id), 'The whole lovely sea.');
 status.textContent = `All ${people.length} people from Tab Thursday #001 & #002.`;
 surface.scrollIntoView({ behavior: reduceMotion.matches || paused ? 'instant' : 'smooth', block: 'start' });
});
document.querySelectorAll<HTMLButtonElement>('[data-query]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.query!; schedule(true); }));
document.addEventListener('keydown', event => {
 const editing = (event.target as HTMLElement).matches('input, textarea, [contenteditable]');
 if (event.key === '/' && !editing) { event.preventDefault(); input.focus(); }
 if (event.key === 'Escape' && !composing) reset();
});
document.addEventListener('click', event => {
 if (!surfacedIds.length || !(event.target instanceof Element)) return;
 if (event.target.closest('.swimmer, .bubble-surface, .person-card, .input-wrap, button, a, input, textarea, select, label, summary, [contenteditable]')) return;
 dismissSurface();
});
function updateMotion() {
 current?.setPaused(paused || reduceMotion.matches);
 oceanLife.setPaused(paused || reduceMotion.matches);
 document.body.classList.toggle('current-paused', paused || reduceMotion.matches);
 $('motion-toggle').setAttribute('aria-pressed', String(paused || reduceMotion.matches));
 $('motion-toggle').textContent = reduceMotion.matches ? 'Motion reduced' : paused ? 'Resume the current' : 'Pause the current';
 $<HTMLButtonElement>('motion-toggle').disabled = reduceMotion.matches;
 if (paused || reduceMotion.matches) { for (const animation of animations) animation.cancel(); animations.clear(); bubbleSurfaces.settle(); }
}
$('motion-toggle').addEventListener('click', () => { paused = !paused; updateMotion(); });
reduceMotion.addEventListener('change', () => { paused = reduceMotion.matches; updateMotion(); });
updateMotion();
fetch('/api/status').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
 // Browsing or clearing during startup must not leave the footer on CONNECTING.
 // A completed search is newer evidence and takes precedence over this request.
 if (!searchReportedMode) $('mode-label').textContent = data.mode === 'jev' ? 'JEV SEARCH' : 'LOCAL SEARCH';
}).catch(() => { if (!searchReportedMode) $('mode-label').textContent = 'SEARCH OFFLINE'; });
if (import.meta.hot) import.meta.hot.dispose(() => { cancelSearch(); bubbleSurfaces.destroy(); current?.destroy(); oceanLife.destroy(); for (const animation of animations) animation.cancel(); });
