import { loadCompetitions, loadCompetition, loadLeaderboard } from './api.js';
import {
  renderBoardList,
  renderBountyDetail,
  renderLeaderboard,
  renderLeaderboardPreview,
  renderSkeleton,
  renderErrorState,
  renderEmptyState,
  renderNotFound
} from './render.js';

const view = document.getElementById('view');
const navLinks = Array.from(document.querySelectorAll('.nav a'));

let routeToken = 0;
let currentRoute = null;

function setShotReady(value) {
  window.__shotReady = value;
}

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const path = raw.split('?')[0];
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'boards' };
  if (parts[0] === 'bounties') return { name: 'bounties' };
  if (parts[0] === 'leaderboard') {
    return { name: 'leaderboard', slug: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
  if (parts[0] === 'bounty' && parts[1]) {
    return { name: 'bounty', slug: decodeURIComponent(parts[1]) };
  }
  return { name: 'notfound' };
}

function markNav(routeName) {
  const active = routeName === 'boards' ? '#/'
    : routeName === 'bounties' ? '#/bounties'
      : routeName === 'leaderboard' || routeName === 'bounty' ? '#/leaderboard'
        : null;
  for (const link of navLinks) {
    if (link.getAttribute('href') === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function routeLabel(route) {
  if (route.name === 'boards') return 'boards';
  if (route.name === 'bounties') return 'bounties';
  if (route.name === 'bounty') return 'bounty';
  if (route.name === 'leaderboard') return 'leaderboard';
  return 'notfound';
}

async function showBoards(token) {
  view.innerHTML = renderSkeleton('board');
  const items = await loadCompetitions();
  if (token !== routeToken) return;
  if (!items.length) {
    view.innerHTML = renderEmptyState('The API returned no open boards. That is what it said, so that is what this page says.');
    return;
  }
  view.innerHTML = renderBoardList(items, {
    title: 'Open boards',
    eyebrow: `make.fun live index · ${items.length} open`,
    lede: 'Live pot or reward, entry fee, time left and entry count, straight from the public API.'
  });
}

async function showBounties(token) {
  view.innerHTML = renderSkeleton('board');
  const items = await loadCompetitions();
  if (token !== routeToken) return;
  if (!items.length) {
    view.innerHTML = renderEmptyState('No bounties are open right now according to make.fun.');
    return;
  }
  view.innerHTML = renderBoardList(items, {
    title: 'Bounties',
    eyebrow: 'make.fun bounties',
    lede: 'The same live index read as bounties: what it pays, what it costs to enter, when it closes.'
  });
}

async function showBounty(token, slug) {
  view.innerHTML = renderSkeleton('detail');
  let item = null;
  let board = null;
  try {
    board = await loadLeaderboard(slug);
    item = board.competition;
  } catch {
    item = await loadCompetition(slug);
  }
  if (token !== routeToken) return;
  if (!item) item = await loadCompetition(slug);
  if (token !== routeToken) return;

  const preview = board && board.rows.length
    ? renderLeaderboardPreview(board.rows, { slug, scoreTitle: board.scoreTitle, micro: board.micro })
    : '';
  view.innerHTML = renderBountyDetail(item) + preview;
}

async function showLeaderboard(token, slug) {
  view.innerHTML = renderSkeleton('leaderboard');
  if (!slug) {
    const items = await loadCompetitions();
    if (token !== routeToken) return;
    const first = items.find((entry) => entry.slug) ?? null;
    if (!first) {
      view.innerHTML = renderEmptyState('Pick a board first: the API returned no open boards to point a leaderboard at.');
      return;
    }
    location.replace(`#/leaderboard/${encodeURIComponent(first.slug)}`);
    return;
  }

  const board = await loadLeaderboard(slug);
  if (token !== routeToken) return;

  const name = board.competition && board.competition.title ? board.competition.title : slug;
  if (!board.rows.length) {
    view.innerHTML = renderLeaderboard([], { title: `Leaderboard: ${name}`, slug, scoreTitle: board.scoreTitle }) +
      renderEmptyState('The leaderboard came back empty: no rows published for this board yet.');
    return;
  }
  view.innerHTML = renderLeaderboard(board.rows, {
    title: `Leaderboard: ${name}`,
    slug,
    scoreTitle: board.scoreTitle,
    micro: board.micro
  });
}

async function route() {
  const token = ++routeToken;
  const parsed = parseHash();
  currentRoute = parsed;
  setShotReady(false);
  document.body.dataset.route = routeLabel(parsed);
  markNav(parsed.name);

  if (parsed.name === 'notfound') {
    view.innerHTML = renderNotFound();
    setShotReady(true);
    return;
  }

  try {
    if (parsed.name === 'boards') await showBoards(token);
    else if (parsed.name === 'bounties') await showBounties(token);
    else if (parsed.name === 'bounty') await showBounty(token, parsed.slug);
    else if (parsed.name === 'leaderboard') await showLeaderboard(token, parsed.slug);
    if (token !== routeToken) return;
    setShotReady(true);
  } catch (error) {
    if (token !== routeToken) return;
    view.innerHTML = renderErrorState(error && error.message ? error.message : 'Unknown error.');
    setShotReady(true);
  }
}

function retry() {
  const name = currentRoute ? currentRoute.name : 'boards';
  const slug = currentRoute && currentRoute.slug ? `/${encodeURIComponent(currentRoute.slug)}` : '';
  if (name === 'leaderboard' && slug) {
    location.hash = `#/leaderboard${slug}`;
    if (location.hash === `#/leaderboard${slug}`) route();
    return;
  }
  route();
}

view.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="retry"]');
  if (button) retry();
});

window.addEventListener('hashchange', route);

function start() {
  if (!location.hash) history.replaceState(null, '', '#/');
  route();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
