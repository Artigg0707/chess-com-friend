/* =============================================
   Chess Leaderboard — script.js
   ============================================= */

(function () {
    'use strict';

    // ===== CONFIG =====
    // New list including j_Cone
    const DEFAULT_FRIENDS = [
        'thcffh',
        'aledmap',
        'Hunster226622',
        'nekoo000',
        'Brdish',
        'j_Cone'
    ];

    // Changed key to force update defaults (v2)
    const STORAGE_KEY_PLAYERS = 'chess_leaderboard_players_v2';
    const STORAGE_KEY_ADMIN = 'chess_leaderboard_admin_hash';
    const STORAGE_KEY_LOGGED = 'chess_leaderboard_logged_in';
    const DEFAULT_PASSWORD = 'admin';

    const DEFAULT_AVATAR = 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#312e2b"/>
            <text x="50" y="58" font-family="sans-serif" font-size="40" fill="#81b64c" text-anchor="middle" dominant-baseline="middle">♟</text>
        </svg>
    `);

    // ===== STATE =====
    let playersData = [];
    let currentSort = 'rapid';

    // ===== DOM ELEMENTS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        loadingSpinner: $('#loading-spinner'),
        tableWrapper: $('#table-wrapper'),
        tableBody: $('#leaderboard-body'),
        lastUpdated: $('#last-updated'),
        refreshBtn: $('#refresh-btn'),
        errorBanner: $('#error-banner'),
        errorText: $('#error-text'),
        adminBtn: $('#admin-btn'),
        // Admin login
        adminLoginOverlay: $('#admin-login-overlay'),
        adminPasswordInput: $('#admin-password-input'),
        adminLoginError: $('#admin-login-error'),
        adminLoginCancel: $('#admin-login-cancel'),
        adminLoginSubmit: $('#admin-login-submit'),
        // Admin panel
        adminPanelOverlay: $('#admin-panel-overlay'),
        adminPanelClose: $('#admin-panel-close'),
        addPlayerInput: $('#add-player-input'),
        addPlayerBtn: $('#add-player-btn'),
        addPlayerError: $('#add-player-error'),
        addPlayerSuccess: $('#add-player-success'),
        adminPlayersList: $('#admin-players-list'),
        adminChangePasswordBtn: $('#admin-change-password-btn'),
        adminLogoutBtn: $('#admin-logout-btn'),
        // Change password
        changePasswordOverlay: $('#change-password-overlay'),
        newPasswordInput: $('#new-password-input'),
        confirmPasswordInput: $('#confirm-password-input'),
        changePasswordError: $('#change-password-error'),
        changePasswordCancel: $('#change-password-cancel'),
        changePasswordSubmit: $('#change-password-submit'),
        // Sort headers
        thRapid: $('#th-rapid'),
        thBlitz: $('#th-blitz'),
        thBullet: $('#th-bullet'),
    };

    // ===== UTILS =====
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + '_chess_leaderboard_salt');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Helper: Fetch with timeout
    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 8000 } = options;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }

    // ===== STORAGE =====
    function getPlayers() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_PLAYERS);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { console.error('Storage error', e); }

        // If no stored players (or old version), init with default
        savePlayers(DEFAULT_FRIENDS);
        return [...DEFAULT_FRIENDS];
    }

    function savePlayers(players) {
        localStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(players));
    }

    async function getAdminHash() {
        const stored = localStorage.getItem(STORAGE_KEY_ADMIN);
        if (stored) return stored;
        const defaultHash = await hashPassword(DEFAULT_PASSWORD);
        localStorage.setItem(STORAGE_KEY_ADMIN, defaultHash);
        return defaultHash;
    }

    function isLoggedIn() {
        return sessionStorage.getItem(STORAGE_KEY_LOGGED) === 'true';
    }

    function setLoggedIn(val) {
        if (val) sessionStorage.setItem(STORAGE_KEY_LOGGED, 'true');
        else sessionStorage.removeItem(STORAGE_KEY_LOGGED);
    }

    // ===== CHESS.COM API =====
    async function fetchPlayerData(username) {
        try {
            const [profileRes, statsRes] = await Promise.all([
                fetchWithTimeout(`https://api.chess.com/pub/player/${username.toLowerCase()}`),
                fetchWithTimeout(`https://api.chess.com/pub/player/${username.toLowerCase()}/stats`),
            ]);

            if (!profileRes.ok) {
                throw new Error(`Player ${username} not found (Status: ${profileRes.status})`);
            }

            const profile = await profileRes.json();
            const stats = statsRes.ok ? await statsRes.json() : {};

            const getRating = (mode) => {
                if (stats[mode] && stats[mode].last && stats[mode].last.rating) {
                    return stats[mode].last.rating;
                }
                return null;
            };

            return {
                username: profile.username || username,
                avatar: profile.avatar || DEFAULT_AVATAR,
                url: profile.url || `https://www.chess.com/member/${username}`,
                rapid: getRating('chess_rapid'),
                blitz: getRating('chess_blitz'),
                bullet: getRating('chess_bullet'),
            };
        } catch (err) {
            console.error(`Error fetching ${username}:`, err);
            throw err;
        }
    }

    async function fetchAllPlayers() {
        const players = getPlayers();
        console.log("Loading players list:", players);

        const results = await Promise.allSettled(
            players.map(username => fetchPlayerData(username))
        );

        const successData = [];
        const errors = [];

        results.forEach((result, i) => {
            if (result.status === 'fulfilled') {
                successData.push(result.value);
            } else {
                errors.push(players[i]);
                console.warn(`Failed to load ${players[i]}:`, result.reason);
            }
        });

        return { data: successData, errors };
    }

    // ===== SORTING =====
    function sortPlayers(data, mode) {
        return [...data].sort((a, b) => {
            const aVal = a[mode] ?? -1;
            const bVal = b[mode] ?? -1;
            return bVal - aVal;
        });
    }

    function updateSortHeaders(mode) {
        currentSort = mode;
        $$('.sortable').forEach(th => {
            const arrow = th.querySelector('.sort-arrow');
            const isActive = th.dataset.sort === mode;
            th.classList.toggle('active-sort', isActive);
            if (arrow) arrow.classList.toggle('active', isActive);
        });
    }

    // ===== RENDERING =====
    function renderTable(data) {
        const sorted = sortPlayers(data, currentSort);
        dom.tableBody.innerHTML = '';

        if (!data || data.length === 0) {
            dom.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#6b6560;">Нет данных для отображения</td></tr>';
            return;
        }

        sorted.forEach((player, idx) => {
            const rank = idx + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="rank-cell ${rankClass}">
                    <span class="rank-badge">${rank}</span>
                </td>
                <td>
                    <div class="player-cell">
                        <img class="player-avatar"
                             src="${player.avatar}"
                             alt="${player.username}"
                             onerror="this.src='${DEFAULT_AVATAR}'"
                             loading="lazy">
                        <a class="player-link" href="${player.url}" target="_blank" rel="noopener">
                            ${player.username}
                        </a>
                    </div>
                </td>
                <td class="rating-cell ${player.rapid == null ? 'no-rating' : (currentSort === 'rapid' ? 'highlight' : '')}">
                    ${player.rapid != null ? player.rapid : '—'}
                </td>
                <td class="rating-cell ${player.blitz == null ? 'no-rating' : (currentSort === 'blitz' ? 'highlight' : '')}">
                    ${player.blitz != null ? player.blitz : '—'}
                </td>
                <td class="rating-cell ${player.bullet == null ? 'no-rating' : (currentSort === 'bullet' ? 'highlight' : '')}">
                    ${player.bullet != null ? player.bullet : '—'}
                </td>
            `;
            dom.tableBody.appendChild(tr);
        });
    }

    function showLoading() {
        if (dom.loadingSpinner) dom.loadingSpinner.style.display = '';
        if (dom.tableWrapper) dom.tableWrapper.style.display = 'none';
        if (dom.errorBanner) dom.errorBanner.classList.add('hidden');
    }

    function showTable() {
        if (dom.loadingSpinner) dom.loadingSpinner.style.display = 'none';
        if (dom.tableWrapper) dom.tableWrapper.style.display = '';
    }

    function showError(message) {
        if (dom.errorText) dom.errorText.textContent = message;
        if (dom.errorBanner) dom.errorBanner.classList.remove('hidden');
    }

    function hideError() {
        if (dom.errorBanner) dom.errorBanner.classList.add('hidden');
    }

    function updateTimestamp() {
        if (!dom.lastUpdated) return;
        const now = new Date();
        const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        dom.lastUpdated.textContent = `Обновлено: ${date}, ${time}`;
    }

    // ===== MAIN LOAD =====
    async function loadLeaderboard() {
        showLoading();
        hideError();
        if (dom.refreshBtn) dom.refreshBtn.classList.add('spinning');

        try {
            // Add slight delay to ensure UI updates before heavy processing
            await new Promise(r => setTimeout(r, 100));

            const { data, errors } = await fetchAllPlayers();
            playersData = data;

            // Always try to show table if we have at least ONE player
            if (data.length > 0) {
                renderTable(data);
                showTable();
            } else {
                // No data at all
                showError('Не удалось загрузить данные ни одного игрока.');
                if (dom.loadingSpinner) dom.loadingSpinner.style.display = 'none';
            }

            // Show partial errors if any
            if (errors.length > 0) {
                const errorMsg = `Не удалось загрузить: ${errors.join(', ')}`;
                if (data.length > 0) {
                    // Show as small error but keep table
                    showError(errorMsg + ' (показаны остальные)');
                } else {
                    showError(errorMsg);
                }
            }

            updateTimestamp();
        } catch (err) {
            showError('Ошибка загрузки. Проверьте подключение к интернету.');
            if (dom.loadingSpinner) dom.loadingSpinner.style.display = 'none';
            console.error(err);
        } finally {
            if (dom.refreshBtn) dom.refreshBtn.classList.remove('spinning');
        }
    }

    // ===== ADMIN LOGIC =====
    function renderAdminPlayersList() {
        const players = getPlayers();
        dom.adminPlayersList.innerHTML = '';
        players.forEach(name => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${name}</span>
                <button class="btn-remove" data-name="${name}" title="Удалить">✕</button>
            `;
            dom.adminPlayersList.appendChild(li);
        });

        dom.adminPlayersList.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const nameToRemove = btn.dataset.name;
                const players = getPlayers().filter(p => p.toLowerCase() !== nameToRemove.toLowerCase()); // Case insensitive remove
                savePlayers(players);
                renderAdminPlayersList();
                loadLeaderboard();
            });
        });
    }

    function openOverlay(overlay) {
        if (!overlay) return;
        overlay.classList.remove('hidden');
        const input = overlay.querySelector('input');
        if (input) setTimeout(() => input.focus(), 100);
    }

    function closeOverlay(overlay) {
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.querySelectorAll('input').forEach(i => i.value = '');
        overlay.querySelectorAll('.error-msg, .success-msg').forEach(el => el.classList.add('hidden'));
    }

    // ===== EVENT LISTENERS =====
    function initEvents() {
        if (dom.refreshBtn) dom.refreshBtn.addEventListener('click', loadLeaderboard);

        $$('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const mode = th.dataset.sort;
                updateSortHeaders(mode);
                renderTable(playersData);
            });
        });

        if (dom.adminBtn) dom.adminBtn.addEventListener('click', () => {
            if (isLoggedIn()) {
                renderAdminPlayersList();
                openOverlay(dom.adminPanelOverlay);
            } else {
                openOverlay(dom.adminLoginOverlay);
            }
        });

        // Safe event binding
        const bind = (el, event, handler) => { if (el) el.addEventListener(event, handler); };

        bind(dom.adminLoginCancel, 'click', () => closeOverlay(dom.adminLoginOverlay));
        bind(dom.adminLoginSubmit, 'click', handleAdminLogin);
        bind(dom.adminPasswordInput, 'keydown', (e) => { if (e.key === 'Enter') handleAdminLogin(); });

        bind(dom.adminPanelClose, 'click', () => closeOverlay(dom.adminPanelOverlay));
        bind(dom.addPlayerBtn, 'click', handleAddPlayer);
        bind(dom.addPlayerInput, 'keydown', (e) => { if (e.key === 'Enter') handleAddPlayer(); });
        bind(dom.adminLogoutBtn, 'click', () => { setLoggedIn(false); closeOverlay(dom.adminPanelOverlay); });
        bind(dom.adminChangePasswordBtn, 'click', () => { closeOverlay(dom.adminPanelOverlay); openOverlay(dom.changePasswordOverlay); });

        bind(dom.changePasswordCancel, 'click', () => { closeOverlay(dom.changePasswordOverlay); renderAdminPlayersList(); openOverlay(dom.adminPanelOverlay); });
        bind(dom.changePasswordSubmit, 'click', handleChangePassword);
        bind(dom.confirmPasswordInput, 'keydown', (e) => { if (e.key === 'Enter') handleChangePassword(); });

        [dom.adminLoginOverlay, dom.adminPanelOverlay, dom.changePasswordOverlay].forEach(overlay => {
            bind(overlay, 'click', (e) => { if (e.target === overlay) closeOverlay(overlay); });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                [dom.adminLoginOverlay, dom.adminPanelOverlay, dom.changePasswordOverlay].forEach(overlay => {
                    if (overlay && !overlay.classList.contains('hidden')) closeOverlay(overlay);
                });
            }
        });
    }

    async function handleAdminLogin() {
        const password = dom.adminPasswordInput.value;
        if (!password) return;

        const hash = await hashPassword(password);
        const storedHash = await getAdminHash();

        if (hash === storedHash) {
            setLoggedIn(true);
            closeOverlay(dom.adminLoginOverlay);
            renderAdminPlayersList();
            openOverlay(dom.adminPanelOverlay);
        } else {
            dom.adminLoginError.classList.remove('hidden');
            dom.adminPasswordInput.value = '';
            dom.adminPasswordInput.focus();
            setTimeout(() => dom.adminLoginError.classList.add('hidden'), 3000);
        }
    }

    async function handleAddPlayer() {
        const username = dom.addPlayerInput.value.trim();
        dom.addPlayerError.classList.add('hidden');
        dom.addPlayerSuccess.classList.add('hidden');

        if (!username) {
            dom.addPlayerError.textContent = 'Введите никнейм';
            dom.addPlayerError.classList.remove('hidden');
            return;
        }

        const players = getPlayers();
        if (players.some(p => p.toLowerCase() === username.toLowerCase())) {
            dom.addPlayerError.textContent = 'Этот игрок уже в списке';
            dom.addPlayerError.classList.remove('hidden');
            return;
        }

        dom.addPlayerBtn.disabled = true;
        dom.addPlayerBtn.textContent = 'Проверка...';

        try {
            const res = await fetchWithTimeout(`https://api.chess.com/pub/player/${username.toLowerCase()}`);
            if (!res.ok) {
                dom.addPlayerError.textContent = `Игрок "${username}" не найден на Chess.com`;
                dom.addPlayerError.classList.remove('hidden');
                return;
            }

            const profile = await res.json();
            players.push(profile.username || username);
            savePlayers(players); // Save immediately
            renderAdminPlayersList();

            dom.addPlayerInput.value = '';
            dom.addPlayerSuccess.textContent = `✓ ${profile.username || username} добавлен!`;
            dom.addPlayerSuccess.classList.remove('hidden');
            setTimeout(() => dom.addPlayerSuccess.classList.add('hidden'), 3000);

            loadLeaderboard();
        } catch (err) {
            dom.addPlayerError.textContent = 'Ошибка сети или API недоступен.';
            dom.addPlayerError.classList.remove('hidden');
        } finally {
            dom.addPlayerBtn.disabled = false;
            dom.addPlayerBtn.textContent = '+ Добавить';
        }
    }

    async function handleChangePassword() {
        const newPass = dom.newPasswordInput.value;
        const confirmPass = dom.confirmPasswordInput.value;
        dom.changePasswordError.classList.add('hidden');

        if (!newPass || newPass.length < 3) {
            dom.changePasswordError.textContent = 'Пароль должен быть не менее 3 символов';
            dom.changePasswordError.classList.remove('hidden');
            return;
        }

        if (newPass !== confirmPass) {
            dom.changePasswordError.textContent = 'Пароли не совпадают';
            dom.changePasswordError.classList.remove('hidden');
            return;
        }

        const hash = await hashPassword(newPass);
        localStorage.setItem(STORAGE_KEY_ADMIN, hash);

        closeOverlay(dom.changePasswordOverlay);
        renderAdminPlayersList();
        openOverlay(dom.adminPanelOverlay);
    }

    // ===== INIT =====
    function init() {
        updateSortHeaders('rapid');
        initEvents();
        loadLeaderboard();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
