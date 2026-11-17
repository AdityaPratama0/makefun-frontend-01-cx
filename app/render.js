const NOT_PUBLISHED = 'not published';

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
  const tag = level !== null ? `${level}% interval ` : 'interval ';
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

function boardHref(slug) {
  return slug ? `#/bounty/${encodeURIComponent(slug)}` : null;
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
  const words = [];
  if (item.status) words.push(item.status);
  if (item.accepting === false) words.push('entries closed');
  if (!words.length) return '';
  const open = item.status === 'open' && item.accepting !== false;
  return `<span class="${open ? 'pill pill--open' : 'pill'}">${escapeHtml(words.join(' · '))}</span>`;
}

function rewardHead(item) {
  if (isNumber(item.potUsd)) return { label: 'Live pot', value: item.potUsd };
  return { label: 'Reward', value: item.rewardUsd };
}

function card(item) {
  const href = boardHref(item.slug);
  const titleText = item.title ?? NOT_PUBLISHED;
  const title = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(titleText)}</a>`
    : `<span>${escapeHtml(titleText)}</span>`;
  const head = rewardHead(item);

  return [
    '<li class="board-card">',
    '<div class="board-card__top">',
    item.category ? `<span class="pill">${escapeHtml(item.category)}</span>` : `<span class="pill">category ${NOT_PUBLISHED}</span>`,
    statusPill(item),
    '</div>',
    `<h2 class="board-card__title">${title}</h2>`,
    '<dl class="board-card__figures">',
    figure(head.label, formatUsd(head.value), 'figure--reward'),
    figure('Entry fee', formatFee(item)),
    figure('Time left', formatTimeLeft(item.endsAt)),
    figure('Entries', formatCount(item.entries)),
    '</dl>',
    href ? `<a class="card-link" href="${escapeHtml(href)}">Open board</a>` : '',
    '</li>'
  ].join('');
}

export function renderBoardList(items, options = {}) {
  const title = options.title ?? 'Open boards';
  const eyebrow = options.eyebrow ?? 'make.fun live index';
  const lede = options.lede ?? 'Reward or live pot, entry fee, deadline and entry count exactly as the public API reports them.';
  const list = Array.isArray(items) ? items : [];

  return [
    pageHead(eyebrow, title, lede),
    `<ul class="board-grid" aria-label="${escapeHtml(title)}">`,
    list.map(card).join(''),
    '</ul>'
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

export function renderBountyDetail(item) {
  if (!item) return renderEmptyState('That board did not come back from make.fun.');

  const href = officialHref(item);
  const title = item.title ?? NOT_PUBLISHED;

  const facts = [
    figure('Reward', formatUsd(item.rewardUsd), 'figure--reward'),
    figure('Live pot', formatUsd(item.potUsd)),
    figure('Entry fee', formatFee(item)),
    figure('Opens', formatDate(item.startsAt)),
    figure('Closes', formatDate(item.endsAt)),
    figure('Time left', formatTimeLeft(item.endsAt)),
    figure('Entries', formatCount(item.entries))
  ].join('');

  return [
    '<p class="crumb"><a href="#/">All boards</a> / ' + escapeHtml(item.slug ?? 'board') + '</p>',
    '<div class="detail">',
    '<div class="detail__head">',
    `<p class="eyebrow">${escapeHtml(item.category ?? `category ${NOT_PUBLISHED}`)}</p>`,
    `<h1 class="detail__title">${escapeHtml(title)}</h1>`,
    `<p class="lede">Status: ${escapeHtml(item.status ?? NOT_PUBLISHED)}. Slug: <span class="mono">${escapeHtml(item.slug ?? NOT_PUBLISHED)}</span>.</p>`,
    '</div>',
    item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : '',
    `<dl class="detail__facts">${facts}</dl>`,
    rewardsTable(item.rewards),
    '<div class="actions">',
    href ? `<a class="btn" href="${escapeHtml(href)}" rel="noopener">Official page</a>` : '',
    '<a class="btn btn--quiet" href="#/bounties">Back to the list</a>',
    '</div>',
    '<p class="detail__note">Every figure above is copied from the make.fun public API. A value shown as not published means the API did not send it: nothing is guessed.</p>',
    '</div>'
  ].join('');
}

function leaderboardTable(rows, caption, scoreTitle, micro) {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.map((row, index) => {
    const rank = isNumber(row.rank) ? row.rank : index + 1;
    const interval = formatInterval(row, micro);
    return [
      '<tr>',
      `<td class="rank">${escapeHtml(String(rank))}</td>`,
      `<td><span class="handle">${escapeHtml(row.handle ?? NOT_PUBLISHED)}</span></td>`,
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
  const list = Array.isArray(rows) ? rows : [];

  return [
    pageHead('make.fun standings', title, slug ? `Top rows for ${slug}, first page only.` : 'Top rows, first page only.'),
    leaderboardTable(list, slug ? `Leaderboard: ${slug}` : 'Leaderboard', scoreTitle, micro),
    '<p class="detail__note">Rank and rate come from the API, the interval with them. A prize is the amount the board publishes for that place, and not published where it publishes none.</p>'
  ].join('');
}

export function renderLeaderboardPreview(rows, options = {}) {
  const slug = options.slug ?? null;
  const scoreTitle = options.scoreTitle ?? 'Score / rate';
  const micro = Boolean(options.micro);
  const list = Array.isArray(rows) ? rows.slice(0, 5) : [];
  if (!list.length) return '';
  return [
    '<div class="detail">',
    '<p class="eyebrow">Top rows</p>',
    leaderboardTable(list, slug ? `Leaderboard preview: ${slug}` : 'Leaderboard preview', scoreTitle, micro),
    `<p class="detail__note"><a href="#/leaderboard/${encodeURIComponent(slug ?? '')}">Full leaderboard</a></p>`,
    '</div>'
  ].join('');
}

export function renderSkeleton(kind = 'board') {
  const label = { board: 'Loading open boards', detail: 'Loading board', leaderboard: 'Loading leaderboard' }[kind] ?? 'Loading';
  const rows = kind === 'leaderboard' ? 8 : 6;
  const row = [
    '<div class="sk-row" aria-hidden="true">',
    '<div class="sk-line sk-line--short"></div>',
    '<div class="sk-line sk-line--mid"></div>',
    '<div class="sk-line"></div>',
    '</div>'
  ].join('');
  return [
    `<div class="skeleton" role="status" aria-live="polite" aria-label="${escapeHtml(label)}">`,
    Array.from({ length: rows }, () => row).join(''),
    '</div>'
  ].join('');
}

export function renderErrorState(message) {
  return [
    '<div class="state" role="alert">',
    '<h2>make.fun did not answer cleanly</h2>',
    `<p>${escapeHtml(message ?? 'Unknown error.')}</p>`,
    '<div class="actions">',
    '<button class="btn" type="button" data-action="retry">Try again</button>',
    '<a class="btn btn--quiet" href="#/">Back to boards</a>',
    '</div>',
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
  return renderEmptyState('No route matches that hash. This guide knows #/, #/bounties, #/bounty/<slug>, #/leaderboard and #/leaderboard/<slug>.');
}
