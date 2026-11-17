export const NOT_PUBLISHED = 'not published';
export const ENTRIES_NOT_PUBLISHED = 'entries not published';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatUsd(value) {
  if (!isNumber(value)) return NOT_PUBLISHED;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2
  }).format(value);
}

export function formatTimeLeft(endsAt, now = Date.now()) {
  if (typeof endsAt !== 'string' || !endsAt) return NOT_PUBLISHED;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return NOT_PUBLISHED;
  const diff = end - now;
  if (diff <= 0) return 'closed';

  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return 'under a minute left';
}

export function formatDate(value) {
  if (typeof value !== 'string' || !value) return NOT_PUBLISHED;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NOT_PUBLISHED;
  const body = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  }).format(date);
  return `${body}, ${time} UTC`;
}

export function formatCount(value) {
  if (!isNumber(value)) return NOT_PUBLISHED;
  return new Intl.NumberFormat('en-US').format(value);
}

// An entry count has its own words for "the API did not send one", because a blank
// under an Entries label reads like zero and zero is a different claim.
export function formatEntries(value) {
  if (!isNumber(value)) return ENTRIES_NOT_PUBLISHED;
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatFee(item) {
  if (!isNumber(item.entryFeeUsd)) {
    return item.entryFeeKnown ? 'none' : NOT_PUBLISHED;
  }
  return formatUsd(item.entryFeeUsd);
}

export function formatRate(score, micro) {
  if (!isNumber(score)) return NOT_PUBLISHED;
  if (micro) return `${(score * 100).toFixed(2)}%`;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(score);
}

export function formatInterval(row, micro) {
  if (!isNumber(row.intervalLow) || !isNumber(row.intervalHigh)) return '';
  const low = micro ? `${(row.intervalLow * 100).toFixed(2)}%` : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row.intervalLow);
  const high = micro ? `${(row.intervalHigh * 100).toFixed(2)}%` : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row.intervalHigh);
  const level = isNumber(row.intervalLevel) ? Math.round(row.intervalLevel * 100) : null;
  const tag = level !== null ? `${level}% interval: ` : 'interval: ';
  return `${tag}${low} to ${high}`;
}

function figure(label, value, extraClass = '') {
  const cls = extraClass ? `figure ${extraClass}` : 'figure';
  return `<div class="${cls}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function safeHref(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `https://make.fun${trimmed}`;
  return null;
}

export function boardHref(slug) {
  return slug ? `#/bounty/${encodeURIComponent(slug)}` : null;
}

const CLOSED_STATUSES = new Set([
  'closed', 'ended', 'resolved', 'settled', 'finished', 'complete', 'completed',
  'archived', 'cancelled', 'canceled', 'judging', 'finalized', 'finalised'
]);

// The badge has to say what the board is, not what its category list was filtered on.
// A deadline in the past is a closed board even when the API still calls its status open.
export function boardStatus(item) {
  if (!item || typeof item !== 'object') return 'unknown';
  const raw = typeof item.status === 'string' ? item.status.trim().toLowerCase() : '';
  const end = typeof item.endsAt === 'string' ? Date.parse(item.endsAt) : NaN;
  if (Number.isFinite(end) && end <= Date.now()) return 'closed';
  if (item.accepting === false) return 'closed';
  if (raw === 'open') return 'open';
  if (raw && CLOSED_STATUSES.has(raw)) return 'closed';
  if (raw) return raw;
  return 'unknown';
}

export function statusLabel(status, item) {
  if (status === 'open') return 'OPEN';
  if (status === 'closed') return 'CLOSED';
  if (status === 'unknown') return 'STATUS NOT PUBLISHED';
  const raw = typeof status === 'string' && status
    ? status
    : item && typeof item.status === 'string' ? item.status : '';
  return raw ? raw.replace(/[^a-z0-9 _-]/gi, '').slice(0, 24).toUpperCase() : 'STATUS NOT PUBLISHED';
}

export function statusClass(status) {
  if (status === 'open') return 'pill--open';
  if (status === 'closed') return 'pill--closed';
  return 'pill--unknown';
}

function officialHref(item) {
  const direct = safeHref(item.url);
  if (direct) return direct;
  if (!item.slug) return null;
  return `https://make.fun/bounty/${encodeURIComponent(item.slug)}`;
}

function pageHead(eyebrow, title, lede) {
  return [
    '<div class="page-head">',
    `<p class="eyebrow">${escapeHtml(eyebrow)}</p>`,
    `<h1>${escapeHtml(title)}</h1>`,
    lede ? `<p class="lede">${escapeHtml(lede)}</p>` : '',
    '</div>'
  ].join('');
}

function statusPill(item) {
  const status = boardStatus(item);
  return `<span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status, item))}</span>`;
}

function rewardHead(item, status) {
  if (isNumber(item.potUsd)) {
    return { label: status === 'open' ? 'Live pot' : 'Pot', value: item.potUsd };
  }
  return { label: 'Reward', value: item.rewardUsd };
}

function card(item) {
  const href = boardHref(item.slug);
  const status = boardStatus(item);
  const titleText = item.title ?? NOT_PUBLISHED;
  const title = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(titleText)}</a>`
    : `<span>${escapeHtml(titleText)}</span>`;
  const head = rewardHead(item, status);
  const time = formatTimeLeft(item.endsAt);

  return [
    `<li class="board-card${status === 'open' ? '' : ' board-card--closed'}">`,
    '<div class="board-card__top">',
    item.category ? `<span class="pill pill--cat">${escapeHtml(item.category)}</span>` : `<span class="pill pill--cat">category ${NOT_PUBLISHED}</span>`,
    statusPill(item),
    '</div>',
    `<h2 class="board-card__title">${title}</h2>`,
    '<p class="board-card__reward">',
    `<span class="board-card__reward-label">${escapeHtml(head.label)}</span>`,
    `<span class="board-card__reward-value">${escapeHtml(formatUsd(head.value))}</span>`,
    '</p>',
    '<dl class="board-card__meta">',
    figure('Entry fee', formatFee(item)),
    figure('Entries', formatEntries(item.entries), 'figure--entries'),
    figure('Time left', time, time === 'closed' ? 'figure--closed' : ''),
    '</dl>',
    href ? `<a class="card-link" href="${escapeHtml(href)}">Open board</a>` : '',
    '</li>'
  ].join('');
}

function cardGrid(items, label) {
  return `<ul class="board-grid" aria-label="${escapeHtml(label)}">${items.map(card).join('')}</ul>`;
}

export function renderBoardList(items, options = {}) {
  const title = options.title ?? 'Live boards';
  const eyebrow = options.eyebrow ?? 'make.fun live index';
  const lede = options.lede ?? 'Reward or live pot, entry fee, entries and time left exactly as the public API reports them.';
  const list = Array.isArray(items) ? items : [];
  const closed = Array.isArray(options.closed) ? options.closed : [];

  const liveNote = list.length ? `${list.length} open` : 'none open';
  const closedBlock = closed.length
    ? [
      '<section class="board-section" aria-labelledby="closed-title">',
      '<div class="section-head">',
      '<h2 id="closed-title">Deadline passed</h2>',
      `<p class="section-note">${closed.length} still listed by the API with an open status. The badge reads the deadline.</p>`,
      '</div>',
      cardGrid(closed, 'Boards whose deadline has passed'),
      '</section>'
    ].join('')
    : '';

  return [
    pageHead(eyebrow, title, lede),
    `<p class="section-note section-note--head">${liveNote}${closed.length ? `, ${closed.length} closed` : ''}. Sorted by what closes next.</p>`,
    list.length ? cardGrid(list, title) : renderEmptyState('The API returned no open boards. That is what it said, so that is what this page says.'),
    closedBlock
  ].join('');
}

export function renderBountyTable(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return renderEmptyState('The API returned no boards.');
  const rows = list.map((item) => {
    const href = boardHref(item.slug);
    const status = boardStatus(item);
    const titleText = item.title ?? NOT_PUBLISHED;
    const title = href ? `<a href="${escapeHtml(href)}">${escapeHtml(titleText)}</a>` : escapeHtml(titleText);
    const head = rewardHead(item, status);
    return [
      '<tr>',
      `<td class="cell-title">${title}<span class="cell-sub mono">${escapeHtml(item.slug ?? NOT_PUBLISHED)}</span></td>`,
      `<td><span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status, item))}</span></td>`,
      `<td class="num">${escapeHtml(formatUsd(head.value))}</td>`,
      `<td class="num">${escapeHtml(formatFee(item))}</td>`,
      `<td class="num">${escapeHtml(formatEntries(item.entries))}</td>`,
      `<td class="num">${escapeHtml(formatTimeLeft(item.endsAt))}</td>`,
      '</tr>'
    ].join('');
  }).join('');

  return [
    pageHead('make.fun bounties', 'All bounties in the feed', 'Every board the public feed returns, open or closed, with its pot, fee, entries and time left.'),
    '<div class="table-wrap">',
    '<table class="lb lb--boards">',
    '<caption>Live and closed boards</caption>',
    '<thead><tr>',
    '<th scope="col">Board</th>',
    '<th scope="col">Status</th>',
    '<th scope="col">Pot</th>',
    '<th scope="col">Fee</th>',
    '<th scope="col">Entries</th>',
    '<th scope="col">Time left</th>',
    '</tr></thead>',
    `<tbody>${rows}</tbody>`,
    '</table>',
    '</div>',
    '<p class="detail__note">A card shows what the API sends. Where it sends no entry count, the table says entries not published.</p>'
  ].join('');
}

function rewardsTable(rewards) {
  const list = Array.isArray(rewards) ? rewards : [];
  if (!list.length) return '';
  const rows = list.slice(0, 10).map((row) => [
    '<tr>',
    `<td class="rank">${escapeHtml(String(row.place))}</td>`,
    `<td class="num prize">${escapeHtml(formatUsd(row.amount))}</td>`,
    '</tr>'
  ].join('')).join('');
  return [
    '<div class="table-wrap">',
    '<table class="lb">',
    '<caption>Prizes by place, live pot included</caption>',
    '<thead><tr><th scope="col">Place</th><th scope="col">Pays</th></tr></thead>',
    `<tbody>${rows}</tbody>`,
    '</table>',
    '</div>',
    list.length > 10 ? `<p class="detail__note">Showing the first 10 of ${escapeHtml(String(list.length))} paid places.</p>` : ''
  ].join('');
}

function prose(text, maxParagraphs = 6) {
  if (typeof text !== 'string' || !text.trim()) return '';
  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s*/gm, '').replace(/\*\*?/g, '').trim())
    .filter(Boolean)
    .slice(0, maxParagraphs)
    .map((part) => `<p>${escapeHtml(part.replace(/\n/g, ' '))}</p>`)
    .join('');
}

export function renderBountyDetail(item, options = {}) {
  if (!item) return renderEmptyState('That board did not come back from make.fun.');

  const href = officialHref(item);
  const title = item.title ?? NOT_PUBLISHED;
  const status = boardStatus(item);
  const time = formatTimeLeft(item.endsAt);
  const leaderboardHref = item.slug ? `#/leaderboard/${encodeURIComponent(item.slug)}` : null;
  const about = prose(item.description || item.summary || '', 2);
  const rules = prose(item.rules || '', 6);

  const facts = [
    figure('Reward', formatUsd(item.rewardUsd), 'figure--reward'),
    figure('Live pot', formatUsd(item.potUsd)),
    figure('Entry fee', formatFee(item)),
    figure('Entries', formatEntries(item.entries), 'figure--entries'),
    figure('Opens', formatDate(item.startsAt)),
    figure('Closes', formatDate(item.endsAt)),
    figure('Time left', time, time === 'closed' ? 'figure--closed' : '')
  ].join('');

  return [
    '<p class="crumb"><a href="#/">All boards</a> / ' + escapeHtml(item.slug ?? 'board') + '</p>',
    '<div class="detail">',
    '<div class="detail__head">',
    `<p class="eyebrow">${escapeHtml(item.category ?? `category ${NOT_PUBLISHED}`)}</p>`,
    `<h1 class="detail__title">${escapeHtml(title)}</h1>`,
    '<p class="detail__statusline">',
    `<span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status, item))}</span>`,
    `<span class="detail__closes">Closes ${escapeHtml(formatDate(item.endsAt))}</span>`,
    `<span class="detail__left">${escapeHtml(time)}</span>`,
    '</p>',
    item.summary ? `<p class="lede">${escapeHtml(item.summary)}</p>` : '',
    '</div>',
    `<dl class="detail__facts">${facts}</dl>`,
    about ? `<div class="prose prose--lead">${about}</div>` : '',
    rules
      ? `<details class="board-about"><summary>Rules</summary><div class="prose">${rules}</div></details>`
      : '',
    rewardsTable(item.rewards),
    '<div class="actions">',
    href ? `<a class="btn" href="${escapeHtml(href)}" rel="noopener">Official page</a>` : '',
    leaderboardHref ? `<a class="btn btn--quiet" href="${escapeHtml(leaderboardHref)}">Leaderboard</a>` : '',
    '<a class="btn btn--quiet" href="#/bounties">Back to the list</a>',
    '</div>',
    '<p class="detail__note">Every figure above is copied from the make.fun public API. A value shown as not published means the API did not send it: nothing is guessed.</p>',
    '</div>',
    options.preview ?? ''
  ].join('');
}

function leaderboardTable(rows, caption, scoreTitle, micro) {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.map((row, index) => {
    const rank = isNumber(row.rank) ? row.rank : index + 1;
    const interval = formatInterval(row, micro);
    const handle = row.handle
      ? `<a class="handle" href="#/profile/${encodeURIComponent(row.handle)}">${escapeHtml(row.handle)}</a>`
      : `<span class="muted">${escapeHtml(NOT_PUBLISHED)}</span>`;
    return [
      '<tr>',
      `<td class="rank">${escapeHtml(String(rank))}</td>`,
      `<td>${handle}</td>`,
      `<td class="num">${escapeHtml(formatRate(row.score, micro))}`,
      interval ? `<span class="interval">${escapeHtml(interval)}</span>` : '',
      '</td>',
      `<td class="num prize">${escapeHtml(formatUsd(row.prize))}</td>`,
      '</tr>'
    ].join('');
  }).join('');

  return [
    '<div class="table-wrap">',
    '<table class="lb">',
    `<caption>${escapeHtml(caption)}</caption>`,
    '<thead><tr>',
    '<th scope="col">Rank</th>',
    '<th scope="col">Handle</th>',
    `<th scope="col">${escapeHtml(scoreTitle || 'Score / rate')}</th>`,
    '<th scope="col">Prize</th>',
    '</tr></thead>',
    `<tbody>${body}</tbody>`,
    '</table>',
    '</div>'
  ].join('');
}

export function renderLeaderboard(rows, options = {}) {
  const title = options.title ?? 'Leaderboard';
  const slug = options.slug ?? null;
  const scoreTitle = options.scoreTitle ?? 'Score / rate';
  const micro = Boolean(options.micro);
  const competition = options.competition ?? null;
  const list = Array.isArray(rows) ? rows : [];
  const status = competition ? boardStatus(competition) : null;

  const head = competition
    ? [
      '<div class="detail__head">',
      `<p class="eyebrow">${escapeHtml(competition.category ?? 'make.fun standings')}</p>`,
      `<h1 class="detail__title">${escapeHtml(title)}</h1>`,
      '<p class="detail__statusline">',
      status ? `<span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status, competition))}</span>` : '',
      competition.endsAt ? `<span class="detail__closes">Closes ${escapeHtml(formatDate(competition.endsAt))}</span>` : '',
      competition.endsAt ? `<span class="detail__left">${escapeHtml(formatTimeLeft(competition.endsAt))}</span>` : '',
      '</p>',
      '</div>'
    ].join('')
    : pageHead('make.fun standings', title, slug ? `Top rows for ${slug}, first page only.` : 'Top rows, first page only.');

  return [
    head,
    leaderboardTable(list, slug ? `Leaderboard: ${slug}` : 'Leaderboard', scoreTitle, micro),
    '<p class="detail__note">Rank and rate come from the API, the interval with them. A prize is the amount the board publishes for that place, and not published where it publishes none. Each handle links to its public profile.</p>'
  ].join('');
}

export function renderLeaderboardPreview(rows, options = {}) {
  const slug = options.slug ?? null;
  const scoreTitle = options.scoreTitle ?? 'Score / rate';
  const micro = Boolean(options.micro);
  const list = Array.isArray(rows) ? rows.slice(0, 5) : [];
  if (!list.length) return '';
  return [
    '<div class="detail detail--preview">',
    '<div class="section-head">',
    '<h2>Top rows</h2>',
    `<p class="section-note"><a href="#/leaderboard/${encodeURIComponent(slug ?? '')}">Full leaderboard</a></p>`,
    '</div>',
    leaderboardTable(list, slug ? `Leaderboard preview: ${slug}` : 'Leaderboard preview', scoreTitle, micro),
    '</div>'
  ].join('');
}

export function renderEmptyState(message) {
  return [
    '<div class="empty" role="status">',
    `<p>${escapeHtml(message ?? 'Nothing to show here.')}</p>`,
    '<div class="actions">',
    '<a class="btn btn--quiet" href="#/">Back to boards</a>',
    '</div>',
    '</div>'
  ].join('');
}

export function renderNotFound() {
  return renderEmptyState('No route matches that hash. This guide knows #/, #/bounties, #/bounty/<slug>, #/leaderboard, #/leaderboard/<slug>, #/profile/<handle> and #/activity.');
}
