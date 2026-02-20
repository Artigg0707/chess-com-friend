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
// FIREBASE — вставьте свои данные из Firebase Console → Project Settings
// Инструкция: console.firebase.google.com → New project → Realtime Database
// ═══════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
    apiKey:            'PASTE_YOUR_API_KEY',
    authDomain:        'PASTE_YOUR_PROJECT.firebaseapp.com',
    databaseURL:       'https://PASTE_YOUR_PROJECT-default-rtdb.firebaseio.com/',
    projectId:         'PASTE_YOUR_PROJECT_ID',
    storageBucket:     'PASTE_YOUR_PROJECT.appspot.com',
    messagingSenderId: 'PASTE_YOUR_SENDER_ID',
    appId:             'PASTE_YOUR_APP_ID'
};

let db            = null;
let chatListener  = null;
let firebaseReady = false;
let currentNickname = localStorage.getItem('chatNickname') || null;

function initFirebase() {
    if (firebaseConfig.apiKey === 'PASTE_YOUR_API_KEY') return; // конфиг не задан
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseReady = true;
    } catch(e) {
        console.warn('Firebase init error:', e);
    }
}
initFirebase();

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

    // Чат: требуем ник, затем загружаем сообщения
    if (tabName === 'chat') {
        if (!currentNickname) {
            document.getElementById('nickname-modal').classList.remove('hidden');
        } else {
            loadChat();
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
// НИКНЕЙМ
// ═══════════════════════════════════════════════════════════════════════════════

function initNicknameModal() {
    // Заполняем кнопки из текущего списка друзей
    const list = document.getElementById('modal-friends-list');
    list.innerHTML = friends.map(f =>
        `<button class="modal-friend-btn" onclick="pickFriendNick('${f}')">${f}</button>`
    ).join('');

    updateChatHeader();
    // Модал открывается только при переходе на вкладку чата, не сразу
}

function pickFriendNick(name) {
    document.getElementById('nickname-input').value = name;
    saveNickname();
}

function saveNickname() {
    const input = document.getElementById('nickname-input');
    const name  = input.value.trim();
    if (!name) { input.focus(); return; }

    currentNickname = name;
    localStorage.setItem('chatNickname', name);
    document.getElementById('nickname-modal').classList.add('hidden');
    updateChatHeader();

    // Если чат уже открыт — загружаем сообщения
    if (document.getElementById('tab-chat').classList.contains('active')) {
        loadChat();
    }
}

function changeNickname() {
    currentNickname = null;
    localStorage.removeItem('chatNickname');
    document.getElementById('nickname-input').value = '';
    document.getElementById('nickname-modal').classList.remove('hidden');
    updateChatHeader();
}

function updateChatHeader() {
    const label = document.getElementById('chat-user-label');
    if (!label) return;
    label.innerHTML = currentNickname
        ? `Вы в чате как: <strong>${currentNickname}</strong>`
        : '<span style="color:#a0a0a0">Никнейм не выбран</span>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ЧАТ
// ═══════════════════════════════════════════════════════════════════════════════

function loadChat() {
    const box = document.getElementById('chat-messages');

    if (!firebaseReady) {
        box.innerHTML = `
            <div class="chat-firebase-error">
                <span class="fire-icon">🔥</span>
                <strong>Чат не настроен</strong><br><br>
                Создайте бесплатный проект на
                <a href="https://console.firebase.google.com/" target="_blank">Firebase</a>,
                включите <strong>Realtime Database</strong> и вставьте конфиг
                в начало файла <code>script.js</code>.
            </div>
        `;
        return;
    }

    // Отключаем старый listener
    if (chatListener) {
        db.ref('chat/messages').off('value', chatListener);
        chatListener = null;
    }

    box.innerHTML = '<div class="chat-placeholder">Загрузка сообщений...</div>';

    chatListener = db.ref('chat/messages').limitToLast(120).on('value', snap => {
        const data = snap.val();
        renderChatMessages(data ? Object.values(data) : []);
    });
}

function renderChatMessages(messages) {
    const box = document.getElementById('chat-messages');

    if (messages.length === 0) {
        box.innerHTML = '<div class="chat-placeholder">Сообщений пока нет. Напишите первым! 👋</div>';
        return;
    }

    // Сортируем по времени (старые сверху)
    messages.sort((a, b) => a.ts - b.ts);

    let html      = '';
    let lastDate  = null;

    for (const msg of messages) {
        // Разделитель по дате
        const dateStr = new Date(msg.ts).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        if (dateStr !== lastDate) {
            html += `<div class="msg-date-divider">${dateStr}</div>`;
            lastDate = dateStr;
        }

        if (msg.type === 'system') {
            html += `<div class="msg-system">${escapeHtml(msg.text)}</div>`;
            continue;
        }

        const isOwn     = msg.author === currentNickname;
        const wrapClass = isOwn ? 'own' : 'other';
        const time      = new Date(msg.ts).toLocaleTimeString('ru-RU', {
            hour: '2-digit', minute: '2-digit'
        });

        html += `
            <div class="msg-wrapper ${wrapClass}">
                ${!isOwn ? `<div class="msg-author">${escapeHtml(msg.author)}</div>` : ''}
                <div class="msg-bubble">${escapeHtml(msg.text)}</div>
                <div class="msg-time">${time}</div>
            </div>
        `;
    }

    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function sendMessage() {
    if (!firebaseReady) return;

    if (!currentNickname) {
        document.getElementById('nickname-modal').classList.remove('hidden');
        return;
    }

    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;

    const btn    = document.querySelector('.chat-send-btn');
    input.value  = '';
    btn.disabled = true;

    try {
        await db.ref('chat/messages').push({
            author: currentNickname,
            text,
            ts:   Date.now(),
            type: 'text'
        });
    } catch(e) {
        console.error('Ошибка отправки:', e);
        input.value = text; // вернуть текст при ошибке
    }

    btn.disabled = false;
    input.focus();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════════

buildLeaderboard();
initNicknameModal();
