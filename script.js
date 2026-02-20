// ТВОИ ДРУЗЬЯ (можно добавлять прямо здесь)
let friends = ['just_Cone', 'MaxMas', 'aledmap2', 'Jcoin'];

// Сохраняем список в localStorage, чтобы он не пропадал при перезагрузке
if (localStorage.getItem('chessboardFriends')) {
    friends = JSON.parse(localStorage.getItem('chessboardFriends'));
}

let playersData = [];
let currentSort = 'rapid'; // По умолчанию сортируем по рапиду

// Функция для получения данных одного игрока
async function getPlayerData(username) {
    try {
        const response = await fetch(`https://lichess.org/api/user/${username}`);
        
        if (!response.ok) {
            throw new Error(`Игрок ${username} не найден`);
        }

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
        console.error(`Ошибка при загрузке данных для ${username}:`, error);
        return null;
    }
}

// Главная функция построения таблицы
async function buildLeaderboard() {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '<tr><td colspan="5" class="loading">Загрузка данных...</td></tr>';

    // Загружаем данные всех друзей параллельно
    const promises = friends.map(friend => getPlayerData(friend));
    playersData = await Promise.all(promises);

    // Удаляем тех, кто не загрузился
    playersData = playersData.filter(player => player !== null);

    // Сортируем по текущему критерию
    sortPlayersByRating(currentSort);

    // Очищаем таблицу
    tableBody.innerHTML = '';

    // Заполняем таблицу
    playersData.forEach((player, index) => {
        const row = document.createElement('tr');
        
        let placeClass = '';
        let placeMedal = '';
        
        if (index === 0) {
            placeClass = 'gold';
            placeMedal = '🥇';
        } else if (index === 1) {
            placeClass = 'silver';
            placeMedal = '🥈';
        } else if (index === 2) {
            placeClass = 'bronze';
            placeMedal = '🥉';
        }

        row.innerHTML = `
            <td><span class="place ${placeClass}">${placeMedal} #${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <span class="status-indicator ${player.online ? 'online' : 'offline'}"></span>
                    <a href="${player.url}" target="_blank" class="username">${player.username}</a>
                </div>
            </td>
            <td class="rating">${player.rapid || '-'}</td>
            <td class="rating">${player.blitz || '-'}</td>
            <td class="rating">${player.bullet || '-'}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Сортировка таблицы
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
        
        if (index === 0) {
            placeClass = 'gold';
            placeMedal = '🥇';
        } else if (index === 1) {
            placeClass = 'silver';
            placeMedal = '🥈';
        } else if (index === 2) {
            placeClass = 'bronze';
            placeMedal = '🥉';
        }

        row.innerHTML = `
            <td><span class="place ${placeClass}">${placeMedal} #${index + 1}</span></td>
            <td>
                <div class="player-info">
                    <span class="status-indicator ${player.online ? 'online' : 'offline'}"></span>
                    <a href="${player.url}" target="_blank" class="username">${player.username}</a>
                </div>
            </td>
            <td class="rating">${player.rapid || '-'}</td>
            <td class="rating">${player.blitz || '-'}</td>
            <td class="rating">${player.bullet || '-'}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Функция добавления нового игрока
function addPlayer() {
    const input = document.getElementById('new-username');
    const username = input.value.trim();

    if (!username) {
        alert('Введите никнейм!');
        return;
    }

    if (friends.includes(username)) {
        alert('Этот игрок уже в списке!');
        return;
    }

    // Добавляем в массив
    friends.push(username);
    
    // Сохраняем в localStorage
    localStorage.setItem('chessboardFriends', JSON.stringify(friends));

    // Очищаем поле ввода
    input.value = '';

    // Перезагружаем таблицу
    buildLeaderboard();
}

// Запускаем при загрузке страницы
buildLeaderboard();