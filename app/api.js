const API_ORIGIN = 'https://make.fun';
const TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 120000;
// A body past this many characters stays in memory only: localStorage holds strings at
// roughly two bytes each and the competitions feed can run to a megabyte.
const MAX_STORED_CHARS = 900000;
const CACHE_PREFIX = 'makefun.cache.v1:';

// Per-URL body + validator, in memory for this tab and in localStorage across loads.
// A stored body inside the TTL answers without a request; past it, the ETag goes back
// as If-None-Match and a 304 reuses the body instead of re-downloading it.
const memory = new Map();

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored(path) {
  const hit = memory.get(path);
  if (hit && typeof hit.at === 'number') return hit;
  const store = storage();
  if (!store) return null;
  let parsed;
  try {
    parsed = JSON.parse(store.getItem(CACHE_PREFIX + path) || 'null');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !('body' in parsed)) return null;
  return {
    etag: typeof parsed.etag === 'string' && parsed.etag ? parsed.etag : null,
    body: parsed.body,
    at: typeof parsed.at === 'number' ? parsed.at : 0
  };
}

function writeStored(path, record) {
  memory.set(path, record);
  const store = storage();
  if (!store) return;
  let serialised;
  try {
    serialised = JSON.stringify(record);
  } catch {
    return;
  }
  if (serialised.length > MAX_STORED_CHARS) return;
  try {
    store.setItem(CACHE_PREFIX + path, serialised);
  } catch {
    // Quota or a private-mode store that refuses writes: memory alone still works.
  }
}

function dropped(path) {
  memory.delete(path);
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(CACHE_PREFIX + path);
  } catch {
    // nothing to clean
  }
}

function numberFrom(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    return numberFrom(value.amount ?? value.usd ?? value.value ?? value.total);
  }
  return null;
}

function textFrom(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object') {
    return textFrom(value.name ?? value.label ?? value.title ?? value.slug);
  }
  return null;
}

function firstOf(raw, keys) {
  for (const key of keys) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return null;
}

function firstNumber(raw, keys) {
  for (const key of keys) {
    const n = numberFrom(raw[key]);
    if (n !== null) return n;
  }
  return null;
}

// A number that may legitimately be null: the difference matters for entry fees, where null means
// "this board charges none" while an absent key means the API never said.
function numberField(raw, keys) {
  for (const key of keys) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value === null || value === undefined) return { known: true, value: null };
    const n = numberFrom(value);
    if (n !== null) return { known: true, value: n };
  }
  return { known: false, value: null };
}

function firstText(raw, keys) {
  for (const key of keys) {
    const t = textFrom(raw[key]);
    if (t !== null) return t;
  }
  return null;
}

function timestampFrom(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
    if (ms === null) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const LIST_KEYS = ['data', 'competitions', 'items', 'results', 'rows', 'leaderboard', 'entries', 'boards', 'bounties'];

function findArray(node, depth = 0) {
  if (Array.isArray(node)) return node;
  if (!node || typeof node !== 'object' || depth > 2) return null;
  for (const key of LIST_KEYS) {
    if (!(key in node)) continue;
    const found = findArray(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function looksLikeCompetition(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return typeof node.slug === 'string' && typeof node.title === 'string' && typeof node.rewardAmount !== 'undefined';
}

function findCompetition(node, depth = 0) {
  if (looksLikeCompetition(node)) return node;
  if (!node || typeof node !== 'object' || depth > 2) return null;
  const preferred = ['data', 'competition', 'result', 'item', 'board', 'bounty'];
  for (const key of preferred) {
    if (!(key in node)) continue;
    const found = findCompetition(node[key], depth + 1);
    if (found) return found;
  }
  for (const value of Object.values(node)) {
    const found = findCompetition(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function rewardsFrom(raw) {
  const list = Array.isArray(raw.rewardsNow) ? raw.rewardsNow : Array.isArray(raw.rewards) ? raw.rewards : [];
  const rows = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const place = numberFrom(entry.place ?? entry.rank ?? entry.position);
    const amount = numberFrom(entry.amountUsd ?? entry.amount_usd ?? entry.amount ?? entry.usd);
    if (place === null || amount === null) continue;
    rows.push({ place, amount });
  }
  rows.sort((a, b) => a.place - b.place);
  return rows;
}

function normaliseCompetition(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const prose = Boolean(options.prose);

  const categoryRaw = firstOf(raw, ['category', 'categoryName', 'category_name', 'track', 'type']);
  const category = typeof categoryRaw === 'object' && categoryRaw
    ? textFrom(categoryRaw.name ?? categoryRaw.label ?? categoryRaw.slug)
    : textFrom(categoryRaw);

  const statusRaw = firstText(raw, ['status', 'state', 'phase']);
  const fee = numberField(raw, ['entryFeeUsd', 'entry_fee_usd', 'entryFee', 'entry_fee', 'feeUsd', 'fee_usd']);
  const acceptingRaw = raw.acceptingSubmissions ?? raw.accepting;
  const accepting = typeof acceptingRaw === 'boolean' ? acceptingRaw : null;

  return {
    slug: firstText(raw, ['slug', 'id', 'key']),
    title: firstText(raw, ['title', 'name', 'headline']),
    category,
    summary: firstText(raw, ['summary', 'description_short']),
    rewardUsd: firstNumber(raw, ['rewardAmount', 'reward_amount', 'rewardUsd', 'reward_usd', 'reward', 'prizeUsd', 'prize_usd', 'prize']),
    potUsd: firstNumber(raw, ['potUsd', 'pot_usd', 'livePotUsd', 'live_pot_usd', 'livePot', 'live_pot', 'pot', 'totalPotUsd', 'total_pot_usd']),
    entryFeeUsd: fee.value,
    entryFeeKnown: fee.known,
    endsAt: timestampFrom(firstOf(raw, ['deadline', 'endsAt', 'ends_at', 'closeAt', 'closesAt', 'closeDate', 'close_date', 'endDate', 'end_date'])),
    startsAt: timestampFrom(firstOf(raw, ['opensAt', 'opens_at', 'startsAt', 'starts_at', 'openAt', 'startDate', 'start_date'])),
    publishedAt: timestampFrom(firstOf(raw, ['publishedAt', 'published_at', 'createdAt', 'created_at', 'postedAt'])),
    entries: firstNumber(raw, ['submissionCount', 'submission_count', 'entries', 'entriesCount', 'entries_count', 'entryCount', 'entry_count', 'participants', 'participantCount', 'participant_count', 'submissions']),
    status: statusRaw ? statusRaw.toLowerCase() : null,
    accepting,
    url: firstText(raw, ['url', 'href', 'officialUrl', 'official_url', 'link', 'permalink']),
    rewards: rewardsFrom(raw),
    resultsOut: raw.resultsOut === true,
    description: prose ? firstText(raw, ['description']) : null,
    rules: prose ? firstText(raw, ['rules']) : null,
    acceptingSubmissions: typeof raw.acceptingSubmissions === 'boolean' ? raw.acceptingSubmissions : null
  };
}

function columnMicro(column) {
  return Boolean(column && typeof column.source === 'string' && column.source.endsWith('_micro'));
}

function scalar(value, micro) {
  const n = numberFrom(value);
  if (n === null) return null;
  return micro ? n / 1e6 : n;
}

function prizeTable(rewards) {
  const table = new Map();
  for (const reward of Array.isArray(rewards) ? rewards : []) {
    if (!reward || typeof reward !== 'object') continue;
    table.set(reward.place, reward.amount);
  }
  return table;
}

function normaliseRow(raw, index, rankKey, micro, prizeByPlace) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const userRaw = raw.user ?? raw.creator ?? raw.entrant ?? null;
  const handle = firstText(raw, ['handle', 'username', 'userHandle', 'user_handle', 'displayName', 'display_name'])
    ?? (userRaw ? firstText(userRaw, ['handle', 'username', 'name', 'displayName', 'display_name']) : null);

  const rank = firstNumber(raw, ['rank', 'position', 'place']);

  let score = null;
  if (rankKey) {
    const display = raw.display && typeof raw.display === 'object' ? raw.display[rankKey] : null;
    const values = raw.values && typeof raw.values === 'object' ? raw.values[rankKey] : null;
    score = scalar(display !== null && display !== undefined ? display : values, micro);
  }

  const interval = raw.interval && typeof raw.interval === 'object' ? raw.interval : null;
  const intervalLow = interval ? scalar(interval.low, micro) : null;
  const intervalHigh = interval ? scalar(interval.high, micro) : null;
  const level = interval ? numberFrom(interval.level) : null;

  const prizeRank = firstNumber(raw, ['prize_rank', 'prizeRank']);
  const place = prizeRank !== null ? prizeRank : rank;
  const prize = prizeByPlace && place !== null && prizeByPlace.has(place) ? prizeByPlace.get(place) : null;

  return {
    rank,
    handle,
    score,
    intervalLow,
    intervalHigh,
    intervalLevel: level,
    prize,
    rowIndex: index
  };
}

async function request(path) {
  const url = `${API_ORIGIN}${path}`;
  const stored = readStored(path);
  if (stored && Date.now() - stored.at < CACHE_TTL_MS) return stored.body;

  const headers = { accept: 'application/json' };
  if (stored && stored.etag) headers['if-none-match'] = stored.etag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      headers,
      cache: 'no-cache',
      signal: controller.signal
    });
  } catch (cause) {
    clearTimeout(timer);
    // A browser revalidating across origins can see a 304 the CORS check refuses, which
    // reaches here as a network error. The stored body is still the last answer make.fun
    // gave, so it is better than an error screen while the ETag keeps trying.
    if (stored) return stored.body;
    if (cause && cause.name === 'AbortError') throw new Error('make.fun did not answer in time');
    throw new Error('could not reach make.fun');
  }
  clearTimeout(timer);

  if (response.status === 304) {
    if (stored) {
      writeStored(path, { etag: stored.etag, body: stored.body, at: Date.now() });
      return stored.body;
    }
    dropped(path);
    throw new Error('make.fun answered 304 with no stored copy');
  }

  if (!response.ok) {
    dropped(path);
    const error = new Error(`make.fun answered ${response.status}`);
    error.status = response.status;
    error.url = url;
    throw error;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('make.fun answered with something that is not JSON');
  }

  const etag = response.headers.get('etag');
  writeStored(path, { etag: etag || null, body, at: Date.now() });
  return body;
}

// The board view asks for the API's open set, then checks every deadline itself: the feed
// still calls a board open after its deadline, and the badge has to show CLOSED there.
export async function loadCompetitions() {
  const payload = await request('/api/competitions?status=open&limit=40');
  const list = findArray(payload) ?? [];
  return list
    .map((row) => normaliseCompetition(row))
    .filter((item) => item && (item.slug || item.title));
}

// The bounties table is the whole feed, closed boards included, because that page's job is
// to show status rather than to hide it.
export async function loadAllCompetitions() {
  const payload = await request('/api/competitions?limit=40');
  const list = findArray(payload) ?? [];
  return list
    .map((row) => normaliseCompetition(row))
    .filter((item) => item && (item.slug || item.title));
}

export async function loadCompetition(slug) {
  if (!slug) throw new Error('missing board slug');
  const payload = await request(`/api/competitions/${encodeURIComponent(slug)}`);
  const record = findCompetition(payload);
  if (!record) throw new Error('make.fun returned no board for this slug');
  return normaliseCompetition(record, { prose: true });
}

function normaliseProfileSolution(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const competition = raw.competition && typeof raw.competition === 'object' ? raw.competition : {};
  const slug = firstText(competition, ['slug', 'id', 'key']);
  const title = firstText(competition, ['title', 'name', 'headline']);
  if (!slug && !title) return null;
  const deadline = firstOf(competition, ['deadline', 'endsAt', 'ends_at', 'closeAt']);
  return {
    slug,
    title,
    status: (firstText(competition, ['status', 'state', 'phase']) || '').toLowerCase() || null,
    endsAt: timestampFrom(deadline),
    placement: firstNumber(raw, ['placement', 'rank', 'place']),
    prizeUsd: firstNumber(raw, ['prize_usd', 'prizeUsd']),
    at: timestampFrom(firstOf(raw, ['entered_at', 'enteredAt', 'createdAt', 'created_at']))
  };
}

export async function loadProfile(handle) {
  if (!handle) throw new Error('missing handle');
  const payload = await request(`/api/profiles/${encodeURIComponent(handle)}`);
  const raw = payload && typeof payload === 'object'
    ? (payload.profile && typeof payload.profile === 'object' ? payload.profile : payload)
    : null;
  if (!raw) throw new Error('make.fun returned no profile for this handle');

  const record = raw.record && typeof raw.record === 'object' ? raw.record : {};
  const solutions = Array.isArray(raw.solutions) ? raw.solutions : [];
  const entries = solutions.map(normaliseProfileSolution).filter(Boolean);

  return {
    handle: firstText(raw, ['handle', 'username', 'name']) || handle,
    displayName: firstText(raw, ['display_name', 'displayName']),
    joinedAt: timestampFrom(raw.joined_at ?? raw.joinedAt),
    entriesCount: firstNumber(record, ['competitions_entered', 'competitionsEntered', 'entries']),
    bestPlacement: firstNumber(record, ['best_placement', 'bestPlacement']),
    wins: firstNumber(record, ['competitions_won', 'competitionsWon']),
    prizeUsd: firstNumber(record, ['prize_usd', 'prizeUsd']),
    entries
  };
}

// The public feed states two things per competition: when it was published and when its
// deadline falls. Those are the two events this page can honestly show.
export async function loadActivity() {
  const payload = await request('/api/competitions?limit=40');
  const list = findArray(payload) ?? [];
  const items = list.map(normaliseCompetition).filter(Boolean);
  const now = Date.now();
  const events = [];

  for (const item of items) {
    // publishedAt is a scheduled opening for boards that have not started yet, so an event is
    // only activity once its date is behind us. A future date would claim something unopened.
    const opened = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (Number.isFinite(opened) && opened <= now) {
      events.push({ kind: 'opened', at: item.publishedAt, item, slug: item.slug, title: item.title });
    }
    const end = item.endsAt ? Date.parse(item.endsAt) : NaN;
    if (Number.isFinite(end) && end <= now) {
      const resolved = item.resultsOut
        || (typeof item.status === 'string' && /resolved|settled|ended|final|complete|closed/.test(item.status));
      events.push({
        kind: resolved ? 'result' : 'closed',
        at: item.endsAt,
        item,
        slug: item.slug,
        title: item.title
      });
    }
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return events.slice(0, 40);
}

export async function loadLeaderboard(slug) {
  if (!slug) throw new Error('missing board slug');
  const encoded = encodeURIComponent(slug);
  const [board, detail] = await Promise.all([
    request(`/api/competitions/${encoded}/leaderboard?rows=first&limit=25`),
    request(`/api/competitions/${encoded}`).catch(() => null)
  ]);

  const list = findArray(board) ?? [];
  const rankKey = board && typeof board === 'object' && typeof board.rank_key === 'string' ? board.rank_key : null;

  let scoreTitle = 'Score / rate';
  let micro = false;
  if (board && Array.isArray(board.columns)) {
    const column = board.columns.find((col) => col && col.key === rankKey);
    if (column && typeof column.title === 'string' && column.title.trim()) scoreTitle = column.title.trim();
    micro = columnMicro(column);
  }

  const detailRecord = findCompetition(detail);
  const tournament = normaliseCompetition(detailRecord, { prose: true });
  const prizeByPlace = prizeTable(tournament ? tournament.rewards : []);

  let intervalLevel = null;
  if (board && board.interval && typeof board.interval === 'object') {
    intervalLevel = numberFrom(board.interval.level);
  }

  return {
    competition: tournament,
    rankKey,
    scoreTitle,
    micro,
    intervalLevel,
    rows: list
      .map((row, index) => normaliseRow(row, index, rankKey, micro, prizeByPlace))
      .filter((row) => row && (row.handle !== null || row.score !== null || row.rank !== null))
  };
}
