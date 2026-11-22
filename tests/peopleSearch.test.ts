import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import {
 FALLBACK_MAX_MATCHES,
 PEOPLE_MATCH_THRESHOLD,
 createPeopleSearchService,
 localPeopleSearch
} from '../server/peopleSearch';
import { createApi } from '../server/api';
import {
 appearanceCount,
 appearancePreview,
 avatarInitials,
 eventById,
 events,
 linkPreview,
 people,
 personPreview,
 personSearchText,
 safeUrl
} from '../src/people';
import { parseSearchResponse } from '../src/types';

const ids = new Set(people.map(person => person.id));

test('canonical directory covers all 4 events, 53 presenters, 82 appearances, and valid links', () => {
 assert.equal(events.length, 4);
 assert.equal(people.length, 53);
 assert.equal(ids.size, 53);

 let totalAppearances = 0;
 const countByEvent = new Map<string, number>();

 for (const person of people) {
  assert.ok(person.name && Array.isArray(person.aliases) && person.appearances.length > 0);
  const seenEvents = new Set<string>();
  for (const appearance of person.appearances) {
   assert.ok(eventById.has(appearance.eventId), `${person.id}: unknown event ${appearance.eventId}`);
   assert.ok(!seenEvents.has(appearance.eventId), `${person.id}: duplicate appearance in ${appearance.eventId}`);
   seenEvents.add(appearance.eventId);
   assert.ok(appearance.title && appearance.summary);
   for (const link of appearance.links) {
    assert.ok(link.label && safeUrl(link.href), `${person.id}: invalid link ${link.href}`);
   }
   countByEvent.set(appearance.eventId, (countByEvent.get(appearance.eventId) ?? 0) + 1);
  }
  assert.equal(appearanceCount(person), seenEvents.size);
  totalAppearances += seenEvents.size;

  const profile = person.profile;
  assert.ok(profile, `${person.id}: missing profile`);
  assert.equal(typeof profile.summary, 'string');
  assert.ok(profile.summary.trim().length > 0, `${person.id}: empty profile.summary`);
  assert.ok(Array.isArray(profile.roles) && profile.roles.length > 0, `${person.id}: invalid profile.roles`);
  assert.ok(Array.isArray(profile.focus_areas) && profile.focus_areas.length > 0, `${person.id}: invalid profile.focus_areas`);
  assert.ok(Array.isArray(profile.notable_projects), `${person.id}: invalid profile.notable_projects`);
  assert.ok(Array.isArray(profile.sources_checked), `${person.id}: invalid profile.sources_checked`);
  for (const field of [profile.roles, profile.focus_areas, profile.notable_projects, profile.sources_checked]) {
   assert.ok(field.every(entry => typeof entry === 'string' && entry.trim().length > 0), `${person.id}: empty profile list item`);
  }
  for (const url of profile.sources_checked) {
   assert.ok(safeUrl(url), `${person.id}: invalid profile source url ${url}`);
  }
  assert.ok(
   profile.status === 'verified' || profile.status === 'partial' || profile.status === 'appearances_only',
   `${person.id}: invalid profile.status ${profile.status}`
  );
 }

 assert.equal(totalAppearances, 82);
 for (const event of events) {
  assert.equal(countByEvent.get(event.id), event.presenterCount, `event ${event.id} presenterCount mismatch`);
 }

 assert.equal(avatarInitials('David Jiang'), 'DJ');
 assert.equal(avatarInitials('海涛'), '海涛');
 assert.equal(avatarInitials('司马光砸缸'), '司马');
 assert.equal(safeUrl('javascript:alert(1)'), undefined);
 assert.equal(safeUrl(null), undefined);
});

test('link preview manifest references valid existing WebPs and preview helpers resolve cleanly', () => {
 const manifestPath = path.resolve(process.cwd(), 'assets/tt-previews.json');
 const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<
  string,
  { url?: string; image?: string; imageAlt?: string; title?: string; siteName?: string; status?: string }
 >;
 const safeImageRe = /^\/people-previews\/[a-z0-9-]+\.webp$/;

 let cachedImages = 0;
 for (const [key, entry] of Object.entries(manifest)) {
  assert.ok(safeUrl(key), `manifest key must be valid URL: ${key}`);
  assert.ok(entry.siteName && typeof entry.siteName === 'string', `${key}: missing siteName`);
  if (entry.image) {
   assert.match(entry.image, safeImageRe, `${key}: unsafe image path ${entry.image}`);
   const fullPath = path.resolve(process.cwd(), 'public', entry.image.slice(1));
   assert.ok(fs.existsSync(fullPath), `${key}: missing WebP file ${entry.image}`);
   assert.ok(fs.statSync(fullPath).size > 0, `${key}: empty WebP file ${entry.image}`);
   cachedImages++;
  }
 }
 assert.ok(cachedImages >= 23, `expected at least 23 cached preview WebPs, found ${cachedImages}`);

 // URL normalization handles www., trailing slash, and fragments identically.
 const owenFromWww = linkPreview('https://www.owenyoung.com/');
 const owenBare = linkPreview('https://owenyoung.com#top');
 assert.ok(owenFromWww?.image && safeImageRe.test(owenFromWww.image));
 assert.deepEqual(owenFromWww, owenBare);
 assert.equal(linkPreview(null), undefined);
 assert.equal(linkPreview(undefined), undefined);
 assert.equal(linkPreview('javascript:alert(1)'), undefined);
 assert.equal(linkPreview('https://nonexistent.example.invalid/no-such-page'), undefined);

 // appearancePreview and personPreview return local cached WebP images with clean fallbacks.
 const owen = people.find(person => person.id === 'p001')!;
 const owenTalk1Preview = appearancePreview(owen.appearances[0]);
 assert.ok(owenTalk1Preview?.image && safeImageRe.test(owenTalk1Preview.image));
 assert.equal(personPreview(owen)?.image, owenFromWww.image);

 const haitao = people.find(person => person.id === 'p007')!;
 const haitaoPreview = personPreview(haitao);
 assert.ok(haitaoPreview?.image && safeImageRe.test(haitaoPreview.image));
});

test('keyword search finds names, aliases, Chinese topics, projects, link labels, and researched profiles', () => {
 for (const [query, id] of [
  ['David', 'p002'],
  ['yytyyf', 'p006'],
  ['孩子', 'p002'],
  ['RSS', 'p001'],
  ['iPhone', 'p007'],
  ['PodText', 'p001'],
  ['KeyKeeper', 'p006'],
  ['Immersive Translate', 'p001'],
  ['digital garden', 'p001'],
  ['Anyway.FM', 'p022'],
  ['NebulaGraph', 'p053']
 ]) {
  assert.ok(localPeopleSearch(query, people).some(person => person.id === id), query);
 }
 const owen = people.find(person => person.id === 'p001')!;
 const owenText = personSearchText(owen);
 assert.ok(owenText.includes('immersive translate'));
 assert.ok(owenText.includes('数字花园博主'));
 assert.ok(owenText.includes('digital garden'));
 assert.ok(owenText.includes('buzzing'));

 assert.equal(localPeopleSearch('nonexistent-topic-zzzz', people).length, 0);
 assert.equal(localPeopleSearch('', people).length, 0);
});

test('exact names and aliases resolve without asking Jev', async () => {
 const client = new TypeSafeClient({ apiKey: 'test', fetch: async () => { throw new Error('Exact lookup should not call Jev'); } });
 const search = createPeopleSearchService(people, client);
 const aliasHit = await search('yytyyf');
 assert.deepEqual(aliasHit.matches, [{ id: 'p006', score: 1 }]);
 assert.equal(aliasHit.mode, 'jev');

 const nameHit = await search('David Jiang');
 assert.deepEqual(nameHit.matches, [{ id: 'p002', score: 1 }]);
});

test('Jev evaluates all 53 presenters, supports >10 matches, and caches queries', async () => {
 let calls = 0;
 const client = new TypeSafeClient({
  apiKey: 'test',
  retry: { maxRetries: 0 },
  fetch: async (_url, init) => {
   calls++;
   const body = JSON.parse(String(init?.body));
   assert.equal(body.state.search, 'people exploring ideas');
   assert.equal(body.state.people.length, 53);
   assert.ok(!('stickers' in body.state));
   for (const person of people) {
    assert.ok(body.questions[person.id].instructions.includes(person.id));
    assert.ok(body.questions[person.id].instructions.includes('profile'));
    assert.equal(body.questions[person.id].type, 'noul');
    const entry = body.state.people.find((item: { id: string }) => item.id === person.id);
    assert.ok(entry.appearances.length > 0);
    assert.deepEqual(entry.profile, {
     summary: person.profile!.summary,
     roles: person.profile!.roles,
     focus_areas: person.profile!.focus_areas,
     notable_projects: person.profile!.notable_projects
    });
    assert.ok(!('sources_checked' in entry.profile));
    assert.ok(!('status' in entry.profile));
   }
   return new Response(JSON.stringify({
    model: 'jev-latest',
    answers: Object.fromEntries(people.map((person, i) => [person.id, { type: 'noul', noul: i === 0 ? 0.2 : 0.9 }])),
    usage: { input_tokens: 100, output_tokens: 53 }
   }), { headers: { 'Content-Type': 'application/json' } });
  }
 });
 const search = createPeopleSearchService(people, client);
 const result = await search('people exploring ideas');
 assert.equal(result.matches.length, people.length - 1);
 assert.equal(result.mode, 'jev');
 assert.ok(!result.matches.some(match => match.id === people[0].id));
 assert.equal(parseSearchResponse(result, ids, people.length).matches.length, people.length - 1);
 await search('PEOPLE EXPLORING IDEAS');
 assert.equal(calls, 1);
});

test('Jev falls back to top 5 positive matches when all scores are below PEOPLE_MATCH_THRESHOLD', async () => {
 assert.equal(PEOPLE_MATCH_THRESHOLD, 0.5);
 assert.equal(FALLBACK_MAX_MATCHES, 5);

 const scoredIds: Record<string, number> = {
  p012: 0.48,
  p003: 0.44,
  p025: 0.44,
  p040: 0.31,
  p007: 0.25,
  p051: 0.19,
  p002: 0.08
 };
 const fallbackClient = new TypeSafeClient({
  apiKey: 'test',
  retry: { maxRetries: 0 },
  fetch: async () => new Response(JSON.stringify({
   model: 'jev-latest',
   answers: Object.fromEntries(people.map(person => [person.id, { type: 'noul', noul: scoredIds[person.id] ?? 0 }])),
   usage: { input_tokens: 100, output_tokens: 53 }
  }), { headers: { 'Content-Type': 'application/json' } })
 });
 const fallbackResult = await createPeopleSearchService(people, fallbackClient)('exploratory niche curiosity');
 assert.equal(fallbackResult.mode, 'jev');
 assert.deepEqual(fallbackResult.matches, [
  { id: 'p012', score: 0.48 },
  { id: 'p003', score: 0.44 },
  { id: 'p025', score: 0.44 },
  { id: 'p040', score: 0.31 },
  { id: 'p007', score: 0.25 }
 ]);
 assert.equal(parseSearchResponse(fallbackResult, ids, people.length).matches.length, 5);

 // When fewer than 5 people score above 0, zero-scored entries are never included in fallback.
 const sparseClient = new TypeSafeClient({
  apiKey: 'test',
  retry: { maxRetries: 0 },
  fetch: async () => new Response(JSON.stringify({
   model: 'jev-latest',
   answers: Object.fromEntries(people.map(person => [
    person.id,
    { type: 'noul', noul: person.id === 'p009' ? 0.35 : person.id === 'p001' ? 0.2 : 0 }
   ])),
   usage: { input_tokens: 100, output_tokens: 53 }
  }), { headers: { 'Content-Type': 'application/json' } })
 });
 const sparseResult = await createPeopleSearchService(people, sparseClient)('sparse exploratory topic');
 assert.deepEqual(sparseResult.matches, [
  { id: 'p009', score: 0.35 },
  { id: 'p001', score: 0.2 }
 ]);

 // Primary threshold (>= 0.5) still excludes sub-threshold scores when at least one presenter clears 0.5.
 const primaryClient = new TypeSafeClient({
  apiKey: 'test',
  retry: { maxRetries: 0 },
  fetch: async () => new Response(JSON.stringify({
   model: 'jev-latest',
   answers: Object.fromEntries(people.map(person => [
    person.id,
    {
     type: 'noul',
     noul: person.id === 'p001' ? 0.5 : person.id === 'p002' ? 0.49 : person.id === 'p003' ? 0.2 : 0
    }
   ])),
   usage: { input_tokens: 100, output_tokens: 53 }
  }), { headers: { 'Content-Type': 'application/json' } })
 });
 const primaryResult = await createPeopleSearchService(people, primaryClient)('threshold boundary query');
 assert.deepEqual(primaryResult.matches, [{ id: 'p001', score: 0.5 }]);

 // Local search still returns empty matches when nothing matches (all 0 scores).
 assert.equal(localPeopleSearch('nonexistent-topic-zzzz', people).length, 0);
});

test('Jev failures and malformed probabilities do not fall back to fabricated matches', async () => {
 const failed = new TypeSafeClient({ apiKey: 'test', retry: { maxRetries: 0 }, fetch: async () => new Response('{}', { status: 401 }) });
 await assert.rejects(() => createPeopleSearchService(people, failed)('AI'));
 const incomplete = new TypeSafeClient({
  apiKey: 'test',
  retry: { maxRetries: 0 },
  fetch: async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {}, usage: { input_tokens: 1, output_tokens: 0 } }), { headers: { 'Content-Type': 'application/json' } })
 });
 await assert.rejects(() => createPeopleSearchService(people, incomplete)('AI'));
 const valid = { mode: 'jev', query: 'AI', matches: [{ id: people[0].id, score: 0.9 }] };
 for (const matches of [[{ id: 'sticker-01', score: 0.9 }], [...valid.matches, ...valid.matches], [{ id: people[0].id, score: 2 }]]) {
  assert.throws(() => parseSearchResponse({ ...valid, matches }, ids, people.length));
 }
});

// Exercise the real HTTP middleware (both raw stream and Vercel pre-parsed req.body).
const api = createApi({});
async function request(path: string, method: string, body?: unknown, preparsed = false) {
 const req = Object.assign(
  Readable.from(preparsed || body === undefined ? [] : [JSON.stringify(body)]),
  { url: path, method, ...(preparsed ? { body } : {}) }
 ) as IncomingMessage;
 let status = 0;
 let payload = '';
 const res = Object.assign(new EventEmitter(), {
  destroyed: false,
  writableEnded: false,
  writeHead(code: number) { status = code; },
  end(value: string) { payload = value; this.writableEnded = true; }
 });
 await api(req, res as unknown as ServerResponse, () => { status = 404; });
 return { status, body: payload ? JSON.parse(payload) : undefined };
}

test('people API routes, Vercel pre-parsed body, status, and isolation from missing sticker catalog work', async () => {
 const found = await request('/api/people-search', 'POST', { query: 'David Jiang' });
 assert.equal(found.status, 200);
 assert.equal(found.body.mode, 'local');
 assert.deepEqual(found.body.matches, [{ id: 'p002', score: 1 }]);

 const vercelParsed = await request('/api/people-search', 'POST', { query: 'yytyyf' }, true);
 assert.equal(vercelParsed.status, 200);
 assert.deepEqual(vercelParsed.body.matches, [{ id: 'p006', score: 1 }]);

 const sticker = await request('/api/search', 'POST', { query: 'coffee' });
 assert.equal(sticker.status, 200);
 assert.ok(sticker.body.matches.every((match: { id: string }) => match.id.startsWith('sticker-')));

 assert.equal((await request('/api/status', 'GET')).body.peopleCount, 53);
 assert.equal((await request('/api/people-search', 'GET')).status, 405);
 assert.equal((await request('/api/people-search', 'POST', { query: 1 })).status, 400);
 assert.equal((await request('/api/people-search', 'POST', { query: 'x'.repeat(241) })).status, 400);
 assert.equal((await request('/api/people-search', 'POST', { query: 'x'.repeat(5000) })).status, 413);

 // Missing sticker catalog should not take down /api/people-search.
 const isolatedApi = createApi({}, '/nonexistent/catalog.json');
 const req = Object.assign(Readable.from([JSON.stringify({ query: 'Owen' })]), { url: '/api/people-search', method: 'POST' }) as IncomingMessage;
 let status = 0;
 let payload = '';
 const res = Object.assign(new EventEmitter(), {
  destroyed: false,
  writableEnded: false,
  writeHead(code: number) { status = code; },
  end(value: string) { payload = value; this.writableEnded = true; }
 });
 await isolatedApi(req, res as unknown as ServerResponse, () => { status = 404; });
 assert.equal(status, 200);
 assert.deepEqual(JSON.parse(payload).matches, [{ id: 'p001', score: 1 }]);
});
