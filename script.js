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
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════════

buildLeaderboard();
