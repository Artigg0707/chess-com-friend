// --- API BASE URL ---
// Локально — запросы идут на тот же сервер (пустая строка)
// На GitHub Pages — запросы идут на удалённый сервер fly.io
// ↓↓↓ ЗАМЕНИ chess-friends-api на имя твоего fly-приложения ↓↓↓
const REMOTE_API = 'https://chess-friends-api.fly.dev';
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API = IS_LOCAL ? '' : REMOTE_API;

// --- GLOBAL STATE ---
let friends = [];
let playersData = [];       // Данные для обычного рейтинга (Lichess)
let internalRatings = {};   // { "Username": { rating: 100, trend: "up/flat/down", diff: +5, games: 10 } }
let gamesHistoryFull = [];  // Полная история партий для расчета ELO
let currentTab = 'leaderboard';
let ratingMode = 'lichess';  // 'lichess' or 'internal'
let lastRecalc = null;       // Дата последнего пересчета

const STARTING_ELO = 100;
const K_FACTOR = 32;

// Флаги загрузки
let gamesLoaded = false;
let activityLoaded = false;

// Текущий пользователь чата
let currentUser = null;
let allMessages = [];
const chatChannel = new BroadcastChannel('chess_friends_chat');

/* 
   -----------------------------------------
   SERVER HELPERS (fetch wrappers)
   -----------------------------------------
*/
async function apiFetch(url, options = {}) {
    const res = await fetch(`${API}${url}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Server error');
    }
    return res.json();
}

/* 
   -----------------------------------------
   INITIALIZATION
   -----------------------------------------
*/
window.addEventListener('load', async () => {
    try {
        // 1. Загружаем друзей с сервера
        friends = await apiFetch('/api/friends');

        // 2. Загружаем сохраненные рейтинги с сервера
        const ratingsData = await apiFetch('/api/ratings');
        internalRatings = ratingsData.ratings || {};
        lastRecalc = ratingsData.lastRecalc;

        // Синхронизируем (если есть друзья без рейтинга)
        syncFriendsWithRatings();

        // 3. Если рейтинги ещё ни разу не считались — пересчитаем
        if (!lastRecalc || Object.keys(internalRatings).length === 0) {
            await recalculateInternalRatings();
        } else {
            buildLeaderboard();
        }
    } catch (e) {
        console.error('Init error:', e);
        // Фоллбек на localStorage если сервер недоступен
        friends = JSON.parse(localStorage.getItem('chessboardFriends') || '["just_Cone","MaxMas","aledmap2","Jcoin"]');
        const saved = localStorage.getItem('internalRatings');
        if (saved) internalRatings = JSON.parse(saved);
        syncFriendsWithRatings();
        buildLeaderboard();
    }

    // 4. Чат
    chatChannel.onmessage = () => {
        loadMessages();
        renderMessages();
    };
});

function syncFriendsWithRatings() {
    friends.forEach(f => {
        if (!internalRatings[f]) {
            internalRatings[f] = { 
                rating: STARTING_ELO, 
                trend: 'flat', 
                diff: 0, 
                games: 0 
            };
        }
    });
}

/* 
   -----------------------------------------
   TABS LOGIC
   -----------------------------------------
*/
function switchTab(tabName) {
    currentTab = tabName;
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el  => el.classList.remove('active'));

    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Логика подгрузки
    if (tabName === 'history' && !gamesLoaded) {
        loadGamesHistory();
    }
    if (tabName === 'activity' && !activityLoaded) {
        loadActivityCalendar();
    }
    if (tabName === 'chat') {
        initChat();
    }
}

/* 
   -----------------------------------------
   RATING MODE TOGGLE (Lichess vs Internal)
   -----------------------------------------
*/
function toggleRatingMode(mode) {
    ratingMode = mode;
    
    // Показать/скрыть кнопку пересчета
    const btn = document.getElementById('recalc-btn');
    if (btn) btn.style.display = (mode === 'internal') ? 'block' : 'none';

    // Перестроить таблицу с новыми заголовками и данными
    buildLeaderboard();
}

/* 
   -----------------------------------------
   LEADERBOARD (Lichess API & Internal Render)
   -----------------------------------------
*/

// --- 1. Lichess Data Fetching ---
async function getPlayerData(username) {
    try {
        const response = await fetch(`https://lichess.org/api/user/${username}`);
        if (!response.ok) throw new Error(`User not found`);
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
        console.warn(`Lichess API err for ${username}:`, error);
        return { 
            username: username, 
            url: `https://lichess.org/@/${username}`,
            online: false, 
            rapid: '?', blitz: '?', bullet: '?' 
        };
    }
}

// --- 2. Main Build Function ---
async function buildLeaderboard() {
    const tableHead = document.querySelector('#main-table thead');
    const tableBody = document.getElementById('table-body');

    // А. Формируем заголовки
    if (ratingMode === 'lichess') {
        tableHead.innerHTML = `
            <tr>
                <th style="width: 50px;">#</th>
                <th>Игрок</th>
                <th style="width: 80px;" class="sortable active" onclick="sortLichessTable('rapid')" data-sort="rapid">Rapid</th>
                <th style="width: 80px;" class="sortable" onclick="sortLichessTable('blitz')" data-sort="blitz">Blitz</th>
                <th style="width: 80px;" class="sortable" onclick="sortLichessTable('bullet')" data-sort="bullet">Bullet</th>
            </tr>
        `;
    } else {
        tableHead.innerHTML = `
            <tr>
                <th style="width: 50px;">#</th>
                <th>Игрок</th>
                <th style="width: 120px;">Внутренний Рейтинг</th>
                <th style="width: 100px;">Партий</th>
            </tr>
        `;
    }

    // Б. Рендерим тело таблицы
    if (ratingMode === 'lichess') {
        // Если уже загружали данные Lichess - не грузим снова (кэшируем в playersData)
        if (playersData.length === 0 || playersData.length !== friends.length) {
            tableBody.innerHTML = '<tr><td colspan="5" class="loading">Загрузка данных Lichess...</td></tr>';
            const promises = friends.map(f => getPlayerData(f));
            playersData = await Promise.all(promises);
        }
        renderLichessTable(tableBody);
    } else {
        // Внутренний рейтинг берем из памяти
        renderInternalTable(tableBody);
    }
}

// --- 3. Render Lichess Table ---
function renderLichessTable(tbody) {
    if (!tbody) tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    // Сортировка по умолчанию (Rapid), если еще не сортировали
    // Или используем текущий метод сортировки, если он есть
    const sortMode = localStorage.getItem('lichessSortMode') || 'rapid';
    sortLichessTable(sortMode, false); // false = не перерисовывать хедеры, т.к. мы уже внутри buildLeaderboard
}

function sortLichessTable(mode, updateUI = true) {
    if (ratingMode !== 'lichess') return;

    localStorage.setItem('lichessSortMode', mode);

    // Сортируем массив
    playersData.sort((a, b) => {
        const valA = (a[mode] === '?' || a[mode] === undefined) ? -1 : a[mode];
        const valB = (b[mode] === '?' || b[mode] === undefined) ? -1 : b[mode];
        return valB - valA;
    });

    if (updateUI) {
         // Обновляем классы active у заголовков
         document.querySelectorAll('th.sortable').forEach(th => {
             if (th.dataset.sort === mode) th.classList.add('active');
             else th.classList.remove('active');
         });
    }

    // Генерируем HTML
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    playersData.forEach((player, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="place">#${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <span class="status-indicator ${player.online ? 'online' : 'offline'}"></span>
                    <a href="${player.url}" target="_blank" class="username">${player.username}</a>
                </div>
            </td>
            <td class="rating">${player.rapid}</td>
            <td class="rating">${player.blitz}</td>
            <td class="rating">${player.bullet}</td>
        `;
        tbody.appendChild(row);
    });
}

// --- 4. Render Internal Table ---
function renderInternalTable(tbody) {
    if (!tbody) tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    // Превращаем объект в массив для сортировки
    let sorted = friends.map(f => {
        const stats = internalRatings[f] || { rating: 100, trend: 'flat', diff: 0, games: 0 };
        return { name: f, ...stats };
    });

    // Сортировка по рейтингу убыванию
    sorted.sort((a, b) => b.rating - a.rating);

    sorted.forEach((player, index) => {
        const row = document.createElement('tr');
        
        // Тренд иконка
        let icon = '';
        let iconClass = 'trend-flat';
        if (player.trend === 'up')   { icon = ''; iconClass = 'trend-up'; }
        if (player.trend === 'down') { icon = ''; iconClass = 'trend-down'; }

        // Diff цвет
        let diffSign = player.diff > 0 ? '+' : '';
        let diffClass = 'diff-neutral';
        if (player.diff > 0) diffClass = 'diff-positive';
        if (player.diff < 0) diffClass = 'diff-negative';
        
        const diffHTML = (player.games > 0 && player.diff !== 0) 
            ? `<span class="elo-diff ${diffClass}">(${diffSign}${player.diff})</span>`
            : '';
        
        // Если 0 игр, показываем пояснение
        const ratingDisplay = (player.games === 0) 
            ? `<span style="color:#636e72;">100 (нет игр)</span>`
            : `<strong>${Math.round(player.rating)}</strong> ${diffHTML}`;

        row.innerHTML = `
            <td><span class="place">#${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <a href="https://lichess.org/@/${player.name}" target="_blank" class="username">${player.name}</a>
                </div>
            </td>
            <td>
                <span class="trend-icon ${iconClass}">${icon}</span>
                ${ratingDisplay}
            </td>
            <td>${player.games}</td>
        `;
        tbody.appendChild(row);
    });
}

/* 
   -----------------------------------------
   INTERNAL ELO CALCULATION LOGIC
   -----------------------------------------
*/

// Функция пересчета всего ELO с нуля (Heavy Operation)
async function recalculateInternalRatings() {
    if (ratingMode !== 'internal') return;

    // UI Loading
    const loadingOverlay = document.getElementById('rating-loading');
    const loadingText = document.getElementById('rating-loading-text');
    loadingOverlay.style.display = 'flex';
    loadingText.innerText = 'Загрузка истории партий (до 100 на игрока)...';

    try {
        // 1. Сбрасываем рейтинги в RAM
        friends.forEach(f => {
            internalRatings[f] = { rating: STARTING_ELO, trend: 'flat', diff: 0, games: 0, history: [] };
        });

        // 2. Получаем партии ВСЕХ друзей (уведомляем пользователя)
        // Чтобы было что считать, берем больше партий (max=100)
        const allGamesPromises = friends.map(f => fetch(
            `https://lichess.org/api/games/user/${f}?max=100`, 
            { headers: { 'Accept': 'application/x-ndjson' } }
        ).then(res => res.text()).then(txt => parseNDJSON(txt)));

        const results = await Promise.all(allGamesPromises);
        
        // 3. Собираем все партии в одну кучу и дедуплицируем
        let allGames = [];
        const seenIds = new Set();
        const friendsLower = friends.map(f => f.toLowerCase());

        results.forEach(userGames => {
            userGames.forEach(g => {
                if (!seenIds.has(g.id)) {
                    // Проверяем, что оба игрока - наши друзья
                    const w = g.players?.white?.user?.name?.toLowerCase();
                    const b = g.players?.black?.user?.name?.toLowerCase();
                    
                    if (w && b && friendsLower.includes(w) && friendsLower.includes(b)) {
                        seenIds.add(g.id);
                        allGames.push(g);
                    }
                }
            });
        });

        // 4. Сортируем хронологически (от старых к новым) для корректного пересчета ELO
        allGames.sort((a, b) => a.createdAt - b.createdAt);

        loadingText.innerText = `Обработка ${allGames.length} партий...`;

        // 5. Проходимся и считаем
        allGames.forEach(game => {
            processGameForELO(game);
        });

        // 6. Сохраняем на сервер
        await apiFetch('/api/ratings', {
            method: 'POST',
            body: JSON.stringify({ ratings: internalRatings })
        });
        
        // Также localStorage как кэш
        localStorage.setItem('internalRatings', JSON.stringify(internalRatings));
        
        // 7. Обновляем UI
        buildLeaderboard();

    } catch (e) {
        console.error(e);
        alert('Ошибка при пересчете рейтинга. Проверьте консоль.');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function processGameForELO(game) {
    // Определяем имена (Lichess может менять регистр, приводим к нашему списку friends)
    const wNameRaw = game.players.white.user.name;
    const bNameRaw = game.players.black.user.name;

    // Находим "каноничное" имя из friends массива (сохраняя регистр как в массиве friends)
    const whitePlayer = friends.find(f => f.toLowerCase() === wNameRaw.toLowerCase());
    const blackPlayer = friends.find(f => f.toLowerCase() === bNameRaw.toLowerCase());

    if (!whitePlayer || !blackPlayer) return; // На всякий случай

    const wStat = internalRatings[whitePlayer];
    const bStat = internalRatings[blackPlayer];

    // Текущие рейтинги
    const Rw = wStat.rating;
    const Rb = bStat.rating;

    // Результат для белых (1 - win, 0.5 - draw, 0 - loss)
    let scoreW = 0.5;
    if (game.winner === 'white') scoreW = 1;
    if (game.winner === 'black') scoreW = 0;

    // Ожидаемый результат (формула ELO)
    // Ea = 1 / (1 + 10 ^ ((Rb - Ra) / 400))
    const ExpectedW = 1 / (1 + Math.pow(10, (Rb - Rw) / 400));
    const ExpectedB = 1 / (1 + Math.pow(10, (Rw - Rb) / 400));

    // Новые рейтинги
    const newRw = Rw + K_FACTOR * (scoreW - ExpectedW);
    // Для черных scoreB = 1 - scoreW
    const scoreB = 1 - scoreW;
    const newRb = Rb + K_FACTOR * (scoreB - ExpectedB);

    // Записываем diff и обновляем рейтинг
    wStat.diff = Math.round(newRw - Rw);
    bStat.diff = Math.round(newRb - Rb);

    wStat.rating = newRw;
    bStat.rating = newRb;

    wStat.games++;
    bStat.games++;

    // История рейтинга (для тренда) - храним последние 5
    if (!wStat.history) wStat.history = [];
    if (!bStat.history) bStat.history = [];

    wStat.history.push(newRw);
    bStat.history.push(newRb);

    if (wStat.history.length > 5) wStat.history.shift();
    if (bStat.history.length > 5) bStat.history.shift();

    // Расчет тренда (сравниваем текущий с тем, что был 5 игр назад или в начале)
    wStat.trend = calculateTrend(wStat);
    bStat.trend = calculateTrend(bStat);
}

function calculateTrend(playerStats) {
    if (playerStats.games < 5 || playerStats.history.length < 2) return 'flat';
    const current = playerStats.rating;
    const old = playerStats.history[0]; // Самый старый из сохраненных (5 игр назад)
    if (current > old + 2) return 'up';
    if (current < old - 2) return 'down';
    return 'flat';
}

/* 
   -----------------------------------------
   ACTIVITY CALENDAR
   -----------------------------------------
*/
async function loadActivityCalendar() {
    activityLoaded = true;
    const container = document.getElementById('activity-list');
    container.innerHTML = `<p style="text-align:center;">Загрузка активности (последние 90 дней)...</p>`;

    // 1. Грузим партии каждого друга за последние 90 дней
    // Lichess API allows filtering by date? Not easily in standard endpoint without exporting.
    // Проще загрузить последние 100-200 партий и отфильтровать по дате на клиенте.
    
    // 90 дней назад timestamp
    const cutoffDate = Date.now() - (90 * 24 * 60 * 60 * 1000);

    const promises = friends.map(async (friend) => {
        try {
            // Берем 200 партий, надеемся что это покроет 90 дней (обычно да, если не маньяк)
            // since параметр в API принимает миллисекунды
            const response = await fetch(
                `https://lichess.org/api/games/user/${friend}?since=${cutoffDate}&max=300`, 
                { headers: { 'Accept': 'application/x-ndjson' } }
            );
            if (!response.ok) return { name: friend, games: [] };
            const text = await response.text();
            const games = parseNDJSON(text); // Это вернет массив объектов
            return { name: friend, games: games };
        } catch (e) {
            console.error(e);
            return { name: friend, games: [] };
        }
    });

    const results = await Promise.all(promises);

    // 2. Рендерим календари
    container.innerHTML = '';
    results.forEach(res => {
        renderPlayerCalendar(container, res.name, res.games, cutoffDate);
    });
}

function renderPlayerCalendar(container, username, games, cutoffDate) {
    // Группируем игры по дням (YYYY-MM-DD)
    const gamesByDay = {};
    games.forEach(g => {
        const d = new Date(g.createdAt); // timestamp
        const dayKey = d.toISOString().split('T')[0]; // "2023-10-05"
        gamesByDay[dayKey] = (gamesByDay[dayKey] || 0) + 1;
    });

    // Создаем карту (структуру) для Grid
    // GitHub calendar usually goes Column = Week, Row = Day of Week (0=Sun, 6=Sat)
    
    // Определяем диапазон дат: от cutoffDate до Today
    const today = new Date();
    const startDate = new Date(cutoffDate);
    
    // Сдвигаем startDate на ближайшее прошедшее воскресенье, чтобы сетка была ровной
    // (или понедельник, если в России). Сделаем Понедельник (1) первым.
    const dayOfWeek = startDate.getDay(); // 0(Sun) - 6(Sat)
    // Если 0 (вс), отнимаем 6 дней до понедельника. Если 1 (пн), отнимаем 0.
    const diffToMon = (dayOfWeek === 0 ? 6 : dayOfWeek - 1); 
    startDate.setDate(startDate.getDate() - diffToMon);

    const oneDay = 24 * 60 * 60 * 1000;
    
    let htmlGrid = '';
    let totalGames = games.length;
    
    // Генерируем ячейки
    // Итерируемся по дням от startDate до today
    let current = new Date(startDate);
    
    // Нужно сгенерировать ячейки. Grid layout: grid-template-rows: repeat(7, ...); grid-auto-flow: column;
    // Это значит, мы просто выплевываем div-ы, они сами встанут в колонки по 7 штук.
    
    while (current <= today) {
        const dateStr = current.toISOString().split('T')[0];
        const count = gamesByDay[dateStr] || 0;
        
        let level = 0;
        if (count > 0) level = 1;
        if (count >= 3) level = 2;
        if (count >= 6) level = 3;
        if (count >= 10) level = 4;

        // Tooltip text
        const niceDate = current.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        const tooltip = `${niceDate}: ${count} партий`;

        htmlGrid += `<div class="day-cell level-${level}" data-tooltip="${tooltip}"></div>`;
        
        // Next day
        current.setTime(current.getTime() + oneDay);
    }
    
    // Статистика (примерная)
    // Самая активная неделя - сложно считать без лупа, пропустим для простоты или сделаем просто Total
    
    const card = document.createElement('div');
    card.className = 'player-activity-card';
    card.innerHTML = `
        <div class="activity-header">
            <span class="activity-username">${username}</span>
            <div class="activity-stats">
                 <span>Всего: <strong>${totalGames}</strong></span>
            </div>
        </div>
        <div class="calendar-grid">
            ${htmlGrid}
        </div>
    `;
    
    container.appendChild(card);
}


/* 
   -----------------------------------------
   HISTORY & SHARED UTILS
   -----------------------------------------
*/

// Парсинг NDJSON
function parseNDJSON(text) {
    return text.trim().split('\n')
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(item => item !== null);
}

// Загрузка партий для вкладки History (только между друзьями)
async function loadGamesHistory() {
    gamesLoaded = true;
    const container = document.getElementById('games-list');
    container.innerHTML = `<p style="text-align:center;">Загрузка истории...</p>`;

    try {
        const allGamesPromises = friends.map(f => fetch(
            `https://lichess.org/api/games/user/${f}?max=20`, 
            { headers: { 'Accept': 'application/x-ndjson' } }
        ).then(res => res.text()).then(txt => parseNDJSON(txt)));

        const results = await Promise.all(allGamesPromises);

        // Фильтрация: только партии между friends
        const friendsLower = friends.map(f => f.toLowerCase());
        const seen = new Set();
        const filtered = [];

        results.forEach(group => {
            group.forEach(game => {
                if (!seen.has(game.id)) {
                    const w = game.players?.white?.user?.name?.toLowerCase();
                    const b = game.players?.black?.user?.name?.toLowerCase();
                    if (w && b && friendsLower.includes(w) && friendsLower.includes(b)) {
                        seen.add(game.id);
                        filtered.push(game);
                    }
                }
            });
        });

        filtered.sort((a, b) => b.createdAt - a.createdAt);
        renderGames(filtered);

    } catch (e) {
        container.innerHTML = `<div class="games-error">Ошибка загрузки</div>`;
    }
}

function renderGames(games) {
    const container = document.getElementById('games-list');
    if (games.length === 0) {
        container.innerHTML = `<div class="games-empty">Нет общих партий</div>`;
        return;
    }

    const html = games.map(game => {
        const white = game.players.white.user.name;
        const black = game.players.black.user.name;
        const winner = game.winner; 
        
        let classW = 'game-player';
        let classB = 'game-player';
        let cardClass = 'draw';

        if (winner === 'white') { cardClass = 'white-wins'; classW += ' winner'; }
        if (winner === 'black') { cardClass = 'black-wins'; classB += ' winner'; }

        return `
        <div class="game-card ${cardClass}">
            <div class="game-meta">
                <span>${new Date(game.createdAt).toLocaleDateString('ru-RU')}</span>
                <span>${game.speed}</span>
            </div>
            <div class="game-players">
                <div class="${classW}">${white} ${winner === 'white' ? '<span class="winner-mark">✓</span>' : ''}</div>
                <span class="game-vs">vs</span>
                <div class="${classB}">${black} ${winner === 'black' ? '<span class="winner-mark">✓</span>' : ''}</div>
            </div>
            <a href="https://lichess.org/${game.id}" target="_blank" class="watch-btn">Смотреть</a>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="games-container">${html}</div>`;
}

/* 
   -----------------------------------------
   ADD PLAYER
   -----------------------------------------
*/
async function addPlayer() {
    const input = document.getElementById('new-username');
    const val = input.value.trim();
    if (!val) return;
    if (friends.some(f => f.toLowerCase() === val.toLowerCase())) { alert('Уже есть'); return; }
    
    try {
        // Отправляем на сервер
        const result = await apiFetch('/api/friends', {
            method: 'POST',
            body: JSON.stringify({ username: val })
        });
        friends = result.friends;
    } catch (e) {
        // Фоллбек: добавляем локально
        friends.push(val);
        localStorage.setItem('chessboardFriends', JSON.stringify(friends));
    }
    
    // Инициализируем рейтинг для нового
    syncFriendsWithRatings();
    
    input.value = '';
    gamesLoaded = false; 
    activityLoaded = false;
    playersData = []; // Сбросить кеш Lichess данных
    
    buildLeaderboard();
}

/* 
   -----------------------------------------
   CHAT (Basic)
   -----------------------------------------
*/
async function initChat() {
    updateLoginSelect();
    const u = localStorage.getItem('chatUser');
    if (u) {
        currentUser = u;
        await loadMessages();
        enableChatInput();
        renderMessages();
    } else {
        document.getElementById('login-modal').classList.add('active');
    }
}

function updateLoginSelect() {
    const sel = document.getElementById('login-select');
    sel.innerHTML = `<option value="" disabled selected>Кто вы?</option>`;
    friends.forEach(f => {
        const op = document.createElement('option');
        op.value = f; op.textContent = f;
        sel.appendChild(op);
    });
}

async function loginChat() {
    const sel = document.getElementById('login-select');
    const inp = document.getElementById('login-input');
    const user = inp.value.trim() || sel.value;

    if (!user) { alert('Введите или выберите ник'); return; }
    
    currentUser = user;
    localStorage.setItem('chatUser', user);
    document.getElementById('login-modal').classList.remove('active');
    await loadMessages();
    enableChatInput();
    renderMessages();
}

function enableChatInput() {
    const inp = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send-btn');
    inp.disabled = false; btn.disabled = false;
    inp.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
}

async function loadMessages() {
    try {
        allMessages = await apiFetch('/api/chat');
    } catch (e) {
        // Фоллбек localStorage
        const s = localStorage.getItem('chatMessages');
        allMessages = s ? JSON.parse(s) : [];
    }
}

function renderMessages() {
    const box = document.getElementById('chat-messages');
    if (allMessages.length === 0) {
        box.innerHTML = `<div class="chat-placeholder">Пусто</div>`;
        return;
    }
    box.innerHTML = '';
    allMessages.forEach(msg => {
        const isMine = msg.user === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isMine ? 'mine' : 'theirs'}`;
        const time = new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        div.innerHTML = `
            <div class="message-meta"><span>${isMine? 'Вы' : msg.user}</span> <span>${time}</span></div>
            <div>${msg.text}</div>
        `;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
    const inp = document.getElementById('chat-input');
    const txt = inp.value.trim();
    if (!txt) return;

    const msg = { user: currentUser, text: txt };

    try {
        const saved = await apiFetch('/api/chat', {
            method: 'POST',
            body: JSON.stringify(msg)
        });
        allMessages.push(saved);
    } catch (e) {
        // Фоллбек localStorage
        const localMsg = { id: Date.now(), user: currentUser, text: txt, timestamp: Date.now() };
        allMessages.push(localMsg);
        localStorage.setItem('chatMessages', JSON.stringify(allMessages));
    }

    inp.value = '';
    renderMessages();
    chatChannel.postMessage({ type: 'new_message' });
}

