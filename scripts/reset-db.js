const fs = require('node:fs/promises');
const path = require('node:path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');

async function main() {
  const emptyDb = {
    users: [],
    stats: {
      internalRatings: {},
      internalRatingsUpdatedAt: null,
    },
    duels: {
      updatedAt: null,
      lastSync: {},
      pairs: {},
    },
    chat: {
      messages: [],
    },
  };

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(emptyDb, null, 2), 'utf8');
  console.log('DB reset:', dbPath);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
