/* =============================================
   Chess Leaderboard — script.js
   ============================================= */

(function () {
    'use strict';

    // ===== CONFIG =====
    const DEFAULT_FRIENDS = ['thcffh', 'aledmap', 'Hunster226622', 'nekoo000', 'Brdish'];
    const STORAGE_KEY_PLAYERS = 'chess_leaderboard_players';
    const STORAGE_KEY_ADMIN = 'chess_leaderboard_admin_hash';
    const STORAGE_KEY_LOGGED = 'chess_leaderboard_logged_in';
    const DEFAULT_PASSWORD = 'admin'; // Default admin password — change on first login

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

    // ===== HASHING (simple for client-side, not production security) =====
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + '_chess_leaderboard_salt');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ===== STORAGE =====
    function getPlayers() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_PLAYERS);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { /* ignore */ }
        // Initialize with defaults
        localStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(DEFAULT_FRIENDS));
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
        const [profileRes, statsRes] = await Promise.all([
            fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}`),
            fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/stats`),
        ]);

        if (!profileRes.ok) throw new Error(`Profile not found for ${username}`);

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
    }

    async function fetchAllPlayers() {
        const players = getPlayers();
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
            arrow.classList.toggle('active', isActive);
        });
    }

    // ===== RENDERING =====
    function renderTable(data) {
        const sorted = sortPlayers(data, currentSort);
        dom.tableBody.innerHTML = '';

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
        dom.loadingSpinner.style.display = '';
        dom.tableWrapper.style.display = 'none';
        dom.errorBanner.classList.add('hidden');
    }

    function showTable() {
        dom.loadingSpinner.style.display = 'none';
        dom.tableWrapper.style.display = '';
    }

    function showError(message) {
        dom.errorText.textContent = message;
        dom.errorBanner.classList.remove('hidden');
    }

    function hideError() {
        dom.errorBanner.classList.add('hidden');
    }

    function updateTimestamp() {
        const now = new Date();
        const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        dom.lastUpdated.textContent = `Обновлено: ${date}, ${time}`;
    }

    // ===== MAIN LOAD =====
    async function loadLeaderboard() {
        showLoading();
        hideError();
        dom.refreshBtn.classList.add('spinning');

        try {
            const { data, errors } = await fetchAllPlayers();

            playersData = data;

            if (data.length === 0 && errors.length > 0) {
                showError('Не удалось загрузить данные ни одного игрока. Проверьте никнеймы.');
                dom.loadingSpinner.style.display = 'none';
                return;
            }

            if (errors.length > 0) {
                showError(`Не удалось загрузить: ${errors.join(', ')}`);
            }

            renderTable(data);
            showTable();
            updateTimestamp();
        } catch (err) {
            showError('Произошла ошибка при загрузке данных. Попробуйте позже.');
            dom.loadingSpinner.style.display = 'none';
            console.error(err);
        } finally {
            dom.refreshBtn.classList.remove('spinning');
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

        // Bind remove buttons
        dom.adminPlayersList.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const nameToRemove = btn.dataset.name;
                const players = getPlayers().filter(p => p.toLowerCase() !== nameToRemove.toLowerCase());
                savePlayers(players);
                renderAdminPlayersList();
                loadLeaderboard();
            });
        });
    }

    function openOverlay(overlay) {
        overlay.classList.remove('hidden');
        // Focus first input
        const input = overlay.querySelector('input');
        if (input) setTimeout(() => input.focus(), 100);
    }

    function closeOverlay(overlay) {
        overlay.classList.add('hidden');
        // Clear inputs
        overlay.querySelectorAll('input').forEach(i => i.value = '');
        // Hide errors/success
        overlay.querySelectorAll('.error-msg, .success-msg').forEach(el => el.classList.add('hidden'));
    }

    // ===== EVENT LISTENERS =====
    function initEvents() {
        // Refresh
        dom.refreshBtn.addEventListener('click', loadLeaderboard);

        // Sort headers
        $$('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const mode = th.dataset.sort;
                updateSortHeaders(mode);
                renderTable(playersData);
            });
        });

        // Admin button
        dom.adminBtn.addEventListener('click', () => {
            if (isLoggedIn()) {
                renderAdminPlayersList();
                openOverlay(dom.adminPanelOverlay);
            } else {
                openOverlay(dom.adminLoginOverlay);
            }
        });

        // Admin login
        dom.adminLoginCancel.addEventListener('click', () => closeOverlay(dom.adminLoginOverlay));
        dom.adminLoginSubmit.addEventListener('click', handleAdminLogin);
        dom.adminPasswordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAdminLogin();
        });

        // Admin panel
        dom.adminPanelClose.addEventListener('click', () => closeOverlay(dom.adminPanelOverlay));
        dom.addPlayerBtn.addEventListener('click', handleAddPlayer);
        dom.addPlayerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAddPlayer();
        });
        dom.adminLogoutBtn.addEventListener('click', () => {
            setLoggedIn(false);
            closeOverlay(dom.adminPanelOverlay);
        });
        dom.adminChangePasswordBtn.addEventListener('click', () => {
            closeOverlay(dom.adminPanelOverlay);
            openOverlay(dom.changePasswordOverlay);
        });

        // Change password
        dom.changePasswordCancel.addEventListener('click', () => {
            closeOverlay(dom.changePasswordOverlay);
            renderAdminPlayersList();
            openOverlay(dom.adminPanelOverlay);
        });
        dom.changePasswordSubmit.addEventListener('click', handleChangePassword);
        dom.confirmPasswordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleChangePassword();
        });

        // Close overlays on background click
        [dom.adminLoginOverlay, dom.adminPanelOverlay, dom.changePasswordOverlay].forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeOverlay(overlay);
            });
        });

        // Close overlays on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                [dom.adminLoginOverlay, dom.adminPanelOverlay, dom.changePasswordOverlay].forEach(overlay => {
                    if (!overlay.classList.contains('hidden')) closeOverlay(overlay);
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

        // Verify the player exists on Chess.com
        dom.addPlayerBtn.disabled = true;
        dom.addPlayerBtn.textContent = 'Проверка...';

        try {
            const res = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}`);
            if (!res.ok) {
                dom.addPlayerError.textContent = `Игрок "${username}" не найден на Chess.com`;
                dom.addPlayerError.classList.remove('hidden');
                return;
            }

            const profile = await res.json();
            players.push(profile.username || username);
            savePlayers(players);
            renderAdminPlayersList();

            dom.addPlayerInput.value = '';
            dom.addPlayerSuccess.textContent = `✓ ${profile.username || username} добавлен!`;
            dom.addPlayerSuccess.classList.remove('hidden');
            setTimeout(() => dom.addPlayerSuccess.classList.add('hidden'), 3000);

            loadLeaderboard();
        } catch (err) {
            dom.addPlayerError.textContent = 'Ошибка сети. Попробуйте позже.';
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

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
