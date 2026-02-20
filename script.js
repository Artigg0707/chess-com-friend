// ═══════════════════════════════════════════════════════════════════════════════
//  ⚙️  НАСТРОЙКА Firebase (чат работает только с настроенным Firebase)
//
//  1. Зайдите: https://console.firebase.google.com
//  2. Создайте проект → добавьте веб-приложение (</>)
//  3. Realtime Database → Создать базу данных → Тестовый режим
//  4. Скопируйте firebaseConfig и вставьте значения ниже
// ═══════════════════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
    apiKey:            "",
    authDomain:        "",
    databaseURL:       "",   // ← https://ВАШ_ПРОЕКТ-default-rtdb.XXX.firebasedatabase.app
    projectId:         "",
    storageBucket:     "",
    messagingSenderId: "",
    appId:             ""
};

// ТВОИ ДРУЗЬЯ (можно добавлять прямо здесь)
let friends = ['just_Cone', 'MaxMas', 'aledmap2', 'Jcoin'];

// Сохраняем список в localStorage, чтобы он не пропадал при перезагрузке
if (localStorage.getItem('chessboardFriends')) {
    friends = JSON.parse(localStorage.getItem('chessboardFriends'));
}

let playersData = [];
let currentSort = 'rapid';
let gamesLoaded  = false;  // флаг: история уже загружена?

// ═══════════════════════════════════════════════════════════════════════════════
// ВКЛАДКИ
// ═══════════════════════════════════════════════════════════════════════════════

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el  => el.classList.remove('active'));

    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Автозагрузка при первом открытии вкладки истории
    if (tabName === 'history' && !gamesLoaded) {
        loadGamesHistory();
    }
    // Чат
    if (tabName === 'chat') {
        if (!chatNickname) {
            showNicknameModal();
        } else if (!chatInitialized) {
            initChat();
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// РЕЙТИНГ
// ═══════════════════════════════════════════════════════════════════════════════

async function getPlayerData(username) {
    try {
        const response = await fetch(`https://lichess.org/api/user/${username}`);

        if (!response.ok) {
            throw new Error(`Игрок ${username} не найден`);
        }

        const data = await response.json();

        return {
            username: data.username,
            url:      `https://lichess.org/@/${data.username}`,
            online:   data.online || false,
            rapid:    data.perfs?.rapid?.rating  || 0,
            blitz:    data.perfs?.blitz?.rating  || 0,
            bullet:   data.perfs?.bullet?.rating || 0
        };
    } catch (error) {
        console.error(`Ошибка при загрузке данных для ${username}:`, error);
        return null;
    }
}

async function buildLeaderboard() {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '<tr><td colspan="5" class="loading">Загрузка данных...</td></tr>';

    const promises = friends.map(friend => getPlayerData(friend));
    playersData = await Promise.all(promises);
    playersData = playersData.filter(player => player !== null);

    sortPlayersByRating(currentSort);
    tableBody.innerHTML = '';

    playersData.forEach((player, index) => {
        const row = document.createElement('tr');

        let placeClass = '';
        let placeMedal = '';

        if      (index === 0) { placeClass = 'gold';   placeMedal = '🥇'; }
        else if (index === 1) { placeClass = 'silver'; placeMedal = '🥈'; }
        else if (index === 2) { placeClass = 'bronze'; placeMedal = '🥉'; }

        row.innerHTML = `
            <td><span class="place ${placeClass}">${placeMedal} #${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <span class="status-indicator ${player.online ? 'online' : 'offline'}"></span>
                    <a href="${player.url}" target="_blank" class="username">${player.username}</a>
                </div>
            </td>
            <td class="rating">${player.rapid  || '-'}</td>
            <td class="rating">${player.blitz  || '-'}</td>
            <td class="rating">${player.bullet || '-'}</td>
        `;

        tableBody.appendChild(row);
    });
}

function sortPlayersByRating(mode) {
    playersData.sort((a, b) => b[mode] - a[mode]);
}

function sortTable(mode) {
    currentSort = mode;
    sortPlayersByRating(mode);

    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';

    playersData.forEach((player, index) => {
        const row = document.createElement('tr');

        let placeClass = '';
        let placeMedal = '';

        if      (index === 0) { placeClass = 'gold';   placeMedal = '🥇'; }
        else if (index === 1) { placeClass = 'silver'; placeMedal = '🥈'; }
        else if (index === 2) { placeClass = 'bronze'; placeMedal = '🥉'; }

        row.innerHTML = `
            <td><span class="place ${placeClass}">${placeMedal} #${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <span class="status-indicator ${player.online ? 'online' : 'offline'}"></span>
                    <a href="${player.url}" target="_blank" class="username">${player.username}</a>
                </div>
            </td>
            <td class="rating">${player.rapid  || '-'}</td>
            <td class="rating">${player.blitz  || '-'}</td>
            <td class="rating">${player.bullet || '-'}</td>
        `;

        tableBody.appendChild(row);
    });
}

function addPlayer() {
    const input    = document.getElementById('new-username');
    const username = input.value.trim();

    if (!username) {
        alert('Введите никнейм!');
        return;
    }

    if (friends.includes(username)) {
        alert('Этот игрок уже в списке!');
        return;
    }

    friends.push(username);
    localStorage.setItem('chessboardFriends', JSON.stringify(friends));
    input.value  = '';
    gamesLoaded  = false;  // сбрасываем кэш, чтобы история перезагрузилась с новым игроком
    buildLeaderboard();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ИСТОРИЯ ПАРТИЙ
// ═══════════════════════════════════════════════════════════════════════════════

// Парсинг NDJSON: каждая строка — отдельный JSON-объект
function parseNDJSON(text) {
    return text
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(item => item !== null);
}

// Перевод режима игры на русский
function translateSpeed(speed) {
    const map = {
        ultraBullet:    '⚡ Ультрапуля',
        bullet:         '⚡ Пуля',
        blitz:          '🔥 Блиц',
        rapid:          '⏱️ Рапид',
        classical:      '♟️ Классика',
        correspondence: '✉️ Переписка'
    };
    return map[speed] || speed;
}

// Форматирование временной метки в читаемую дату
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('ru-RU', {
        day:    '2-digit',
        month:  '2-digit',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit'
    });
}

// Загрузка последних 50 партий одного игрока через Lichess NDJSON API
async function fetchPlayerGames(username) {
    try {
        const response = await fetch(
            `https://lichess.org/api/games/user/${username}?max=50`,
            { headers: { 'Accept': 'application/x-ndjson' } }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseNDJSON(await response.text());
    } catch (e) {
        console.error(`Ошибка загрузки партий ${username}:`, e);
        return [];
    }
}

// Главная функция: параллельная загрузка, фильтрация, дедупликация, рендер
async function loadGamesHistory() {
    gamesLoaded = true;
    const container = document.getElementById('games-list');

    container.innerHTML = `
        <div class="games-loading-state">
            <div class="spinner"></div>
            <p>Загружаем партии для ${friends.length} игроков…</p>
        </div>
    `;

    try {
        // Параллельные запросы для всех друзей
        const allGamesArrays = await Promise.all(friends.map(f => fetchPlayerGames(f)));

        const friendsLower = friends.map(f => f.toLowerCase());
        const seen     = new Set();
        const filtered = [];

        for (const games of allGamesArrays) {
            for (const game of games) {
                if (!game.id || seen.has(game.id)) continue;

                const white = game.players?.white?.user?.name?.toLowerCase();
                const black = game.players?.black?.user?.name?.toLowerCase();

                // Оставляем только партии, где оба игрока есть в списке друзей
                if (white && black &&
                    friendsLower.includes(white) &&
                    friendsLower.includes(black)) {
                    seen.add(game.id);
                    filtered.push(game);
                }
            }
        }

        // Новые партии сверху
        filtered.sort((a, b) => b.createdAt - a.createdAt);

        renderGames(filtered);

    } catch (e) {
        container.innerHTML = `
            <div class="games-error">
                ⚠️ Ошибка загрузки данных.<br>
                Проверьте подключение к интернету и попробуйте снова.
            </div>
        `;
    }
}

// Рендер списка партий
function renderGames(games) {
    const container = document.getElementById('games-list');

    if (games.length === 0) {
        container.innerHTML = `
            <div class="games-empty">
                <span class="empty-icon">♟️</span>
                Партий между вами пока нет. Сыграйте первую!
            </div>
        `;
        return;
    }

    const cards = games.map(game => {
        const whiteName = game.players?.white?.user?.name || '?';
        const blackName = game.players?.black?.user?.name || '?';
        const winner    = game.winner; // 'white' | 'black' | undefined
        const isDraw    = !winner;

        // CSS-класс карточки и классы игроков
        const cardClass  = winner === 'white' ? 'white-wins'
                         : winner === 'black' ? 'black-wins'
                         : 'draw';

        const whiteClass = winner === 'white' ? 'game-player winner' : 'game-player';
        const blackClass = winner === 'black' ? 'game-player winner' : 'game-player';

        const whiteCheck = winner === 'white' ? '<span class="winner-mark"> ✓</span>' : '';
        const blackCheck = winner === 'black' ? '<span class="winner-mark"> ✓</span>' : '';
        const drawBadge  = isDraw              ? '<span class="game-draw-badge">Ничья</span>' : '';

        return `
            <div class="game-card ${cardClass}">
                <div class="game-meta">
                    <span class="game-date">📅 ${formatDate(game.createdAt)}</span>
                    <span class="game-mode">${translateSpeed(game.speed)}</span>
                </div>
                <div class="game-players">
                    <div class="${whiteClass}">
                        <span class="piece-icon">♔</span>
                        <span class="player-name">${whiteName}</span>${whiteCheck}
                    </div>
                    <span class="game-vs">vs</span>
                    <div class="${blackClass}">
                        <span class="piece-icon">♚</span>
                        <span class="player-name">${blackName}</span>${blackCheck}
                    </div>
                    ${drawBadge}
                </div>
                <a href="https://lichess.org/${game.id}" target="_blank" class="watch-btn">👁️ Смотреть</a>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <p style="color:#a0a0a0; margin-bottom:16px;">
            Найдено партий: <strong style="color:#d59120">${games.length}</strong>
        </p>
        <div class="games-container">${cards}</div>
    `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ЧАТ — НИК И FIREBASE
// ═══════════════════════════════════════════════════════════════════════════════

let chatNickname     = localStorage.getItem('chatNickname') || '';
let chatInitialized  = false;
let db               = null;
let selectedFriendNick = null;

// Генерация цвета по строке (детерминированно)
function nickColor(nick) {
    const palette = ['#d59120','#3893E8','#66dd66','#e06060','#c97bcc','#5bc0eb','#f7b731','#20bf6b'];
    let h = 0;
    for (let i = 0; i < nick.length; i++) h = nick.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
}

function formatChatTime(ts) {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatChatDate(ts) {
    const d         = new Date(ts);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Сегодня';
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Модальное окно ───

function showNicknameModal() {
    selectedFriendNick = null;
    const grid = document.getElementById('nick-friends-grid');
    grid.innerHTML = '';

    friends.forEach(f => {
        const btn = document.createElement('button');
        btn.className   = 'nick-friend-btn';
        btn.textContent = f;
        btn.onclick = () => {
            document.querySelectorAll('.nick-friend-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedFriendNick = f;
            document.getElementById('nick-custom-input').value = '';
        };
        grid.appendChild(btn);
    });

    // Если ник уже был выбран ранее — предзаполняем поле
    if (chatNickname) {
        const match = [...grid.querySelectorAll('.nick-friend-btn')].find(b => b.textContent === chatNickname);
        if (match) {
            match.classList.add('selected');
            selectedFriendNick = chatNickname;
        } else {
            document.getElementById('nick-custom-input').value = chatNickname;
        }
    }

    document.getElementById('nickname-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('nick-custom-input').focus(), 80);
}

function confirmNickname() {
    const customInput = document.getElementById('nick-custom-input').value.trim();
    const nick = selectedFriendNick || customInput;

    if (!nick) {
        const inp = document.getElementById('nick-custom-input');
        inp.focus();
        inp.style.borderColor = '#e06060';
        setTimeout(() => { inp.style.borderColor = ''; }, 1200);
        return;
    }

    chatNickname = nick;
    localStorage.setItem('chatNickname', nick);
    document.getElementById('nickname-modal').style.display = 'none';
    document.getElementById('chat-current-nick').textContent = nick;

    if (!chatInitialized) initChat();
}

function changeNickname() {
    selectedFriendNick = null;
    showNicknameModal();
}

// ─── Firebase и чат ───

function isFirebaseConfigured() {
    return !!(FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.databaseURL.trim().length > 10);
}

function initChat() {
    chatInitialized = true;
    const messagesEl = document.getElementById('chat-messages');

    if (!isFirebaseConfigured()) {
        messagesEl.innerHTML = `
            <div class="chat-setup-msg">
                <p>🔧 <strong style="color:#d59120">Чат не настроен</strong></p>
                <p style="margin:12px 0 6px">Включить чат (бесплатно, ~5 мин):</p>
                <ol style="text-align:left;line-height:2.1;padding-left:20px;font-size:0.87rem;color:#ccc;">
                    <li>Зайдите на <a href="https://console.firebase.google.com" target="_blank">console.firebase.google.com</a></li>
                    <li>Создайте проект &rarr; добавьте веб-приложение <strong>&lt;/&gt;</strong></li>
                    <li><strong>Realtime Database</strong> &rarr; Создать базу &rarr; Тестовый режим</li>
                    <li>Скопируйте <code style="background:#1e1c1a;padding:1px 6px;border-radius:4px;color:#d59120">firebaseConfig</code> в начало <code style="background:#1e1c1a;padding:1px 6px;border-radius:4px;color:#d59120">script.js</code></li>
                </ol>
            </div>
        `;
        return;
    }

    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
    } catch(e) {
        messagesEl.innerHTML = `<div class="games-error">⚠️ Ошибка Firebase: ${escapeHtml(e.message)}</div>`;
        return;
    }

    messagesEl.innerHTML = '<p class="loading" style="text-align:center;margin-top:20px">Подключение…</p>';

    const ref = db.ref('chess-chat/messages').limitToLast(100);
    ref.on('value', snapshot => {
        const msgs = [];
        snapshot.forEach(child => msgs.push({ id: child.key, ...child.val() }));
        renderChatMessages(msgs);
    }, err => {
        messagesEl.innerHTML = `<div class="games-error">⚠️ Ошибка: ${escapeHtml(err.message)}</div>`;
    });
}

function renderChatMessages(msgs) {
    const el = document.getElementById('chat-messages');
    if (!el) return;

    // Запоминаем, был ли пользователь внизу до обновления
    const wasAtBottom = el.scrollHeight === 0 || (el.scrollHeight - el.scrollTop - el.clientHeight < 80);

    if (msgs.length === 0) {
        el.innerHTML = `
            <div class="games-empty">
                <span class="empty-icon">💬</span>
                Никто ещё не написал. Начните первым!
            </div>
        `;
        return;
    }

    let html     = '';
    let lastDate = '';

    msgs.forEach(msg => {
        if (!msg.author || !msg.text) return;

        const dateStr = formatChatDate(msg.timestamp);
        if (dateStr !== lastDate) {
            html    += `<div class="chat-date-separator">${dateStr}</div>`;
            lastDate = dateStr;
        }

        const isOwn  = msg.author === chatNickname;
        const cls    = isOwn ? 'own' : 'other';
        const color  = nickColor(msg.author);
        const youTag = isOwn ? ' <span style="color:#555;font-weight:normal">(вы)</span>' : '';

        html += `
            <div class="chat-msg ${cls}">
                <div class="chat-msg-meta">
                    <span class="chat-msg-author" style="color:${color}">${escapeHtml(msg.author)}${youTag}</span>
                    <span class="chat-msg-time">${formatChatTime(msg.timestamp)}</span>
                </div>
                <div class="chat-msg-bubble">${escapeHtml(msg.text)}</div>
            </div>
        `;
    });

    el.innerHTML = html;
    if (wasAtBottom) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function sendChatMessage() {
    if (!chatNickname) {
        showNicknameModal();
        return;
    }

    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;

    if (!db) {
        if (!isFirebaseConfigured()) alert('Чат не настроен. Заполните FIREBASE_CONFIG в script.js');
        return;
    }

    db.ref('chess-chat/messages').push({
        author:    chatNickname,
        text,
        timestamp: Date.now()
    }).catch(err => console.error('Ошибка отправки:', err));

    input.value = '';
    input.focus();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════════

buildLeaderboard();

// Отображаем сохранённый ник в шапке чата
if (chatNickname) {
    const nickEl = document.getElementById('chat-current-nick');
    if (nickEl) nickEl.textContent = chatNickname;
}
