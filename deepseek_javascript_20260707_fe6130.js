// ============================================
// 1. Декодеры и утилиты
// ============================================

const window = window;
const charMap = { /* таблица подстановки */ };

function decodeString(encoded) {
    // Расшифровывает строки
    let result = [];
    for(let i = 0; i < encoded.length; i += 2) {
        result.push((encoded[i] << 4) | encoded[i+1]);
    }
    return result;
}

// ============================================
// 2. Конфигурация чита
// ============================================

const config = {
    // Aimbot
    aimbotEnabled: false,
    targetMode: 'players', // 'players', 'ghouls', 'all'
    distanceCoeff: 100,
    offsetCoeff: 0.1,
    autoFire: false,
    lockId: -1,
    jitterActive: false,
    jitterOffset: 0,
    
    // Visuals (ESP)
    showLines: false,
    showGauges: false,
    showMines: false,
    showSpikes: false,
    showWires: false,
    showNamesOnMap: false,
    
    // AutoLoot
    autoLootEnabled: false,
    autoTakeEnabled: false,
    
    // AutoMake (автокрафт)
    autoWood: false,
    autoGasoline: false,
    autoCells: false,
    autoUranium: false,
    autoMetal: false,
    
    // Keyboard shortcuts
    aimbotKey: 'NoKey',
    jitterKey: 'NoKey',
    autoLootKey: 'NoKey',
    // ...
};

// ============================================
// 3. Классы для игроков и объектов
// ============================================

class Player {
    constructor(id) {
        this.id = id;
        this.x = -1;
        this.y = -1;
        this.team = -1;
        this.health = 100;
        this.name = '';
        this.isAlive = true;
        this.lastPositions = []; // Для предсказания движения
    }
    
    updatePosition(x, y) {
        if(this.x !== -1 && this.y !== -1) {
            this.lastPositions.push({x: this.x, y: this.y});
            if(this.lastPositions.length > 3) {
                this.lastPositions.shift();
            }
        }
        this.x = x;
        this.y = y;
    }
}

class GameWorld {
    constructor() {
        this.players = [];
        this.ghouls = [];
        for(let i = 1; i < 120; i++) {
            this.players[i] = new Player(i);
        }
        for(let i = 1; i < 1000; i++) {
            this.ghouls[i] = new Player(i);
        }
    }
}

// ============================================
// 4. Aimbot
// ============================================

function calculateAngle(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if(dx < 0) angle += 180;
    return angle;
}

function findClosestTarget(player, maxDistance) {
    let closest = null;
    let closestDist = maxDistance;
    
    // Проверяем игроков
    for(let id in gameWorld.players) {
        const target = gameWorld.players[id];
        if(!target.isAlive || target.id === player.id) continue;
        if(target.team === player.team && player.team !== -1) continue;
        
        const dist = getDistance(player, target);
        if(dist < closestDist) {
            closestDist = dist;
            closest = target;
        }
    }
    
    // Проверяем зомби
    for(let id in gameWorld.ghouls) {
        const target = gameWorld.ghouls[id];
        if(!target.isAlive) continue;
        
        const dist = getDistance(player, target);
        if(dist < closestDist) {
            closestDist = dist;
            closest = target;
        }
    }
    
    return closest;
}

function aimbot() {
    if(!config.aimbotEnabled) return;
    
    const myPlayer = gameWorld.players[myId];
    if(!myPlayer || !myPlayer.isAlive) return;
    
    let target = null;
    if(config.lockId > -1) {
        target = gameWorld.players[config.lockId];
    } else {
        target = findClosestTarget(myPlayer, 2500);
    }
    
    if(!target) return;
    
    // Предсказание движения
    let targetX = target.x;
    let targetY = target.y;
    if(target.lastPositions.length >= 2) {
        const dx = target.x - target.lastPositions[0].x;
        const dy = target.y - target.lastPositions[0].y;
        // Экстраполяция
        targetX += dx * 0.5;
        targetY += dy * 0.5;
    }
    
    const angle = calculateAngle(myPlayer, {x: targetX, y: targetY});
    
    // Отправляем угол на сервер
    if(config.autoFire) {
        sendAttack();
    }
    sendAngle(angle);
}

// ============================================
// 5. AutoLoot и AutoTake
// ============================================

function autoLoot() {
    if(!config.autoLootEnabled) return;
    
    // Проверяем предметы вокруг
    for(let item of worldItems) {
        if(isItemWanted(item)) {
            const dist = getDistance(myPlayer, item);
            if(dist < 200) {
                // Подбираем предмет
                sendTakeItem(item.id);
            }
        }
    }
}

function autoTake() {
    if(!config.autoTakeEnabled) return;
    
    // Проверяем контейнеры (ящики, холодильники)
    for(let container of containers) {
        const dist = getDistance(myPlayer, container);
        if(dist < 150) {
            // Открываем контейнер
            sendOpenContainer(container.id);
        }
    }
}

// ============================================
// 6. AutoMake (автокрафт)
// ============================================

function autoCraft() {
    const recipes = {
        wood: { from: 'logs', to: 'planks' },
        gasoline: { from: 'oil', to: 'gasoline' },
        cells: { from: 'electronics', to: 'energy_cells' },
        uranium: { from: 'uranium_ore', to: 'shaped_uranium' },
        metal: { from: 'scrap', to: 'shaped_metal' }
    };
    
    for(let item in recipes) {
        if(config['auto' + item]) {
            if(hasMaterials(recipes[item].from)) {
                sendCraft(recipes[item].to);
            }
        }
    }
}

// ============================================
// 7. ESP (визуальные функции)
// ============================================

function drawESP() {
    if(!config.showLines && !config.showNamesOnMap) return;
    
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    if(config.showLines) {
        // Рисуем линии к игрокам
        for(let id in gameWorld.players) {
            const player = gameWorld.players[id];
            if(player.isAlive && player.id !== myId) {
                ctx.beginPath();
                ctx.moveTo(myPlayer.x, myPlayer.y);
                ctx.lineTo(player.x, player.y);
                ctx.strokeStyle = player.team === myTeam ? '#00FF00' : '#FF0000';
                ctx.stroke();
            }
        }
    }
    
    if(config.showNamesOnMap) {
        // Рисуем имена на карте
        for(let id in gameWorld.players) {
            const player = gameWorld.players[id];
            if(player.isAlive) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(player.name, player.x, player.y - 20);
            }
        }
    }
}

// ============================================
// 8. Веб-сокет и коммуникация
// ============================================

let ws = null;
let myId = -1;

function connectToServer(server, token) {
    ws = new WebSocket('wss://' + server);
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = function() {
        // Отправляем токен и данные игрока
        ws.send(JSON.stringify(['login', token, myId, config.skin]));
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
}

function handleServerMessage(data) {
    switch(data[0]) {
        case 0x01: // Новый игрок
            const player = gameWorld.players[data[1]];
            player.name = data[2];
            player.team = data[3];
            break;
            
        case 0x03: // Обновление позиции
            const id = data[1];
            const x = data[2] * 32;
            const y = data[3] * 32;
            if(gameWorld.players[id]) {
                gameWorld.players[id].updatePosition(x, y);
            }
            break;
            
        case 0x04: // Игрок умер
            const deadId = data[1];
            gameWorld.players[deadId].isAlive = false;
            break;
            
        case 0x06: // Направление игрока
            // ...
            break;
    }
}

function sendAttack() {
    if(ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify([0x04]));
    }
}

function sendAngle(angle) {
    if(ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify([0x06, angle]));
    }
}

// ============================================
// 9. GUI-меню
// ============================================

function createMenu() {
    const gui = new dat.GUI();
    
    // Вкладка Aimbot
    const aimbotFolder = gui.addFolder('Aimbot');
    aimbotFolder.add(config, 'aimbotEnabled').name('Enabled');
    aimbotFolder.add(config, 'targetMode', ['players', 'ghouls', 'all']).name('Target');
    aimbotFolder.add(config, 'autoFire').name('Auto Fire');
    aimbotFolder.add(config, 'jitterActive').name('Jitter');
    
    // Вкладка Visuals
    const visualsFolder = gui.addFolder('Visuals');
    visualsFolder.add(config, 'showLines').name('Show Lines');
    visualsFolder.add(config, 'showGauges').name('Show Gauges');
    visualsFolder.add(config, 'showNamesOnMap').name('Show Names');
    
    // Вкладка AutoLoot
    const lootFolder = gui.addFolder('AutoLoot');
    lootFolder.add(config, 'autoLootEnabled').name('Enabled');
    lootFolder.add(config, 'autoTakeEnabled').name('Auto Take');
    
    // Вкладка AutoMake
    const craftFolder = gui.addFolder('AutoMake');
    craftFolder.add(config, 'autoWood').name('Auto Wood');
    craftFolder.add(config, 'autoGasoline').name('Auto Gasoline');
    craftFolder.add(config, 'autoUranium').name('Auto Uranium');
}

// ============================================
// 10. Запуск
// ============================================

// Главный цикл
setInterval(() => {
    aimbot();
    autoLoot();
    autoCraft();
}, 50);

// Рендеринг ESP
setInterval(() => {
    drawESP();
}, 100);

// Создаем меню при загрузке
window.onload = function() {
    createMenu();
};