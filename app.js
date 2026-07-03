// 1. FIREBASE CONFIGURATION (No import statements!)
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://pubgolf-4b56b-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

// Initialize Firebase using the global objects
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 2. STATE MANAGEMENT
let gameState = {
    code: localStorage.getItem('gameCode') || null,
    role: localStorage.getItem('role') || null, // 'GM' or 'Player'
    playerName: localStorage.getItem('playerName') || null,
    teamId: localStorage.getItem('teamId') || null,
    data: null // Holds live Firebase data
};

// 3. FANTASY SCORING SYSTEM
function getScoringLabel(sips, par) {
    if (!sips || !par) return "-";
    const diff = sips - par;
    
    if (diff <= -4) return "Legendary";
    if (diff === -3) return "Heroic";
    if (diff === -2) return "Valiant";
    if (diff === -1) return "Swift";
    if (diff === 0) return "True";
    if (diff === 1) return "Faltering";
    if (diff === 2) return "Reckless";
    if (diff === 3) return "Cursed";
    return "Doomed";
}

// 4. LOBBY FUNCTIONS
function generateGameCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function createGame() {
    const passcode = document.getElementById('gm-passcode').value;
    if (!passcode) return alert("Passcode required for GM");

    const code = generateGameCode();
    
    // Setup default game structure in Firebase
    await db.ref(`games/${code}`).set({
        gmPasscode: passcode,
        created: firebase.database.ServerValue.TIMESTAMP,
        taverns: {
            t1: { name: "The Prancing Pony", drink: "Pint of Ale", par: 4, order: 1 }
        },
        teams: {
            guild1: { name: "Crimson Brotherhood", color: "crimson" }
        },
        log: []
    });

    saveSession(code, 'GM', 'Quest Master', null);
    initGame();
}

async function joinGame() {
    const code = document.getElementById('join-code').value.toUpperCase();
    const name = document.getElementById('player-name').value;
    
    if (!code || !name) return alert("Code and Name required");

    const snapshot = await db.ref(`games/${code}`).once('value');
    if (!snapshot.exists()) return alert("Tavern not found!");

    saveSession(code, 'Player', name, null); // Team selection happens inside
    initGame();
}

function saveSession(code, role, name, teamId) {
    gameState.code = code;
    gameState.role = role;
    gameState.playerName = name;
    gameState.teamId = teamId;
    
    localStorage.setItem('gameCode', code);
    localStorage.setItem('role', role);
    localStorage.setItem('playerName', name);
    if(teamId) localStorage.setItem('teamId', teamId);
}

// 5. MAIN GAME LOOP & UI
function initGame() {
    if (!gameState.code) return;

    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('display-code').innerHTML = `Code: <b>${gameState.code}</b>`;
    document.getElementById('display-role').innerText = gameState.playerName;

    if (gameState.role === 'GM') {
        document.body.classList.add('is-gm');
    }

    // Listen to Firebase Realtime Database
    db.ref(`games/${gameState.code}`).on('value', (snapshot) => {
        gameState.data = snapshot.val();
        renderActiveTab();
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Store active tab globally or pass it to render logic
    window.activeTab = tabName;
    renderActiveTab();
}

function renderActiveTab() {
    const content = document.getElementById('tab-content');
    if (!gameState.data) return;

    // GM defaults to 'setup', Adventurers default to 'card'
    const tab = function renderActiveTab() {
    const content = document.getElementById('tab-content');
    if (!gameState.data) return;

    // GM defaults to 'setup', Adventurers default to 'card'
    const tab = window.activeTab || (gameState.role === 'GM' ? 'setup' : 'card');
    
    if (tab === 'setup' && gameState.role === 'GM') {
        renderSetupTab(content);
    } else if (tab === 'card') {
        content.innerHTML = `<div class="parchment-card"><h2>Live Scorecard</h2>
        <p>Scorecard UI coming next!</p></div>`;
    } else {
        content.innerHTML = `<div class="parchment-card"><h2>${tab.toUpperCase()}</h2><p>Under construction...</p></div>`;
    }
}window.activeTab || (gameState.role === 'GM' ? 'setup' : 'card');
    
    if (tab === 'setup' && gameState.role === 'GM') {
        renderSetupTab(content);
    } else if (tab === 'card') {
        content.innerHTML = `<div class="parchment-card"><h2>Live Scorecard</h2>
        <p>Scorecard UI coming next!</p></div>`;
    } else {
        content.innerHTML = `<div class="parchment-card"><h2>${tab.toUpperCase()}</h2><p>Under construction...</p></div>`;
    }
}

// Auto-init if session exists
if (gameState.code) {
    initGame();
}

function renderSetupTab(content) {
    // 1. Generate the list of existing Taverns
    let tavernsHtml = Object.keys(gameState.data.taverns || {}).map(key => {
        let t = gameState.data.taverns[key];
        return `<li style="margin-bottom: 5px;"><b>${t.name}</b> — ${t.drink} (Par: ${t.par})</li>`;
    }).join('');

    // 2. Generate the list of existing Guilds
    let teamsHtml = Object.keys(gameState.data.teams || {}).map(key => {
        let tm = gameState.data.teams[key];
        return `<li style="margin-bottom: 5px; color: var(--${tm.color})"><b>${tm.name}</b></li>`;
    }).join('');

    // 3. Draw the GM Setup Interface
    content.innerHTML = `
        <div class="parchment-card">
            <h2>Manage Taverns</h2>
            <ul style="margin-bottom: 15px; padding-left: 20px;">${tavernsHtml || "<li>No taverns yet.</li>"}</ul>
            
            <input type="text" id="new-tavern-name" placeholder="Tavern Name (e.g. The Prancing Pony)">
            <input type="text" id="new-tavern-drink" placeholder="Drink (e.g. Pint of Ale)">
            <input type="number" id="new-tavern-par" placeholder="Par (Sips)" min="1">
            <button onclick="addTavern()" class="gold-btn">Add Tavern</button>
        </div>

        <div class="parchment-card dark-wood">
            <h2 style="color: var(--parchment)">Manage Guilds</h2>
            <ul style="color: white; margin-bottom: 15px; padding-left: 20px;">${teamsHtml || "<li>No guilds yet.</li>"}</ul>
            
            <input type="text" id="new-team-name" placeholder="Guild Name">
            <select id="new-team-color" style="width: 100%; padding: 12px; margin-bottom: 15px; background: rgba(255,255,255,0.8); border-radius: 4px;">
                <option value="crimson">Crimson</option>
                <option value="gold">Gold</option>
                <option value="forest green">Forest Green</option>
                <option value="steel blue">Steel Blue</option>
                <option value="purple">Purple</option>
            </select>
            <button onclick="addGuild()">Add Guild</button>
        </div>
    `;
}

async function addTavern() {
    const name = document.getElementById('new-tavern-name').value;
    const drink = document.getElementById('new-tavern-drink').value;
    const par = parseInt(document.getElementById('new-tavern-par').value);
    
    if(!name || !drink || !par) return alert("Please fill in all Tavern details.");
    
    const tavernId = 't' + Date.now(); // generate unique ID
    await db.ref(`games/${gameState.code}/taverns/${tavernId}`).set({
        name: name,
        drink: drink,
        par: par,
        order: Date.now() // Allows us to sort them chronologically later
    });
}

async function addGuild() {
    const name = document.getElementById('new-team-name').value;
    const color = documasync function addTavern() {
    const name = document.getElementById('new-tavern-name').value;
    const drink = document.getElementById('new-tavern-drink').value;
    const par = parseInt(document.getElementById('new-tavern-par').value);
    
    if(!name || !drink || !par) return alert("Please fill in all Tavern details.");
    
    const tavernId = 't' + Date.now(); // generate unique ID
    await db.ref(`games/${gameState.code}/taverns/${tavernId}`).set({
        name: name,
        drink: drink,
        par: par,
        order: Date.now() // Allows us to sort them chronologically later
    });
}

async function addGuild() {
    const name = document.getElementById('new-team-name').value;
    const color = document.getElementById('new-team-color').value;
    
    if(!name) return alert("Your Guild needs a name!");
    
    const teamId = 'g' + Date.now(); // generate unique ID
    await db.ref(`games/${gameState.code}/teams/${teamId}`).set({
        name: name,
        color: color
    });
}ent.getElementById('new-team-color').value;
    
    if(!name) return alert("Your Guild needs a name!");
    
    const teamId = 'g' + Date.now(); // generate unique ID
    await db.ref(`games/${gameState.code}/teams/${teamId}`).set({
        name: name,
        color: color
    });
}

function renderActiveTab() {
    const content = document.getElementById('tab-content');
    if (!gameState.data) return;

    // GM defaults to 'setup', Adventurers default to 'card'
    const tab = window.activeTab || (gameState.role === 'GM' ? 'setup' : 'card');
    
    if (tab === 'setup' && gameState.role === 'GM') {
        renderSetupTab(content);
    } else if (tab === 'card') {
        content.innerHTML = `<div class="parchment-card"><h2>Live Scorecard</h2>
        <p>Scorecard UI coming next!</p></div>`;
    } else {
        content.innerHTML = `<div class="parchment-card"><h2>${tab.toUpperCase()}</h2><p>Under construction...</p></div>`;
    }
}
