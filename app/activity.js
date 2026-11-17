// Activity route: the newest public events make.fun exposes, read from the competitions feed.
// Two event kinds are visible without an account of your own: a board opening and a board closing.

import {
  escapeHtml,
  formatDate,
  boardStatus,
  statusLabel,
  statusClass,
  boardHref,
  NOT_PUBLISHED
} from './render.js';

function kindWords(kind) {
  if (kind === 'opened') return 'Opened';
  if (kind === 'result') return 'Result out';
  return 'Closed';
}

function activityRow(event) {
  const href = boardHref(event.slug);
  const titleText = event.title ?? NOT_PUBLISHED;
  const title = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(titleText)}</a>`
    : `<span>${escapeHtml(titleText)}</span>`;
  const status = boardStatus(event.item);

  return [
    '<li class="activity-row">',
    `<time class="activity-row__date" datetime="${escapeHtml(event.at)}">${escapeHtml(formatDate(event.at))}</time>`,
    '<div class="activity-row__body">',
    `<p class="activity-row__kind"><span class="kind kind--${escapeHtml(event.kind)}">${escapeHtml(kindWords(event.kind))}</span> <span class="mono">${escapeHtml(event.slug ?? NOT_PUBLISHED)}</span></p>`,
    `<h3 class="activity-row__title">${title}</h3>`,
    '</div>',
    `<span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status, event.item))}</span>`,
    '</li>'
  ].join('');
}

export function renderActivity(events) {
  const list = Array.isArray(events) ? events : [];
  const body = list.length
    ? `<ol class="activity-list">${list.map(activityRow).join('')}</ol>`
    : '<p class="empty-inline">The competitions feed returned no dated events. Nothing is invented to fill the page.</p>';

  return [
    '<div class="page-head">',
    '<p class="eyebrow">make.fun public activity</p>',
    '<h1>Activity</h1>',
    '<p class="lede">Newest first: boards that opened and boards that closed, from the public competitions feed.</p>',
    '</div>',
    `<p class="section-note">${list.length} event${list.length === 1 ? '' : 's'} from the last 40 competitions.</p>`,
    body,
    '<p class="detail__note">Dates are the publication and deadline times the API sends, shown in UTC. Each row links to the board it belongs to. A result is only claimed when the API says results are out.</p>'
  ].join('');
}
