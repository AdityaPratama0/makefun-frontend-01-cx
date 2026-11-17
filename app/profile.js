// Profile route: one handle, its public record, and the boards it entered.
// Every field comes from the public API; a missing one says so in words.

import {
  escapeHtml,
  formatCount,
  formatDate,
  formatUsd,
  boardStatus,
  statusLabel,
  statusClass,
  boardHref,
  NOT_PUBLISHED
} from './render.js';

function initial(handle) {
  const text = typeof handle === 'string' ? handle.trim() : '';
  const match = text.match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : '?';
}

function profileStat(label, value) {
  return [
    '<div class="figure profile-stat">',
    `<dt>${escapeHtml(label)}</dt>`,
    `<dd>${escapeHtml(value)}</dd>`,
    '</div>'
  ].join('');
}

function entryRow(entry) {
  const href = boardHref(entry.slug);
  const titleText = entry.title ?? NOT_PUBLISHED;
  const title = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(titleText)}</a>`
    : `<span>${escapeHtml(titleText)}</span>`;
  const status = boardStatus(entry);
  const placement = Number.isFinite(entry.placement) ? `#${entry.placement}` : NOT_PUBLISHED;
  const meta = entry.at
    ? `entered <time datetime="${escapeHtml(entry.at)}">${escapeHtml(formatDate(entry.at))}</time>`
    : `entered ${NOT_PUBLISHED}`;

  return [
    '<li class="entry-row">',
    '<div class="entry-row__main">',
    `<h3 class="entry-row__title">${title}</h3>`,
    `<p class="entry-row__meta"><span class="mono">${escapeHtml(entry.slug ?? NOT_PUBLISHED)}</span> · ${meta}</p>`,
    '</div>',
    '<div class="entry-row__side">',
    `<span class="pill ${statusClass(status)}">${escapeHtml(statusLabel(status, entry))}</span>`,
    `<span class="entry-row__place" title="Placement">${escapeHtml(placement)}</span>`,
    '</div>',
    '</li>'
  ].join('');
}

export function renderProfileLookup() {
  return [
    '<div class="page-head">',
    '<p class="eyebrow">make.fun profile</p>',
    '<h1>Look up a handle</h1>',
    '<p class="lede">Type a make.fun handle to read its public record: entries, best placement and the boards it entered.</p>',
    '</div>',
    '<form class="lookup" data-action="profile-lookup" action="#/profile/" method="get">',
    '<div class="lookup__field">',
    '<label for="profile-handle">Handle</label>',
    '<input id="profile-handle" name="handle" type="text" autocomplete="off" spellcheck="false" placeholder="bounty-runner-72" required>',
    '</div>',
    '<button class="btn" type="submit">Open profile</button>',
    '</form>',
    '<p class="detail__note">A handle is the name on a leaderboard row. Example: <a href="#/profile/bounty-runner-72">bounty-runner-72</a>.</p>'
  ].join('');
}

// A handle the API does not know is a normal answer, not a crash: say so and offer the lookup.
export function renderProfileMissing(handle) {
  const shown = typeof handle === 'string' && handle.trim() ? handle.trim() : 'that handle';
  return [
    '<p class="crumb"><a href="#/">All boards</a> / profile</p>',
    '<div class="empty" role="status">',
    `<h2>No public profile for ${escapeHtml(shown)}</h2>`,
    '<p>make.fun answered 404 for this handle. Either it is spelled differently or the account has no public record.</p>',
    '<div class="actions">',
    '<a class="btn" href="#/profile/">Look up another handle</a>',
    '<a class="btn btn--quiet" href="#/leaderboard">Find handles on a leaderboard</a>',
    '</div>',
    '</div>'
  ].join('');
}

export function renderProfile(profile) {
  const handle = profile && profile.handle ? profile.handle : 'unknown handle';
  const entries = profile && Array.isArray(profile.entries) ? profile.entries : [];
  const entriesCount = profile && Number.isFinite(profile.entriesCount)
    ? formatCount(profile.entriesCount)
    : 'entries not published';
  const best = profile && Number.isFinite(profile.bestPlacement)
    ? `#${profile.bestPlacement}`
    : 'best placement not published';
  const wins = profile && Number.isFinite(profile.wins) ? formatCount(profile.wins) : NOT_PUBLISHED;
  const prize = profile && Number.isFinite(profile.prizeUsd) ? formatUsd(profile.prizeUsd) : NOT_PUBLISHED;

  const list = entries.length
    ? `<ul class="entry-list">${entries.map(entryRow).join('')}</ul>`
    : '<p class="empty-inline">No entries for this handle came back from the public API.</p>';

  return [
    '<p class="crumb"><a href="#/">All boards</a> / <a href="#/activity">Activity</a> / profile</p>',
    '<div class="profile-head">',
    `<span class="avatar" aria-hidden="true">${escapeHtml(initial(handle))}</span>`,
    '<div class="profile-head__text">',
    '<p class="eyebrow">make.fun profile</p>',
    `<h1 class="profile-handle">${escapeHtml(handle)}</h1>`,
    '<p class="lede">Public record as make.fun reports it. Nothing on this page is estimated.</p>',
    '</div>',
    '</div>',
    '<dl class="profile-stats">',
    profileStat('Entries', entriesCount),
    profileStat('Best placement', best),
    profileStat('Competitions won', wins),
    profileStat('Prize money', prize),
    '</dl>',
    '<section class="profile-entries" aria-labelledby="profile-entries-title">',
    '<div class="section-head">',
    '<h2 id="profile-entries-title">Entries</h2>',
    `<p class="section-note">${entries.length ? `${entries.length} published` : 'none published'}</p>`,
    '</div>',
    list,
    '</section>',
    `<p class="detail__note">Source: https://make.fun/api/profiles/${escapeHtml(encodeURIComponent(handle))} and the competitions API. A field shown as not published was absent.</p>`
  ].join('');
}
