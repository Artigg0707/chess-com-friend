const { getDb, withDbWrite } = require('./db');

const LICHESS_GAMES_MAX = 200;
const DEFAULT_SINCE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MIN_SYNC_INTERVAL_MS = 30 * 1000;

let syncPromise = null;

function nowMs() {
  return Date.now();
}

function normalizeDbDuels(db) {
  if (!db.duels || typeof db.duels !== 'object') {
    db.duels = {
      updatedAt: null,
      lastSync: {}, // lichessUsername(lower) -> sinceMs
      pairs: {}, // key 'a|b' where a<b, values { a, b, aWins, bWins, draws, games, lastGameAt }
    };
  }
  if (!db.duels.lastSync || typeof db.duels.lastSync !== 'object') db.duels.lastSync = {};
  if (!db.duels.pairs || typeof db.duels.pairs !== 'object') db.duels.pairs = {};
  return db;
}

function getLinkedUsers(db) {
  return (db.users || [])
    .map((u) => ({ site: u.username, lichess: u.lichess?.username || null }))
    .filter((u) => u.lichess);
}

function buildLichessToSiteMap(linked) {
  const m = new Map();
  for (const u of linked) {
    m.set(String(u.lichess).toLowerCase(), u.site);
  }
  return m;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function ensurePair(db, a, b) {
  const key = pairKey(a, b);
  if (!db.duels.pairs[key]) {
    const [p, q] = a < b ? [a, b] : [b, a];
    db.duels.pairs[key] = {
      a: p,
      b: q,
      aWins: 0,
      bWins: 0,
      draws: 0,
      games: 0,
      lastGameAt: null,
    };
  }
  return db.duels.pairs[key];
}

async function fetchLichessGamesNdjson(lichessUsername, sinceMs) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(lichessUsername)}?max=${LICHESS_GAMES_MAX}&since=${sinceMs}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/x-ndjson',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Lichess games fetch failed (${res.status})`);
    err.status = res.status;
    err.details = text.slice(0, 200);
    throw err;
  }
  const text = await res.text();
  const lines = text.split('\n');
  const games = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      games.push(JSON.parse(trimmed));
    } catch {
      // ignore bad line
    }
  }
  return games;
}

function extractPlayers(game) {
  const w = game?.players?.white?.user?.name;
  const b = game?.players?.black?.user?.name;
  if (!w || !b) return null;
  return { white: w, black: b };
}

function gameCreatedAtMs(game) {
  const t = game?.createdAt;
  if (typeof t === 'number') return t;
  const parsed = Date.parse(t);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyGameToDuels(db, lichessToSite, game) {
  const players = extractPlayers(game);
  if (!players) return;

  const wSite = lichessToSite.get(players.white.toLowerCase());
  const bSite = lichessToSite.get(players.black.toLowerCase());
  if (!wSite || !bSite) return;
  if (wSite === bSite) return;

  const createdAt = gameCreatedAtMs(game);

  const pair = ensurePair(db, wSite, bSite);
  pair.games += 1;
  if (createdAt) {
    if (!pair.lastGameAt || createdAt > pair.lastGameAt) pair.lastGameAt = createdAt;
  }

  const winner = game?.winner;
  if (winner === 'white') {
    if (pair.a === wSite) pair.aWins += 1;
    else pair.bWins += 1;
    return;
  }
  if (winner === 'black') {
    if (pair.a === bSite) pair.aWins += 1;
    else pair.bWins += 1;
    return;
  }
  pair.draws += 1;
}

function computeMatrixView(db) {
  const users = (db.users || []).map((u) => ({
    username: u.username,
    lichessUsername: u.lichess?.username || null,
  }));

  const names = users.map((u) => u.username);
  const cells = {};
  for (const r of names) {
    cells[r] = {};
    for (const c of names) {
      if (r === c) {
        cells[r][c] = null;
      } else {
        cells[r][c] = { w: 0, l: 0, d: 0, games: 0, lastGameAt: null };
      }
    }
  }

  for (const pair of Object.values(db.duels?.pairs || {})) {
    const { a, b, aWins, bWins, draws, games, lastGameAt } = pair;
    if (!cells[a] || !cells[b]) continue;
    // a vs b
    if (cells[a][b]) {
      cells[a][b] = { w: aWins, l: bWins, d: draws, games, lastGameAt };
    }
    // b vs a
    if (cells[b][a]) {
      cells[b][a] = { w: bWins, l: aWins, d: draws, games, lastGameAt };
    }
  }

  return {
    updatedAt: db.duels?.updatedAt || null,
    users,
    names,
    cells,
  };
}

async function syncDuelsInternal() {
  const db0 = await getDb();
  normalizeDbDuels(db0);

  const linked = getLinkedUsers(db0);
  if (linked.length === 0) {
    await withDbWrite(async (db) => {
      normalizeDbDuels(db);
      db.duels.updatedAt = new Date().toISOString();
      return db;
    });
    return;
  }

  const lichessToSite = buildLichessToSiteMap(linked);

  await withDbWrite(async (db) => {
    normalizeDbDuels(db);

    const linked2 = getLinkedUsers(db);
    const lichessToSite2 = buildLichessToSiteMap(linked2);

    const lastSync = db.duels.lastSync || {};

    for (const u of linked2) {
      const key = String(u.lichess).toLowerCase();
      const sinceMs = Number.isFinite(lastSync[key])
        ? lastSync[key]
        : nowMs() - DEFAULT_SINCE_MS;

      let games;
      try {
        games = await fetchLichessGamesNdjson(u.lichess, sinceMs);
      } catch (e) {
        // Skip on transient errors; do not advance since
        continue;
      }

      let maxCreatedAt = sinceMs;
      for (const g of games) {
        const createdAt = gameCreatedAtMs(g);
        if (createdAt && createdAt > maxCreatedAt) maxCreatedAt = createdAt;
        applyGameToDuels(db, lichessToSite2, g);
      }

      // Advance cursor slightly to avoid refetching the same boundary
      lastSync[key] = maxCreatedAt + 1;
    }

    db.duels.lastSync = lastSync;
    db.duels.updatedAt = new Date().toISOString();
    return db;
  });
}

async function syncDuelsIfNeeded({ force = false } = {}) {
  if (syncPromise) return syncPromise;

  const db = await getDb();
  normalizeDbDuels(db);

  const updatedAt = db.duels.updatedAt ? Date.parse(db.duels.updatedAt) : 0;
  const stale = !updatedAt || nowMs() - updatedAt > MIN_SYNC_INTERVAL_MS;
  if (!force && !stale) return;

  syncPromise = (async () => {
    try {
      await syncDuelsInternal();
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

async function getDuelsMatrix({ sync = true } = {}) {
  if (sync) {
    await syncDuelsIfNeeded();
  }
  const db = await getDb();
  normalizeDbDuels(db);
  return computeMatrixView(db);
}

module.exports = {
  normalizeDbDuels,
  syncDuelsIfNeeded,
  getDuelsMatrix,
};
