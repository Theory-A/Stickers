import './tabThursday.css';
import {
 appearanceCount,
 appearanceForEvent,
 appearancePreview,
 avatarInitials,
 eventById,
 events,
 linkPreview,
 people,
 personById,
 personPreview,
 safeUrl,
 updated,
 type Appearance,
 type LinkPreview,
 type Person,
 type TabEvent
} from './people';
import {
 BADGE_TIERS,
 DEFAULT_FILTER_STATE,
 badgeForCount,
 buildTimelineStops,
 continuitySpan,
 dateRangeKicker,
 filterAndSortPeople,
 firstEventIdForPerson,
 formatShortDate,
 hasActiveFilters,
 repeatPresenterCount,
 totalAppearances,
 type FilterState,
 type SortMode
} from './tabThursdayModel';
import { parseSearchResponse } from './types';

type ViewMode = 'timeline' | 'table';

interface InlineDetailsOptions {
 modalTriggerKey?: string;
 onOpenModal?: (trigger: HTMLElement) => void;
 onCollapse?: () => void;
 onJumpToJourney?: () => void;
 showDate?: boolean;
 showBadgeMeta?: boolean;
}

const root = document.getElementById('thursday-root')!;
const stops = buildTimelineStops(events, people);
const stopByEventId = new Map(stops.map(stop => [stop.event.id, stop]));
const personIds = new Set(people.map(person => person.id));
const totalTalks = totalAppearances(people);
const repeatCount = repeatPresenterCount(people);

let view: ViewMode = 'timeline';
let filters: FilterState = { ...DEFAULT_FILTER_STATE };
let badgeGuideOpen = false;
let activePersonId: string | null = null;
const expandedCards = new Set<string>();
const selectedStopPerson = new Map<string, string>();
let modalTrigger: HTMLElement | null = null;
let modalTriggerSelector: string | null = null;
let searchMode: 'local' | 'jev' = 'local';
let semanticMatches: { query: string; ids: Set<string> } | null = null;
let semanticLoading = false;
let semanticError = false;
let searchVersion = 0;
let searchController: AbortController | undefined;
let composing = false;
let lastRenderedSignature = '';

function cardKey(personId: string, eventId: string): string {
 return `${personId}-${eventId}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
 tag: K,
 className?: string,
 text?: string
): HTMLElementTagNameMap[K] {
 const node = document.createElement(tag);
 if (className) node.className = className;
 if (text !== undefined) node.textContent = text;
 return node;
}

function stableFocusSelector(node: Element | null): string | null {
 if (!(node instanceof HTMLElement)) return null;
 if (node.dataset.rolodexCard) return '[data-rolodex-card="true"]';
 if (node.dataset.personProfile) return `[data-person-profile="${node.dataset.personProfile}"]`;
 if (node.dataset.openModal) return `[data-open-modal="${node.dataset.openModal}"]`;
 if (node.dataset.timelinePresentation) return `[data-timeline-presentation="${node.dataset.timelinePresentation}"]`;
 if (node.dataset.journeyPresentation) return `[data-journey-presentation="${node.dataset.journeyPresentation}"]`;
 if (node.dataset.presentation) return `[data-presentation="${node.dataset.presentation}"]`;
 if (node.dataset.personWebsite) return `[data-person-website="${node.dataset.personWebsite}"]`;
 return null;
}

function makeProfileTriggerBtn(
 person: Person,
 label: string,
 key: string,
 className = 'tt-profile-pill-btn'
): HTMLButtonElement {
 const btn = el('button', className, label);
 btn.type = 'button';
 btn.dataset.personProfile = key;
 btn.setAttribute('aria-haspopup', 'dialog');
 btn.title = `查看 ${person.name} 的分享者档案`;
 btn.setAttribute('aria-label', `查看 ${person.name} 的分享者档案`);
 btn.addEventListener('click', () => openProfileModal(person.id, btn));
 return btn;
}

function makeBadge(count: number, large = false): HTMLElement {
 const info = badgeForCount(count);
 const badge = el('span', large ? 'tt-badge tt-badge-lg' : 'tt-badge');
 badge.setAttribute('role', 'img');
 badge.setAttribute('aria-label', info.description);
 badge.title = info.description;
 badge.dataset.volumeCount = String(count);
 badge.dataset.badgeTier = info.tier.id;
 badge.dataset.lightText = String(info.tier.lightText);
 badge.dataset.longCount = String(count >= 100);

 const img = el('img');
 img.src = info.image;
 img.width = large ? 34 : 28;
 img.height = large ? 34 : 28;
 img.alt = '';
 img.setAttribute('aria-hidden', 'true');
 img.loading = 'lazy';
 img.decoding = 'async';

 const numeral = el('span', undefined, String(count));
 numeral.setAttribute('aria-hidden', 'true');
 badge.append(img, numeral);
 return badge;
}

function makeProfileNode(person: Person, trackKey?: string): HTMLElement {
 const url = safeUrl(person.website);
 if (!url) return el('span', 'tt-profile', person.name);
 const anchor = el('a', 'tt-profile');
 anchor.href = url;
 anchor.target = '_blank';
 anchor.rel = 'noopener noreferrer';
 anchor.setAttribute('aria-label', `${person.name} 的个人主页（新窗口）`);
 if (trackKey) anchor.dataset.personWebsite = trackKey;
 const arrow = el('span', undefined, '↗');
 arrow.setAttribute('aria-hidden', 'true');
 anchor.append(document.createTextNode(person.name), arrow);
 return anchor;
}

function linkHostname(href: string): string {
 try {
  return new URL(href).hostname.replace(/^www\./, '');
 } catch {
  return href;
 }
}

function buildInlinePreviewCard(preview: LinkPreview): HTMLAnchorElement | null {
 if (!preview.image) return null;
 const href = safeUrl(preview.url);
 if (!href) return null;

 const card = el('a', 'tt-inline-preview');
 card.href = href;
 card.target = '_blank';
 card.rel = 'noopener noreferrer';
 card.title = preview.title ? `${preview.title} — ${preview.siteName}` : preview.siteName;
 card.setAttribute('aria-label', `${preview.title ?? preview.siteName} 预览链接（新窗口）`);

 const img = el('img');
 img.src = preview.image;
 img.alt = preview.imageAlt;
 img.loading = 'lazy';
 img.decoding = 'async';
 img.addEventListener('error', () => card.remove(), { once: true });

 const caption = el('span', 'tt-inline-preview-caption');
 const arrow = el('span', undefined, '↗');
 arrow.setAttribute('aria-hidden', 'true');
 caption.append(el('span', undefined, preview.siteName), arrow);

 card.append(img, caption);
 return card;
}

function buildModalPreviewCard(preview: LinkPreview, variant: 'talk' | 'profile'): HTMLAnchorElement | null {
 if (!preview.image) return null;
 const href = safeUrl(preview.url);
 if (!href) return null;

 const card = el('a', `tt-modal-preview-card tt-modal-preview-card--${variant}`);
 card.href = href;
 card.target = '_blank';
 card.rel = 'noopener noreferrer';
 card.setAttribute('aria-label', `${preview.title ?? preview.siteName} 预览链接（新窗口）`);

 const media = el('div', 'tt-modal-preview-media');
 const img = el('img');
 img.src = preview.image;
 img.alt = preview.imageAlt;
 img.loading = 'lazy';
 img.decoding = 'async';
 img.addEventListener('error', () => card.remove(), { once: true });
 media.append(img);

 const meta = el('div', 'tt-modal-preview-meta');
 if (preview.title && preview.title !== preview.siteName) {
  meta.append(el('strong', undefined, preview.title), el('small', undefined, `${preview.siteName} ↗`));
 } else {
  meta.append(el('strong', undefined, preview.siteName), el('small', undefined, '打开链接 ↗'));
 }

 card.append(media, meta);
 return card;
}

function buildModalLinkThumb(preview: LinkPreview): HTMLElement | null {
 if (!preview.image) return null;
 const thumb = el('span', 'tt-modal-link-thumb');
 thumb.setAttribute('aria-hidden', 'true');
 const img = el('img');
 img.src = preview.image;
 img.alt = '';
 img.loading = 'lazy';
 img.decoding = 'async';
 img.addEventListener('error', () => thumb.remove(), { once: true });
 thumb.append(img);
 return thumb;
}

function buildInlineDetails(
 person: Person,
 presentation: Appearance,
 event: TabEvent,
 options: InlineDetailsOptions = {}
): HTMLElement {
 const body = el('div', 'tt-inline-body');
 body.id = options.modalTriggerKey ? `inline-${options.modalTriggerKey}` : `inline-${person.id}-${event.id}`;

 const count = appearanceCount(person);
 const badgeInfo = badgeForCount(count);
 const validLinks = presentation.links
  .map(link => ({ label: link.label, href: safeUrl(link.href) }))
  .filter((link): link is { label: string; href: string } => Boolean(link.href));

 const meta = el('div', 'tt-inline-meta');
 const datePart = options.showDate !== false ? `${formatShortDate(event.date)} · ` : '';
 meta.append(el('span', 'tt-inline-venue', `${datePart}${event.venue}`));
 if (options.showBadgeMeta !== false) {
  const tier = el('span', 'tt-inline-tier', `${count} 场 · ${badgeInfo.tier.zh} ${badgeInfo.tier.name}`);
  tier.title = badgeInfo.description;
  meta.append(tier);
 }
 if (presentation.sourceName !== person.name) {
  meta.append(el('span', 'tt-inline-alias', `记为 ${presentation.sourceName}`));
 }
 body.append(meta, el('p', 'tt-inline-summary', presentation.summary));

 const talkPreview = appearancePreview(presentation);
 if (talkPreview) {
  const inlinePreview = buildInlinePreviewCard(talkPreview);
  if (inlinePreview) body.append(inlinePreview);
 }

 const profile = person.profile;
 if (profile && (profile.summary || profile.roles.length > 0 || profile.focus_areas.length > 0)) {
  const profileBox = el('div', 'tt-inline-profile');
  if (profile.summary || profile.roles.length > 0) {
   const profileHead = el('div', 'tt-inline-profile-head');
   profileHead.append(el('span', 'tt-inline-profile-kicker', '分享者简介'));
   for (const role of profile.roles.slice(0, 3)) {
    profileHead.append(el('span', 'tt-inline-role', role));
   }
   profileBox.append(profileHead);
  }
  if (profile.summary) {
   const bio = el('p', 'tt-inline-bio', profile.summary);
   bio.title = profile.summary;
   profileBox.append(bio);
  }
  if (profile.focus_areas.length > 0) {
   const tagsWrap = el('div', 'tt-inline-tags');
   const visibleTags = profile.focus_areas.slice(0, 5);
   for (const tag of visibleTags) {
    tagsWrap.append(el('span', 'tt-inline-tag', tag));
   }
   if (profile.focus_areas.length > visibleTags.length) {
    tagsWrap.append(el('span', 'tt-inline-tag tt-inline-tag--more', `+${profile.focus_areas.length - visibleTags.length}`));
   }
   profileBox.append(tagsWrap);
  }
  body.append(profileBox);
 }

 if (validLinks.length > 0) {
  const linksBlock = el('div', 'tt-inline-links-block');
  const linksHead = el('div', 'tt-inline-links-head');
  linksHead.append(
   el('span', 'tt-inline-links-label', '相关资料'),
   el('span', 'tt-inline-links-count', String(validLinks.length))
  );
  const linksWrap = el('div', 'tt-inline-links');
  for (const link of validLinks) {
   const host = linkHostname(link.href);
   const a = el('a', 'tt-inline-link-chip');
   a.href = link.href;
   a.target = '_blank';
   a.rel = 'noopener noreferrer';
   a.title = `${link.label} — ${host}`;
   const arrow = el('span', undefined, '↗');
   arrow.setAttribute('aria-hidden', 'true');
   a.append(el('span', undefined, link.label), arrow);
   linksWrap.append(a);
  }
  linksBlock.append(linksHead, linksWrap);
  body.append(linksBlock);
 }

 const foot = el('div', 'tt-inline-foot');
 const footLinks = el('div', 'tt-inline-foot-links');
 const websiteHref = safeUrl(person.website);
 if (websiteHref) {
  const siteLink = el('a', 'tt-inline-website', '主页 ↗');
  siteLink.href = websiteHref;
  siteLink.target = '_blank';
  siteLink.rel = 'noopener noreferrer';
  siteLink.title = `${person.name} 个人主页 — ${linkHostname(websiteHref)}`;
  siteLink.setAttribute('aria-label', `${person.name} 的个人主页（新窗口）`);
  footLinks.append(siteLink);
 }
 const sourceHref = safeUrl(event.source);
 if (sourceHref) {
  const recap = el('a', undefined, `#${event.id} 纪要 ↗`);
  recap.href = sourceHref;
  recap.target = '_blank';
  recap.rel = 'noopener noreferrer';
  footLinks.append(recap);
 }
 if (options.onJumpToJourney) {
  const jumpBtn = el('button', 'tt-inline-action', '在下方展开 ↓');
  jumpBtn.type = 'button';
  jumpBtn.addEventListener('click', options.onJumpToJourney);
  footLinks.append(jumpBtn);
 }
 foot.append(footLinks);

 const footActions = el('div', 'tt-inline-foot-actions');
 if (options.onOpenModal) {
  const openModalHandler = options.onOpenModal;
  const modalBtn = el('button', 'tt-inline-modal-btn', '完整详情 ↗');
  modalBtn.type = 'button';
  modalBtn.setAttribute('aria-haspopup', 'dialog');
  modalBtn.setAttribute('aria-label', `${person.name} · 第 ${event.id} 期 · ${presentation.title}，打开完整详情弹窗`);
  if (options.modalTriggerKey) {
   modalBtn.dataset.openModal = options.modalTriggerKey;
  }
  modalBtn.addEventListener('click', () => openModalHandler(modalBtn));
  footActions.append(modalBtn);
 }
 if (options.onCollapse) {
  const collapseBtn = el('button', 'tt-inline-action', '收起');
  collapseBtn.type = 'button';
  collapseBtn.addEventListener('click', options.onCollapse);
  footActions.append(collapseBtn);
 }
 if (footActions.childElementCount > 0) {
  foot.append(footActions);
 }

 body.append(foot);
 return body;
}

// ── Static Shell ──
const shell = el('div', 'tt-shell');
shell.style.setProperty('--event-count', String(Math.max(stops.length, 1)));

// Top Utility Bar
const topbar = el('nav', 'tt-topbar');
topbar.setAttribute('aria-label', '站点导航');
const homeLink = el('a', 'tt-home-link');
homeLink.href = '/';
const homeIcon = el('img');
homeIcon.src = '/logo.webp';
homeIcon.width = 20;
homeIcon.height = 20;
homeIcon.alt = '';
const homeDot = el('span', 'tt-home-dot', '.');
homeLink.append(homeIcon, document.createTextNode('little paper world'), homeDot);

const topbarMeta = el('div', 'tt-topbar-meta');
const modePill = el('span', 'tt-mode-pill', 'LOCAL SEARCH');
modePill.dataset.mode = 'local';
topbarMeta.append(el('span', undefined, 'TAB THURSDAY ARCHIVE'), modePill);
topbar.append(homeLink, topbarMeta);

// Editorial Masthead
const masthead = el('header', 'tt-masthead');
const mastheadTitle = el('div');
mastheadTitle.append(el('p', 'tt-eyebrow', 'PEOPLE × THURSDAYS'));
const h1 = el('h1');
h1.append(el('em', undefined, 'Tab'), document.createTextNode('星期四'));
mastheadTitle.append(
 h1,
 el('p', 'tt-subtitle', '一人一行，一期一列 · 记录每一次相遇、分享与重逢。')
);

const stats = el('dl', 'tt-stats');
stats.setAttribute('aria-label', '活动统计');
for (const [label, value] of [
 ['活动', String(events.length)],
 ['分享者', String(people.length)],
 ['分享记录', String(totalTalks)]
]) {
 const box = el('div', 'tt-stat');
 box.append(el('dt', undefined, label), el('dd', undefined, value));
 stats.append(box);
}
masthead.append(mastheadTitle, stats);

// Unified Control Panel
const controls = el('section', 'tt-controls');
controls.setAttribute('aria-label', '视图切换与筛选');

const controlsTop = el('div', 'tt-controls-top');
const viewSwitch = el('div', 'tt-view-switch');
viewSwitch.setAttribute('role', 'group');
viewSwitch.setAttribute('aria-label', '查看方式');

const timelineTabBtn = el('button');
timelineTabBtn.type = 'button';
timelineTabBtn.append(document.createTextNode('时间线 '), el('span', undefined, 'TIMELINE'));

const tableTabBtn = el('button');
tableTabBtn.type = 'button';
tableTabBtn.append(document.createTextNode('表格 '), el('span', undefined, 'TABLE'));

viewSwitch.append(timelineTabBtn, tableTabBtn);

const eventFiltersWrap = el('div', 'tt-event-filters');
eventFiltersWrap.setAttribute('role', 'group');
eventFiltersWrap.setAttribute('aria-label', '按活动筛选分享者');

const eventFilterButtons = new Map<string, HTMLButtonElement>();
const allEventsBtn = el('button', 'tt-event-chip');
allEventsBtn.type = 'button';
allEventsBtn.append(document.createTextNode('全部'), el('small', undefined, String(people.length)));
allEventsBtn.addEventListener('click', () => {
 filters = { ...filters, eventId: '' };
 renderContent();
});
eventFilterButtons.set('', allEventsBtn);
eventFiltersWrap.append(allEventsBtn);

for (const stop of stops) {
 const btn = el('button', 'tt-event-chip');
 btn.type = 'button';
 btn.style.setProperty('--event-color', stop.color);
 btn.setAttribute('aria-label', `筛选第 ${stop.event.id} 期分享者`);
 const dot = el('i');
 dot.setAttribute('aria-hidden', 'true');
 btn.append(dot, document.createTextNode(`#${stop.event.id}`), el('small', undefined, String(stop.people.length)));
 btn.addEventListener('click', () => {
  filters = { ...filters, eventId: filters.eventId === stop.event.id ? '' : stop.event.id };
  renderContent();
 });
 eventFilterButtons.set(stop.event.id, btn);
 eventFiltersWrap.append(btn);
}

const repeatLabel = el('label', 'tt-repeat-toggle');
const repeatInput = el('input');
repeatInput.type = 'checkbox';
repeatLabel.append(repeatInput, document.createTextNode('多次分享'), el('span', 'tt-repeat-count', String(repeatCount)));

const filterDivider = el('span', 'tt-filter-divider');
filterDivider.setAttribute('aria-hidden', 'true');

const topFiltersCluster = el('div', 'tt-top-filters');
topFiltersCluster.append(eventFiltersWrap, filterDivider, repeatLabel);

controlsTop.append(viewSwitch, topFiltersCluster);

const controlsBottom = el('div', 'tt-controls-bottom');

const searchLabel = el('label', 'tt-search');
const searchSr = el('span', 'tt-sr-only', '搜索分享者或话题');
const searchSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
searchSvg.setAttribute('viewBox', '0 0 24 24');
searchSvg.setAttribute('aria-hidden', 'true');
const svgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
svgCircle.setAttribute('cx', '10.5');
svgCircle.setAttribute('cy', '10.5');
svgCircle.setAttribute('r', '6.5');
const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
svgPath.setAttribute('d', 'm15.5 15.5 4.5 4.5');
searchSvg.append(svgCircle, svgPath);

const searchInput = el('input');
searchInput.type = 'search';
searchInput.maxLength = 240;
searchInput.placeholder = '搜索人名、项目或话题…';
searchInput.autocomplete = 'off';

const clearBtn = el('button', 'tt-search-clear', '×');
clearBtn.type = 'button';
clearBtn.setAttribute('aria-label', '清空搜索');
clearBtn.hidden = true;

const jevBtn = el('button', 'tt-jev-btn');
jevBtn.type = 'button';
jevBtn.hidden = true;
jevBtn.title = '按 Enter 使用 Jev 语义搜索';
jevBtn.setAttribute('aria-label', '使用 Jev 语义搜索');

const shortcutKbd = el('kbd', 'tt-kbd', '/');
shortcutKbd.setAttribute('aria-hidden', 'true');

searchLabel.append(searchSr, searchSvg, searchInput, clearBtn, jevBtn, shortcutKbd);

// Tactile Physical Archival Rolodex beside Search Input
const rolodex = el('div', 'tt-rolodex');
rolodex.setAttribute('role', 'region');
rolodex.setAttribute('aria-label', '分享者名片盒 Rolodex');
rolodex.dataset.state = 'idle';

const rolodexStackTop = el('div', 'tt-rolodex-stack-top');
rolodexStackTop.setAttribute('aria-hidden', 'true');

const rolodexChassis = el('div', 'tt-rolodex-chassis');
const rolodexBar = el('div', 'tt-rolodex-bar');
const rolodexStatus = el('span', 'tt-rolodex-status');
const rolodexStatusDot = el('i');
rolodexStatusDot.setAttribute('aria-hidden', 'true');
const rolodexStatusText = el('span', undefined, 'ROLODEX');
rolodexStatus.append(rolodexStatusDot, rolodexStatusText);

const rolodexBarRight = el('div', 'tt-rolodex-bar-right');
const rolodexCounter = el('span', 'tt-rolodex-counter', `01 / ${String(people.length).padStart(2, '0')}`);
const rolodexFlickBtn = el('button', 'tt-rolodex-flick', '↻');
rolodexFlickBtn.type = 'button';
rolodexFlickBtn.title = '手动翻牌浏览下一位分享者';
rolodexFlickBtn.setAttribute('aria-label', '翻到下一张分享者名片');
rolodexBarRight.append(rolodexCounter, rolodexFlickBtn);
rolodexBar.append(rolodexStatus, rolodexBarRight);

const rolodexStage = el('div', 'tt-rolodex-stage');
const rolodexBaseBtn = el('button', 'tt-rolodex-card tt-rolodex-card--base');
rolodexBaseBtn.type = 'button';
rolodexBaseBtn.dataset.rolodexCard = 'true';
rolodexBaseBtn.setAttribute('aria-haspopup', 'dialog');
rolodexStage.append(rolodexBaseBtn);

const rolodexHinge = el('div', 'tt-rolodex-hinge');
rolodexHinge.setAttribute('aria-hidden', 'true');
rolodexStage.append(rolodexHinge);

rolodexChassis.append(rolodexBar, rolodexStage);

const rolodexStackBottom = el('div', 'tt-rolodex-stack-bottom');
rolodexStackBottom.setAttribute('aria-hidden', 'true');

rolodex.append(rolodexStackTop, rolodexChassis, rolodexStackBottom);

const searchCluster = el('div', 'tt-search-cluster');
searchCluster.append(searchLabel, rolodex);

const controlsRight = el('div', 'tt-controls-right');
const resultsStatus = el('p', 'tt-results');
resultsStatus.setAttribute('role', 'status');
resultsStatus.setAttribute('aria-live', 'polite');

const sortWrap = el('label', 'tt-sort');
sortWrap.append(el('span', 'tt-sr-only', '排序方式'));
const sortSelect = el('select');
sortSelect.setAttribute('aria-label', '排序方式');
for (const [value, label] of [
 ['appearances', '分享场次 ↓'],
 ['name', '姓名排序'],
 ['recent', '最近分享']
] as const) {
 const opt = el('option', undefined, label);
 opt.value = value;
 sortSelect.append(opt);
}
sortWrap.append(sortSelect);

controlsRight.append(resultsStatus, sortWrap);
controlsBottom.append(searchCluster, controlsRight);
controls.append(controlsTop, controlsBottom);

// Main Content Region
const contentRegion = el('div');

// Footer
const footer = el('footer', 'tt-footer');
const footerNote = el('p');
footerNote.append(
 el('strong', undefined, '—'),
 document.createTextNode(' 未记录分享，不代表缺席。场次不含群内补充。点任意分享卡片或徽章就地展开摘要，或点击「完整详情」打开弹窗。')
);
const footerLinks = el('div', 'tt-footer-links');
footerLinks.append(el('span', undefined, `更新 ${updated}`));
const officialLink = el('a', undefined, 'Tab Thursday ↗');
officialLink.href = 'https://tabthursday.com/';
officialLink.target = '_blank';
officialLink.rel = 'noopener noreferrer';
footerLinks.append(officialLink);
footer.append(footerNote, footerLinks);

// Presentation Detail Modal (<dialog>)
const modal = el('dialog', 'tt-modal');
modal.setAttribute('aria-labelledby', 'tt-modal-title');
modal.setAttribute('aria-modal', 'true');

shell.append(topbar, masthead, controls, contentRegion, footer, modal);
root.replaceChildren(shell);

// ── Presentation Detail Modal Logic ──
function focusableInside(container: HTMLElement): HTMLElement[] {
 return Array.from(
  container.querySelectorAll<HTMLElement>(
   'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
 ).filter(node => !node.hidden && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
}

function closeModal() {
 if (modal.open) {
  modal.close();
 }
}

function renderModalContent(person: Person, presentation: Appearance, event: TabEvent, color: string) {
 modal.dataset.mode = 'talk';
 modal.style.setProperty('--event-color', color);
 const count = appearanceCount(person);
 const badgeInfo = badgeForCount(count);
 const validLinks = presentation.links
  .map(link => ({ label: link.label, href: safeUrl(link.href) }))
  .filter((link): link is { label: string; href: string } => Boolean(link.href));

 const surface = el('div', 'tt-modal-surface');

 const accentBar = el('div', 'tt-modal-accent');
 accentBar.setAttribute('aria-hidden', 'true');
 surface.append(accentBar);

 // Sticky header
 const head = el('header', 'tt-modal-head');
 const eventMeta = el('div', 'tt-modal-event-meta');
 const editionBadge = el('span', 'tt-modal-event-badge');
 const editionDot = el('i');
 editionDot.setAttribute('aria-hidden', 'true');
 editionBadge.append(editionDot, document.createTextNode(`#${event.id}`));
 const eventTime = el('time', undefined, event.date);
 eventTime.dateTime = event.date;
 eventMeta.append(editionBadge, eventTime, el('span', 'tt-modal-event-short', formatShortDate(event.date)));

 const closeBtn = el('button', 'tt-modal-close', '×');
 closeBtn.type = 'button';
 closeBtn.setAttribute('aria-label', '关闭详情弹窗');
 closeBtn.addEventListener('click', closeModal);
 head.append(eventMeta, closeBtn);
 surface.append(head);

 // Scrollable body
 const body = el('div', 'tt-modal-body');

 // Presenter byline + large tier badge + progression + jump to profile
 const byline = el('div', 'tt-modal-byline');
 byline.append(makeBadge(count, true));
 const bylineText = el('div', 'tt-modal-byline-text');
 const bylineTop = el('div', 'tt-modal-byline-top');
 bylineTop.append(makeProfileNode(person), el('span', 'tt-modal-count-pill', `共 ${count} 场分享`));
 bylineText.append(bylineTop, el('p', 'tt-modal-progression', badgeInfo.description));
 byline.append(bylineText);

 const viewProfileBtn = el('button', 'tt-modal-profile-jump-btn', '查看档案 →');
 viewProfileBtn.type = 'button';
 viewProfileBtn.setAttribute('aria-label', `查看 ${person.name} 的完整分享者档案`);
 viewProfileBtn.addEventListener('click', () => openProfileModal(person.id));
 byline.append(viewProfileBtn);
 body.append(byline);

 if (presentation.sourceName !== person.name) {
  const aliasNote = el('p', 'tt-modal-alias');
  aliasNote.append(document.createTextNode('本期纪要署名：'), el('strong', undefined, presentation.sourceName));
  body.append(aliasNote);
 }

 // Presenter profile section
 const profile = person.profile;
 if (
  profile &&
  (profile.summary || profile.roles.length > 0 || profile.focus_areas.length > 0 || profile.notable_projects.length > 0)
 ) {
  const profileSection = el('section', 'tt-modal-profile');
  profileSection.setAttribute('aria-label', '分享者简介');

  const profileHead = el('div', 'tt-modal-profile-head');
  const profileTitle = el('h3', 'tt-modal-section-label');
  profileTitle.append(document.createTextNode('关于分享者 '), el('span', undefined, 'PROFILE'));
  profileHead.append(profileTitle);

  if (profile.roles.length > 0) {
   const rolesWrap = el('div', 'tt-modal-roles');
   for (const role of profile.roles) {
    rolesWrap.append(el('span', 'tt-modal-role', role));
   }
   profileHead.append(rolesWrap);
  }
  profileSection.append(profileHead);

  if (profile.summary) {
   profileSection.append(el('p', 'tt-modal-bio', profile.summary));
  }

  if (profile.focus_areas.length > 0) {
   const tagsWrap = el('div', 'tt-modal-tags');
   tagsWrap.setAttribute('aria-label', '关注领域');
   for (const tag of profile.focus_areas) {
    tagsWrap.append(el('span', 'tt-modal-tag', tag));
   }
   profileSection.append(tagsWrap);
  }

  if (profile.notable_projects.length > 0) {
   const projectsLine = el('p', 'tt-modal-projects');
   projectsLine.append(
    el('span', undefined, '代表项目'),
    document.createTextNode(profile.notable_projects.join(' · '))
   );
   profileSection.append(projectsLine);
  }

  body.append(profileSection);
 }

 // Talk title, venue, and full summary
 const talkSection = el('section', 'tt-modal-talk');
 const titleEl = el('h2', 'tt-modal-title', presentation.title);
 titleEl.id = 'tt-modal-title';
 talkSection.append(
  titleEl,
  el('p', 'tt-modal-venue', `${event.date} · ${event.venue}`),
  el('p', 'tt-modal-summary', presentation.summary)
 );
 const talkPreview = appearancePreview(presentation);
 if (talkPreview) {
  const modalPreview = buildModalPreviewCard(talkPreview, 'talk');
  if (modalPreview) talkSection.append(modalPreview);
 }
 body.append(talkSection);

 // Links section
 if (validLinks.length > 0) {
  const linksSection = el('section', 'tt-modal-section');
  linksSection.setAttribute('aria-label', '相关项目与资料');
  const linksHeading = el('h3', 'tt-modal-section-label');
  linksHeading.append(document.createTextNode('相关项目与资料 '), el('span', undefined, `LINKS · ${validLinks.length}`));
  const linksList = el('ul', 'tt-modal-links');
  for (const link of validLinks) {
   const li = el('li');
   const a = el('a', 'tt-modal-link-item');
   a.href = link.href;
   a.target = '_blank';
   a.rel = 'noopener noreferrer';
   const lp = linkPreview(link.href);
   const thumb = lp ? buildModalLinkThumb(lp) : null;
   if (lp?.title && lp.title !== link.label) {
    a.title = lp.title;
   }
   const textWrap = el('span', 'tt-modal-link-text');
   textWrap.append(el('strong', undefined, link.label), el('small', undefined, linkHostname(link.href)));
   const arrow = el('span', 'tt-modal-link-arrow', '↗');
   arrow.setAttribute('aria-hidden', 'true');
   if (thumb) {
    a.append(thumb, textWrap, arrow);
   } else {
    a.append(textWrap, arrow);
   }
   li.append(a);
   linksList.append(li);
  }
  linksSection.append(linksHeading, linksList);
  body.append(linksSection);
 }

 // Multi-talk quick-switcher
 const personTalks = stops.flatMap(stop => {
  const appearance = appearanceForEvent(person, stop.event.id);
  return appearance ? [{ stop, appearance }] : [];
 });
 if (personTalks.length > 1) {
  const switcherSection = el('section', 'tt-modal-section tt-modal-switcher');
  switcherSection.setAttribute('aria-label', '该分享者的全部场次');
  const switcherHeading = el('h3', 'tt-modal-section-label');
  switcherHeading.append(document.createTextNode('该分享者的全部场次 '), el('span', undefined, `${personTalks.length} TALKS`));
  const talkList = el('div', 'tt-modal-talk-list');
  talkList.setAttribute('role', 'group');
  talkList.setAttribute('aria-label', '切换该分享者的其他场次');

  for (const { stop, appearance } of personTalks) {
   const isCurrent = stop.event.id === event.id;
   const talkBtn = el('button', 'tt-modal-talk-btn');
   talkBtn.type = 'button';
   talkBtn.dataset.modalSwitchEvent = stop.event.id;
   talkBtn.style.setProperty('--event-color', stop.color);
   talkBtn.setAttribute('aria-current', isCurrent ? 'true' : 'false');

   const metaRow = el('span', 'tt-modal-talk-meta');
   const dot = el('i');
   dot.setAttribute('aria-hidden', 'true');
   metaRow.append(dot, document.createTextNode(`#${stop.event.id} · ${formatShortDate(stop.event.date)}`));

   talkBtn.append(metaRow, el('span', 'tt-modal-talk-title', appearance.title));
   talkBtn.addEventListener('click', () => {
    if (isCurrent) return;
    openModal(person.id, stop.event.id, undefined, { preserveSwitchFocus: stop.event.id });
   });
   talkList.append(talkBtn);
  }
  switcherSection.append(switcherHeading, talkList);
  body.append(switcherSection);
 }

 surface.append(body);

 // Modal footer
 const modalFoot = el('footer', 'tt-modal-foot');
 const websiteHref = safeUrl(person.website);
 if (websiteHref) {
  const siteLink = el('a', 'tt-modal-foot-link');
  siteLink.href = websiteHref;
  siteLink.target = '_blank';
  siteLink.rel = 'noopener noreferrer';
  siteLink.append(
   document.createTextNode('个人主页 '),
   el('small', undefined, linkHostname(websiteHref)),
   document.createTextNode(' ↗')
  );
  modalFoot.append(siteLink);
 } else {
  modalFoot.append(el('span', 'tt-modal-foot-muted', `${person.name} · Tab 星期四`));
 }

 const sourceHref = safeUrl(event.source);
 if (sourceHref) {
  const recapLink = el('a', 'tt-modal-foot-link tt-modal-foot-recap', `查看 #${event.id} 现场纪要 ↗`);
  recapLink.href = sourceHref;
  recapLink.target = '_blank';
  recapLink.rel = 'noopener noreferrer';
  modalFoot.append(recapLink);
 }
 surface.append(modalFoot);

 modal.replaceChildren(surface);
}

function profileStatusLabel(status: 'verified' | 'partial' | 'appearances_only'): string {
 if (status === 'verified') return '已核验';
 if (status === 'partial') return '部分公开';
 return '基于分享记录';
}

function renderProfileModalContent(person: Person) {
 modal.dataset.mode = 'profile';
 const personTalks = stops.flatMap(stop => {
  const appearance = appearanceForEvent(person, stop.event.id);
  return appearance ? [{ stop, appearance }] : [];
 });
 const accentColor = personTalks.at(-1)?.stop.color ?? '#a83c2b';
 modal.style.setProperty('--event-color', accentColor);

 const count = appearanceCount(person);
 const badgeInfo = badgeForCount(count);
 const profile = person.profile;
 const websiteHref = safeUrl(person.website);
 const aliases = Array.from(
  new Set([
   ...person.aliases,
   ...person.appearances.map(appearance => appearance.sourceName)
  ].filter(name => name && name !== person.name))
 );

 const surface = el('div', 'tt-modal-surface');

 const accentBar = el('div', 'tt-modal-accent');
 accentBar.setAttribute('aria-hidden', 'true');
 surface.append(accentBar);

 // Sticky header
 const head = el('header', 'tt-modal-head');
 const meta = el('div', 'tt-modal-event-meta');
 const profileBadge = el('span', 'tt-modal-event-badge');
 const dot = el('i');
 dot.setAttribute('aria-hidden', 'true');
 profileBadge.append(dot, document.createTextNode('分享者档案'));
 meta.append(profileBadge);

 if (profile?.status) {
  const statusPill = el('span', 'tt-profile-status-pill', profileStatusLabel(profile.status));
  statusPill.dataset.status = profile.status;
  meta.append(statusPill);
 }

 const closeBtn = el('button', 'tt-modal-close', '×');
 closeBtn.type = 'button';
 closeBtn.setAttribute('aria-label', '关闭分享者档案弹窗');
 closeBtn.addEventListener('click', closeModal);
 head.append(meta, closeBtn);
 surface.append(head);

 // Scrollable body
 const body = el('div', 'tt-modal-body');

 // Identity block
 const identity = el('div', 'tt-modal-byline tt-modal-byline--profile');
 identity.append(makeBadge(count, true));
 const idText = el('div', 'tt-modal-byline-text');
 const idTop = el('div', 'tt-modal-byline-top');
 const nameHeading = el('h2', 'tt-modal-person-title', person.name);
 nameHeading.id = 'tt-modal-title';
 idTop.append(nameHeading, el('span', 'tt-modal-count-pill', `共 ${count} 场分享`));
 idText.append(idTop);

 if (aliases.length > 0) {
  idText.append(el('p', 'tt-modal-aliases', `又名：${aliases.join(' / ')}`));
 }
 idText.append(el('p', 'tt-modal-progression', badgeInfo.description));

 if (websiteHref) {
  const siteChip = el('a', 'tt-modal-website-chip');
  siteChip.href = websiteHref;
  siteChip.target = '_blank';
  siteChip.rel = 'noopener noreferrer';
  siteChip.append(
   document.createTextNode('个人主页 '),
   el('small', undefined, linkHostname(websiteHref)),
   document.createTextNode(' ↗')
  );
  idText.append(siteChip);
 }
 identity.append(idText);
 body.append(identity);

 const featuredPreview = personPreview(person);
 if (featuredPreview) {
  const profilePreview = buildModalPreviewCard(featuredPreview, 'profile');
  if (profilePreview) body.append(profilePreview);
 }

 // Researched profile details
 if (profile) {
  const overview = el('section', 'tt-modal-profile-overview');
  overview.setAttribute('aria-label', '分享者简介与标签');
  const overviewHeading = el('h3', 'tt-modal-section-label');
  overviewHeading.append(document.createTextNode('个人简介 '), el('span', undefined, 'BIO'));
  overview.append(overviewHeading);

  if (profile.summary) {
   overview.append(el('p', 'tt-modal-profile-summary', profile.summary));
  }

  if (profile.roles.length > 0) {
   const rolesWrap = el('div', 'tt-modal-roles');
   rolesWrap.setAttribute('aria-label', '身份角色');
   for (const role of profile.roles) {
    rolesWrap.append(el('span', 'tt-modal-role', role));
   }
   overview.append(rolesWrap);
  }

  if (profile.focus_areas.length > 0) {
   const tagsWrap = el('div', 'tt-modal-tags');
   tagsWrap.setAttribute('aria-label', '关注领域');
   for (const tag of profile.focus_areas) {
    tagsWrap.append(el('span', 'tt-modal-tag', tag));
   }
   overview.append(tagsWrap);
  }
  body.append(overview);

  if (profile.notable_projects.length > 0) {
   const projectsSection = el('section', 'tt-modal-section');
   projectsSection.setAttribute('aria-label', '代表项目');
   const projHeading = el('h3', 'tt-modal-section-label');
   projHeading.append(document.createTextNode('代表项目 '), el('span', undefined, `PROJECTS · ${profile.notable_projects.length}`));
   const projChips = el('div', 'tt-modal-project-chips');
   for (const proj of profile.notable_projects) {
    projChips.append(el('span', 'tt-modal-project-chip', proj));
   }
   projectsSection.append(projHeading, projChips);
   body.append(projectsSection);
  }

  const validSources = Array.from(
   new Set(profile.sources_checked.map(src => safeUrl(src)).filter((u): u is string => Boolean(u)))
  );
  if (validSources.length > 0) {
   const sourcesSection = el('section', 'tt-modal-section');
   sourcesSection.setAttribute('aria-label', '核验来源');
   const srcHeading = el('h3', 'tt-modal-section-label');
   srcHeading.append(document.createTextNode('核验来源 '), el('span', undefined, `SOURCES · ${validSources.length}`));
   const srcList = el('ul', 'tt-modal-links');
   for (const srcUrl of validSources) {
    const li = el('li');
    const a = el('a', 'tt-modal-link-item');
    a.href = srcUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const lp = linkPreview(srcUrl);
    const thumb = lp ? buildModalLinkThumb(lp) : null;
    if (lp?.title) {
     a.title = lp.title;
    }
    const textWrap = el('span', 'tt-modal-link-text');
    textWrap.append(el('strong', undefined, linkHostname(srcUrl)), el('small', undefined, srcUrl));
    const arrow = el('span', 'tt-modal-link-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    if (thumb) {
     a.append(thumb, textWrap, arrow);
    } else {
     a.append(textWrap, arrow);
    }
    li.append(a);
    srcList.append(li);
   }
   sourcesSection.append(srcHeading, srcList);
   body.append(sourcesSection);
  }
 }

 // Chronological list of all Tab Thursday talks
 if (personTalks.length > 0) {
  const talksSection = el('section', 'tt-modal-section');
  talksSection.setAttribute('aria-label', '历期分享记录');
  const talksHeading = el('h3', 'tt-modal-section-label');
  talksHeading.append(document.createTextNode('历期分享记录 '), el('span', undefined, `${personTalks.length} TALKS`));
  const talksList = el('div', 'tt-modal-talk-cards');
  talksList.setAttribute('role', 'group');
  talksList.setAttribute('aria-label', '切换至对应场次的分享详情');

  for (const { stop, appearance } of personTalks) {
   const talkCard = el('button', 'tt-modal-talk-card');
   talkCard.type = 'button';
   talkCard.dataset.modalSwitchEvent = stop.event.id;
   talkCard.style.setProperty('--event-color', stop.color);
   talkCard.setAttribute('aria-label', `查看第 ${stop.event.id} 期分享详情：${appearance.title}`);

   const cardTop = el('span', 'tt-modal-talk-card-top');
   const metaTag = el('span', 'tt-modal-talk-meta');
   const metaDot = el('i');
   metaDot.setAttribute('aria-hidden', 'true');
   metaTag.append(metaDot, document.createTextNode(`#${stop.event.id} · ${formatShortDate(stop.event.date)}`));
   cardTop.append(metaTag, el('span', 'tt-modal-talk-card-cta', '查看详情 →'));

   talkCard.append(
    cardTop,
    el('span', 'tt-modal-talk-card-title', appearance.title),
    el('span', 'tt-modal-talk-card-summary', appearance.summary)
   );
   talkCard.addEventListener('click', () => {
    openModal(person.id, stop.event.id);
   });
   talksList.append(talkCard);
  }
  talksSection.append(talksHeading, talksList);
  body.append(talksSection);
 }

 surface.append(body);

 // Footer
 const modalFoot = el('footer', 'tt-modal-foot');
 if (websiteHref) {
  const siteLink = el('a', 'tt-modal-foot-link');
  siteLink.href = websiteHref;
  siteLink.target = '_blank';
  siteLink.rel = 'noopener noreferrer';
  siteLink.append(
   document.createTextNode('个人主页 '),
   el('small', undefined, linkHostname(websiteHref)),
   document.createTextNode(' ↗')
  );
  modalFoot.append(siteLink);
 } else {
  modalFoot.append(el('span', 'tt-modal-foot-muted', `${person.name} · 分享者档案`));
 }

 const latestTalk = personTalks.at(-1);
 if (latestTalk) {
  const jumpTalkBtn = el('button', 'tt-modal-foot-action', `查看最近分享 #${latestTalk.stop.event.id} →`);
  jumpTalkBtn.type = 'button';
  jumpTalkBtn.addEventListener('click', () => openModal(person.id, latestTalk.stop.event.id));
  modalFoot.append(jumpTalkBtn);
 }
 surface.append(modalFoot);

 modal.replaceChildren(surface);
}

function openProfileModal(personId: string, trigger?: HTMLElement) {
 const person = personById.get(personId);
 if (!person) return;

 if (!modal.open) {
  modalTrigger = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  modalTriggerSelector = stableFocusSelector(modalTrigger);
 }

 renderProfileModalContent(person);

 if (!modal.open) {
  modal.showModal();
 }

 const body = modal.querySelector<HTMLElement>('.tt-modal-body');
 if (body) body.scrollTop = 0;
 modal.querySelector<HTMLButtonElement>('.tt-modal-close')?.focus({ preventScroll: true });
}

function openModal(
 personId: string,
 eventId: string,
 trigger?: HTMLElement,
 options?: { preserveSwitchFocus?: string }
) {
 const person = personById.get(personId);
 const event = eventById.get(eventId);
 const presentation = person ? appearanceForEvent(person, eventId) : undefined;
 if (!person || !event || !presentation) return;

 if (!modal.open) {
  modalTrigger = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  modalTriggerSelector = stableFocusSelector(modalTrigger);
 }

 const color = stopByEventId.get(event.id)?.color ?? '#1f725b';
 renderModalContent(person, presentation, event, color);

 if (!modal.open) {
  modal.showModal();
 }

 if (options?.preserveSwitchFocus) {
  const switchBtn = modal.querySelector<HTMLButtonElement>(`[data-modal-switch-event="${options.preserveSwitchFocus}"]`);
  switchBtn?.focus({ preventScroll: true });
 } else {
  const body = modal.querySelector<HTMLElement>('.tt-modal-body');
  if (body) body.scrollTop = 0;
  modal.querySelector<HTMLButtonElement>('.tt-modal-close')?.focus({ preventScroll: true });
 }
}

modal.addEventListener('click', event => {
 if (event.target === modal) {
  closeModal();
 }
});

modal.addEventListener('cancel', event => {
 event.preventDefault();
 closeModal();
});

modal.addEventListener('close', () => {
 const triggerToRestore = modalTrigger?.isConnected
  ? modalTrigger
  : modalTriggerSelector
   ? contentRegion.querySelector<HTMLElement>(modalTriggerSelector)
   : null;
 modalTrigger = null;
 modalTriggerSelector = null;
 triggerToRestore?.focus({ preventScroll: true });
});

modal.addEventListener('keydown', event => {
 if (event.key !== 'Tab' || !modal.open) return;
 const focusables = focusableInside(modal);
 if (focusables.length === 0) {
  event.preventDefault();
  return;
 }
 const first = focusables[0];
 const last = focusables[focusables.length - 1];
 const active = document.activeElement as HTMLElement | null;
 if (event.shiftKey) {
  if (!active || active === first || !modal.contains(active)) {
   event.preventDefault();
   last.focus();
  }
 } else if (!active || active === last || !modal.contains(active)) {
  event.preventDefault();
  first.focus();
 }
});

// ── Search-Bar Rolodex Controller ──
type RolodexState = 'idle' | 'searching' | 'matched' | 'empty';

const personIndexById = new Map(people.map((person, index) => [person.id, index]));
let rolodexState: RolodexState = 'idle';
let rolodexMatchCount = 0;
let rolodexDeck: Person[] = [...people];
let rolodexCursor = 0;
let rolodexCurrentPerson: Person | null = people[0] ?? null;
let rolodexIntervalId: number | undefined;
const rolodexTimeouts = new Set<number>();

function prefersReducedMotion(): boolean {
 return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scheduleRolodexTimeout(fn: () => void, delayMs: number): number {
 const id = window.setTimeout(() => {
  rolodexTimeouts.delete(id);
  fn();
 }, delayMs);
 rolodexTimeouts.add(id);
 return id;
}

function clearRolodexTimers() {
 if (rolodexIntervalId !== undefined) {
  window.clearInterval(rolodexIntervalId);
  rolodexIntervalId = undefined;
 }
 for (const id of rolodexTimeouts) {
  window.clearTimeout(id);
 }
 rolodexTimeouts.clear();
}

function clearRolodexLeaves() {
 rolodexStage.querySelectorAll('.tt-rolodex-leaf').forEach(node => node.remove());
 rolodexBaseBtn.classList.remove('tt-rolodex-card--entering');
}

function shuffledPeople(avoidPersonId?: string): Person[] {
 const deck = [...people];
 for (let i = deck.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [deck[i], deck[j]] = [deck[j], deck[i]];
 }
 if (avoidPersonId && deck.length > 1 && deck[0].id === avoidPersonId) {
  [deck[0], deck[1]] = [deck[1], deck[0]];
 }
 return deck;
}

function rolodexSubtitle(person: Person): string {
 const role = person.profile?.roles?.[0];
 if (role) return role;
 const latestAppearance = person.appearances.at(-1);
 return latestAppearance?.title ?? `${appearanceCount(person)} 场分享`;
}

function fillRolodexCard(container: HTMLElement, person: Person | null) {
 container.replaceChildren();
 if (!person) {
  const emptyIcon = el('span', 'tt-rolodex-empty-mark', '—');
  emptyIcon.setAttribute('aria-hidden', 'true');
  const text = el('span', 'tt-rolodex-text');
  text.append(
   el('span', 'tt-rolodex-name tt-rolodex-name--empty', '无匹配档案'),
   el('span', 'tt-rolodex-sub', '换个语义描述或切回本地')
  );
  container.append(emptyIcon, text);
  return;
 }
 const text = el('span', 'tt-rolodex-text');
 text.append(
  el('span', 'tt-rolodex-name', person.name),
  el('span', 'tt-rolodex-sub', rolodexSubtitle(person))
 );
 container.append(makeBadge(appearanceCount(person)), text);
}

function updateRolodexChrome(state: RolodexState, matchCount = 0) {
 rolodexState = state;
 rolodexMatchCount = matchCount;
 rolodex.dataset.state = state;
 rolodexFlickBtn.disabled = state === 'searching' || people.length <= 1;
 rolodexStage.setAttribute('aria-busy', String(state === 'searching'));

 if (state === 'searching') {
  rolodexStatusText.textContent = 'JEV 检索中';
 } else if (state === 'matched') {
  rolodexStatusText.textContent = `JEV 命中 · ${matchCount} 位`;
 } else if (state === 'empty') {
  rolodexStatusText.textContent = 'JEV · 0 命中';
 } else {
  rolodexStatusText.textContent = 'ROLODEX';
 }

 const totalStr = String(people.length).padStart(2, '0');
 if (rolodexCurrentPerson) {
  const idx = (personIndexById.get(rolodexCurrentPerson.id) ?? 0) + 1;
  rolodexCounter.textContent = `${String(idx).padStart(2, '0')} / ${totalStr}`;
 } else {
  rolodexCounter.textContent = `-- / ${totalStr}`;
 }
}

function flipRolodexTo(nextPerson: Person | null, durationMs: number, animate = true) {
 const prevPerson = rolodexCurrentPerson;
 const shouldAnimate = animate && !prefersReducedMotion();

 if (shouldAnimate) {
  const existingLeaves = rolodexStage.querySelectorAll('.tt-rolodex-leaf');
  if (existingLeaves.length >= 2) {
   existingLeaves[0].remove();
  }
  const leaf = el('div', 'tt-rolodex-card tt-rolodex-leaf');
  leaf.setAttribute('aria-hidden', 'true');
  leaf.style.setProperty('--rolodex-flip-ms', `${durationMs}ms`);
  fillRolodexCard(leaf, prevPerson);
  rolodexStage.insertBefore(leaf, rolodexHinge);

  const removeLeaf = () => {
   if (leaf.isConnected) leaf.remove();
  };
  leaf.addEventListener('animationend', removeLeaf, { once: true });
  scheduleRolodexTimeout(removeLeaf, durationMs + 80);

  rolodexBaseBtn.classList.remove('tt-rolodex-card--entering');
  rolodexBaseBtn.style.setProperty('--rolodex-flip-ms', `${durationMs}ms`);
  void rolodexBaseBtn.offsetWidth;
  rolodexBaseBtn.classList.add('tt-rolodex-card--entering');
 }

 rolodexCurrentPerson = nextPerson;
 fillRolodexCard(rolodexBaseBtn, nextPerson);
 rolodexBaseBtn.disabled = !nextPerson || rolodexState === 'searching';
 if (nextPerson) {
  rolodexBaseBtn.title = `点击查看 ${nextPerson.name} 的分享者档案`;
  rolodexBaseBtn.setAttribute('aria-label', `当前名片：${nextPerson.name}，点击查看分享者档案`);
 } else {
  rolodexBaseBtn.title = '暂无匹配档案';
  rolodexBaseBtn.setAttribute('aria-label', '当前无匹配分享者档案');
 }
 updateRolodexChrome(rolodexState, rolodexMatchCount);
}

function startRolodexSpin() {
 clearRolodexTimers();
 clearRolodexLeaves();
 if (people.length === 0) return;

 rolodexDeck = shuffledPeople(rolodexCurrentPerson?.id);
 rolodexCursor = 0;
 updateRolodexChrome('searching', 0);
 rolodexBaseBtn.disabled = true;

 const reduced = prefersReducedMotion();
 const stepMs = reduced ? 340 : 95;
 const flipMs = reduced ? 0 : 140;

 const step = () => {
  if (rolodexState !== 'searching') return;
  const next = rolodexDeck[rolodexCursor % rolodexDeck.length];
  rolodexCursor++;
  if (rolodexCursor >= rolodexDeck.length) {
   rolodexDeck = shuffledPeople(next.id);
   rolodexCursor = 0;
  }
  flipRolodexTo(next, flipMs, !reduced);
 };

 step();
 rolodexIntervalId = window.setInterval(step, stepMs);
}

function settleRolodexOnResult(topPerson: Person | null, matchCount: number) {
 clearRolodexTimers();
 const nextState: RolodexState = topPerson ? 'matched' : 'empty';

 if (prefersReducedMotion()) {
  clearRolodexLeaves();
  rolodexState = nextState;
  rolodexMatchCount = matchCount;
  flipRolodexTo(topPerson, 0, false);
  updateRolodexChrome(nextState, matchCount);
  return;
 }

 const midCandidate = rolodexDeck[rolodexCursor % rolodexDeck.length];
 const midPerson = midCandidate && midCandidate.id !== topPerson?.id
  ? midCandidate
  : people.find(p => p.id !== topPerson?.id && p.id !== rolodexCurrentPerson?.id) ?? topPerson;

 scheduleRolodexTimeout(() => {
  if (midPerson) flipRolodexTo(midPerson, 175, true);
 }, 115);

 scheduleRolodexTimeout(() => {
  rolodexState = nextState;
  rolodexMatchCount = matchCount;
  flipRolodexTo(topPerson, 240, true);
  updateRolodexChrome(nextState, matchCount);
 }, 275);
}

function resetRolodexToIdle() {
 clearRolodexTimers();
 clearRolodexLeaves();
 rolodexState = 'idle';
 rolodexMatchCount = 0;
 const target = rolodexCurrentPerson ?? people[0] ?? null;
 rolodexCurrentPerson = target;
 fillRolodexCard(rolodexBaseBtn, target);
 rolodexBaseBtn.disabled = !target;
 if (target) {
  rolodexBaseBtn.title = `点击查看 ${target.name} 的分享者档案`;
  rolodexBaseBtn.setAttribute('aria-label', `当前名片：${target.name}，点击查看分享者档案`);
 }
 updateRolodexChrome('idle', 0);
}

rolodexBaseBtn.addEventListener('click', () => {
 if (rolodexState === 'searching' || !rolodexCurrentPerson) return;
 openProfileModal(rolodexCurrentPerson.id, rolodexBaseBtn);
});

rolodexFlickBtn.addEventListener('click', () => {
 if (rolodexState === 'searching' || people.length === 0) return;
 clearRolodexTimers();
 const currentIdx = rolodexCurrentPerson ? (personIndexById.get(rolodexCurrentPerson.id) ?? -1) : -1;
 const nextPerson = people[(currentIdx + 1) % people.length];
 rolodexState = 'idle';
 rolodexMatchCount = 0;
 flipRolodexTo(nextPerson, 240, true);
});

// Initialize default Rolodex card
resetRolodexToIdle();

// ── Cross-Highlighting (DOM attribute toggle without re-rendering) ──
function setActivePerson(personId: string | null) {
 if (activePersonId === personId) return;
 activePersonId = personId;
 const timelineSection = contentRegion.querySelector<HTMLElement>('.tt-timeline');
 if (!timelineSection) return;
 if (personId) {
  timelineSection.dataset.hasActive = 'true';
 } else {
  delete timelineSection.dataset.hasActive;
 }
 timelineSection.querySelectorAll<HTMLElement>('[data-person-id]').forEach(node => {
  node.dataset.active = String(node.dataset.personId === personId);
 });
 timelineSection.querySelectorAll<HTMLElement>('[data-journey-person]').forEach(node => {
  node.dataset.active = String(node.dataset.journeyPerson === personId);
 });
}

function bindHighlightHandlers(node: HTMLElement, personId: string) {
 node.addEventListener('mouseenter', () => setActivePerson(personId));
 node.addEventListener('mouseleave', () => {
  if (activePersonId === personId) setActivePerson(null);
 });
 node.addEventListener('focusin', () => setActivePerson(personId));
 node.addEventListener('focusout', event => {
  const next = event.relatedTarget as Node | null;
  if (next && node.contains(next)) return;
  if (activePersonId === personId) setActivePerson(null);
 });
}

// ── Inline Collapse-All Sync ──
function syncCollapseAllControls() {
 const count = expandedCards.size;
 contentRegion.querySelectorAll<HTMLButtonElement>('[data-collapse-all]').forEach(btn => {
  btn.hidden = count === 0;
  btn.textContent = `全部收起 (${count})`;
 });
}

function collapseAllInline() {
 if (!expandedCards.size && !selectedStopPerson.size) return;
 expandedCards.clear();
 selectedStopPerson.clear();
 lastRenderedSignature = '';
 renderContent();
}

function expandAndJumpToJourney(personId: string, eventId: string) {
 const key = cardKey(personId, eventId);
 const btn = contentRegion.querySelector<HTMLButtonElement>(`[data-journey-presentation="${key}"]`);
 if (btn) {
  const card = btn.closest<HTMLElement>('.tt-station-card');
  if (card && card.dataset.expanded !== 'true') {
   btn.click();
  }
  const row = btn.closest<HTMLElement>('.tt-journey-row');
  row?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  btn.focus({ preventScroll: true });
 }
}

// ── Timeline View Rendering ──
function buildBadgeGuide(): HTMLDetailsElement {
 const details = el('details', 'tt-badge-guide');
 details.dataset.badgeGuide = 'true';
 details.open = badgeGuideOpen;
 details.addEventListener('toggle', () => {
  badgeGuideOpen = details.open;
 });

 const summary = el('summary');
 const left = el('span', 'tt-badge-guide-title');
 const chevron = el('span', 'tt-badge-guide-chevron');
 chevron.setAttribute('aria-hidden', 'true');
 left.append(chevron, document.createTextNode('徽章进阶'), el('span', 'tt-badge-guide-range', '1 → 12'));

 const preview = el('span', 'tt-badge-guide-preview');
 preview.setAttribute('aria-hidden', 'true');
 for (const tier of BADGE_TIERS) {
  const img = el('img');
  img.src = tier.image;
  img.alt = '';
  img.width = 20;
  img.height = 20;
  img.loading = 'lazy';
  preview.append(img);
 }
 summary.append(left, preview);

 const body = el('div', 'tt-badge-guide-body');
 body.append(el('p', undefined, '每场分享留下一枚印记。次数越多，材质越珍贵；徽章中的数字始终是实际记录场次。'));

 const ol = el('ol', 'tt-badge-guide-list');
 for (const tier of BADGE_TIERS) {
  const li = el('li');
  li.dataset.badgePreview = tier.id;
  const info = el('div');
  info.append(
   el('strong', undefined, tier.zh),
   el('small', undefined, tier.name),
   el('span', 'tt-tier-min', `${tier.minimum} 场起`)
  );
  li.append(makeBadge(tier.minimum), info);
  ol.append(li);
 }

 body.append(
  ol,
  el('p', undefined, '按已记录的分享场次累计，不含未记录的出席。满 12 场解锁「社区锚点」最高徽章，数字继续增长。')
 );
 details.append(summary, body);
 return details;
}

function renderTimelineView(visiblePeople: Person[]): HTMLElement {
 const section = el('section', 'tt-timeline');
 section.setAttribute('aria-label', 'Tab 星期四分享时间线');
 section.dataset.timeline = 'true';

 // Intro + Legend
 const intro = el('div', 'tt-timeline-intro');
 const introLeft = el('div');
 introLeft.append(el('p', 'tt-kicker', dateRangeKicker(stops)), el('h2', undefined, '从初见，到再见面。'));

 const legend = el('div', 'tt-legend');
 for (const stop of stops) {
  const item = el('span', 'tt-legend-item');
  item.style.setProperty('--event-color', stop.color);
  const ring = el('i', 'tt-legend-ring');
  ring.setAttribute('aria-hidden', 'true');
  item.append(ring, document.createTextNode(formatShortDate(stop.event.date)));
  legend.append(item);
 }
 legend.append(el('small', undefined, '颜色对应活动 · 徽章累计分享场次'));
 intro.append(introLeft, legend);
 section.append(intro, buildBadgeGuide());

 // 4-Column Event Timeline Stops
 const stopsList = el('ol', 'tt-stops');
 for (const stop of stops) {
  const matchedInStop = visiblePeople.filter(person => Boolean(appearanceForEvent(person, stop.event.id)));
  const li = el('li', 'tt-stop');
  li.dataset.timelineEvent = stop.event.id;
  li.dataset.selected = String(filters.eventId === stop.event.id);
  li.style.setProperty('--event-color', stop.color);

  // Date bar
  const datebar = el('header', 'tt-stop-datebar');
  const time = el('time', undefined, formatShortDate(stop.event.date));
  time.dateTime = stop.event.date;
  const edition = el('span', 'tt-stop-edition');
  edition.append(document.createTextNode('THU '), el('b', undefined, `#${stop.event.id}`));
  datebar.append(time, edition);

  // Spine node
  const spine = el('div', 'tt-spine');
  spine.setAttribute('aria-hidden', 'true');
  spine.append(el('span', 'tt-spine-node', String(stop.index + 1).padStart(2, '0')));

  // Elevated Stop Card
  const card = el('div', 'tt-stop-card');

  const head = el('div', 'tt-stop-head');
  const meta = el('div', 'tt-stop-meta');
  meta.append(el('span', undefined, '位分享者'), el('small', undefined, stop.event.venue));
  head.append(el('strong', 'tt-stop-count', String(stop.people.length)), meta);

  const sourceHref = safeUrl(stop.event.source);
  if (sourceHref) {
   const sourceLink = el('a', 'tt-stop-source', '↗');
   sourceLink.href = sourceHref;
   sourceLink.target = '_blank';
   sourceLink.rel = 'noopener noreferrer';
   sourceLink.title = `第 ${stop.event.id} 期现场纪要`;
   sourceLink.setAttribute('aria-label', `第 ${stop.event.id} 期现场纪要`);
   head.append(sourceLink);
  }
  card.append(head);

  // First vs Returning split + micro stacked bar
  const splitBlock = el('div', 'tt-split-block');
  const splitRow = el('p', 'tt-split');

  const firstItem = el('span', 'tt-split-item');
  const firstSwatch = el('i', 'tt-split-swatch tt-split-swatch--first');
  firstSwatch.setAttribute('aria-hidden', 'true');
  firstItem.append(firstSwatch, document.createTextNode(`${stop.firstCount} 首次记录`));

  const returnItem = el('span', 'tt-split-item');
  const returnSwatch = el('i', 'tt-split-swatch tt-split-swatch--return');
  returnSwatch.setAttribute('aria-hidden', 'true');
  returnItem.append(returnSwatch, document.createTextNode(`${stop.returningCount} 再次分享`));

  splitRow.append(firstItem, returnItem);

  const splitBar = el('div', 'tt-split-bar');
  splitBar.setAttribute('aria-hidden', 'true');
  const totalInStop = Math.max(stop.people.length, 1);
  if (stop.firstCount > 0) {
   const seg = el('span', 'tt-split-bar-first');
   seg.style.width = `${(stop.firstCount / totalInStop) * 100}%`;
   splitBar.append(seg);
  }
  if (stop.returningCount > 0) {
   const seg = el('span', 'tt-split-bar-return');
   seg.style.width = `${(stop.returningCount / totalInStop) * 100}%`;
   splitBar.append(seg);
  }
  splitBlock.append(splitRow, splitBar);
  card.append(splitBlock);

  // Inline detail slot right inside this stop card (no modal)
  const stopInlineSlot = el('div');
  const dotButtons = new Map<string, HTMLButtonElement>();

  const renderStopInline = () => {
   const selectedId = selectedStopPerson.get(stop.event.id);
   const selectedPerson = selectedId ? matchedInStop.find(p => p.id === selectedId) : undefined;
   for (const [pid, btn] of dotButtons) {
    btn.setAttribute('aria-expanded', String(selectedPerson?.id === pid));
   }
   stopInlineSlot.replaceChildren();
   if (!selectedPerson) return;
   const presentation = appearanceForEvent(selectedPerson, stop.event.id);
   if (!presentation) return;

   const box = el('div', 'tt-stop-inline');
   box.style.setProperty('--event-color', stop.color);
   const boxHead = el('div', 'tt-stop-inline-head');
   const who = el('div', 'tt-stop-inline-who');
   const count = appearanceCount(selectedPerson);
   const badgeInfo = badgeForCount(count);
   const whoText = el('div', 'tt-stop-inline-who-text');
   const badgeMeta = el('span', 'tt-stop-inline-badge-meta', `${count} 场 · ${badgeInfo.tier.zh} ${badgeInfo.tier.name}`);
   badgeMeta.title = badgeInfo.description;
   whoText.append(makeProfileNode(selectedPerson), badgeMeta);
   who.append(makeBadge(count), whoText);

   const controlsWrap = el('div', 'tt-stop-inline-controls');
   const profileBtn = makeProfileTriggerBtn(
    selectedPerson,
    '查看档案',
    `stop-${cardKey(selectedPerson.id, stop.event.id)}`,
    'tt-profile-pill-btn tt-profile-pill-btn--stop'
   );
   const closeBtn = el('button', 'tt-stop-inline-close', '×');
   closeBtn.type = 'button';
   closeBtn.setAttribute('aria-label', '收起详情');
   closeBtn.addEventListener('click', () => {
    selectedStopPerson.delete(stop.event.id);
    renderStopInline();
    dotButtons.get(selectedPerson.id)?.focus({ preventScroll: true });
   });
   controlsWrap.append(profileBtn, closeBtn);
   boxHead.append(who, controlsWrap);

   const title = el('p', 'tt-stop-inline-title', presentation.title);
   const details = buildInlineDetails(selectedPerson, presentation, stop.event, {
    showDate: false,
    showBadgeMeta: false,
    modalTriggerKey: `stop-${cardKey(selectedPerson.id, stop.event.id)}`,
    onOpenModal: trigger => openModal(selectedPerson.id, stop.event.id, trigger),
    onJumpToJourney: () => expandAndJumpToJourney(selectedPerson.id, stop.event.id)
   });
   box.append(boxHead, title, details);
   stopInlineSlot.append(box);
  };

  // Presenter badge cluster
  const cluster = el('div', 'tt-cluster');
  cluster.setAttribute('aria-label', `第 ${stop.event.id} 期的 ${matchedInStop.length} 位分享者`);
  if (matchedInStop.length === 0) {
   cluster.append(el('p', 'tt-no-matches', '本期没有匹配的分享'));
  } else {
   for (const person of matchedInStop) {
    const presentation = appearanceForEvent(person, stop.event.id);
    if (!presentation) continue;
    const kind = firstEventIdForPerson(person, stops) === stop.event.id ? 'first' : 'returning';
    const dotBtn = el('button', 'tt-person-dot');
    dotBtn.type = 'button';
    dotBtn.dataset.kind = kind;
    dotBtn.dataset.personId = person.id;
    dotBtn.dataset.timelinePresentation = cardKey(person.id, stop.event.id);
    dotBtn.dataset.active = String(activePersonId === person.id);
    dotBtn.setAttribute('aria-expanded', String(selectedStopPerson.get(stop.event.id) === person.id));
    dotBtn.title = `${person.name} · ${presentation.title}`;
    dotBtn.setAttribute('aria-label', `${person.name} · 第 ${stop.event.id} 期 · ${presentation.title}，展开详情`);

    const initials = el('span', 'tt-initials', avatarInitials(person.name));
    initials.setAttribute('aria-hidden', 'true');
    dotBtn.append(makeBadge(appearanceCount(person)), initials);

    bindHighlightHandlers(dotBtn, person.id);
    dotBtn.addEventListener('click', () => {
     if (selectedStopPerson.get(stop.event.id) === person.id) {
      selectedStopPerson.delete(stop.event.id);
     } else {
      selectedStopPerson.set(stop.event.id, person.id);
     }
     renderStopInline();
    });
    dotButtons.set(person.id, dotBtn);
    cluster.append(dotBtn);
   }
  }
  card.append(cluster, stopInlineSlot);
  renderStopInline();

  if (matchedInStop.length !== stop.people.length) {
   card.append(el('p', 'tt-filtered-note', `筛选后显示 ${matchedInStop.length} / ${stop.people.length} 人`));
  }

  // Cumulative growth footer
  const growth = el('div', 'tt-growth');
  const growthRow = el('div', 'tt-growth-row');
  const growthStrong = el('strong');
  growthStrong.append(document.createTextNode(String(stop.cumulativeCount)), el('small', undefined, ` / ${people.length} 人`));
  growthRow.append(el('span', undefined, '累计分享者'), growthStrong);

  const growthBar = el('div', 'tt-growth-bar');
  growthBar.setAttribute('aria-hidden', 'true');
  const fill = el('span');
  fill.style.width = `${(stop.cumulativeCount / Math.max(people.length, 1)) * 100}%`;
  growthBar.append(fill);
  growth.append(growthRow, growthBar);
  card.append(growth);

  li.append(datebar, spine, card);
  stopsList.append(li);
 }
 section.append(stopsList);

 // People / Continuity Matrix
 const journeys = el('section', 'tt-journeys');
 journeys.setAttribute('aria-label', '所有分享者的时间轨迹');

 const journeyIntro = el('header', 'tt-journey-intro');
 const journeyHeading = el('div', 'tt-journey-heading');
 const collapseAllBtn = el('button', 'tt-collapse-all-btn', `全部收起 (${expandedCards.size})`);
 collapseAllBtn.type = 'button';
 collapseAllBtn.dataset.collapseAll = 'true';
 collapseAllBtn.hidden = expandedCards.size === 0;
 collapseAllBtn.addEventListener('click', collapseAllInline);

 journeyHeading.append(
  el('h3', undefined, '每个人的星期四'),
  el('span', 'tt-count-pill', `${visiblePeople.length} 人`),
  collapseAllBtn
 );
 const journeyRight = el('div', 'tt-journey-right');
 const lineLegend = el('span', 'tt-line-legend');
 const solidSample = el('span');
 solidSample.append(el('i', 'tt-line-sample'), document.createTextNode('连续参与'));
 const dashedSample = el('span');
 dashedSample.append(el('i', 'tt-line-sample tt-line-sample--dashed'), document.createTextNode('间隔重逢'));
 lineLegend.append(solidSample, dashedSample);
 journeyRight.append(lineLegend, el('span', undefined, 'PEOPLE / CONTINUITY'));
 journeyIntro.append(journeyHeading, journeyRight);
 journeys.append(journeyIntro);

 const journeyCard = el('div', 'tt-journey-card');
 journeyCard.setAttribute('role', 'region');
 journeyCard.setAttribute('aria-label', '完整分享时间线');

 const datesHeader = el('div', 'tt-journey-dates');
 datesHeader.append(el('span', undefined, '分享者 / 场次'));
 const datesCols = el('div');
 for (const stop of stops) {
  const time = el('time');
  time.dateTime = stop.event.date;
  time.style.setProperty('--event-color', stop.color);
  time.dataset.selected = String(filters.eventId === stop.event.id);
  const ring = el('i', 'tt-legend-ring');
  ring.setAttribute('aria-hidden', 'true');
  time.append(ring, document.createTextNode(formatShortDate(stop.event.date)));
  datesCols.append(time);
 }
 datesHeader.append(datesCols);
 journeyCard.append(datesHeader);

 if (visiblePeople.length === 0) {
  journeyCard.append(buildEmptyState());
 } else {
  for (const person of visiblePeople) {
   const span = continuitySpan(person, stops);
   const row = el('div', 'tt-journey-row');
   row.dataset.journeyPerson = person.id;
   row.dataset.active = String(activePersonId === person.id);
   bindHighlightHandlers(row, person.id);

   const nameCol = el('div', 'tt-journey-name');
   nameCol.append(makeBadge(appearanceCount(person)));
   const identity = el('div', 'tt-journey-identity');
   const websiteUrl = safeUrl(person.website);
   if (websiteUrl) {
    const a = el('a');
    a.href = websiteUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.personWebsite = `journey-${person.id}`;
    a.setAttribute('aria-label', `${person.name} 的个人主页（新窗口）`);
    const arrow = el('span', undefined, '↗');
    arrow.setAttribute('aria-hidden', 'true');
    a.append(document.createTextNode(person.name), arrow);
    identity.append(a);
   } else {
    identity.append(el('span', 'tt-plain-name', person.name));
   }
   identity.append(makeProfileTriggerBtn(person, '档案', `journey-${person.id}`));
   nameCol.append(identity, el('strong', 'tt-sr-only', `${appearanceCount(person)} 场`));

   const track = el('div', 'tt-track');
   if (span.hasConnector) {
    track.style.setProperty('--line-start', `${span.lineStartPct}%`);
    track.style.setProperty('--line-width', `${span.lineWidthPct}%`);
    const connector = el('span', 'tt-connector');
    connector.dataset.gap = String(span.hasGap);
    connector.setAttribute('aria-hidden', 'true');
    track.append(connector);
   }

   for (const stop of stops) {
    const presentation = appearanceForEvent(person, stop.event.id);
    const station = el('div', 'tt-station');
    station.style.setProperty('--event-color', stop.color);
    station.dataset.selected = String(filters.eventId === stop.event.id);

    const mobileDate = el('time', 'tt-station-date', formatShortDate(stop.event.date));
    mobileDate.dateTime = stop.event.date;
    station.append(mobileDate);

    if (presentation) {
     const key = cardKey(person.id, stop.event.id);
     const isExpanded = expandedCards.has(key);
     station.dataset.expanded = String(isExpanded);

     const stationCard = el('div', 'tt-station-card');
     stationCard.dataset.expanded = String(isExpanded);

     const btn = el('button', 'tt-station-btn');
     btn.type = 'button';
     btn.dataset.journeyPresentation = key;
     btn.dataset.kind = firstEventIdForPerson(person, stops) === stop.event.id ? 'first' : 'returning';
     btn.setAttribute('aria-expanded', String(isExpanded));
     btn.title = `${person.name} · ${presentation.title}`;
     btn.setAttribute('aria-label', `${person.name} · 第 ${stop.event.id} 期 · ${presentation.title}，展开或收起详情`);

     const titleSpan = el('span', 'tt-station-title', presentation.title);
     const chevron = el('span', 'tt-station-chevron', '▾');
     chevron.setAttribute('aria-hidden', 'true');
     btn.append(titleSpan, chevron);

     let inlineBody: HTMLElement | null = null;
     const createStationInlineBody = () =>
      buildInlineDetails(person, presentation, stop.event, {
       modalTriggerKey: `journey-${key}`,
       onOpenModal: trigger => openModal(person.id, stop.event.id, trigger),
       onCollapse: () => {
        syncStationExpanded(false);
        btn.focus({ preventScroll: true });
       }
      });

     const syncStationExpanded = (nextOpen: boolean) => {
      station.dataset.expanded = String(nextOpen);
      stationCard.dataset.expanded = String(nextOpen);
      btn.setAttribute('aria-expanded', String(nextOpen));
      if (nextOpen) {
       expandedCards.add(key);
       if (!inlineBody) {
        inlineBody = createStationInlineBody();
        stationCard.append(inlineBody);
       }
      } else {
       expandedCards.delete(key);
       if (inlineBody) {
        inlineBody.remove();
        inlineBody = null;
       }
      }
      syncCollapseAllControls();
     };

     btn.addEventListener('click', () => {
      syncStationExpanded(!expandedCards.has(key));
     });

     stationCard.append(btn);
     if (isExpanded) {
      inlineBody = createStationInlineBody();
      stationCard.append(inlineBody);
     }
     station.append(stationCard);
    } else {
     const empty = el('span', 'tt-no-record');
     empty.setAttribute('aria-label', '未记录分享');
     station.append(empty);
    }
    track.append(station);
   }

   row.append(nameCol, track);
   journeyCard.append(row);
  }
 }

 journeys.append(
  journeyCard,
  el('p', 'tt-timeline-note', '首次记录指首次出现在这四期纪要中；连线仅连接有记录场次，不推断未记录场次的出席情况。点任意卡片可就地展开多场对比阅读。')
 );
 section.append(journeys);
 return section;
}

// ── Table View Rendering ──
function renderTableView(visiblePeople: Person[]): HTMLElement {
 const section = el('section', 'tt-table-section');
 section.setAttribute('aria-label', '分享者与四场活动完整对照表');

 const tableBar = el('div', 'tt-table-bar');
 tableBar.append(el('span', undefined, '点击任意分享标题就地展开摘要、简介与资料链接，并可打开完整详情弹窗'));
 const collapseAllBtn = el('button', 'tt-collapse-all-btn', `全部收起 (${expandedCards.size})`);
 collapseAllBtn.type = 'button';
 collapseAllBtn.dataset.collapseAll = 'true';
 collapseAllBtn.hidden = expandedCards.size === 0;
 collapseAllBtn.addEventListener('click', collapseAllInline);
 tableBar.append(collapseAllBtn);
 section.append(tableBar);

 const card = el('div', 'tt-table-card');
 card.setAttribute('role', 'region');
 card.setAttribute('aria-label', '分享者与四场活动完整对照表');

 const table = el('table', 'tt-matrix');
 table.append(el('caption', 'tt-sr-only', '每人一行，每期一列。场次仅统计现场纪要中的分享记录；空白不代表缺席。'));

 const colgroup = el('colgroup');
 colgroup.append(el('col', 'tt-col-person'));
 for (let i = 0; i < stops.length; i++) colgroup.append(el('col'));
 table.append(colgroup);

 const thead = el('thead');
 const headRow = el('tr');
 const personTh = el('th', 'tt-person-th');
 personTh.scope = 'col';
 personTh.append(el('span', undefined, '分享者'), el('small', undefined, '姓名 ↗ 主页 · 档案'));
 headRow.append(personTh);

 for (const stop of stops) {
  const th = el('th');
  th.scope = 'col';
  th.dataset.event = stop.event.id;
  th.dataset.selected = String(filters.eventId === stop.event.id);
  th.style.setProperty('--event-color', stop.color);

  const top = el('div', 'tt-event-th-top');
  const time = el('time', undefined, formatShortDate(stop.event.date));
  time.dateTime = stop.event.date;
  top.append(el('span', undefined, `#${stop.event.id}`), time);

  const meta = el('div', 'tt-event-th-meta');
  meta.append(el('span', undefined, `${stop.event.presenterCount} 位分享者`));
  const sourceHref = safeUrl(stop.event.source);
  if (sourceHref) {
   const a = el('a', undefined, '纪要 ↗');
   a.href = sourceHref;
   a.target = '_blank';
   a.rel = 'noopener noreferrer';
   a.setAttribute('aria-label', `第 ${stop.event.id} 期原始纪要`);
   meta.append(a);
  }
  th.append(top, meta);
  headRow.append(th);
 }
 thead.append(headRow);
 table.append(thead);

 const tbody = el('tbody');
 for (const person of visiblePeople) {
  const tr = el('tr');
  tr.dataset.person = person.id;

  const personCell = el('th', 'tt-person-cell');
  personCell.scope = 'row';
  const cellHead = el('div', 'tt-person-cell-head');
  cellHead.append(makeBadge(appearanceCount(person)), makeProfileNode(person, `table-${person.id}`));

  const attendance = el('div', 'tt-attendance');
  const count = appearanceCount(person);
  attendance.setAttribute('aria-label', `${person.name}，${count} 场有记录的分享`);
  const strong = el('strong');
  strong.append(document.createTextNode(String(count)), el('span', undefined, ` / ${stops.length}`));
  const pips = el('span', 'tt-pips');
  pips.setAttribute('aria-hidden', 'true');
  for (const stop of stops) {
   const pip = el('i');
   pip.style.setProperty('--pip-color', stop.color);
   pip.dataset.present = String(Boolean(appearanceForEvent(person, stop.event.id)));
   pips.append(pip);
  }
  attendance.append(strong, pips, makeProfileTriggerBtn(person, '档案', `table-${person.id}`));
  personCell.append(cellHead, attendance);
  tr.append(personCell);

  for (const stop of stops) {
   const td = el('td');
   td.dataset.event = stop.event.id;
   td.dataset.date = formatShortDate(stop.event.date);
   td.dataset.selected = String(filters.eventId === stop.event.id);
   td.style.setProperty('--event-color', stop.color);

   const presentation = appearanceForEvent(person, stop.event.id);
   if (presentation) {
    const key = cardKey(person.id, stop.event.id);
    const isExpanded = expandedCards.has(key);
    td.dataset.expanded = String(isExpanded);

    const wrap = el('div', 'tt-table-cell-wrap');
    wrap.dataset.expanded = String(isExpanded);

    const btn = el('button', 'tt-talk-cell-btn');
    btn.type = 'button';
    btn.dataset.presentation = key;
    btn.setAttribute('aria-expanded', String(isExpanded));
    btn.setAttribute('aria-label', `${person.name} · 第 ${stop.event.id} 期 · ${presentation.title}，展开或收起详情`);
    const expand = el('span', 'tt-talk-expand', isExpanded ? '−' : '＋');
    expand.setAttribute('aria-hidden', 'true');
    btn.append(el('span', undefined, presentation.title), expand);

    let inlineBody: HTMLElement | null = null;
    const createTableInlineBody = () =>
     buildInlineDetails(person, presentation, stop.event, {
      modalTriggerKey: `table-${key}`,
      onOpenModal: trigger => openModal(person.id, stop.event.id, trigger),
      onCollapse: () => {
       syncTableExpanded(false);
       btn.focus({ preventScroll: true });
      }
     });

    const syncTableExpanded = (nextOpen: boolean) => {
     td.dataset.expanded = String(nextOpen);
     wrap.dataset.expanded = String(nextOpen);
     btn.setAttribute('aria-expanded', String(nextOpen));
     expand.textContent = nextOpen ? '−' : '＋';
     if (nextOpen) {
      expandedCards.add(key);
      if (!inlineBody) {
       inlineBody = createTableInlineBody();
       wrap.append(inlineBody);
      }
     } else {
      expandedCards.delete(key);
      if (inlineBody) {
       inlineBody.remove();
       inlineBody = null;
      }
     }
     syncCollapseAllControls();
    };

    btn.addEventListener('click', () => {
     syncTableExpanded(!expandedCards.has(key));
    });

    wrap.append(btn);
    if (isExpanded) {
     inlineBody = createTableInlineBody();
     wrap.append(inlineBody);
    }
    td.append(wrap);
   } else {
    const empty = el('span', 'tt-empty-cell', '—');
    empty.setAttribute('aria-label', '未记录分享');
    td.append(empty);
   }
   tr.append(td);
  }
  tbody.append(tr);
 }
 table.append(tbody);
 card.append(table);

 if (visiblePeople.length === 0) {
  card.append(buildEmptyState());
 }
 section.append(card);
 return section;
}

function buildEmptyState(): HTMLElement {
 const empty = el('div', 'tt-empty-state');
 const trimmed = filters.query.trim();
 const canRunJev = searchMode === 'jev' && Boolean(trimmed) && !activeSemanticSet() && !semanticLoading;

 let headingText = '没有找到匹配的分享';
 let bodyText = '换个人名、项目或话题，或清除当前筛选条件。';
 if (semanticLoading) {
  headingText = '正在使用 Jev 语义搜索…';
  bodyText = `正在理解“${trimmed}”并检索全部 ${people.length} 位分享者。`;
 } else if (semanticError) {
  bodyText = 'Jev 语义搜索暂时不可用，当前仅显示本地关键词匹配结果。';
 } else if (canRunJev) {
  headingText = '本地关键词暂无匹配';
  bodyText = `按 Enter 或点击下方按钮，用 Jev 语义搜索“${trimmed}”。`;
 } else if (activeSemanticSet()) {
  bodyText = `Jev 语义搜索未找到与“${trimmed}”匹配的分享，可换个表达或切回本地匹配。`;
 }

 empty.append(el('h3', undefined, headingText), el('p', undefined, bodyText));

 const actions = el('div', 'tt-empty-actions');
 if (canRunJev || (semanticError && searchMode === 'jev' && trimmed)) {
  const jevAction = el('button', 'tt-empty-primary', semanticError ? '重试 Jev 语义搜索 ↵' : '用 Jev 语义搜索 ↵');
  jevAction.type = 'button';
  jevAction.addEventListener('click', () => triggerSemanticSearch());
  actions.append(jevAction);
 }
 const resetBtn = el('button', undefined, '显示全部分享者');
 resetBtn.type = 'button';
 resetBtn.addEventListener('click', resetFilters);
 actions.append(resetBtn);
 empty.append(actions);
 return empty;
}

// ── State Sync & Rendering ──
function activeSemanticSet(): ReadonlySet<string> | undefined {
 const normalized = filters.query.trim().normalize('NFKC').toLowerCase();
 if (!normalized || !semanticMatches || semanticMatches.query !== normalized) return undefined;
 return semanticMatches.ids;
}

function syncJevButton(semanticActive: boolean) {
 const trimmed = filters.query.trim();
 const show = searchMode === 'jev' && Boolean(trimmed);
 jevBtn.hidden = !show;
 searchInput.placeholder = searchMode === 'jev'
  ? '搜索人名、项目或话题… 按 Enter 启用 Jev 语义'
  : '搜索人名、项目或话题…';
 if (!show) return;

 jevBtn.disabled = semanticLoading;
 jevBtn.replaceChildren();
 if (semanticLoading) {
  jevBtn.dataset.state = 'loading';
  jevBtn.append(document.createTextNode('Jev 搜索中…'));
  jevBtn.setAttribute('aria-label', '正在使用 Jev 语义搜索');
 } else if (semanticActive) {
  jevBtn.dataset.state = 'active';
  jevBtn.append(document.createTextNode('✓ Jev'));
  jevBtn.title = '已使用 Jev 语义搜索（点击重新搜索）';
  jevBtn.setAttribute('aria-label', '已使用 Jev 语义搜索，点击重新搜索');
 } else {
  jevBtn.dataset.state = 'ready';
  jevBtn.append(document.createTextNode('Jev '), el('kbd', undefined, '↵'));
  jevBtn.title = '按 Enter 使用 Jev 语义搜索';
  jevBtn.setAttribute('aria-label', '按 Enter 使用 Jev 语义搜索');
 }
}

function renderContent() {
 timelineTabBtn.setAttribute('aria-pressed', String(view === 'timeline'));
 tableTabBtn.setAttribute('aria-pressed', String(view === 'table'));
 for (const [id, btn] of eventFilterButtons) {
  btn.setAttribute('aria-pressed', String(filters.eventId === id));
 }
 repeatInput.checked = filters.repeatsOnly;
 repeatLabel.dataset.checked = String(filters.repeatsOnly);
 sortSelect.value = filters.sort;
 clearBtn.hidden = !filters.query;
 shortcutKbd.hidden = Boolean(filters.query);
 searchLabel.dataset.loading = String(semanticLoading);

 const semanticSet = activeSemanticSet();
 const semanticActive = Boolean(semanticSet);
 syncJevButton(semanticActive);

 const visiblePeople = filterAndSortPeople(people, filters, semanticSet);

 resultsStatus.replaceChildren();
 resultsStatus.append(
  el('strong', undefined, String(visiblePeople.length)),
  document.createTextNode(' 位分享者')
 );
 if (semanticActive) {
  resultsStatus.append(el('span', 'tt-semantic-tag', 'JEV 语义'));
  const localBtn = el('button', 'tt-local-fallback-btn', '切回本地');
  localBtn.type = 'button';
  localBtn.addEventListener('click', () => {
   semanticMatches = null;
   resetRolodexToIdle();
   renderContent();
  });
  resultsStatus.append(localBtn);
 }
 if (semanticError && filters.query.trim()) {
  const errSpan = el('span', 'tt-semantic-error');
  const retryBtn = el('button', 'tt-retry-btn', '重试');
  retryBtn.type = 'button';
  retryBtn.addEventListener('click', () => triggerSemanticSearch());
  errSpan.append(document.createTextNode('Jev 暂不可用 · '), retryBtn);
  resultsStatus.append(errSpan);
 }
 if (hasActiveFilters(filters)) {
  const resetBtn = el('button', 'tt-reset-btn', '重置');
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', resetFilters);
  resultsStatus.append(resetBtn);
 }

 const emptyReason = visiblePeople.length === 0
  ? `${searchMode}:${semanticLoading ? 'load' : semanticError ? 'err' : semanticActive ? 'jev0' : 'loc0'}:${filters.query.trim()}`
  : 'nonempty';
 const signature = [
  view,
  filters.eventId,
  filters.sort,
  emptyReason,
  visiblePeople.map(p => p.id).join(',')
 ].join('|');

 if (signature === lastRenderedSignature) return;
 lastRenderedSignature = signature;

 const focusedInContent = contentRegion.contains(document.activeElement)
  ? stableFocusSelector(document.activeElement)
  : null;

 activePersonId = null;
 const rendered = view === 'timeline' ? renderTimelineView(visiblePeople) : renderTableView(visiblePeople);
 contentRegion.replaceChildren(rendered);

 if (focusedInContent) {
  contentRegion.querySelector<HTMLElement>(focusedInContent)?.focus({ preventScroll: true });
 }
}

function cancelSemanticSearch() {
 searchController?.abort();
 searchVersion++;
 semanticLoading = false;
 semanticError = false;
 searchLabel.dataset.loading = 'false';
 resetRolodexToIdle();
}

async function runSemanticSearch(query: string, version: number) {
 const normalized = query.trim().normalize('NFKC').toLowerCase();
 searchController = new AbortController();
 semanticLoading = true;
 semanticError = false;
 startRolodexSpin();
 renderContent();
 try {
  const response = await fetch('/api/people-search', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ query }),
   signal: searchController.signal
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const parsed = parseSearchResponse(await response.json(), personIds, people.length);
  if (version !== searchVersion) return;
  if (parsed.mode === 'jev') {
   searchMode = 'jev';
   modePill.dataset.mode = 'jev';
   modePill.textContent = 'JEV · ENTER';
   semanticMatches = { query: normalized, ids: new Set(parsed.matches.map(m => m.id)) };
   const topMatch = parsed.matches
    .map(match => personById.get(match.id))
    .find((person): person is Person => Boolean(person)) ?? null;
   settleRolodexOnResult(topMatch, parsed.matches.length);
  } else {
   resetRolodexToIdle();
  }
 } catch (error) {
  if (version !== searchVersion || (error instanceof Error && error.name === 'AbortError')) return;
  semanticError = true;
  resetRolodexToIdle();
 } finally {
  if (version === searchVersion) {
   semanticLoading = false;
   renderContent();
  }
 }
}

function updateLocalQuery() {
 cancelSemanticSearch();
 semanticMatches = null;
 filters = { ...filters, query: searchInput.value };
 renderContent();
}

function triggerSemanticSearch() {
 const trimmed = searchInput.value.trim();
 if (!trimmed || composing || searchMode !== 'jev') return;
 cancelSemanticSearch();
 filters = { ...filters, query: searchInput.value };
 const version = searchVersion;
 void runSemanticSearch(trimmed, version);
}

function resetFilters() {
 cancelSemanticSearch();
 semanticMatches = null;
 filters = { ...DEFAULT_FILTER_STATE };
 searchInput.value = '';
 renderContent();
}

// ── Event Listeners ──
timelineTabBtn.addEventListener('click', () => {
 if (view === 'timeline') return;
 view = 'timeline';
 renderContent();
});

tableTabBtn.addEventListener('click', () => {
 if (view === 'table') return;
 view = 'table';
 renderContent();
});

searchInput.addEventListener('input', () => updateLocalQuery());
searchInput.addEventListener('compositionstart', () => {
 composing = true;
 cancelSemanticSearch();
});
searchInput.addEventListener('compositionend', () => {
 composing = false;
 updateLocalQuery();
});
searchInput.addEventListener('keydown', event => {
 if (event.key === 'Enter' && !composing && !event.isComposing && event.keyCode !== 229) {
  event.preventDefault();
  triggerSemanticSearch();
 }
});

jevBtn.addEventListener('click', () => triggerSemanticSearch());

clearBtn.addEventListener('click', () => {
 searchInput.value = '';
 updateLocalQuery();
 searchInput.focus({ preventScroll: true });
});

repeatInput.addEventListener('change', () => {
 filters = { ...filters, repeatsOnly: repeatInput.checked };
 renderContent();
});

sortSelect.addEventListener('change', () => {
 filters = { ...filters, sort: sortSelect.value as SortMode };
 renderContent();
});

const onDocumentKeydown = (event: KeyboardEvent) => {
 if (modal.open) {
  if (event.key === 'Escape' && !composing && !event.isComposing) {
   event.preventDefault();
   closeModal();
  }
  return;
 }
 const target = event.target as HTMLElement | null;
 const editing = Boolean(target?.matches('input, textarea, select, [contenteditable]'));
 if (event.key === '/' && !editing) {
  event.preventDefault();
  searchInput.focus();
 } else if (event.key === 'Escape' && !composing && !event.isComposing) {
  if (document.activeElement === searchInput && filters.query) {
   searchInput.value = '';
   updateLocalQuery();
   searchInput.blur();
  } else if (expandedCards.size > 0 || selectedStopPerson.size > 0) {
   collapseAllInline();
  } else if (filters.query) {
   searchInput.value = '';
   updateLocalQuery();
  }
 }
};
document.addEventListener('keydown', onDocumentKeydown);

// Initial render
renderContent();

// Detect Jev semantic mode without blocking initial render
fetch('/api/status')
 .then(response => (response.ok ? response.json() : null))
 .then(data => {
  if (data && data.mode === 'jev') {
   searchMode = 'jev';
   modePill.dataset.mode = 'jev';
   modePill.textContent = 'JEV · ENTER';
   renderContent();
  }
 })
 .catch(() => {
  // Keep local search mode quietly.
 });

if (import.meta.hot) {
 import.meta.hot.dispose(() => {
  cancelSemanticSearch();
  clearRolodexTimers();
  clearRolodexLeaves();
  closeModal();
  document.removeEventListener('keydown', onDocumentKeydown);
 });
}
