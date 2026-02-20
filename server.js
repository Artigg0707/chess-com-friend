const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// В продакшене (fly.io) данные хранятся на persistent volume /data
// Локально — рядом с проектом
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// --- CORS: разрешаем GitHub Pages и localhost ---
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        // ↓↓↓ ЗАМЕНИ на свой реальный домен GitHub Pages ↓↓↓
        'https://YOUR_GITHUB_USERNAME.github.io'
    ]
}));
app.use(express.json());

// Раздача статики только при локальной разработке
if (!process.env.FLY_APP_NAME) {
    app.use(express.static(__dirname));
}

// --- Хелперы для работы с файлом ---
function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const defaults = {
                friends: ['just_Cone', 'MaxMas', 'aledmap2', 'Jcoin'],
                ratings: {},
                chat: [],
                lastRecalc: null
            };
            fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
            return defaults;
        }
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        console.error('Ошибка чтения data.json:', e);
        return { friends: [], ratings: {}, chat: [], lastRecalc: null };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/* =========================================
   API: FRIENDS
   ========================================= */

// GET /api/friends — список друзей
app.get('/api/friends', (req, res) => {
    const data = readData();
    res.json(data.friends);
});

// POST /api/friends — добавить друга { "username": "NewPlayer" }
app.post('/api/friends', (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'username обязателен' });
    }

    const data = readData();
    const trimmed = username.trim();

    if (data.friends.some(f => f.toLowerCase() === trimmed.toLowerCase())) {
        return res.status(409).json({ error: 'Игрок уже в списке' });
    }

    data.friends.push(trimmed);

    // Инициализируем рейтинг нового игрока
    if (!data.ratings[trimmed]) {
        data.ratings[trimmed] = { rating: 100, trend: 'flat', diff: 0, games: 0, history: [] };
    }

    writeData(data);
    res.status(201).json({ friends: data.friends });
});

// DELETE /api/friends/:username — удалить друга
app.delete('/api/friends/:username', (req, res) => {
    const data = readData();
    const target = req.params.username.toLowerCase();
    const idx = data.friends.findIndex(f => f.toLowerCase() === target);

    if (idx === -1) {
        return res.status(404).json({ error: 'Игрок не найден' });
    }

    const removed = data.friends.splice(idx, 1)[0];
    delete data.ratings[removed];
    writeData(data);
    res.json({ friends: data.friends });
});

/* =========================================
   API: RATINGS (Internal ELO)
   ========================================= */

// GET /api/ratings — получить все рейтинги
app.get('/api/ratings', (req, res) => {
    const data = readData();
    res.json({
        ratings: data.ratings,
        lastRecalc: data.lastRecalc
    });
});

// POST /api/ratings — сохранить пересчитанные рейтинги
// Тело: { "ratings": { "Player1": {...}, "Player2": {...} } }
app.post('/api/ratings', (req, res) => {
    const { ratings } = req.body;
    if (!ratings || typeof ratings !== 'object') {
        return res.status(400).json({ error: 'ratings обязателен (объект)' });
    }

    const data = readData();
    data.ratings = ratings;
    data.lastRecalc = new Date().toISOString();
    writeData(data);
    res.json({ ok: true, lastRecalc: data.lastRecalc });
});

/* =========================================
   API: CHAT
   ========================================= */

// GET /api/chat — все сообщения
app.get('/api/chat', (req, res) => {
    const data = readData();
    res.json(data.chat);
});

// POST /api/chat — новое сообщение { "user": "Name", "text": "Hello" }
app.post('/api/chat', (req, res) => {
    const { user, text } = req.body;
    if (!user || !text) {
        return res.status(400).json({ error: 'user и text обязательны' });
    }

    const data = readData();
    const msg = {
        id: Date.now(),
        user: user.trim(),
        text: text.trim(),
        timestamp: Date.now()
    };
    data.chat.push(msg);

    // Лимит: храним последние 500 сообщений
    if (data.chat.length > 500) {
        data.chat = data.chat.slice(-500);
    }

    writeData(data);
    res.status(201).json(msg);
});

/* =========================================
   API: INFO
   ========================================= */

// GET /api/status — общее состояние (для отладки)
app.get('/api/status', (req, res) => {
    const data = readData();
    res.json({
        friends: data.friends.length,
        ratingsCount: Object.keys(data.ratings).length,
        chatMessages: data.chat.length,
        lastRecalc: data.lastRecalc
    });
});

/* =========================================
   ЗАПУСК
   ========================================= */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ♟  Chess Friends Server`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  Data: ${DATA_FILE}\n`);
});
