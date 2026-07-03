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

    const tab = window.activeTab || 'card';
    
    if (tab === 'card') {
        content.innerHTML = `<div class="parchment-card"><h2>Taverns (Live Scorecard)</h2>
        <p>Render loop for taverns goes here. Player logs sips, GM sees all.</p></div>`;
    } else if (tab === 'board') {
        content.innerHTML = `<div class="parchment-card"><h2>Guild Standings</h2>
        <p>Render loop for Leaderboard goes here.</p></div>`;
    }
    // ... Implement logic for Setup, Quests, and Log tabs
}

// Auto-init if session exists
if (gameState.code) {
    initGame();
}
