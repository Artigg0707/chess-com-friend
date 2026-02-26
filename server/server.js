const path = require('node:path');

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const { getDb, withDbWrite } = require('./db');
const { syncDuelsIfNeeded, getDuelsMatrix } = require('./duels');
const {
  normalizeUsername,
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
} = require('./auth');
const { getLichessAccountFromToken } = require('./lichess');

const app = express();

const isProd = process.env.NODE_ENV === 'production';

// Running behind a reverse proxy on platforms like Render.
// Needed so req.secure is derived from X-Forwarded-Proto.
if (isProd || process.env.RENDER_EXTERNAL_URL || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: false, // keep simple for static app
}));

app.use(express.json({ limit: '64kb' }));

app.use(
  session({
    name: 'cf.sid',
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd ? 'auto' : false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return next();
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    lichessUsername: user.lichess?.username || null,
    createdAt: user.createdAt,
  };
}

// --- HEALTH ---
app.get('/api/health', (req, res) => {
  return res.json({ ok: true, time: new Date().toISOString() });
});

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;

  if (!validateUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-24 chars: letters, digits, _' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be 8-72 chars' });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  try {
    const db = await withDbWrite(async (db0) => {
      const exists = db0.users.some((u) => u.username.toLowerCase() === username.toLowerCase());
      if (exists) {
        const err = new Error('Username already exists');
        err.status = 409;
        throw err;
      }
      const user = {
        id: crypto.randomUUID(),
        username,
        passwordHash,
        createdAt: now,
        lichess: null,
      };
      return {
        ...db0,
        users: [...db0.users, user],
      };
    });

    const created = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    req.session.userId = created.id;
    return res.json({ user: publicUser(created) });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;

  const db = await getDb();
  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const ok = await verifyPassword(password || '', user.passwordHash);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  return res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cf.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const db = await getDb();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user) return res.json({ user: null });
  return res.json({ user: publicUser(user) });
});

// --- USERS ---
app.get('/api/users', async (req, res) => {
  const db = await getDb();
  return res.json({ users: db.users.map(publicUser) });
});

// --- CHAT ---
app.get('/api/chat', async (req, res) => {
  const db = await getDb();
  const messages = Array.isArray(db.chat?.messages) ? db.chat.messages : [];
  return res.json({ messages: messages.slice(-100) });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Empty message' });
  }
  if (text.length > 280) {
    return res.status(400).json({ error: 'Message too long (max 280)' });
  }

  try {
    const now = new Date().toISOString();

    const db = await withDbWrite(async (db0) => {
      const me = db0.users.find((u) => u.id === req.session.userId);
      if (!me) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
      }

      const prev = Array.isArray(db0.chat?.messages) ? db0.chat.messages : [];
      const nextMsg = {
        id: crypto.randomUUID(),
        userId: me.id,
        username: me.username,
        text,
        createdAt: now,
      };

      const nextMessages = [...prev, nextMsg].slice(-200);
      return {
        ...db0,
        chat: {
          ...(db0.chat && typeof db0.chat === 'object' ? db0.chat : {}),
          messages: nextMessages,
        },
      };
    });

    const messages = Array.isArray(db.chat?.messages) ? db.chat.messages : [];
    return res.json({ ok: true, messages: messages.slice(-100) });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Server error' });
  }
});

// --- DUELS MATRIX ---
app.get('/api/duels', async (req, res) => {
  try {
    const force = String(req.query?.force || '') === '1';
    if (force) {
      await syncDuelsIfNeeded({ force: true });
    }
    const view = await getDuelsMatrix({ sync: true });
    return res.json(view);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

// --- LICHESS LINK ---
app.post('/api/me/link-lichess', requireAuth, async (req, res) => {
  const token = req.body?.token;

  try {
    const account = await getLichessAccountFromToken(token);

    const db = await withDbWrite(async (db0) => {
      const me = db0.users.find((u) => u.id === req.session.userId);
      if (!me) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
      }

      const alreadyUsed = db0.users.some(
        (u) => u.id !== me.id && (u.lichess?.username || '').toLowerCase() === account.username.toLowerCase()
      );
      if (alreadyUsed) {
        const err = new Error('This Lichess account is already linked');
        err.status = 409;
        throw err;
      }

      const nextUsers = db0.users.map((u) => {
        if (u.id !== me.id) return u;
        return {
          ...u,
          lichess: {
            username: account.username,
            linkedAt: new Date().toISOString(),
          },
        };
      });

      return { ...db0, users: nextUsers };
    });

    const updated = db.users.find((u) => u.id === req.session.userId);
    return res.json({ user: publicUser(updated) });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Server error' });
  }
});

// --- STATIC ---
const staticDir = path.join(__dirname, '..');
app.use(express.static(staticDir));

// SPA-ish fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log(`ChessFriends server running on http://localhost:${port}`);
});

// Periodic background sync (best-effort)
setInterval(() => {
  syncDuelsIfNeeded().catch(() => {});
}, 60 * 1000);
