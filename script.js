// --- API BASE URL ---
// Локально — запросы идут на тот же сервер (пустая строка)
// На GitHub Pages — запросы идут на удалённый сервер fly.io
const REMOTE_API = "https://chess-friends-api.fly.dev";
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API = IS_LOCAL ? "" : REMOTE_API;

// --- GLOBAL STATE ---
let friends = [];
let playersData = [];       // Данные для обычного рейтинга (Lichess)
let internalRatings = {};   // { "Username": { rating: 100, trend: "up/flat/down", diff: +5, games: 10, history: [] } }
let currentTab = "leaderboard";
let ratingMode = "lichess";  // "lichess" or "internal"
let lastRecalc = null;       // Дата последнего пересчета

// --- ECONOMY STATE ---
let economy = {
    pawnBalances: {},     // { "Username": 145 }
    inventories: {},      // { "Username": { badges: [], animations: [], cardColors: [], frames: [], titles: [] } }
    equipped: {},         // { "Username": { badge: null, animation: null, cardColor: null, frame: null, title: null } }
    transactions: {}      // { "Username": [ { date, type, item, cost/amount } ] }
};

const STARTING_ELO = 100;
const K_FACTOR = 32;

// Флаги загрузки
let gamesLoaded = false;
let activityLoaded = false;

// Текущий пользователь чата
let currentUser = null;
let allMessages = [];
const chatChannel = new BroadcastChannel("chess_friends_chat");

/* 
   -----------------------------------------
   SHOP ITEMS CONSTANTS
   -----------------------------------------
*/
const SHOP_ITEMS = [
    // 1. BADGES
    { id: "badge_fire",    type: "badge", name: "Огонь", icon: "🔥", cost: 50 },
    { id: "badge_bolt",    type: "badge", name: "Молния", icon: "⚡", cost: 50 },
    { id: "badge_crown",   type: "badge", name: "Корона", icon: "👑", cost: 100 },
    { id: "badge_diamond", type: "badge", name: "Алмаз", icon: "💎", cost: 150 },
    { id: "badge_shark",   type: "badge", name: "Акула", icon: "🦈", cost: 200 },
    { id: "badge_wizard",  type: "badge", name: "Маг", icon: "🧙", cost: 300 },
    { id: "badge_dragon",  type: "badge", name: "Дракон", icon: "🐉", cost: 500 },

    // 2. ANIMATIONS
    { id: "anim_shimmer", type: "animation", name: "Мерцание", icon: "✨", cssClass: "anim-shimmer", cost: 80 },
    { id: "anim_wave",    type: "animation", name: "Волна",    icon: "🌊", cssClass: "anim-wave",    cost: 80 },
    { id: "anim_pulse",   type: "animation", name: "Пульсация",icon: "🔮", cssClass: "anim-pulse",   cost: 100 },
    { id: "anim_rainbow", type: "animation", name: "Радужный", icon: "🌈", cssClass: "anim-rainbow", cost: 150 },
    { id: "anim_sparks",  type: "animation", name: "Искры",    icon: "⚡", cssClass: "anim-sparks",  cost: 200 },
    { id: "anim_fire",    type: "animation", name: "Огонь",    icon: "🔥", cssClass: "anim-fire",    cost: 250 },

    // 3. CARD COLORS
    { id: "color_blue",   type: "cardColor", name: "Синий",      icon: "🟦", value: "border-left: 4px solid #0984e3", cost: 30 },
    { id: "color_green",  type: "cardColor", name: "Зеленый",    icon: "🟩", value: "border-left: 4px solid #00b894", cost: 30 },
    { id: "color_purple", type: "cardColor", name: "Фиолетовый", icon: "🟪", value: "border-left: 4px solid #a29bfe", cost: 50 },
    { id: "color_red",    type: "cardColor", name: "Красный",    icon: "🟥", value: "border-left: 4px solid #d63031", cost: 50 },
    { id: "color_gold",   type: "cardColor", name: "Золотой",    icon: "🟨", value: "border-left: 4px solid #ffeaa7", cost: 100 },
    { id: "color_black",  type: "cardColor", name: "Черный",     icon: "⬛", value: "border-left: 4px solid #2d3436", cost: 150 },
    { id: "color_grad",   type: "cardColor", name: "Градиент",   icon: "🌈", value: "border-image: linear-gradient(to bottom, #a29bfe, #00b894) 1 100%", cost: 300 },

    // 4. FRAMES
    { id: "frame_simple", type: "frames", name: "Простая",     icon: "📦", cssClass: "frame-simple", cost: 20 },
    { id: "frame_glow",   type: "frames", name: "Светящаяся",  icon: "✨", cssClass: "frame-glow",   cost: 80 },
    { id: "frame_royal",  type: "frames", name: "Королевская", icon: "👑", cssClass: "frame-royal",  cost: 150 },
    { id: "frame_fire",   type: "frames", name: "Огненная",    icon: "🔥", cssClass: "frame-fire",   cost: 200 },

    // 5. TITLES
    { id: "title_novice", type: "titles", name: "Новичок",       icon: "🐣", text: "Новичок",       cost: 10 },
    { id: "title_amateur",type: "titles", name: "Любитель",      icon: "♟️", text: "Любитель",      cost: 30 },
    { id: "title_veteran",type: "titles", name: "Ветеран",       icon: "🎖️", text: "Ветеран",       cost: 100 },
    { id: "title_master", type: "titles", name: "Мастер",        icon: "🎓", text: "Мастер",        cost: 200 },
    { id: "title_gm",     type: "titles", name: "Гроссмейстер",  icon: "🧠", text: "Гроссмейстер",  cost: 500 },
    { id: "title_legend", type: "titles", name: "Легенда",       icon: "🏆", text: "Легенда",       cost: 1000 }
];


/* 
   -----------------------------------------
   SERVER HELPERS (fetch wrappers)
   -----------------------------------------
*/
async function apiFetch(url, options = {}) {
    try {
        const res = await fetch(`${API}${url}`, {
            headers: { "Content-Type": "application/json", ...options.headers },
            ...options
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || "Server error");
        }
        return res.json();
    } catch (e) {
        throw e; 
    }
}

/* 
   -----------------------------------------
   INITIALIZATION
   -----------------------------------------
*/
window.addEventListener("load", async () => {
    try {
        // 1. Загружаем друзей
        try {
            friends = await apiFetch("/api/friends");
        } catch {
            friends = JSON.parse(localStorage.getItem("chessboardFriends") || "[\"just_Cone\",\"MaxMas\",\"aledmap2\",\"Jcoin\"]");
        }

        // 2. Рейтинги
        try {
            const ratingsData = await apiFetch("/api/ratings");
            internalRatings = ratingsData.ratings || {};
            lastRecalc = ratingsData.lastRecalc;
        } catch {
            const saved = localStorage.getItem("internalRatings");
            if (saved) internalRatings = JSON.parse(saved);
        }

        // 3. Загружаем ЭКОНОМИКУ из localStorage
        // В ТЗ сказано "Все данные в localStorage". Можно было бы и на сервер, 
        // но чтобы не ломать серверную часть без доступа к ней, юзаем local
        const savedEconomy = localStorage.getItem("chessEconomy");
        if (savedEconomy) {
            economy = JSON.parse(savedEconomy);
        }
        // Инициализация пустых структур для новых друзей
        initEconomyForFriends();

        syncFriendsWithRatings();

        // 4. Логика пересчета при старте
        if (!lastRecalc || Object.keys(internalRatings).length === 0) {
            await recalculateInternalRatings();
        } else {
            buildLeaderboard();
        }

        updateProfileSelect();
        updateBalanceDisplay();
    } catch (e) {
        console.error("Init error:", e);
    }

    // 5. Чат
    chatChannel.onmessage = () => {
        loadMessages();
        renderMessages();
    };
});

function initEconomyForFriends() {
    friends.forEach(f => {
        if (!economy.pawnBalances[f]) economy.pawnBalances[f] = 0; // Start 0
        if (!economy.inventories[f]) economy.inventories[f] = { badges: [], animations: [], cardColors: [], frames: [], titles: [] };
        if (!economy.equipped[f]) economy.equipped[f] = { badge: null, animation: null, cardColor: null, frame: null, title: null };
        if (!economy.transactions[f]) economy.transactions[f] = [];
    });
    saveEconomy();
}

function saveEconomy() {
    localStorage.setItem("chessEconomy", JSON.stringify(economy));
}

function syncFriendsWithRatings() {
    friends.forEach(f => {
        if (!internalRatings[f]) {
            internalRatings[f] = { 
                rating: STARTING_ELO, 
                trend: "flat", 
                diff: 0, 
                games: 0,
                history: []
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
    
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(el  => el.classList.remove("active"));

    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add("active");
    document.getElementById(`tab-${tabName}`).classList.add("active");

    if (tabName === "history" && !gamesLoaded) loadGamesHistory();
    if (tabName === "activity" && !activityLoaded) loadActivityCalendar();
    if (tabName === "chat") initChat();
    if (tabName === "shop") renderShop("badge"); // default tab
    if (tabName === "profile") {
        const val = document.getElementById("profile-select").value || currentUser || friends[0];
        renderProfile(val);
    }
}

function toggleRatingMode(mode) {
    ratingMode = mode;
    const btn = document.getElementById("recalc-btn");
    if (btn) btn.style.display = (mode === "internal") ? "block" : "none";
    buildLeaderboard();
}

/* 
   -----------------------------------------
   LEADERBOARD 
   -----------------------------------------
*/
async function getPlayerData(username) {
    try {
        const response = await fetch(`https://lichess.org/api/user/${username}`);
        if (!response.ok) throw new Error("User not found");
        const data = await response.json();
        return {
            username: data.username,
            url: `https://lichess.org/@/${data.username}`,
            online: data.online || false,
            rapid: data.perfs?.rapid?.rating || 0,
            blitz: data.perfs?.blitz?.rating || 0,
            bullet: data.perfs?.bullet?.rating || 0
        };
    } catch (error) {
        return { username: username, url: `https://lichess.org/@/${username}`, online: false, rapid: "?", blitz: "?", bullet: "?" };
    }
}

async function buildLeaderboard() {
    const tableHead = document.querySelector("#main-table thead");
    const tableBody = document.getElementById("table-body");

    // Headers
    if (ratingMode === "lichess") {
        tableHead.innerHTML = `
            <tr>
                <th style="width: 50px;">#</th>
                <th>Игрок</th>
                <th style="width: 80px;" class="sortable active" onclick="sortLichessTable('rapid')" data-sort="rapid">Rapid</th>
                <th style="width: 80px;" class="sortable" onclick="sortLichessTable('blitz')" data-sort="blitz">Blitz</th>
                <th style="width: 80px;" class="sortable" onclick="sortLichessTable('bullet')" data-sort="bullet">Bullet</th>
            </tr>`;
    } else {
        tableHead.innerHTML = `
            <tr>
                <th style="width: 50px;">#</th>
                <th>Игрок</th>
                <th style="width: 120px;">Рейтинг (ELO)</th>
                <th style="width: 50px;">Игр</th>
                <th style="width: 50px;">Пешки</th>
            </tr>`;
    }

    // Body
    if (ratingMode === "lichess") {
        if (playersData.length === 0 || playersData.length !== friends.length) {
            tableBody.innerHTML = "<tr><td colspan='5' class='loading'>Загрузка данных Lichess...</td></tr>";
            const promises = friends.map(f => getPlayerData(f));
            playersData = await Promise.all(promises);
        }
        renderLichessTable(tableBody);
    } else {
        renderInternalTable(tableBody);
    }
}

function renderLichessTable(tbody) {
    if (!tbody) tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    const sortMode = localStorage.getItem("lichessSortMode") || "rapid";
    sortLichessTable(sortMode, false);
}

function sortLichessTable(mode, updateUI = true) {
    if (ratingMode !== "lichess") return;
    localStorage.setItem("lichessSortMode", mode);
    playersData.sort((a, b) => {
        const valA = (a[mode] === "?" || a[mode] === undefined) ? -1 : a[mode];
        const valB = (b[mode] === "?" || b[mode] === undefined) ? -1 : b[mode];
        return valB - valA;
    });

    if (updateUI) {
         document.querySelectorAll("th.sortable").forEach(th => {
             if (th.dataset.sort === mode) th.classList.add("active");
             else th.classList.remove("active");
         });
    }

    const tbody = document.getElementById("table-body");
    tbody.innerHTML = "";
    
    playersData.forEach((player, index) => {
        // Получаем экипировку
        const eq = economy.equipped[player.username] || {};
        
        // Применяем стили экипировки
        let nameHtml = player.username;
        if (eq.animation) {
            const animItem = SHOP_ITEMS.find(i => i.id === eq.animation);
            if (animItem) nameHtml = `<span class="${animItem.cssClass}">${player.username}</span>`;
        }
        if (eq.badge) {
            const badgeItem = SHOP_ITEMS.find(i => i.id === eq.badge);
            if (badgeItem) nameHtml = `${badgeItem.icon} ${nameHtml}`;
        }
        if (eq.title) {
            nameHtml += ` <small style="color:#636e72">[${eq.title}]</small>`;
        }
        
        // Цвет карточки
        let style = "";
        if (eq.cardColor) {
            const colorItem = SHOP_ITEMS.find(i => i.id === eq.cardColor);
            if (colorItem) style = `style="${colorItem.value}"`;
        }
        
        const row = document.createElement("tr");
        if (style) row.innerHTML = `<td colspan="5" style="padding:0"><div ${style} style="display:flex; width:100%; padding: 12px 15px;">...</div></td>`; // Hacky way for row styling or just style TD
        // Better way:
        row.innerHTML = `
            <td ${style}><span class="place">#${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <span class="status-indicator ${player.online ? "online" : "offline"}"></span>
                    <a href="${player.url}" target="_blank" class="username">${nameHtml}</a>
                </div>
            </td>
            <td class="rating">${player.rapid}</td>
            <td class="rating">${player.blitz}</td>
            <td class="rating">${player.bullet}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderInternalTable(tbody) {
    if (!tbody) tbody = document.getElementById("table-body");
    tbody.innerHTML = "";

    let sorted = friends.map(f => {
        const stats = internalRatings[f] || { rating: 100, trend: "flat", diff: 0, games: 0 };
        return { name: f, ...stats };
    });
    sorted.sort((a, b) => b.rating - a.rating);

    sorted.forEach((player, index) => {
        const eq = economy.equipped[player.name] || {};
        
        let nameHtml = player.name;
        if (eq.animation) {
            const animItem = SHOP_ITEMS.find(i => i.id === eq.animation);
            if (animItem) nameHtml = `<span class="${animItem.cssClass}">${player.name}</span>`;
        }
        if (eq.badge) {
            const badgeItem = SHOP_ITEMS.find(i => i.id === eq.badge);
            if (badgeItem) nameHtml = `${badgeItem.icon} ${nameHtml}`;
        }
        if (eq.title) {
            nameHtml += ` <small style="color:#636e72; font-size:10px;">${eq.title}</small>`;
        }
        
        let style = "";
        if (eq.cardColor) {
            const colorItem = SHOP_ITEMS.find(i => i.id === eq.cardColor);
            if (colorItem) style = `style="${colorItem.value}"`;
        }

        let icon = "";
        let iconClass = "trend-flat";
        if (player.trend === "up")   { icon = ""; iconClass = "trend-up"; }
        if (player.trend === "down") { icon = ""; iconClass = "trend-down"; }

        let diffSign = player.diff > 0 ? "+" : "";
        let diffClass = "diff-neutral";
        if (player.diff > 0) diffClass = "diff-positive";
        if (player.diff < 0) diffClass = "diff-negative";
        
        const diffHTML = (player.games > 0 && player.diff !== 0) 
            ? `<span class="elo-diff ${diffClass}">(${diffSign}${player.diff})</span>`
            : "";
        
        const ratingDisplay = (player.games === 0) 
            ? `<span style="color:#636e72;">100 (нет игр)</span>`
            : `<strong>${Math.round(player.rating)}</strong> ${diffHTML}`;

        const pawns = economy.pawnBalances[player.name] || 0;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td ${style}><span class="place">#${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <a href="https://lichess.org/@/${player.name}" target="_blank" class="username">${nameHtml}</a>
                </div>
            </td>
            <td>
                <span class="trend-icon ${iconClass}">${icon}</span>
                ${ratingDisplay}
            </td>
            <td>${player.games}</td>
            <td>${pawns} ♟️</td>
        `;
        tbody.appendChild(row);
    });
}

/* 
   -----------------------------------------
   INTERNAL ELO + ECONOMY LOGIC
   -----------------------------------------
*/
// Парсинг NDJSON
function parseNDJSON(text) {
    return text.trim().split("\n")
        .filter(line => line.trim())
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(item => item !== null);
}

async function recalculateInternalRatings() {
    if (ratingMode !== "internal") return;
    const loadingOverlay = document.getElementById("rating-loading");
    const loadingText = document.getElementById("rating-loading-text");
    loadingOverlay.style.display = "flex";
    loadingText.innerText = "Загрузка партий и расчет экономики...";

    try {
        // Reset ratings
        friends.forEach(f => {
            internalRatings[f] = { rating: STARTING_ELO, trend: "flat", diff: 0, games: 0, history: [] };
            economy.pawnBalances[f] = 0; // Reset pawns on recalc
        });

        const allGamesPromises = friends.map(f => fetch(
            `https://lichess.org/api/games/user/${f}?max=100`, 
            { headers: { "Accept": "application/x-ndjson" } }
        ).then(res => res.text()).then(txt => parseNDJSON(txt)));

        const results = await Promise.all(allGamesPromises);
        
        let allGames = [];
        const seenIds = new Set();
        const friendsLower = friends.map(f => f.toLowerCase());

        results.forEach(userGames => {
            userGames.forEach(g => {
                if (!seenIds.has(g.id)) {
                    const w = g.players?.white?.user?.name?.toLowerCase();
                    const b = g.players?.black?.user?.name?.toLowerCase();
                    if (w && b && friendsLower.includes(w) && friendsLower.includes(b)) {
                        seenIds.add(g.id);
                        allGames.push(g);
                    }
                }
            });
        });

        allGames.sort((a, b) => a.createdAt - b.createdAt);

        // Calculate ELO
        allGames.forEach(game => processGameForELO(game));

        // Calculate Economy (Pawns) for each player separately based on sorted games
        friends.forEach(f => {
            const playerGames = allGames.filter(g => {
                const w = g.players.white.user.name.toLowerCase();
                const b = g.players.black.user.name.toLowerCase();
                return w === f.toLowerCase() || b === f.toLowerCase();
            });
            economy.pawnBalances[f] = calculatePawnsForPlayer(f, playerGames);
        });

        // Save
        if (!IS_LOCAL) {
            await apiFetch("/api/ratings", {
                method: "POST",
                body: JSON.stringify({ ratings: internalRatings })
            });
        }
        localStorage.setItem("internalRatings", JSON.stringify(internalRatings));
        saveEconomy();
        
        buildLeaderboard();
        updateBalanceDisplay();

    } catch (e) {
        console.error(e);
        alert("Ошибка: " + e.message);
    } finally {
        loadingOverlay.style.display = "none";
    }
}

function processGameForELO(game) {
    const wNameRaw = game.players.white.user.name;
    const bNameRaw = game.players.black.user.name;
    const whitePlayer = friends.find(f => f.toLowerCase() === wNameRaw.toLowerCase());
    const blackPlayer = friends.find(f => f.toLowerCase() === bNameRaw.toLowerCase());

    if (!whitePlayer || !blackPlayer) return;

    const wStat = internalRatings[whitePlayer];
    const bStat = internalRatings[blackPlayer];

    const Rw = wStat.rating;
    const Rb = bStat.rating;

    let scoreW = 0.5;
    if (game.winner === "white") scoreW = 1;
    if (game.winner === "black") scoreW = 0;

    const ExpectedW = 1 / (1 + Math.pow(10, (Rb - Rw) / 400));
    const ExpectedB = 1 / (1 + Math.pow(10, (Rw - Rb) / 400));

    const newRw = Rw + K_FACTOR * (scoreW - ExpectedW);
    const scoreB = 1 - scoreW;
    const newRb = Rb + K_FACTOR * (scoreB - ExpectedB);

    wStat.diff = Math.round(newRw - Rw);
    bStat.diff = Math.round(newRb - Rb);
    wStat.rating = newRw;
    bStat.rating = newRb;
    wStat.games++;
    bStat.games++;

    if (!wStat.history) wStat.history = [];
    if (!bStat.history) bStat.history = [];
    wStat.history.push(newRw);
    bStat.history.push(newRb);
    if (wStat.history.length > 5) wStat.history.shift();
    if (bStat.history.length > 5) bStat.history.shift();

    wStat.trend = calculateTrend(wStat);
    bStat.trend = calculateTrend(bStat);
}

function calculateTrend(playerStats) {
    if (playerStats.games < 5 || playerStats.history.length < 2) return "flat";
    const current = playerStats.rating;
    const old = playerStats.history[0];
    if (current > old + 2) return "up";
    if (current < old - 2) return "down";
    return "flat";
}

/* 
   -----------------------------------------
   ECONOMY LOGIC
   -----------------------------------------
*/
function calculatePawnsForPlayer(username, games) {
    let pawns = 0;
    let currentWinStreak = 0;
    let lastGameDate = null;
    const uLower = username.toLowerCase();

    // Sort already done, but just in case
    games.sort((a, b) => a.createdAt - b.createdAt);

    games.forEach(game => {
        const white = game.players.white.user.name.toLowerCase();
        const black = game.players.black.user.name.toLowerCase();
        const amIWhite = white === uLower;
        
        let result = "draw"; // draw
        if (game.winner) {
            if ((game.winner === "white" && amIWhite) || (game.winner === "black" && !amIWhite)) {
                result = "win";
            } else {
                result = "loss";
            }
        }

        // 1. Base Points
        if (result === "win") pawns += 10;
        else if (result === "draw") pawns += 3;
        else if (result === "loss") pawns += 1;

        // 2. Streaks
        if (result === "win") {
            currentWinStreak++;
            if (currentWinStreak === 3) pawns += 20;
            if (currentWinStreak === 5) pawns += 50;
        } else {
            currentWinStreak = 0;
        }

        // 3. First game of day
        const gameDate = new Date(game.createdAt).toDateString();
        if (gameDate !== lastGameDate) {
            pawns += 5; // Bonus for first game
            lastGameDate = gameDate;
        }
    });

    return pawns;
}

function updateBalanceDisplay() {
    // Получаем текущего пользователя чата или первого из списка
    const user = currentUser || friends[0];
    const bal = economy.pawnBalances[user] || 0;
    const el = document.getElementById("shop-balance-amount");
    if (el) el.innerText = bal;
}

/* 
   -----------------------------------------
   PROFILE & SHOP UI
   -----------------------------------------
*/
function updateProfileSelect() {
    const sel = document.getElementById("profile-select");
    if (!sel) return;
    sel.innerHTML = "";
    friends.forEach(f => {
        const op = document.createElement("option");
        op.value = f; op.text = f;
        if (currentUser === f) op.selected = true;
        sel.appendChild(op);
    });
}

function renderProfile(targetUser) {
    const container = document.getElementById("profile-card-container");
    if (!container) return;
    
    // Stats
    const stats = internalRatings[targetUser] || { rating: 100, games: 0 };
    const balance = economy.pawnBalances[targetUser] || 0;
    const eq = economy.equipped[targetUser] || {};
    
    // Apply frame style
    let frameClass = "";
    if (eq.frame) {
        const fItem = SHOP_ITEMS.find(i => i.id === eq.frame);
        if (fItem) frameClass = fItem.cssClass;
    }

    container.innerHTML = `
        <div class="profile-card ${frameClass}">
            <div class="profile-header">
                <div class="profile-avatar-section">
                    <div class="profile-avatar">${eq.badge ? (SHOP_ITEMS.find(i=>i.id===eq.badge)?.icon || "👤") : "👤"}</div>
                    <div class="profile-name-block">
                        <h2>
                            ${targetUser} 
                            ${eq.animation ? `<small style="font-size:12px">(${SHOP_ITEMS.find(i=>i.id===eq.animation)?.name})</small>` : ""}
                        </h2>
                        ${eq.title ? `<div class="profile-title">${eq.title}</div>` : ""}
                    </div>
                </div>
                <div class="profile-balance-box">
                    <div class="pawn-balance-big">${balance} ♟️</div>
                    <small>Баланс</small>
                </div>
            </div>

            <div class="section-title">Статистика</div>
            <div class="profile-stats-grid">
                <div class="stat-item"><span class="stat-label">Рейтинг (внутр.)</span> <span class="stat-val">${Math.round(stats.rating)}</span></div>
                <div class="stat-item"><span class="stat-label">Игр сыграно</span> <span class="stat-val">${stats.games}</span></div>
                <!-- TODO: Detailed stats like Wins/Losses require parsing history -->
            </div>

            <div class="section-title">Инвентарь</div>
            <div class="active-items-row">
                 <button class="inventory-btn" onclick="openInventory(\'badge\', \'${targetUser}\')">Значок: ${eq.badge ? unescape(SHOP_ITEMS.find(i=>i.id==eq.badge)?.icon) : "—"}</button>
                 <button class="inventory-btn" onclick="openInventory(\'animation\', \'${targetUser}\')">Анимация: ${eq.animation ? "Вкл" : "—"}</button>
                 <button class="inventory-btn" onclick="openInventory(\'cardColor\', \'${targetUser}\')">Карточка: ${eq.cardColor ? "Цвет" : "—"}</button>
                 <button class="inventory-btn" onclick="openInventory(\'frames\', \'${targetUser}\')">Рамка: ${eq.frame ? "Вкл" : "—"}</button>
            </div>
            
            ${currentUser === targetUser ? `<p style="text-align:center; font-size:10px; color:#636e72;">Нажмите на кнопку выше, чтобы надеть/снять</p>` : ""}
        </div>
    `;
}

// category: badge, animation, cardColor, frames, titles
function filterShop(category) {
    document.querySelectorAll(".shop-tab-btn").forEach(b => b.classList.remove("active"));
    event.target.classList.add("active");
    renderShop(category);
}

function renderShop(category) {
    const container = document.getElementById("shop-container");
    container.innerHTML = "";

    const user = currentUser || friends[0]; 
    const inventory = economy.inventories[user] || { badges:[], animations:[], cardColors:[], frames:[], titles:[] };
    const myBalance = economy.pawnBalances[user] || 0;

    const items = SHOP_ITEMS.filter(i => i.type === category);

    items.forEach(item => {
        // Map category to inventory key
        let invKey = "";
        if (category === "badge") invKey = "badges";
        else if (category === "animation") invKey = "animations";
        else if (category === "cardColor") invKey = "cardColors";
        else if (category === "frames") invKey = "frames";
        else if (category === "titles") invKey = "titles";

        const isOwned = inventory[invKey]?.includes(item.id);
        const canAfford = myBalance >= item.cost;
        
        let previewHTML = "";
        if (item.icon) previewHTML = `<div class="shop-icon-preview">${item.icon}</div>`;
        if (category === "cardColor") {
             previewHTML = `<div style="height:40px; width:40px; margin:0 auto 10px; background:#2d3436; ${item.value}"></div>`;
        }

        const card = document.createElement("div");
        card.className = "shop-item-card";
        card.innerHTML = `
            ${previewHTML}
            <div class="shop-item-name">${item.name}</div>
            <div class="shop-item-cost">${item.cost} ♟️</div>
            ${isOwned 
                ? `<span class="owned-badge">Куплено</span>` 
                : `<button class="buy-btn" onclick="buyItem('${item.id}', ${item.cost})" ${canAfford ? "" : "disabled"}>Купить</button>`
            }
        `;
        container.appendChild(card);
    });
}

function buyItem(itemId, cost) {
    const user = currentUser || friends[0];
    if (!currentUser) {
         if (!confirm(`Вы не авторизованы в чате. Купить для ${user}?`)) return;
    }

    if (economy.pawnBalances[user] < cost) {
        alert("Недостаточно пешек!");
        return;
    }

    // Deduct
    economy.pawnBalances[user] -= cost;

    // Add to inventory
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    let invKey = "";
    if (item.type === "badge") invKey = "badges";
    else if (item.type === "animation") invKey = "animations";
    else if (item.type === "cardColor") invKey = "cardColors";
    else if (item.type === "frames") invKey = "frames";
    else if (item.type === "titles") invKey = "titles";

    if (!economy.inventories[user][invKey].includes(itemId)) {
        economy.inventories[user][invKey].push(itemId);
    }

    // Save
    saveEconomy();
    updateBalanceDisplay();
    // Re-render shop
    const activeTab = document.querySelector(".shop-tab-btn.active");
    if (activeTab) activeTab.click(); 
    else renderShop("badge");
    
    // Refresh profile if open
    if (currentTab === "profile") {
        renderProfile(user);
    }
}

// Inventory Modal
function openInventory(category, targetUser) {
    if (currentUser && currentUser !== targetUser) {
        alert("Вы можете менять экипировку только себе!");
        return;
    }
    
    document.getElementById("inventory-modal").classList.add("active");
    const container = document.getElementById("inventory-container");
    container.innerHTML = "";
    
    const user = targetUser;
    const itemsOwned = getOwnedItems(user, category);
    const currentlyEquipped = economy.equipped[user][category];

    // "None" option
    const noneDiv = document.createElement("div");
    noneDiv.className = `inv-item ${!currentlyEquipped ? "equipped" : ""}`;
    noneDiv.innerHTML = "<div>🚫</div><div>Снять</div>";
    noneDiv.onclick = () => equipItem(user, category, null);
    container.appendChild(noneDiv);

    itemsOwned.forEach(itemId => {
        const itemDef = SHOP_ITEMS.find(i => i.id === itemId);
        if (!itemDef) return;
        
        const div = document.createElement("div");
        div.className = `inv-item ${currentlyEquipped === itemId ? "equipped" : ""}`;
        div.innerHTML = `<div>${itemDef.icon || "📦"}</div><div>${itemDef.name}</div>`;
        div.onclick = () => equipItem(user, category, itemId);
        container.appendChild(div);
    });
}

function getOwnedItems(user, category) {
    let invKey = "";
    if (category === "badge") invKey = "badges";
    else if (category === "animation") invKey = "animations";
    else if (category === "cardColor") invKey = "cardColors";
    else if (category === "frames") invKey = "frames";
    else if (category === "titles") invKey = "titles"; // Note: mapped "title" -> "titles" in SHOP_ITEMS const? YES type: "titles"
    
    return economy.inventories[user][invKey] || [];
}

function equipItem(user, category, itemId) {
    // category mapping (inventory keys are plural, equipped keys are singular)
    // equip keys: badge, animation, cardColor, frame, title
    // passing "frames" -> "frame"
    let equipKey = category;
    if (category === "frames") equipKey = "frame";
    if (category === "titles") equipKey = "title";
    
    economy.equipped[user][equipKey] = itemId;
    saveEconomy();
    
    // Refresh UI
    document.getElementById("inventory-modal").classList.remove("active");
    renderProfile(user);
}


/* 
   -----------------------------------------
   ACTIVITY CALENDAR
   -----------------------------------------
*/
async function loadActivityCalendar() {
    activityLoaded = true;
    const container = document.getElementById("activity-list");
    container.innerHTML = `<p style="text-align:center;">Загрузка активности (последние 90 дней)...</p>`;
    const cutoffDate = Date.now() - (90 * 24 * 60 * 60 * 1000);

    const promises = friends.map(async (friend) => {
        try {
            const response = await fetch(
                `https://lichess.org/api/games/user/${friend}?since=${cutoffDate}&max=300`, 
                { headers: { "Accept": "application/x-ndjson" } }
            );
            if (!response.ok) return { name: friend, games: [] };
            const text = await response.text();
            const games = parseNDJSON(text); 
            return { name: friend, games: games };
        } catch {
            return { name: friend, games: [] };
        }
    });

    const results = await Promise.all(promises);
    container.innerHTML = "";
    results.forEach(res => {
        renderPlayerCalendar(container, res.name, res.games, cutoffDate);
    });
}

function renderPlayerCalendar(container, username, games, cutoffDate) {
    const gamesByDay = {};
    games.forEach(g => {
        const d = new Date(g.createdAt); 
        const dayKey = d.toISOString().split("T")[0]; 
        gamesByDay[dayKey] = (gamesByDay[dayKey] || 0) + 1;
    });

    const today = new Date();
    const startDate = new Date(cutoffDate);
    const dayOfWeek = startDate.getDay(); 
    const diffToMon = (dayOfWeek === 0 ? 6 : dayOfWeek - 1); 
    startDate.setDate(startDate.getDate() - diffToMon);

    const oneDay = 24 * 60 * 60 * 1000;
    
    let htmlGrid = "";
    let totalGames = games.length;
    let current = new Date(startDate);
    
    while (current <= today) {
        const dateStr = current.toISOString().split("T")[0];
        const count = gamesByDay[dateStr] || 0;
        
        let level = 0;
        if (count > 0) level = 1;
        if (count >= 3) level = 2;
        if (count >= 6) level = 3;
        if (count >= 10) level = 4;

        const niceDate = current.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
        const tooltip = `${niceDate}: ${count} партий`;

        htmlGrid += `<div class="day-cell level-${level}" data-tooltip="${tooltip}"></div>`;
        current.setTime(current.getTime() + oneDay);
    }
    
    const card = document.createElement("div");
    card.className = "player-activity-card";
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
   HISTORY & ADD PLAYER
   -----------------------------------------
*/
async function loadGamesHistory() {
    gamesLoaded = true;
    const container = document.getElementById("games-list");
    container.innerHTML = `<p style="text-align:center;">Загрузка истории...</p>`;

    try {
        const allGamesPromises = friends.map(f => fetch(
            `https://lichess.org/api/games/user/${f}?max=20`, 
            { headers: { "Accept": "application/x-ndjson" } }
        ).then(res => res.text()).then(txt => parseNDJSON(txt)));

        const results = await Promise.all(allGamesPromises);
        const friendsLower = friends.map(f => f.toLowerCase());
        const seen = new Set();
        const filtered = [];

        results.forEach(group => {
            group.forEach(game => {
                if (!seen.has(game.id)) {
                    const w = game.players?.white?.user?.name?.toLowerCase();
                    const b = g.players?.black?.user?.name?.toLowerCase(); // bug in logic above fixed here
                    const bCheck = game.players?.black?.user?.name?.toLowerCase();
                    if (w && bCheck && friendsLower.includes(w) && friendsLower.includes(bCheck)) {
                        seen.add(game.id);
                        filtered.push(game);
                    }
                }
            });
        });

        filtered.sort((a, b) => b.createdAt - a.createdAt);
        renderGames(filtered);
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="games-error">Ошибка загрузки</div>`;
    }
}

function renderGames(games) {
    const container = document.getElementById("games-list");
    if (games.length === 0) {
        container.innerHTML = `<div class="games-empty">Нет общих партий</div>`;
        return;
    }

    const html = games.map(game => {
        const white = game.players.white.user.name;
        const black = game.players.black.user.name;
        const winner = game.winner; 
        
        let classW = "game-player";
        let classB = "game-player";
        let cardClass = "draw";

        if (winner === "white") { cardClass = "white-wins"; classW += " winner"; }
        if (winner === "black") { cardClass = "black-wins"; classB += " winner"; }

        // Equip Badges in History
        const wEq = economy.equipped[white] || {};
        const bEq = economy.equipped[black] || {};
        
        let wBadge = ""; if (wEq.badge) { const i = SHOP_ITEMS.find(x=>x.id==wEq.badge); if(i) wBadge = i.icon + " "; }
        let bBadge = ""; if (bEq.badge) { const i = SHOP_ITEMS.find(x=>x.id==bEq.badge); if(i) bBadge = i.icon + " "; }

        return `
        <div class="game-card ${cardClass}">
            <div class="game-meta">
                <span>${new Date(game.createdAt).toLocaleDateString("ru-RU")}</span>
                <span>${game.speed}</span>
            </div>
            <div class="game-players">
                <div class="${classW}">${wBadge}${white} ${winner === "white" ? "<span class=\"winner-mark\">✓</span>" : ""}</div>
                <span class="game-vs">vs</span>
                <div class="${classB}">${bBadge}${black} ${winner === "black" ? "<span class=\"winner-mark\">✓</span>" : ""}</div>
            </div>
            <a href="https://lichess.org/${game.id}" target="_blank" class="watch-btn">Смотреть</a>
        </div>`;
    }).join("");

    container.innerHTML = `<div class="games-container">${html}</div>`;
}

async function addPlayer() {
    const input = document.getElementById("new-username");
    const val = input.value.trim();
    if (!val) return;
    if (friends.some(f => f.toLowerCase() === val.toLowerCase())) { alert("Уже есть"); return; }
    
    try {
        const result = await apiFetch("/api/friends", {
            method: "POST",
            body: JSON.stringify({ username: val })
        });
        friends = result.friends;
    } catch (e) {
        friends.push(val);
        localStorage.setItem("chessboardFriends", JSON.stringify(friends));
    }
    
    initEconomyForFriends();
    syncFriendsWithRatings();
    
    input.value = "";
    gamesLoaded = false; 
    activityLoaded = false;
    playersData = [];
    
    buildLeaderboard();
}

/* 
   -----------------------------------------
   CHAT
   -----------------------------------------
*/
async function initChat() {
    updateLoginSelect();
    const u = localStorage.getItem("chatUser");
    if (u) {
        currentUser = u;
        await loadMessages();
        enableChatInput();
        renderMessages();
    } else {
        document.getElementById("login-modal").classList.add("active");
    }
}

function updateLoginSelect() {
    const sel = document.getElementById("login-select");
    sel.innerHTML = `<option value="" disabled selected>Кто вы?</option>`;
    friends.forEach(f => {
        const op = document.createElement("option");
        op.value = f; op.textContent = f;
        sel.appendChild(op);
    });
}

async function loginChat() {
    const sel = document.getElementById("login-select");
    const inp = document.getElementById("login-input");
    const user = inp.value.trim() || sel.value;

    if (!user) { alert("Введите или выберите ник"); return; }
    
    currentUser = user;
    localStorage.setItem("chatUser", user);
    document.getElementById("login-modal").classList.remove("active");
    await loadMessages();
    enableChatInput();
    renderMessages();
    updateBalanceDisplay();
}

function enableChatInput() {
    const inp = document.getElementById("chat-input");
    const btn = document.getElementById("chat-send-btn");
    inp.disabled = false; btn.disabled = false;
    inp.onkeypress = (e) => { if (e.key === "Enter") sendMessage(); };
}

async function loadMessages() {
    try {
        allMessages = await apiFetch("/api/chat");
    } catch (e) {
        const s = localStorage.getItem("chatMessages");
        allMessages = s ? JSON.parse(s) : [];
    }
}

function renderMessages() {
    const box = document.getElementById("chat-messages");
    if (allMessages.length === 0) {
        box.innerHTML = `<div class="chat-placeholder">Пусто</div>`;
        return;
    }
    box.innerHTML = "";
    allMessages.forEach(msg => {
        const isMine = msg.user === currentUser;
        const div = document.createElement("div");
        div.className = `message ${isMine ? "mine" : "theirs"}`;
        const time = new Date(msg.timestamp).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
        div.innerHTML = `
            <div class="message-meta"><span>${isMine? "Вы" : msg.user}</span> <span>${time}</span></div>
            <div>${msg.text}</div>
        `;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
    const inp = document.getElementById("chat-input");
    const txt = inp.value.trim();
    if (!txt) return;

    const msg = { user: currentUser, text: txt };

    try {
        const saved = await apiFetch("/api/chat", {
            method: "POST",
            body: JSON.stringify(msg)
        });
        allMessages.push(saved);
    } catch (e) {
        const localMsg = { id: Date.now(), user: currentUser, text: txt, timestamp: Date.now() };
        allMessages.push(localMsg);
        localStorage.setItem("chatMessages", JSON.stringify(allMessages));
    }

    inp.value = "";
    renderMessages();
    chatChannel.postMessage({ type: "new_message" });
}

