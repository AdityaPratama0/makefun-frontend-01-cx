// The shell. It parses the hash, paints a skeleton, then imports only the modules the
// current route needs, so a first paint fetches this file and the current route's code,
// never the other routes' code. Every specifier is a literal path inside app/.

const view = document.getElementById('view');
const navLinks = Array.from(document.querySelectorAll('.nav a'));
const ROUTES = new Set(['boards', 'bounties', 'bounty', 'leaderboard', 'profile', 'activity']);

let routeToken = 0;
let currentRoute = null;

function setShotReady(value) {
  window.__shotReady = value;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function skeleton(label, rows) {
  const row = '<div class="sk-row" aria-hidden="true"><div class="sk-line sk-line--short"></div><div class="sk-line sk-line--mid"></div><div class="sk-line"></div></div>';
  const body = Array.from({ length: rows || 6 }, () => row).join('');
  return '<div class="skeleton" role="status" aria-live="polite" aria-label="' + esc(label) + '">' + body + '</div>';
}

function shellError(message) {
  return [
    '<div class="state" role="alert">',
    '<h2>make.fun did not answer cleanly</h2>',
    '<p>' + esc(message ?? 'Unknown error.') + '</p>',
    '<div class="actions">',
    '<button class="btn" type="button" data-action="retry">Try again</button>',
    '<a class="btn btn--quiet" href="#/">Back to boards</a>',
    '</div>',
    '</div>'
  ].join('');
}

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const path = raw.split('?')[0];
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'boards' };
  if (parts[0] === 'bounties') return { name: 'bounties' };
  if (parts[0] === 'activity') return { name: 'activity' };
  if (parts[0] === 'profile') {
    return { name: 'profile', handle: parts[1] ? decodeURIComponent(parts[1]) : null };
  }
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
      : routeName === 'activity' ? '#/activity'
        : routeName === 'profile' ? '#/profile/'
          : routeName === 'leaderboard' || routeName === 'bounty' ? '#/leaderboard'
            : null;
  for (const link of navLinks) {
    if (link.getAttribute('href') === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function routeLabel(route) {
  return ROUTES.has(route.name) ? route.name : 'notfound';
}

async function showBoardIndex(token, kind) {
  view.innerHTML = skeleton(kind === 'bounties' ? 'Loading every bounty in the feed' : 'Loading live boards');
  const [api, render] = await Promise.all([import('./api.js'), import('./render.js')]);
  const items = await (kind === 'bounties' ? api.loadAllCompetitions() : api.loadCompetitions());
  if (token !== routeToken) return;

  if (kind === 'bounties') {
    view.innerHTML = render.renderBountyTable(items);
    return;
  }

  const open = [];
  const closed = [];
  for (const item of items) {
    if (render.boardStatus(item) === 'open') open.push(item);
    else closed.push(item);
  }
  open.sort((a, b) => {
    const ax = a.endsAt ? Date.parse(a.endsAt) : Number.POSITIVE_INFINITY;
    const bx = b.endsAt ? Date.parse(b.endsAt) : Number.POSITIVE_INFINITY;
    return ax - bx;
  });

  view.innerHTML = render.renderBoardList(open, {
    closed,
    title: 'Open boards',
    eyebrow: 'make.fun live index',
    lede: 'Live pot or reward, entry fee, entries and time left, straight from the public API.'
  });
}

async function showBounty(token, slug) {
  view.innerHTML = skeleton('Loading board', 5);
  const [api, render] = await Promise.all([import('./api.js'), import('./render.js')]);
  if (token !== routeToken) return;

  let item = null;
  let board = null;
  try {
    board = await api.loadLeaderboard(slug);
    item = board.competition;
  } catch {
    board = null;
  }
  if (token !== routeToken) return;
  if (!item) {
    item = await api.loadCompetition(slug);
    if (token !== routeToken) return;
  }

  const preview = board && board.rows.length
    ? render.renderLeaderboardPreview(board.rows, { slug, scoreTitle: board.scoreTitle, micro: board.micro })
    : '';
  view.innerHTML = render.renderBountyDetail(item, { preview });
}

async function showLeaderboard(token, slug) {
  view.innerHTML = skeleton('Loading leaderboard', 8);
  const [api, render] = await Promise.all([import('./api.js'), import('./render.js')]);
  if (token !== routeToken) return;

  if (!slug) {
    const items = await api.loadCompetitions();
    if (token !== routeToken) return;
    const first = items.find((entry) => entry.slug && render.boardStatus(entry) === 'open')
      ?? items.find((entry) => entry.slug);
    if (!first) {
      view.innerHTML = render.renderEmptyState('Pick a board first: the API returned no boards to point a leaderboard at.');
      return;
    }
    location.replace('#/leaderboard/' + encodeURIComponent(first.slug));
    return;
  }

  const board = await api.loadLeaderboard(slug);
  if (token !== routeToken) return;

  const name = board.competition && board.competition.title ? board.competition.title : slug;
  if (!board.rows.length) {
    view.innerHTML = render.renderLeaderboard([], {
      title: 'Leaderboard: ' + name,
      slug,
      competition: board.competition,
      scoreTitle: board.scoreTitle
    }) + render.renderEmptyState('The leaderboard came back empty: no rows published for this board yet.');
    return;
  }
  view.innerHTML = render.renderLeaderboard(board.rows, {
    title: 'Leaderboard: ' + name,
    slug,
    competition: board.competition,
    scoreTitle: board.scoreTitle,
    micro: board.micro
  });
}

async function showProfile(token, handle) {
  view.innerHTML = skeleton(handle ? 'Loading profile' : 'Profile lookup', 4);
  const profile = await import('./profile.js');
  if (token !== routeToken) return;
  if (!handle) {
    view.innerHTML = profile.renderProfileLookup();
    return;
  }
  const api = await import('./api.js');
  try {
    const record = await api.loadProfile(handle);
    if (token !== routeToken) return;
    view.innerHTML = profile.renderProfile(record);
  } catch (error) {
    if (token !== routeToken) return;
    if (error && error.status === 404) {
      view.innerHTML = profile.renderProfileMissing(handle);
      return;
    }
    throw error;
  }
}

async function showActivity(token) {
  view.innerHTML = skeleton('Loading activity', 8);
  const [api, activity] = await Promise.all([import('./api.js'), import('./activity.js')]);
  const events = await api.loadActivity();
  if (token !== routeToken) return;
  view.innerHTML = activity.renderActivity(events);
}

async function route() {
  const token = ++routeToken;
  const parsed = parseHash();
  currentRoute = parsed;
  setShotReady(false);
  document.body.dataset.route = routeLabel(parsed);
  markNav(parsed.name);

  if (parsed.name === 'notfound') {
    const render = await import('./render.js');
    if (token !== routeToken) return;
    view.innerHTML = render.renderNotFound();
    setShotReady(true);
    return;
  }

  try {
    if (parsed.name === 'boards') await showBoardIndex(token, 'boards');
    else if (parsed.name === 'bounties') await showBoardIndex(token, 'bounties');
    else if (parsed.name === 'bounty') await showBounty(token, parsed.slug);
    else if (parsed.name === 'leaderboard') await showLeaderboard(token, parsed.slug);
    else if (parsed.name === 'profile') await showProfile(token, parsed.handle);
    else if (parsed.name === 'activity') await showActivity(token);
    if (token !== routeToken) return;
    setShotReady(true);
  } catch (error) {
    if (token !== routeToken) return;
    view.innerHTML = shellError(error && error.message ? error.message : 'Unknown error.');
    setShotReady(true);
  }
}

function retry() {
  route();
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="retry"]')) {
    retry();
    return;
  }
  const skip = event.target.closest('.skip');
  if (skip) {
    event.preventDefault();
    view.focus();
  }
});

// The lookup form carries a handle; keep it inside the hash route rather than a page load.
view.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action="profile-lookup"]');
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('input[name="handle"]');
  const handle = input && input.value ? input.value.trim().replace(/^@/, '') : '';
  if (!handle) return;
  location.hash = '#/profile/' + encodeURIComponent(handle);
});

window.addEventListener('hashchange', () => {
  if (location.hash && location.hash.charAt(1) !== '/') return;
  route();
});

function start() {
  if (!location.hash) history.replaceState(null, '', '#/');
  route();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
