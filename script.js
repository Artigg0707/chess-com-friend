/* 
    CHESS LEADERBOARD & ECONOMY SYSTEM
    ----------------------------------
    Features: 
    - Lichess API Integration
    - Internal ELO Calculation
    - "Pawns" Currency Economy
    - Shop & Inventory System
    - Activity Calendar
*/

// --- CONFIG & STATE ---
const FRIENDS_KEY = 'chessboardFriends';
const RATINGS_KEY = 'internalRatings';
const CHAT_KEY = 'chatMessages';

// Economy Keys
const PAWN_BALANCES_KEY = 'pawnBalances';
const INVENTORY_KEY = 'userInventory';
const EQUIPPED_KEY = 'equippedItems';
const TRANSACTIONS_KEY = 'transactionHistory';

// Default friends if empty
let friends = JSON.parse(localStorage.getItem(FRIENDS_KEY)) || ['just_Cone', 'MaxMas', 'aledmap2', 'Jcoin'];
let internalRatings = JSON.parse(localStorage.getItem(RATINGS_KEY)) || {};
let chatMessages = JSON.parse(localStorage.getItem(CHAT_KEY)) || [];

// Economy State
let pawnBalances = JSON.parse(localStorage.getItem(PAWN_BALANCES_KEY)) || {};
let userInventory = JSON.parse(localStorage.getItem(INVENTORY_KEY)) || {};
let equippedItems = JSON.parse(localStorage.getItem(EQUIPPED_KEY)) || {};
let transactions = JSON.parse(localStorage.getItem(TRANSACTIONS_KEY)) || {};

let gamesCache = [];
let currentUser = localStorage.getItem('currentUser') || null;

// SHOP CATALOG
const SHOP_ITEMS = [
    // Badges
    { id: 'badge_fire', type: 'badge', name: 'Огонь', icon: '🔥', price: 50 },
    { id: 'badge_bolt', type: 'badge', name: 'Молния', icon: '⚡', price: 50 },
    { id: 'badge_crown', type: 'badge', name: 'Корона', icon: '👑', price: 100 },
    { id: 'badge_diamond', type: 'badge', name: 'Алмаз', icon: '💎', price: 150 },
    { id: 'badge_shark', type: 'badge', name: 'Акула', icon: '🦈', price: 200 },
    { id: 'badge_wizard', type: 'badge', name: 'Маг', icon: '🧙', price: 300 },
    { id: 'badge_dragon', type: 'badge', name: 'Дракон', icon: '🐉', price: 500 },

    // Animations (CSS classes)
    { id: 'anim_shimmer', type: 'effect', name: 'Мерцание', icon: '✨', price: 80, class: 'anim-shimmer' },
    { id: 'anim_wave', type: 'effect', name: 'Волна', icon: '🌊', price: 80, class: 'anim-wave' },
    { id: 'anim_pulse', type: 'effect', name: 'Пульсация', icon: '🔮', price: 100, class: 'anim-pulse' },
    { id: 'anim_rainbow', type: 'effect', name: 'Радуга', icon: '🌈', price: 150, class: 'anim-rainbow' },
    { id: 'anim_fire', type: 'effect', name: 'Огонь', icon: '🔥', price: 250, class: 'anim-fire' },

    // Card Colors (CSS classes)
    { id: 'color_blue', type: 'color', name: 'Синий', icon: '🟦', price: 30, class: 'card-blue' },
    { id: 'color_green', type: 'color', name: 'Зеленый', icon: '🟩', price: 30, class: 'card-green' },
    { id: 'color_purple', type: 'color', name: 'Фиолетовый', icon: '🟪', price: 50, class: 'card-purple' },
    { id: 'color_red', type: 'color', name: 'Красный', icon: '🟥', price: 50, class: 'card-red' },
    { id: 'color_gold', type: 'color', name: 'Золотой', icon: '🟨', price: 100, class: 'card-gold' },
    { id: 'color_black', type: 'color', name: 'Черный', icon: '⬛', price: 150, class: 'card-black' },

    // Titles
    { id: 'title_noob', type: 'title', name: 'Новичок', icon: '🐣', price: 10, text: 'Новичок' },
    { id: 'title_amateur', type: 'title', name: 'Любитель', icon: '🥉', price: 30, text: 'Любитель' },
    { id: 'title_veteran', type: 'title', name: 'Ветеран', icon: '🎖️', price: 100, text: 'Ветеран' },
    { id: 'title_master', type: 'title', name: 'Мастер', icon: '🥋', price: 200, text: 'Мастер' },
    { id: 'title_gm', type: 'title', name: 'Гроссмейстер', icon: '🧠', price: 500, text: 'Гроссмейстер' },
    { id: 'title_legend', type: 'title', name: 'Легенда', icon: '🗿', price: 1000, text: 'Легенда' },
];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    setupTabs();
    setupAdmin();
    setupChat();
    
    // Default load
    fetchLichessRatings(); // Load External
    loadGamesHistory();    // Load Games & Internal logic
    updateShopUI();
    
    // Check local storage init for friends
    if(!localStorage.getItem(FRIENDS_KEY)) {
        localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
    }
});

// --- TABS LOGIC ---
function setupTabs() {
    document.querySelectorAll('.nav-btn, .shop-banner-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let tabId = btn.getAttribute('data-tab');
            if(!tabId && btn.id === 'banner-shop-btn') tabId = 'shop';
            switchTab(tabId);
        });
    });

    // Rating Mode Switch
    document.querySelectorAll('input[name="rating-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'internal') {
                renderInternalTable();
                document.getElementById('recalc-internal-btn').style.display = 'inline-block';
            } else {
                fetchLichessRatings();
                document.getElementById('recalc-internal-btn').style.display = 'none';
            }
        });
    });

    // Recalc Button
    document.getElementById('recalc-internal-btn').addEventListener('click', recalculateInternalRatings);
    
    // Refresh Button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchLichessRatings();
        loadGamesHistory();
    });

    // Filter Games
    document.getElementById('games-filter-select').addEventListener('change', renderGamesList);

    // Profile Select
    document.getElementById('profile-select-user').addEventListener('change', (e) => {
        renderProfile(e.target.value);
    });
}

function switchTab(tabId) {
    if (!tabId) return;
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(nb => nb.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabId}`);
    if(targetTab) targetTab.classList.add('active');

    const targetBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    if(targetBtn) targetBtn.classList.add('active');

    if (tabId === 'activity') loadActivityCalendar();
    
    // Refresh Profile if entered
    if (tabId === 'profile') {
        populateProfileSelector();
        renderProfile(currentUser || friends[0]);
    }

    if (tabId === 'shop') updateShopUI();
}

// --- LOGIN SYSTEM ---
function initLogin() {
    const modal = document.getElementById('login-modal');
    const select = document.getElementById('login-select');
    const input = document.getElementById('login-username');
    const btn = document.getElementById('login-confirm');

    // Populate select
    select.innerHTML = '<option value="">-- Выберите --</option>';
    friends.forEach(f => {
        select.innerHTML += `<option value="${f}">${f}</option>`;
    });

    // Check if logged in
    if (currentUser && friends.includes(currentUser)) {
        modal.classList.remove('active');
        updateMiniProfile();
    } else {
        modal.classList.add('active');
    }

    btn.addEventListener('click', () => {
        const user = select.value || input.value.trim();
        if (user) {
            currentUser = user;
            if (!friends.includes(user)) {
                friends.push(user);
                localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
            }
            localStorage.setItem('currentUser', user);
            
            // Init economy for new user
            if (pawnBalances[user] === undefined) {
                pawnBalances[user] = 0; // Start with 0
                localStorage.setItem(PAWN_BALANCES_KEY, JSON.stringify(pawnBalances));
            }
            
            modal.classList.remove('active');
            updateMiniProfile();
            updateShopUI();
            location.reload(); 
        }
    });
}

function updateMiniProfile() {
    if(!currentUser) return;
    const miniName = document.getElementById('mini-username-display');
    const miniBal = document.getElementById('mini-balance-display');
    
    if(miniName) miniName.textContent = currentUser;
    if(miniBal) miniBal.textContent = pawnBalances[currentUser] || 0;
    
    const banBal = document.getElementById('banner-balance');
    if(banBal) banBal.textContent = pawnBalances[currentUser] || 0;
    
    const shopBal = document.getElementById('shop-user-balance');
    if(shopBal) shopBal.textContent = pawnBalances[currentUser] || 0;
}


// --- 1. LICHESS RATINGS ---
async function fetchLichessRatings() {
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head-row');
    if (!tbody) return;

    // Set Headers
    thead.innerHTML = `
        <th>#</th>
        <th>Игрок</th>
        <th>Rapid</th>
        <th>Blitz</th>
        <th>Bullet</th>
    `;

    document.getElementById('loading-spinner').style.display = 'block';
    tbody.innerHTML = '';

    try {
        const data = await Promise.all(friends.map(username => 
            fetch(`https://lichess.org/api/user/${username}`).then(res => res.json())
        ));

        // Sort by Rapid
        data.sort((a, b) => (b.perfs?.rapid?.rating || 0) - (a.perfs?.rapid?.rating || 0));

        data.forEach((user, index) => {
            if (user.error) return; // Skip if user not found
            
            const equipped = getEquipped(user.username);
            const rowClass = equipped.cardColor ? equipped.cardColor : '';
            
            // Construct Name
            let nameHTML = `<a href="https://lichess.org/@/${user.username}" target="_blank" class="username ${equipped.animation || ''}">${user.username}</a>`;
            if (equipped.badge) nameHTML = `<span class="badge-icon">${equipped.badge}</span> ${nameHTML}`;
            if (equipped.title) nameHTML += `<span class="title-text">${equipped.title}</span>`;

            const row = document.createElement('tr');
            if (rowClass) row.className = rowClass;
            
            row.innerHTML = `
                <td><span class="place">#${index + 1}</span></td>
                <td><div class="player-info">${nameHTML}</div></td>
                <td class="rating">${user.perfs?.rapid?.rating || '-'}</td>
                <td class="rating">${user.perfs?.blitz?.rating || '-'}</td>
                <td class="rating">${user.perfs?.bullet?.rating || '-'}</td>
            `;
            tbody.appendChild(row);
        });
        
        document.getElementById('last-update').textContent = `Обновлено: ${new Date().toLocaleTimeString()}`;
    } catch (e) {
        console.error(e);
    } finally {
        document.getElementById('loading-spinner').style.display = 'none';
    }
}


// --- 2. GAMES & INTERNAL RATING & ECONOMY ---

async function loadGamesHistory() {
    if (friends.length === 0) return;
    document.getElementById('loading-spinner').style.display = 'block';
    
    let allGames = [];
    // 90 days in ms
    const sinceDate = Date.now() - (90 * 24 * 60 * 60 * 1000); 

    try {
        // Fetch for all
        for (const user of friends) {
            try {
                const response = await fetch(`https://lichess.org/api/games/user/${user}?max=60&since=${sinceDate}`, {
                    headers: { 'Accept': 'application/x-ndjson' }
                });
                if(!response.ok) continue;

                const text = await response.text();
                if(!text.trim()) continue;

                const games = text.trim().split('\n').map(JSON.parse);
                allGames = allGames.concat(games);
            } catch(e) { console.warn('Error fetching games for', user); }
        }

        // Deduplicate
        const uniqueGames = [];
        const seen = new Set();
        for (const g of allGames) {
            if (!seen.has(g.id)) {
                seen.add(g.id);
                uniqueGames.push(g);
            }
        }

        // Filter: Friend vs Friend
        gamesCache = uniqueGames.filter(g => {
            const wId = g.players.white.user?.id;
            const bId = g.players.black.user?.id;
            
            // Check if BOTH are in our friends list
            const isFriendW = friends.some(f => f.toLowerCase() === wId);
            const isFriendB = friends.some(f => f.toLowerCase() === bId);
            
            return isFriendW && isFriendB;
        });

        gamesCache.sort((a, b) => b.createdAt - a.createdAt); // newest first
        
        populateFilterSelect();
        renderGamesList();

    } catch (err) {
        console.error("Error loading games", err);
    } finally {
        document.getElementById('loading-spinner').style.display = 'none';
    }
}

function renderGamesList() {
    const list = document.getElementById('games-list');
    const filter = document.getElementById('games-filter-select').value;
    list.innerHTML = '';

    const filtered = (filter === 'all') 
        ? gamesCache 
        : gamesCache.filter(g => 
            g.players.white.user.name === filter || g.players.black.user.name === filter
          );

    filtered.slice(0, 50).forEach(game => { // Limit render size
        const white = game.players.white.user.name;
        const black = game.players.black.user.name;
        const winner = game.winner; 
        
        const wEquip = getEquipped(white);
        const bEquip = getEquipped(black);

        const wDisplay = `${wEquip.badge ? wEquip.badge : ''} ${white} ${wEquip.title ? `[${wEquip.title}]` : ''} ${winner === 'white' ? '<span class="winner-mark">✓</span>' : ''}`;
        const bDisplay = `${bEquip.badge ? bEquip.badge : ''} ${black} ${bEquip.title ? `[${bEquip.title}]` : ''} ${winner === 'black' ? '<span class="winner-mark">✓</span>' : ''}`;

        const card = document.createElement('div');
        const whiteClass = winner === 'white' ? 'winner-text' : '';
        const blackClass = winner === 'black' ? 'winner-text' : '';

        card.className = 'game-card';
        card.innerHTML = `
            <div class="game-meta">
                <span>${new Date(game.createdAt).toLocaleDateString()}</span>
                <span>${game.speed}</span>
            </div>
            <div class="game-players">
                <div class="${whiteClass}">${wDisplay}</div>
                <span class="game-vs">vs</span>
                <div class="${blackClass}">${bDisplay}</div>
            </div>
            <a href="https://lichess.org/${game.id}" target="_blank" class="watch-btn" title="Просмотр">
                <i class="fa-solid fa-eye"></i>
            </a>
        `;
        list.appendChild(card);
    });
}

function populateFilterSelect() {
    const s = document.getElementById('games-filter-select');
    s.innerHTML = '<option value="all">Все партии</option>';
    friends.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        s.appendChild(opt);
    });
}


// --- 3. INTERNAL ELO & PAWN CALCULATION ---

function recalculateInternalRatings() {
    // 1. Reset Stats
    friends.forEach(f => {
        internalRatings[f] = { rating: 100, games: 0, wins: 0, loss: 0, draw: 0 };
    });

    // 2. Prepare new Economy (Reset earned, keep spent)
    // To do this simply: We sort of 'replay' the economy.
    // However, to avoid complexity with existing purchases, we will ADD new earnings to a fresh state 
    // but we must subtract what was arguably "already earned".
    // 
    // SIMPLIFIED APPROACH requested: "Automate charge on recount".
    // We will recalculate TOTAL LIFETIME EARNINGS from games.
    // Current Balance = Lifetime Earnings - Lifetime Spent.
    
    // Calculate total spent so far
    const lifetimeSpent = {};
    friends.forEach(f => {
        lifetimeSpent[f] = 0;
        const hist = transactions[f] || [];
        hist.forEach(t => {
            if(t.type === 'buy') lifetimeSpent[f] += Math.abs(t.cost || t.amount);
        });
    });

    const lifetimeEarned = {};
    friends.forEach(f => lifetimeEarned[f] = 0);
    
    // Streaks
    const streaks = {}; 
    friends.forEach(f => streaks[f] = 0);
    const daily = {}; // key: user_date
    const newTrans = {}; // user -> []
    friends.forEach(f => newTrans[f] = []);

    // Process oldest to newest
    const chronologicalGames = [...gamesCache].sort((a, b) => a.createdAt - b.createdAt);

    chronologicalGames.forEach(game => {
        const w = game.players.white.user.name;
        const b = game.players.black.user.name;
        
        if (!internalRatings[w]) internalRatings[w] = { rating: 100, games:0, wins:0, loss:0, draw:0 };
        if (!internalRatings[b]) internalRatings[b] = { rating: 100, games:0, wins:0, loss:0, draw:0 };

        // ELO
        const Rw = internalRatings[w].rating;
        const Rb = internalRatings[b].rating;
        const K = 32;

        let scoreW = 0.5, scoreB = 0.5;
        let wEarn = 0, bEarn = 0;
        let wDesc = [], bDesc = [];

        if (game.winner === 'white') {
            scoreW = 1; scoreB = 0;
            wEarn += 10; wDesc.push("Победа");
            bEarn += 1;  bDesc.push("Утешение");
            streaks[w]++; streaks[b]=0;

            internalRatings[w].wins++; internalRatings[b].loss++;
        } else if (game.winner === 'black') {
            scoreW = 0; scoreB = 1;
            wEarn += 1;  wDesc.push("Утешение");
            bEarn += 10; bDesc.push("Победа");
            streaks[b]++; streaks[w]=0;

            internalRatings[w].loss++; internalRatings[b].wins++;
        } else {
            wEarn += 3; wDesc.push("Ничья");
            bEarn += 3; bDesc.push("Ничья");
            streaks[w]=0; streaks[b]=0;

            internalRatings[w].draw++; internalRatings[b].draw++;
        }

        internalRatings[w].games++;
        internalRatings[b].games++;

        // Calc Rating
        const Ew = 1 / (1 + Math.pow(10, (Rb - Rw) / 400));
        const Eb = 1 / (1 + Math.pow(10, (Rw - Rb) / 400));
        internalRatings[w].rating = Rw + K * (scoreW - Ew);
        internalRatings[b].rating = Rb + K * (scoreB - Eb);

        // Bonuses
        if(streaks[w] === 3) { wEarn += 20; wDesc.push("Серия 3"); }
        if(streaks[w] === 5) { wEarn += 50; wDesc.push("Серия 5"); }
        if(streaks[b] === 3) { bEarn += 20; bDesc.push("Серия 3"); }
        if(streaks[b] === 5) { bEarn += 50; bDesc.push("Серия 5"); }

        const dateKey = new Date(game.createdAt).toISOString().split('T')[0];
        if(!daily[`${w}_${dateKey}`]) { daily[`${w}_${dateKey}`]=true; wEarn+=5; wDesc.push("1-я игра дня"); }
        if(!daily[`${b}_${dateKey}`]) { daily[`${b}_${dateKey}`]=true; bEarn+=5; bDesc.push("1-я игра дня"); }

        lifetimeEarned[w] += wEarn;
        lifetimeEarned[b] += bEarn;

        // Log Trans logic (recreate earnings history)
        newTrans[w].push({ date: new Date(game.createdAt).toLocaleDateString(), type: 'earn', amount: wEarn, desc: wDesc.join(', ') });
        newTrans[b].push({ date: new Date(game.createdAt).toLocaleDateString(), type: 'earn', amount: bEarn, desc: bDesc.join(', ') });
    });

    // Save Logic
    localStorage.setItem(RATINGS_KEY, JSON.stringify(internalRatings));

    // Update Economy
    friends.forEach(f => {
        // Balance = Earned - Spent
        const earned = lifetimeEarned[f] || 0;
        const spent = lifetimeSpent[f] || 0;
        pawnBalances[f] = earned - spent;

        // Merge Trans history: Existing Purchases + New Earnings history
        const oldPurchases = (transactions[f] || []).filter(t => t.type === 'buy');
        const fullHist = [...(newTrans[f] || []), ...oldPurchases];
        
        // Sort newest first
        fullHist.sort((a,b) => {
             // simplified string sort for date might fail, but acceptable for demo
             return new Date(b.date) - new Date(a.date);
        });
        transactions[f] = fullHist;
    });

    localStorage.setItem(PAWN_BALANCES_KEY, JSON.stringify(pawnBalances));
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));

    renderInternalTable();
    updateMiniProfile();
    alert('Система пересчитана! Рейтинги и Балансы обновлены.');
}

function renderInternalTable() {
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head-row');
    
    thead.innerHTML = `<th>#</th><th>Игрок</th><th>Вн. Рейтинг</th><th>Игр</th><th>Винрейт</th>`;
    tbody.innerHTML = '';

    const sorted = friends.map(f => {
        const stats = internalRatings[f] || { rating: 100, games: 0, wins: 0 };
        return { name: f, ...stats };
    });

    sorted.sort((a, b) => b.rating - a.rating);

    sorted.forEach((p, i) => {
        const winrate = p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0;
        const equipped = getEquipped(p.name);
        const rowClass = equipped.cardColor ? equipped.cardColor : '';

        // Construct Name
        let nameHTML = `<span class="username ${equipped.animation || ''}">${p.name}</span>`;
        if (equipped.badge) nameHTML = `<span class="badge-icon">${equipped.badge}</span> ${nameHTML}`;
        if (equipped.title) nameHTML += `<span class="title-text">${equipped.title}</span>`;

        const row = document.createElement('tr');
        if (rowClass) row.className = rowClass;
        
        row.innerHTML = `
            <td><span class="place">#${i + 1}</span></td>
            <td><div class="player-info">${nameHTML}</div></td>
            <td class="rating"><strong>${Math.round(p.rating)}</strong></td>
            <td>${p.games}</td>
            <td>${winrate}%</td>
        `;
        tbody.appendChild(row);
    });
}


// --- 4. PROFILE & INVENTORY ---

function populateProfileSelector() {
    const s = document.getElementById('profile-select-user');
    s.innerHTML = '';
    friends.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        if (f === currentUser) opt.selected = true;
        s.appendChild(opt);
    });
}

function renderProfile(username) {
    const container = document.getElementById('profile-card-container');
    const stats = internalRatings[username] || { rating: 100, games: 0, wins: 0, loss: 0, draw: 0 };
    const balance = pawnBalances[username] || 0;
    const equipped = getEquipped(username);
    const winrate = stats.games > 0 ? ((stats.wins / stats.games) * 100).toFixed(1) : 0;

    // Apply frame class
    const frameClass = equipped.frame || ''; 
    
    // Apply card color to profile
    if (equipped.cardColor) container.className = `profile-card-large ${equipped.cardColor}`;
    else container.className = 'profile-card-large';

    container.innerHTML = `
        <div class="profile-header-lg">
            <div class="profile-avatar-lg ${frameClass}">
                <i class="fa-solid fa-user"></i>
            </div>
            <div class="profile-main-info">
                <h2>
                    ${equipped.badge ? equipped.badge + ' ' : ''} 
                    <span class="${equipped.animation || ''}">${username}</span>
                </h2>
                ${equipped.title ? `<div style="color:#b2bec3; margin-bottom:5px;">${equipped.title}</div>` : ''}
                <div class="profile-balance">${balance} ♟️</div>
            </div>
        </div>

        <div class="profile-stats-grid">
            <div class="stat-box">
                <div class="stat-value">${Math.round(stats.rating)}</div>
                <div class="stat-label">Вн. Рейтинг</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${stats.games}</div>
                <div class="stat-label">Партий</div>
            </div>
            <div class="stat-box stat-win">
                <div class="stat-value">${stats.wins}</div>
                <div class="stat-label">Побед</div>
            </div>
            <div class="stat-box stat-loss">
                <div class="stat-value">${stats.loss}</div>
                <div class="stat-label">Поражений</div>
            </div>
             <div class="stat-box">
                <div class="stat-value">${winrate}%</div>
                <div class="stat-label">Винрейт</div>
            </div>
        </div>
    `;

    renderInventory(username);
    renderTransactions(username);
}

function renderInventory(username) {
    const isMe = (username === currentUser);
    const invDiv = document.getElementById('inventory-container');
    invDiv.innerHTML = '';

    const myInv = userInventory[username] || { badges: [], effects: [], colors: [], titles: [] };
    const myEq = equippedItems[username] || {};

    const renderItems = (itemIds, type) => {
        if(!itemIds) return;
        itemIds.forEach(id => {
            const shopItem = SHOP_ITEMS.find(i => i.id === id);
            if (!shopItem) return;

            // Determine what Value is stored in Equipped
            const val = shopItem.type === 'color' || shopItem.type === 'effect' ? shopItem.class : (shopItem.text || shopItem.icon);
            
            // Check if active (we store id or value in equipped? Let's check logic toggleEquip)
            // In toggleEquip we stored VALUE. So compare VALUE.
            const isActive = (myEq[type] === val);

            const el = document.createElement('div');
            el.className = `inv-item ${isActive ? 'equipped' : ''}`;
            el.innerHTML = shopItem.icon;
            el.title = shopItem.name;
            
            if (isMe) {
                el.onclick = () => { toggleEquip(type, val); };
            }
            invDiv.appendChild(el);
        });
    };

    renderItems(myInv.badges, 'badge');
    renderItems(myInv.effects, 'animation');
    renderItems(myInv.colors, 'cardColor');
    renderItems(myInv.titles, 'title');
    
    if (invDiv.children.length === 0) {
        invDiv.innerHTML = '<div style="color:#636e72; font-size:12px; grid-column:1/-1;">Пусто...</div>';
    }
}

function toggleEquip(type, value) {
    if (!currentUser) return;
    
    const eq = equippedItems[currentUser] || {};
    
    // Toggle
    if (eq[type] === value) {
        eq[type] = null;
    } else {
        eq[type] = value;
    }
    
    equippedItems[currentUser] = eq;
    localStorage.setItem(EQUIPPED_KEY, JSON.stringify(equippedItems));
    
    renderProfile(currentUser);
    updateMiniProfile(); 
}

function renderTransactions(username) {
    const list = document.getElementById('transaction-list');
    list.innerHTML = '';
    const hist = transactions[username] || [];
    
    hist.slice(0, 20).forEach(t => {
        const li = document.createElement('li');
        const isPlus = (t.type === 'earn') || (t.amount > 0 && t.type !== 'buy');
        
        li.innerHTML = `
            <span>${t.date} - ${t.desc || t.type} ${t.item ? '('+t.item+')' : ''}</span>
            <span class="${isPlus ? 'trans-positive' : 'trans-negative'}">
                ${isPlus ? '+' : ''}${Math.abs(t.amount || t.cost)}
            </span>
        `;
        list.appendChild(li);
    });
}
function getEquipped(user) {
    return equippedItems[user] || {};
}


// --- 5. SHOP SYSTEM ---

function updateShopUI() {
    if (pawnBalances[currentUser] === undefined) pawnBalances[currentUser] = 0;
    
    const els = ['shop-user-balance', 'banner-balance'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = pawnBalances[currentUser];
    });

    // Filter categories logic
    const btns = document.querySelectorAll('.shop-cat-btn');
    btns.forEach(b => {
        b.onclick = () => {
            btns.forEach(btn => btn.classList.remove('active'));
            b.classList.add('active');
            renderShop(b.getAttribute('data-cat'));
        };
    });

    renderShop('all'); // Render default
}

function renderShop(filter) {
    const grid = document.getElementById('shop-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const userInv = userInventory[currentUser] || { badges:[], effects:[], colors:[], titles:[] };

    SHOP_ITEMS.forEach(item => {
        if (filter !== 'all' && item.type !== filter) return;
        
        let owned = false;
        if (item.type === 'badge' && userInv.badges?.includes(item.id)) owned = true;
        if (item.type === 'effect' && userInv.effects?.includes(item.id)) owned = true;
        if (item.type === 'color' && userInv.colors?.includes(item.id)) owned = true;
        if (item.type === 'title' && userInv.titles?.includes(item.id)) owned = true;

        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `
            <div class="shop-item-icon ${item.class || ''}">${item.icon}</div>
            <div class="shop-item-name">${item.name}</div>
            <div class="shop-item-type">${item.type}</div>
            <div class="shop-price">${item.price} ♟️</div>
            ${ owned 
                ? `<button class="shop-buy-btn" disabled>Куплено</button>`
                : `<button class="shop-buy-btn" onclick="buyItem('${item.id}')">Купить</button>`
            }
        `;
        grid.appendChild(card);
    });
}

window.buyItem = function(itemId) {
    if (!currentUser) { alert('Сначала войдите!'); return; }
    
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (pawnBalances[currentUser] < item.price) {
        alert('Недостаточно пешек!');
        return;
    }

    // Process Buy
    pawnBalances[currentUser] -= item.price;
    localStorage.setItem(PAWN_BALANCES_KEY, JSON.stringify(pawnBalances));

    // Add to Inventory
    if (!userInventory[currentUser]) userInventory[currentUser] = { badges:[], effects:[], colors:[], titles:[] };
    const inv = userInventory[currentUser];

    // Initialize arrays if missing
    if(!inv.badges) inv.badges = [];
    if(!inv.effects) inv.effects = [];
    if(!inv.colors) inv.colors = [];
    if(!inv.titles) inv.titles = [];

    if (item.type === 'badge') inv.badges.push(item.id);
    if (item.type === 'effect') inv.effects.push(item.id);
    if (item.type === 'color') inv.colors.push(item.id);
    if (item.type === 'title') inv.titles.push(item.id);

    localStorage.setItem(INVENTORY_KEY, JSON.stringify(userInventory));

    // Log Transaction
    if (!transactions[currentUser]) transactions[currentUser] = [];
    transactions[currentUser].unshift({
        date: new Date().toLocaleDateString(),
        type: 'buy',
        item: item.name,
        cost: -item.price
    });
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));

    alert(`Поздравляем! Вы купили: ${item.name}`);
    updateShopUI();
    updateMiniProfile();
};


// --- 6. ACTIVITY CALENDAR ---
function loadActivityCalendar() {
    const container = document.getElementById('activity-container');
    container.innerHTML = '';

    friends.forEach(user => {
        const wrapper = document.createElement('div');
        wrapper.className = 'player-activity-card';

        const userGames = gamesCache.filter(g => 
            g.players.white.user.name === user || g.players.black.user.name === user
        );

        const counts = {};
        userGames.forEach(g => {
            const d = new Date(g.createdAt).toISOString().split('T')[0];
            counts[d] = (counts[d] || 0) + 1;
        });

        wrapper.innerHTML = `
            <div class="activity-header">
                <div class="activity-username">${user}</div>
                <div class="activity-stats">
                    <span><strong>${userGames.length}</strong> игр за 90 дней</span>
                </div>
            </div>
        `;
        
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        const today = new Date();
        const days = [];
        for (let i = 0; i < 90; i++) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            days.push(d);
        }
        days.reverse(); 

        days.forEach(date => {
            const key = date.toISOString().split('T')[0];
            const count = counts[key] || 0;
            
            let level = 0;
            if (count >= 1) level = 1;
            if (count >= 3) level = 2;
            if (count >= 5) level = 3;
            if (count >= 8) level = 4;

            const cell = document.createElement('div');
            cell.className = `day-cell level-${level}`;
            cell.setAttribute('data-tooltip', `${key}: ${count}`);
            grid.appendChild(cell);
        });

        wrapper.appendChild(grid);
        container.appendChild(wrapper);
    });
}


// --- 7. ADMIN / CHAT UTILS ---

function setupAdmin() {
    const input = document.getElementById('new-username');
    const updateList = () => {
        const ul = document.getElementById('friends-list');
        ul.innerHTML = '';
        friends.forEach(f => {
            const li = document.createElement('li');
            li.innerHTML = `${f} <span style="cursor:pointer; color:red; float:right;" onclick="removeFriend('${f}')">x</span>`;
            ul.appendChild(li);
        });
    };

    document.getElementById('add-friend-btn').addEventListener('click', () => {
        const val = input.value.trim();
        if (val && !friends.includes(val)) {
            friends.push(val);
            localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
            updateList();
            input.value = '';
        }
    });

    window.removeFriend = function(name) {
        if(confirm(`Удалить ${name}?`)) {
            friends = friends.filter(f => f !== name);
            localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
            updateList();
        }
    };
    
    document.getElementById('reset-all-btn').addEventListener('click', () => {
         if(confirm("ВЫ УВЕРЕНЫ? Это удалит ВСЕ данные.")) {
             localStorage.clear();
             location.reload();
         }
    });

    updateList();
}

function setupChat() {
    const win = document.getElementById('chat-window');
    const inp = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send-btn');

    const renderMsgs = () => {
        if(!win) return;
        win.innerHTML = '';
        chatMessages.forEach(m => {
            const div = document.createElement('div');
            div.className = `message ${m.user === currentUser ? 'mine' : ''}`;
            div.innerHTML = `<strong>${m.user}</strong>: ${m.text}`;
            win.appendChild(div);
        });
        
    };

    const send = () => {
        const text = inp.value.trim();
        if (text && currentUser) {
            chatMessages.push({ user: currentUser, text });
            if (chatMessages.length > 50) chatMessages.shift();
            localStorage.setItem(CHAT_KEY, JSON.stringify(chatMessages));
            inp.value = '';
            renderMsgs();
            
            // Scroll to bottom
            setTimeout(() => win.scrollTop = win.scrollHeight, 50);
        } else if (!currentUser) {
            alert('Сначала войдите!');
        }
    };

    btn.onclick = send;
    inp.onkeypress = (e) => { if(e.key === 'Enter') send(); };
    renderMsgs();
    
    // Poll
    setInterval(() => {
        const fresh = JSON.parse(localStorage.getItem(CHAT_KEY)) || [];
        if (fresh.length !== chatMessages.length) {
            chatMessages = fresh;
            renderMsgs();
            win.scrollTop = win.scrollHeight;
        }
    }, 2000);
}
