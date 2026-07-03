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
    role: localStorage.getItem('role') || null,
    playerName: localStorage.getItem('playerName') || null,
    teamId: localStorage.getItem('teamId') || null,
    data: null
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

function sanitizeForFirebase(name) {
    return name.replace(/[.#$\[\]]/g, '').trim();
}

// 4. LOBBY FUNCTIONS
function generateGameCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function createGame() {
    const passcode = document.getElementById('gm-passcode').value;
    if (!passcode) return alert("Passcode required for GM");

    const code = generateGameCode();
    
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

    saveSession(code, 'Player', name, null);
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

    db.ref(`games/${gameState.code}`).on('value', (snapshot) => {
        gameState.data = snapshot.val();
        renderActiveTab();
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    window.activeTab = tabName;
    renderActiveTab();
}

function renderActiveTab() {
    const content = document.getElementById('tab-content');
    if (!gameState.data) return;

    const tab = window.activeTab || (gameState.role === 'GM' ? 'setup' : 'card');
    
    if (tab === 'setup' && gameState.role === 'GM') {
        renderSetupTab(content);
    } else if (tab === 'card') {
        renderCardTab(content);
    } else {
        content.innerHTML = `<div class="parchment-card"><h2>${tab.toUpperCase()}</h2><p>Under construction...</p></div>`;
    }
}

// --- SETUP TAB FUNCTIONS ---
function renderSetupTab(content) {
    let tavernsHtml = Object.keys(gameState.data.taverns || {}).map(key => {
        let t = gameState.data.taverns[key];
        return `<li style="margin-bottom: 10px; display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(0,0,0,0.2); padding-bottom: 5px;">
                    <span><b>${t.name}</b><br><small>${t.drink} (Par: ${t.par})</small></span>
                    <span style="color: var(--crimson); cursor: pointer; font-size: 1.2em; font-weight: bold; padding: 0 10px;" onclick="deleteItem('taverns', '${key}')">X</span>
                </li>`;
    }).join('');

    let teamsHtml = Object.keys(gameState.data.teams || {}).map(key => {
        let tm = gameState.data.teams[key];
        return `<li style="margin-bottom: 10px; color: var(--${tm.color.replace(' ', '')}); display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(0,0,0,0.2); padding-bottom: 5px;">
                    <span><b>${tm.name}</b></span>
                    <span style="color: var(--crimson); cursor: pointer; font-size: 1.2em; font-weight: bold; padding: 0 10px;" onclick="deleteItem('teams', '${key}')">X</span>
                </li>`;
    }).join('');

    let rulesHtml = Object.keys(gameState.data.rules || {}).map(key => {
        let r = gameState.data.rules[key];
        let sign = r.points > 0 ? '+' : '';
        return `<li style="margin-bottom: 10px; display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(0,0,0,0.2); padding-bottom: 5px;">
                    <span><b>${r.name}</b><br><small>Penalty: ${sign}${r.points} pts</small></span>
                    <span style="color: var(--crimson); cursor: pointer; font-size: 1.2em; font-weight: bold; padding: 0 10px;" onclick="deleteItem('rules', '${key}')">X</span>
                </li>`;
    }).join('');

    content.innerHTML = `
        <div class="parchment-card">
            <h2>Manage Taverns (The Route)</h2>
            <ul style="margin-bottom: 15px; padding-left: 0; list-style: none;">${tavernsHtml || "<li>No taverns yet.</li>"}</ul>
            
            <input type="text" id="new-tavern-name" placeholder="Tavern Name (e.g. The Prancing Pony)">
            <input type="text" id="new-tavern-drink" placeholder="Drink (e.g. Pint of Ale)">
            <input type="number" id="new-tavern-par" placeholder="Par (Sips)" min="1">
            <button onclick="addTavern()" class="gold-btn">Add Tavern</button>
        </div>

        <div class="parchment-card dark-wood">
            <h2 style="color: var(--parchment)">Manage Guilds (Teams)</h2>
            <ul style="color: white; margin-bottom: 15px; padding-left: 0; list-style: none;">${teamsHtml || "<li>No guilds yet.</li>"}</ul>
            
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

        <div class="parchment-card">
            <h2>House Rules (Penalties)</h2>
            <ul style="margin-bottom: 15px; padding-left: 0; list-style: none;">${rulesHtml || "<li>No house rules yet.</li>"}</ul>
            
            <input type="text" id="new-rule-name" placeholder="Rule (e.g. Spilled Drink)">
            <input type="number" id="new-rule-points" placeholder="Points Added (e.g. 2)">
            <button onclick="addRule()" class="gold-btn">Add Rule</button>
        </div>
    `;
}

async function addTavern() {
    const name = document.getElementById('new-tavern-name').value;
    const drink = document.getElementById('new-tavern-drink').value;
    const par = parseInt(document.getElementById('new-tavern-par').value);
    
    if(!name || !drink || !par) return alert("Please fill in all Tavern details.");
    
    const tavernId = 't' + Date.now();
    await db.ref(`games/${gameState.code}/taverns/${tavernId}`).set({
        name: name, drink: drink, par: par, order: Date.now()
    });
}

async function addGuild() {
    const name = document.getElementById('new-team-name').value;
    const color = document.getElementById('new-team-color').value;
    
    if(!name) return alert("Your Guild needs a name!");
    
    const teamId = 'g' + Date.now();
    await db.ref(`games/${gameState.code}/teams/${teamId}`).set({ name: name, color: color });
}

async function addRule() {
    const name = document.getElementById('new-rule-name').value;
    const points = parseInt(document.getElementById('new-rule-points').value);
    
    if(!name || isNaN(points)) return alert("Please provide a rule name and a point value.");
    
    const ruleId = 'r' + Date.now();
    await db.ref(`games/${gameState.code}/rules/${ruleId}`).set({ name: name, points: points });
}

async function deleteItem(category, id) {
    if(confirm(`Are you sure you want to delete this?`)) {
        await db.ref(`games/${gameState.code}/${category}/${id}`).remove();
    }
}

// --- LIVE SCORECARD FUNCTIONS ---
function renderCardTab(content) {
    const taverns = gameState.data.taverns || {};
    const scores = gameState.data.scores || {};
    
    const myPlayerKey = sanitizeForFirebase(gameState.playerName);
    const myScores = scores[myPlayerKey] || {};

    if (Object.keys(taverns).length === 0) {
        content.innerHTML = `<div class="parchment-card"><h2>The Route is Empty</h2><p>Wait for the Quest Master to forge the route in the Setup tab.</p></div>`;
        return;
    }

    const sortedTaverns = Object.entries(taverns).sort((a, b) => a[1].order - b[1].order);
    let html = `<h2 style="color: var(--gold); text-align: center; margin-bottom: 20px;">Your Quest Log</h2>`;

    sortedTaverns.forEach(([tavernId, t]) => {
        const currentSips = myScores[tavernId] || '';
        const scoreLabel = currentSips ? getScoringLabel(currentSips, t.par) : 'Awaiting...';
        const labelColor = currentSips && (currentSips > t.par) ? 'var(--crimson)' : 'var(--wood-dark)';
        
        html += `
        <div class="parchment-card" style="margin-bottom: 15px;">
            <h3 style="color: var(--wood-light); border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 5px; margin-bottom: 10px;">${t.name}</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span><b>Drink:</b> ${t.drink}</span>
                <span><b>Par:</b> ${t.par} sips</span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.4); padding: 10px; border-radius: 4px;">
                <label style="flex-grow: 1;"><b>Your Sips:</b></label>
                <input type="number" id="sips-${tavernId}" value="${currentSips}" min="1" style="width: 70px; margin-bottom: 0; padding: 8px;">
                <button onclick="saveScore('${tavernId}', ${t.par})" class="gold-btn" style="width: auto; padding: 8px 15px;">Log</button>
            </div>
            
            <div style="margin-top: 10px; text-align: right; font-style: italic;">
                Rank: <b style="color: ${labelColor}">${scoreLabel}</b>
            </div>
        </div>`;
    });

    content.innerHTML = html;
}

async function saveScore(tavernId, par) {
    const input = document.getElementById(`sips-${tavernId}`);
    const sips = parseInt(input.value);
    
    if (isNaN(sips) || sips < 1) return alert("You must enter a valid number of sips!");

    const myPlayerKey = sanitizeForFirebase(gameState.playerName);
    
    await db.ref(`games/${gameState.code}/scores/${myPlayerKey}/${tavernId}`).set(sips);
    
    const label = getScoringLabel(sips, par);
    const logEntry = `${gameState.playerName} scored ${label} (${sips} sips) at a Tavern.`;
    
    await db.ref(`games/${gameState.code}/log`).push({
        text: logEntry,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

// Auto-init if session exists
if (gameState.code) {
    initGame();
}
