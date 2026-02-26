const fs = require('node:fs/promises');
const path = require('node:path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

let cachedDb = null;
let writeQueue = Promise.resolve();

async function ensureDbFile() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

async function loadDb() {
  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const duels = parsed.duels && typeof parsed.duels === 'object'
    ? parsed.duels
    : { updatedAt: null, lastSync: {}, pairs: {} };
  return { ...parsed, users, duels };
}

async function getDb() {
  if (!cachedDb) {
    cachedDb = await loadDb();
  }
  return cachedDb;
}

async function saveDb(nextDb) {
  cachedDb = nextDb;
  const tmpPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(nextDb, null, 2), 'utf8');
  await fs.rename(tmpPath, DB_PATH);
}

function withDbWrite(fn) {
  writeQueue = writeQueue.then(async () => {
    const db = await getDb();
    const nextDb = await fn(db);
    await saveDb(nextDb);
    return nextDb;
  });
  return writeQueue;
}

module.exports = {
  getDb,
  withDbWrite,
};
