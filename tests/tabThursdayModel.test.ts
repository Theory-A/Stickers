import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { appearanceCount, events, people } from '../src/people';
import {
 BADGE_TIERS,
 DEFAULT_FILTER_STATE,
 badgeForCount,
 buildTimelineStops,
 continuitySpan,
 dateRangeKicker,
 filterAndSortPeople,
 firstEventIdForPerson,
 repeatPresenterCount,
 totalAppearances
} from '../src/tabThursdayModel';

test('timeline stops reconcile first-time, returning, and cumulative counts across all 4 events', () => {
 const stops = buildTimelineStops(events, people);
 assert.equal(stops.length, 4);
 assert.deepEqual(
  stops.map(s => [s.event.id, s.people.length, s.firstCount, s.returningCount, s.cumulativeCount]),
  [
   ['001', 18, 18, 0, 18],
   ['002', 21, 13, 8, 31],
   ['003', 22, 12, 10, 43],
   ['004', 21, 10, 11, 53]
  ]
 );
 assert.equal(totalAppearances(people), 82);
 assert.equal(repeatPresenterCount(people), 13);
 assert.equal(dateRangeKicker(stops), '2026 / OCT — NOV');
});

test('badge progression maps counts 1 through 12+ to the 8 canonical tiers with valid badge assets', () => {
 assert.equal(BADGE_TIERS.length, 8);
 const badgeImageRe = /^\/tab-thursday\/badges\/[a-z0-9-]+\.webp$/;
 for (const tier of BADGE_TIERS) {
  assert.match(tier.image, badgeImageRe);
  const assetPath = path.resolve(process.cwd(), 'public', tier.image.slice(1));
  assert.ok(fs.existsSync(assetPath), `missing badge asset ${tier.image}`);
 }

 assert.equal(badgeForCount(1).tier.id, 'copper');
 assert.equal(badgeForCount(1).image, '/tab-thursday/badges/copper.webp');
 assert.equal(badgeForCount(2).tier.id, 'steel');
 assert.equal(badgeForCount(3).tier.id, 'enamel');
 assert.equal(badgeForCount(4).tier.id, 'gold');
 assert.equal(badgeForCount(5).tier.id, 'gold');
 assert.equal(badgeForCount(6).tier.id, 'crystal');
 assert.equal(badgeForCount(8).tier.id, 'prismatic');
 assert.equal(badgeForCount(10).tier.id, 'obsidian');

 const anchor12 = badgeForCount(12);
 assert.equal(anchor12.tier.id, 'anchor');
 assert.equal(anchor12.tier.name, 'Community Anchor');
 assert.equal(anchor12.tier.zh, '社区锚点');
 assert.equal(anchor12.image, '/tab-thursday/badges/centennial.webp');
 assert.equal(anchor12.next, null);
 assert.ok(anchor12.description.includes('社区锚点 Community Anchor'));

 const anchor15 = badgeForCount(15);
 assert.equal(anchor15.tier.id, 'anchor');
 assert.equal(anchor15.next, null);
 assert.equal(anchor15.image, '/tab-thursday/badges/centennial.webp');
 assert.throws(() => badgeForCount(0), RangeError);
});

test('continuity span distinguishes single appearance, consecutive runs, and gaps', () => {
 const stops = buildTimelineStops(events, people);
 const owen = people.find(p => p.id === 'p001')!; // 001, 002, 003, 004
 const junwei = people.find(p => p.id === 'p003')!; // 001, 004 (gap)
 const gloria = people.find(p => p.id === 'p004')!; // 001 only

 const owenSpan = continuitySpan(owen, stops);
 assert.equal(owenSpan.hasConnector, true);
 assert.equal(owenSpan.hasGap, false);
 assert.equal(owenSpan.lineStartPct, 12.5);
 assert.equal(owenSpan.lineWidthPct, 75);

 const junweiSpan = continuitySpan(junwei, stops);
 assert.equal(junweiSpan.hasConnector, true);
 assert.equal(junweiSpan.hasGap, true);
 assert.equal(junweiSpan.lineStartPct, 12.5);
 assert.equal(junweiSpan.lineWidthPct, 75);

 const gloriaSpan = continuitySpan(gloria, stops);
 assert.equal(gloriaSpan.hasConnector, false);
 assert.equal(firstEventIdForPerson(junwei, stops), '001');
});

test('filtering and sorting preserve event selection, repeats-only, exact names, plural keywords, aliases, and semantic union', () => {
 const defaultOrder = filterAndSortPeople(people, DEFAULT_FILTER_STATE);
 assert.deepEqual(defaultOrder.slice(0, 3).map(p => p.id), ['p001', 'p007', 'p002']);

 const repeats = filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, repeatsOnly: true });
 assert.equal(repeats.length, 13);
 assert.ok(repeats.every(p => appearanceCount(p) >= 2));

 const event003 = filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, eventId: '003' });
 assert.equal(event003.length, 22);

 const aliasMatch = filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'yytyyf' });
 assert.deepEqual(aliasMatch.map(p => p.id), ['p006']);

 // Exact name lookup resolves only Hao (p030), not Sean Shao (p029).
 const exactHao = filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'Hao' });
 assert.deepEqual(exactHao.map(p => p.id), ['p030']);

 // Preserved legacy aliases still resolve cleanly.
 assert.deepEqual(filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'Owen Young' }).map(p => p.id), ['p001']);
 assert.deepEqual(filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'Haitao' }).map(p => p.id), ['p007']);
 assert.deepEqual(filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'JTing' }).map(p => p.id), ['p024']);

 // Plural & punctuation keyword matching matches server localPeopleSearch.
 const aiAgents = filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'AI agents' });
 assert.ok(aiAgents.length >= 6);

 // Researched presenter profiles are indexed by filterAndSortPeople.
 assert.ok(filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'Anyway.FM' }).some(p => p.id === 'p022'));
 assert.ok(filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, query: 'NebulaGraph' }).some(p => p.id === 'p053'));

 const semanticResult = filterAndSortPeople(
  people,
  { ...DEFAULT_FILTER_STATE, query: 'AI agents' },
  new Set(['p002'])
 );
 assert.deepEqual(semanticResult.map(p => p.id), ['p002']);

 const semanticEmpty = filterAndSortPeople(
  people,
  { ...DEFAULT_FILTER_STATE, query: 'AI' },
  new Set()
 );
 assert.deepEqual(semanticEmpty, []);

 const byRecent = filterAndSortPeople(people, { ...DEFAULT_FILTER_STATE, sort: 'recent' });
 assert.ok(byRecent[0].appearances.some(a => a.eventId === '004'));
});
