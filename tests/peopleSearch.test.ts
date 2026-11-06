import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { createPeopleSearchService, localPeopleSearch } from '../server/peopleSearch';
import { createApi } from '../server/api';
import { avatarInitials, events, links, people, safeUrl } from '../src/people';
import { parseSearchResponse } from '../src/types';

const ids = new Set(people.map(person => person.id));
test('directory covers all 32 presenters, projects, recaps, and resource links', () => {
 assert.equal(people.length, 32); assert.equal(ids.size, 32);
 const linkIds = new Set(links.map(link => link.id));
 for (const person of people) {
  assert.ok(person.name && person.description && Array.isArray(person.projects));
  for (const id of person.link_ids) assert.ok(linkIds.has(id), `${person.id}: ${id}`);
  for (const recap of person.event_recap) assert.ok(recap.event_id in events);
 }
 for (const event of Object.values(events)) for (const id of event.presenter_ids) assert.ok(ids.has(id));
 assert.equal(avatarInitials('David Jiang'), 'DJ'); assert.equal(avatarInitials('海涛'), '海涛');
 assert.equal(safeUrl('javascript:alert(1)'), undefined); assert.equal(safeUrl(null), undefined);
});
test('keyword search finds names, aliases, topics, Chinese project names, and recaps', () => {
 for (const [query, id] of [['David', 'david-jiang'], ['yytyyf', 'yang-yuntong'], ['孩子', 'david-jiang'], ['RSS', 'owen'], ['browser automation', 'gloria-x'], ['iPhone', 'haitao']]) {
  assert.ok(localPeopleSearch(query, people).some(person => person.id === id), query);
 }
 assert.equal(localPeopleSearch('nonexistent-topic-zzzz', people).length, 0);
 assert.equal(localPeopleSearch('', people).length, 0);
});
test('exact names and aliases resolve without asking Jev', async () => {
 const client = new TypeSafeClient({ apiKey: 'test', fetch: async () => { throw new Error('Exact lookup should not call Jev'); } });
 const result = await createPeopleSearchService(people, client)('yytyyf');
 assert.deepEqual(result.matches, [{ id: 'yang-yuntong', score: 1 }]);
 assert.equal(result.mode, 'jev');
});
test('Jev evaluates people metadata, supports more than ten matches, and caches queries', async () => {
 let calls = 0;
 const client = new TypeSafeClient({ apiKey: 'test', retry: { maxRetries: 0 }, fetch: async (_url, init) => {
  calls++;
  const body = JSON.parse(String(init?.body));
  assert.equal(body.state.search, 'people exploring ideas');
  assert.equal(body.state.people.length, 32);
  assert.ok(!('stickers' in body.state));
  for (const person of people) {
   assert.ok(body.questions[person.id].instructions.includes(person.id));
   assert.equal(body.questions[person.id].type, 'noul');
   assert.ok(body.state.people.find((entry: { id: string }) => entry.id === person.id).event_recap.length);
  }
  return new Response(JSON.stringify({ model: 'jev-latest', answers: Object.fromEntries(people.map((person, i) => [person.id, { type: 'noul', noul: i === 0 ? .2 : .9 }])), usage: { input_tokens: 100, output_tokens: 32 } }), { headers: { 'Content-Type': 'application/json' } });
 } });
 const search = createPeopleSearchService(people, client);
 const result = await search('people exploring ideas');
 assert.equal(result.matches.length, 31); assert.equal(result.mode, 'jev');
 assert.ok(!result.matches.some(match => match.id === people[0].id));
 assert.equal(parseSearchResponse(result, ids, people.length).matches.length, 31);
 await search('PEOPLE EXPLORING IDEAS'); assert.equal(calls, 1);
});
test('Jev failures and malformed probabilities do not fall back to fabricated matches', async () => {
 const failed = new TypeSafeClient({ apiKey: 'test', retry: { maxRetries: 0 }, fetch: async () => new Response('{}', { status: 401 }) });
 await assert.rejects(() => createPeopleSearchService(people, failed)('AI'));
 const incomplete = new TypeSafeClient({ apiKey: 'test', retry: { maxRetries: 0 }, fetch: async () => new Response(JSON.stringify({ model: 'jev-latest', answers: {}, usage: { input_tokens: 1, output_tokens: 0 } }), { headers: { 'Content-Type': 'application/json' } }) });
 await assert.rejects(() => createPeopleSearchService(people, incomplete)('AI'));
 const valid = { mode: 'jev', query: 'AI', matches: [{ id: people[0].id, score: .9 }] };
 for (const matches of [[{ id: 'sticker-01', score: .9 }], [...valid.matches, ...valid.matches], [{ id: people[0].id, score: 2 }]]) assert.throws(() => parseSearchResponse({ ...valid, matches }, ids, people.length));
});

// Exercise the real HTTP middleware without starting a local server.
const api = createApi({});
async function request(path: string, method: string, body?: unknown) {
 const req = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), { url: path, method }) as IncomingMessage;
 let status = 0, payload = '';
 const res = Object.assign(new EventEmitter(), {
  destroyed: false, writableEnded: false,
  writeHead(code: number) { status = code; },
  end(value: string) { payload = value; this.writableEnded = true; }
 });
 await api(req, res as unknown as ServerResponse, () => { status = 404; });
 return { status, body: payload ? JSON.parse(payload) : undefined };
}
test('people API routes, body validation, status, and sticker search remain isolated', async () => {
 const found = await request('/api/people-search', 'POST', { query: 'David' });
 assert.equal(found.status, 200); assert.equal(found.body.mode, 'local');
 assert.deepEqual(found.body.matches, [{ id: 'david-jiang', score: 1 }]);
 const sticker = await request('/api/search', 'POST', { query: 'coffee' });
 assert.equal(sticker.status, 200); assert.ok(sticker.body.matches.every((match: { id: string }) => match.id.startsWith('sticker-')));
 assert.equal((await request('/api/status', 'GET')).body.peopleCount, 32);
 assert.equal((await request('/api/people-search', 'GET')).status, 405);
 assert.equal((await request('/api/people-search', 'POST', { query: 1 })).status, 400);
 assert.equal((await request('/api/people-search', 'POST', { query: 'x'.repeat(241) })).status, 400);
 assert.equal((await request('/api/people-search', 'POST', { query: 'x'.repeat(5000) })).status, 413);
});
