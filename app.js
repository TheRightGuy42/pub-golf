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

    const gameData = snapshot.val();
    const teams = gameData.teams || {};
    
    // Stop players from joining if the GM hasn't created teams yet
    if (Object.keys(teams).length === 0) {
        return alert("The Quest Master hasn't forged any Guilds yet! Wait a moment and try again.");
    }

    // Hide lobby, show team selection screen
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('team-screen').classList.add('active');
    
    // Generate a button for each available Guild
    const teamList = document.getElementById('team-list');
    teamList.innerHTML = Object.keys(teams).map(tId => `
        <button onclick="confirmTeam('${code}', '${name}', '${tId}')" 
                style="background-color: var(--${teams[tId].color.replace(' ', '')}); color: white; margin-bottom: 10px; border-color: white; text-shadow: 1px 1px 2px black;">
            Join ${teams[tId].name}
        </button>
    `).join('');
}

async function confirmTeam(code, name, teamId) {
    const playerKey = sanitizeForFirebase(name);
    
    // Save the player's team to the database so the Leaderboard can do the math
    await db.ref(`games/${code}/players/${playerKey}`).set({
        teamId: teamId,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // Save session and enter the game
    saveSession(code, 'Player', name, teamId);
    document.getElementById('team-screen').classList.remove('active');
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

    // ... (Keep existing code that hides lobby and sets display names) ...

    if (gameState.role === 'GM') {
        document.body.classList.add('is-gm');
        window.activeTab = 'setup'; // GM defaults to Setup
    } else {
        window.activeTab = 'card';  // Players default to Card
    }

    // Update the visual state of the navigation buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (gameState.role === 'GM') {
        document.querySelector('.tab-btn[onclick="switchTab(\'setup\')"]').classList.add('active');
    } else {
        document.querySelector('.tab-btn[onclick="switchTab(\'card\')"]').classList.add('active');
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
    } else if (tab === 'quests') {
        renderQuestsTab(content);
    } else if (tab === 'board') {
        renderBoardTab(content); // <--- Add this new condition
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


// --- QUESTS TAB FUNCTIONS ---
function renderQuestsTab(content) {
    // 1. Block Adventurers from seeing the secret quests
    if (gameState.role !== 'GM') {
        content.innerHTML = `
        <div class="parchment-card" style="text-align: center;">
            <h2 style="color: var(--crimson); margin-bottom: 15px;">Sealed Bounties</h2>
            <p>The Quest Master keeps the side quests hidden.</p>
            <p>Complete deeds of glory in the real world, and you may be rewarded!</p>
        </div>`;
        return;
    }

    const quests = gameState.data.quests || {};
    const teams = gameState.data.teams || {};

    // 2. Build the dropdown menu of active Guilds
    let teamsOptions = `<option value="">-- Select a Guild --</option>` + 
        Object.keys(teams).map(tId => `<option value="${tId}">${teams[tId].name}</option>`).join('');

    // 3. Generate the list of Quests with their "Award" buttons
    let questsHtml = Object.keys(quests).map(key => {
        let q = quests[key];
        return `
        <div style="border: 1px solid var(--wood-light); padding: 15px; margin-bottom: 15px; background: rgba(255,255,255,0.4); border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <b style="font-size: 1.1em; color: var(--wood-dark);">${q.name}</b>
                <span style="color: var(--crimson); cursor: pointer; font-weight: bold;" onclick="deleteItem('quests', '${key}')">X</span>
            </div>
            <div style="font-size: 0.9em; margin-bottom: 15px; font-style: italic;">Bonus: -${q.points} sips</div>
            
            <div style="display: flex; gap: 10px;">
                <select id="award-team-${key}" style="flex-grow: 1; padding: 8px;">
                    ${teamsOptions}
                </select>
                <button onclick="awardQuest('${key}')" class="gold-btn" style="padding: 8px 15px; width: auto;">Award</button>
            </div>
        </div>`;
    }).join('');

    // 4. Draw the GM Quest Interface
    content.innerHTML = `
        <div class="parchment-card">
            <h2>Secret Quests</h2>
            <p style="font-size: 0.9em; margin-bottom: 15px;">Awarding a quest will permanently deduct sips from a Guild's total score.</p>
            <div>${questsHtml || "<p>No quests forged yet.</p>"}</div>
        </div>

        <div class="parchment-card dark-wood">
            <h2 style="color: var(--parchment)">Forge New Quest</h2>
            <input type="text" id="new-quest-name" placeholder="Quest Name (e.g., Drink a pint upside down)">
            <input type="number" id="new-quest-points" placeholder="Sips to Deduct (e.g., 3)" min="1">
            <button onclick="addQuest()">Add Quest</button>
        </div>
    `;
}

async function addQuest() {
    const name = document.getElementById('new-quest-name').value;
    const points = parseInt(document.getElementById('new-quest-points').value);
    
    if(!name || isNaN(points)) return alert("Please provide a quest name and point value.");
    
    const questId = 'q' + Date.now();
    await db.ref(`games/${gameState.code}/quests/${questId}`).set({ name: name, points: points });
}

async function awardQuest(questId) {
    const teamId = document.getElementById(`award-team-${questId}`).value;
    if (!teamId) return alert("You must select a Guild to award this quest to!");

    const quest = gameState.data.quests[questId];
    const team = gameState.data.teams[teamId];

    if(confirm(`Award "${quest.name}" (-${quest.points} sips) to ${team.name}?`)) {
        
        // 1. Save the awarded points for the Leaderboard math
        await db.ref(`games/${gameState.code}/awardedQuests`).push({
            questName: quest.name,
            points: quest.points,
            teamId: teamId,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // 2. Announce it in the public log
        const logEntry = `🏆 Quest Completed! ${team.name} achieved "${quest.name}" and gained a -${quest.points} sip bonus!`;
        await db.ref(`games/${gameState.code}/log`).push({
            text: logEntry,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        alert(`Huzzah! Quest awarded to ${team.name}!`);
    }
}

// --- LEADERBOARD (BOARD TAB) FUNCTIONS ---
function renderBoardTab(content) {
    const teams = gameState.data.teams || {};
    const scores = gameState.data.scores || {};
    const quests = gameState.data.awardedQuests || {};
    const players = gameState.data.players || {}; // We will use this soon!

    if (Object.keys(teams).length === 0) {
        content.innerHTML = `<div class="parchment-card"><h2>No Guilds Yet</h2><p>The Quest Master must forge Guilds in the Setup tab.</p></div>`;
        return;
    }

    // 1. Calculate Quest Bonuses per Team
    let teamBonuses = {};
    Object.values(quests).forEach(q => {
        teamBonuses[q.teamId] = (teamBonuses[q.teamId] || 0) + q.points;
    });

    // 2. Calculate Individual Scores & Combine into Team Scores
    let playerTotals = [];
    let teamTotals = {};

    // Initialize team scores with their negative quest bonuses
    Object.keys(teams).forEach(tId => {
        teamTotals[tId] = -(teamBonuses[tId] || 0); 
    });

    // Sum up each player's sips
    Object.keys(scores).forEach(playerKey => {
        let totalSips = 0;
        Object.values(scores[playerKey]).forEach(sips => totalSips += sips);
        
        playerTotals.push({ name: playerKey, score: totalSips });

        // If this player belongs to a team, add their sips to the team's total
        if (players[playerKey] && players[playerKey].teamId) {
            const tId = players[playerKey].teamId;
            if (teamTotals[tId] !== undefined) {
                teamTotals[tId] += totalSips;
            }
        }
    });

    // 3. Sort Teams and Players (Lowest score wins!)
    let sortedTeams = Object.keys(teams).map(tId => ({
        id: tId,
        name: teams[tId].name,
        color: teams[tId].color,
        score: teamTotals[tId],
        bonus: teamBonuses[tId] || 0
    })).sort((a, b) => a.score - b.score);

    playerTotals.sort((a, b) => a.score - b.score);

    // 4. Generate the HTML for the Guild Standings
    let teamsHtml = sortedTeams.map((t, index) => {
        let rank = index + 1;
        let medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `${rank}.`));
        return `
        <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); align-items: center; background: rgba(255,255,255,0.3); margin-bottom: 5px; border-radius: 4px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3em; width: 30px; text-align: center;">${medal}</span>
                <b style="color: var(--${t.color.replace(' ', '')}); font-size: 1.2em; text-shadow: 1px 1px 0px rgba(255,255,255,0.5);">${t.name}</b>
            </div>
            <div style="text-align: right;">
                <b style="font-size: 1.3em; color: var(--wood-dark);">${t.score} sips</b><br>
                <small style="color: var(--forestgreen); font-weight: bold;">-${t.bonus} quest bonus</small>
            </div>
        </div>`;
    }).join('');

    // 5. Generate the HTML for Individual Standings
    let playersHtml = playerTotals.map((p, index) => {
        return `
        <div style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px dashed rgba(0,0,0,0.1);">
            <span>${index + 1}. <b>${p.name}</b></span>
            <span><b>${p.score}</b> sips</span>
        </div>`;
    }).join('');

    // 6. Draw the Board Interface
    content.innerHTML = `
        <div class="parchment-card" style="padding: 10px;">
            <h2 style="text-align: center; color: var(--gold); margin-bottom: 20px; font-size: 2em; text-shadow: 2px 2px 2px #000;">Guild Standings</h2>
            <div style="margin-bottom: 20px;">${teamsHtml}</div>
        </div>

        <div class="parchment-card dark-wood">
            <h2 style="color: var(--parchment); text-align: center; margin-bottom: 15px;">Adventurer Standings</h2>
            <div style="color: white; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px;">
                ${playersHtml || "<p style='text-align:center; font-style:italic;'>No sips logged yet.</p>"}
            </div>
        </div>
    `;
}
