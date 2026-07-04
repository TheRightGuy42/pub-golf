/* ===================== Constants ===================== */

const TEAM_COLORS = ['#B08D2F', '#7A1F2B', '#3F5B3A', '#4C6B8A', '#6B4E8A', '#8A5B2F'];

function scoreLabel(diff) {
  if (diff <= -4) return 'Legendary Ogre';
  if (diff === -3) return 'Swamp Hero';
  if (diff === -2) return 'Fairy-Tale Fine';
  if (diff === -1) return 'Quick n Nimble';
  if (diff === 0) return 'True Ogre';
  if (diff === 1) return 'A Bit Onion-Eyed';
  if (diff === 2) return 'Wobbly Ogre';
  if (diff === 3) return 'Cursed by the Swamp';
  return `Doomed +${diff}`;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function genGameCode() {
  const letters = 'BCDFGHJKLMNPQRSTVWXYZ'; // no vowels, avoids accidental words / ambiguity
  let code = '';
  for (let i = 0; i < 5; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

/* ===================== Firebase ===================== */

let fbReady = false;
let db = null;
try {
  if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PASTE')) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    fbReady = true;
  }
} catch (e) {
  console.error('Firebase init failed', e);
  fbReady = false;
}

function gameRef(code, path) { return db.ref(`games/${code}${path ? '/' + path : ''}`); }

/* ===================== Session ===================== */

const SESSION_KEY = 'tavern_session_v1';
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

let session = loadSession();
let gameData = null; // live snapshot of games/{code}
let activeTab = 'card';
let gmActiveHoleIndex = 0;
let playerActiveHoleIndex = 0;
let gmCardTeamFilter = 'all';

/* ===================== DOM refs ===================== */

const main = document.getElementById('main-content');
const courseNameEl = document.getElementById('course-name');
const eyebrowEl = document.getElementById('header-eyebrow');
const tabBar = document.getElementById('tab-bar');
const modalLayer = document.getElementById('modal-layer');
const toastEl = document.getElementById('toast');
const menuBtn = document.getElementById('menu-btn');

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* ===================== Modal helper ===================== */

function openModal(html, onMount) {
  modalLayer.innerHTML = `<div class="modal-sheet">${html}</div>`;
  modalLayer.classList.add('open');
  if (onMount) onMount(modalLayer);
  modalLayer.onclick = (e) => { if (e.target === modalLayer) closeModal(); };
}
function closeModal() { modalLayer.classList.remove('open'); modalLayer.innerHTML = ''; }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===================== Boot ===================== */

function boot() {
  if (!fbReady) {
    main.innerHTML = `
      <div class="landing">
        <div class="landing-seal">${sealSvg()}</div>
        <h1>Configuration needed</h1>
        <p class="tagline">This copy of The Ogre's Open isn't connected to a swamp log yet.</p>
        <div class="card">
          <p class="card-title">One-time setup</p>
          <p class="card-sub" style="margin-top:8px; line-height:1.6;">Open <b>firebase-config.js</b> in the project files and paste in your free Firebase project keys. Instructions are in the comments at the top of that file.</p>
        </div>
      </div>`;
    return;
  }
  if (session && session.gameCode) {
    attachToGame(session.gameCode);
  } else {
    renderLanding();
  }
}

function sealSvg() {
  return `<svg viewBox="0 0 40 40"><circle cx="20" cy="19" r="15" fill="var(--crimson)"/><circle cx="20" cy="19" r="12.3" fill="none" stroke="var(--gold)" stroke-width="1.2"/><rect x="18.7" y="11" width="2.6" height="13" fill="var(--gold)"/><polygon points="15.5,11 24.5,11 21.8,16.5 18.2,16.5" fill="var(--gold)"/><ellipse cx="20" cy="24.5" rx="4" ry="1.8" fill="var(--gold)"/></svg>`;
}

/* ===================== Landing ===================== */

function renderLanding() {
  tabBar.style.display = 'none';
  courseNameEl.textContent = 'Gather Thy Ogres';
  eyebrowEl.textContent = "The Ogre's Open";
  main.innerHTML = `
    <div class="landing">
      <div class="landing-seal">${sealSvg()}</div>
      <h1>The Ogre's Open</h1>
      <p class="tagline">A swamp log for ogres who golf with ale.</p>

      <div class="card">
        <p class="card-title">Wade into a swamp already underway</p>
        <div class="field on-parchment" style="margin-top:12px;">
          <label>Swamp code</label>
          <input type="text" id="join-code" placeholder="e.g. RQNVK" maxlength="8" style="text-transform:uppercase;" />
        </div>
        <button class="btn btn-primary btn-block" id="join-btn">Join the clan</button>
      </div>

      <div class="divider">or</div>

      <div class="card">
        <p class="card-title">Found the Swamp Lord's crown?</p>
        <p class="card-sub" style="margin:6px 0 14px;">Claim a new swamp and receive a code to share with your fellow ogres.</p>
        <button class="btn btn-gold btn-block" id="create-btn">Claim a new swamp</button>
      </div>
    </div>
  `;
  document.getElementById('join-btn').onclick = () => startJoinFlow(document.getElementById('join-code').value.trim().toUpperCase());
  document.getElementById('create-btn').onclick = () => startCreateFlow();
}

/* ===================== Create game (GM) ===================== */

function startCreateFlow() {
  openModal(`
    <h2>Claim a New Swamp</h2>
    <div class="field">
      <label>Swamp name</label>
      <input type="text" id="course-name-input" placeholder="e.g. Friday's Ogre Crawl" />
    </div>
    <div class="field">
      <label>Your name (Swamp Lord)</label>
      <input type="text" id="gm-name-input" placeholder="e.g. Aldric" />
    </div>
    <div class="field">
      <label>Set a Swamp Lord passcode</label>
      <input type="password" id="gm-pass-input" placeholder="Only you'll need this" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-create">Cancel</button>
      <button class="btn btn-primary" id="confirm-create">Claim it</button>
    </div>
  `, () => {
    document.getElementById('cancel-create').onclick = closeModal;
    document.getElementById('confirm-create').onclick = () => {
      const courseName = document.getElementById('course-name-input').value.trim() || "The Ogre's Open";
      const gmName = document.getElementById('gm-name-input').value.trim() || 'Swamp Lord';
      const gmPasscode = document.getElementById('gm-pass-input').value.trim();
      if (!gmPasscode) { toast('Set a passcode so you can rejoin as Swamp Lord.'); return; }
      createGame(courseName, gmName, gmPasscode);
    };
  });
}

function createGame(courseName, gmName, gmPasscode) {
  const code = genGameCode();
  const meta = {
    courseName, gmName, gmPasscode,
    createdAt: Date.now(), started: false, currentHoleIndex: 0,
  };

  // No default decrees — the Swamp Lord adds their own from the Setup screen.
  gameRef(code).set({ meta, rules: {} }).then(() => {
    closeModal();
    saveSession({ gameCode: code, role: 'gm', gmPasscode });
    session = loadSession();
    toast(`Swamp claimed! Code: ${code}`);
    attachToGame(code);
  }).catch((e) => toast('Could not reach the realm — check your connection.'));
}

/* ===================== Join game (Player) ===================== */

function startJoinFlow(code) {
  if (!code) { toast('Enter a swamp code first.'); return; }
  gameRef(code, 'meta').once('value').then((snap) => {
    if (!snap.exists()) { toast('No swamp found with that code.'); return; }
    const meta = snap.val();
    openModal(`
      <h2>Join ${escapeHtml(meta.courseName)}</h2>
      <div class="field">
        <label>Your name</label>
        <input type="text" id="player-name-input" placeholder="e.g. Rowan" />
      </div>
      <p class="card-sub" style="color:rgba(237,224,192,0.6); margin-bottom:16px;">You'll pick or be assigned a clan once inside.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost-light" id="cancel-join">Cancel</button>
        <button class="btn btn-primary" id="confirm-join">Wade into the swamp</button>
      </div>
      <div class="divider">or</div>
      <button class="btn btn-ghost-light btn-block" id="gm-instead">I am this swamp's Swamp Lord</button>
    `, () => {
      document.getElementById('cancel-join').onclick = closeModal;
      document.getElementById('confirm-join').onclick = () => {
        const name = document.getElementById('player-name-input').value.trim();
        if (!name) { toast('Enter a name.'); return; }
        joinAsPlayer(code, name);
      };
      document.getElementById('gm-instead').onclick = () => gmLoginFlow(code, meta);
    });
  }).catch(() => toast('Could not reach the realm — check your connection.'));
}

function gmLoginFlow(code, meta) {
  openModal(`
    <h2>Swamp Lord Login</h2>
    <div class="field">
      <label>Passcode</label>
      <input type="password" id="gm-pass-check" placeholder="Enter your passcode" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-gm-login">Cancel</button>
      <button class="btn btn-primary" id="confirm-gm-login">Enter</button>
    </div>
  `, () => {
    document.getElementById('cancel-gm-login').onclick = closeModal;
    document.getElementById('confirm-gm-login').onclick = () => {
      const pass = document.getElementById('gm-pass-check').value;
      if (pass && pass === meta.gmPasscode) {
        closeModal();
        saveSession({ gameCode: code, role: 'gm', gmPasscode: pass });
        session = loadSession();
        attachToGame(code);
      } else {
        toast('Incorrect passcode.');
      }
    };
  });
}

function joinAsPlayer(code, name) {
  const playerId = uid();
  gameRef(code, `players/${playerId}`).set({ name, teamId: null, joinedAt: Date.now() }).then(() => {
    closeModal();
    saveSession({ gameCode: code, role: 'player', playerId, playerName: name });
    session = loadSession();
    attachToGame(code);
  }).catch(() => toast('Could not reach the realm — check your connection.'));
}

/* ===================== Attach live listeners ===================== */

let gameListener = null;
function attachToGame(code) {
  main.innerHTML = `<div class="spinner-wrap">Unrolling the scroll…</div>`;
  if (gameListener) gameRef(session.gameCode, '').off('value', gameListener);
  gameListener = (snap) => {
    if (!snap.exists()) {
      toast('This swamp no longer exists.');
      clearSession(); session = null; renderLanding();
      return;
    }
    gameData = snap.val();
    gameData.teams = gameData.teams || {};
    gameData.holes = gameData.holes || {};
    gameData.rules = gameData.rules || {};
    gameData.players = gameData.players || {};
    gameData.quests = gameData.quests || {};
    gameData.questLog = gameData.questLog || {};
    gameData.scores = gameData.scores || {};
    gameData.changeLog = gameData.changeLog || {};
    gameData.proposals = gameData.proposals || {};

    // Guard against a player having been removed mid-session.
    if (session.role === 'player' && !gameData.players[session.playerId]) {
      toast('You have been removed from this swamp.');
      clearSession(); session = null; renderLanding();
      return;
    }
    render();
  };
  gameRef(code, '').on('value', gameListener);
}

/* ===================== Derived helpers ===================== */

function sortedHoles() {
  return Object.entries(gameData.holes).map(([id, h]) => ({ id, ...h })).sort((a, b) => a.order - b.order);
}
function sortedTeams() {
  return Object.entries(gameData.teams).map(([id, t]) => ({ id, ...t }));
}
function playersOfTeam(teamId) {
  return Object.entries(gameData.players).filter(([, p]) => p.teamId === teamId).map(([id, p]) => ({ id, ...p }));
}
function allRules() {
  return Object.entries(gameData.rules).map(([id, r]) => ({ id, ...r }));
}

function playerHolePoints(playerId, hole) {
  const cell = gameData.scores[playerId] && gameData.scores[playerId][hole.id];
  if (!cell || cell.sips === null || cell.sips === undefined) return 0;
  let pts = cell.sips - hole.par;
  const flags = cell.ruleFlags || {};
  Object.keys(flags).forEach((ruleId) => {
    if (flags[ruleId] && gameData.rules[ruleId]) pts += gameData.rules[ruleId].points;
  });
  return pts;
}

function teamQuestPoints(teamId) {
  let total = 0;
  Object.entries(gameData.questLog).forEach(([questId, teamsMap]) => {
    const q = gameData.quests[questId];
    if (!q) return;
    if (teamsMap && teamsMap[teamId]) total += q.points;
  });
  return total;
}

function teamManualAdjust(teamId) {
  let total = 0;
  Object.values(gameData.changeLog).forEach((entry) => {
    if ((entry.type === 'gm' || entry.type === 'custom' || entry.type === 'proposal') && entry.teamId === teamId) total += entry.delta;
  });
  return total;
}

function teamTotal(teamId) {
  const players = playersOfTeam(teamId);
  const holes = sortedHoles();
  let total = 0;
  players.forEach((p) => holes.forEach((h) => { total += playerHolePoints(p.id, h); }));
  total += teamQuestPoints(teamId);
  total += teamManualAdjust(teamId);
  return total;
}

function pushLog(entry) {
  const id = uid();
  gameRef(session.gameCode, `changeLog/${id}`).set({ ts: Date.now(), ...entry });
}

/* ===================== Shell render ===================== */

function render() {
  const role = session.role;
  courseNameEl.textContent = gameData.meta.courseName || "The Ogre's Open";
  eyebrowEl.innerHTML = role === 'gm' ? 'Swamp Lord' : `Ogre <span class="role-badge player">${escapeHtml(currentPlayerName())}</span>`;
  tabBar.style.display = 'flex';

  // Player without a team yet -> team picker gate
  if (role === 'player') {
    const me = gameData.players[session.playerId];
    if (!me) { clearSession(); session = null; renderLanding(); return; }
    if (!me.teamId && sortedTeams().length) {
      renderTeamPicker();
      return;
    }
  }

  tabBar.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === activeTab));

  if (activeTab === 'card') renderCard();
  else if (activeTab === 'quests') renderQuests();
  else if (activeTab === 'board') renderBoard();
  else if (activeTab === 'log') renderLog();
}

function currentPlayerName() {
  if (session.role !== 'player') return '';
  const p = gameData.players[session.playerId];
  return p ? p.name : session.playerName || '';
}

tabBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  render();
});

menuBtn.addEventListener('click', openGameMenu);

function renderTeamPicker() {
  const teams = sortedTeams();
  main.innerHTML = `
    <p class="section-eyebrow">Choose Thy Path</p>
    <h2 class="section-title">Pick a clan, ${escapeHtml(currentPlayerName())}</h2>
    ${teams.map((t) => `
      <button class="card btn-block" style="text-align:left; cursor:pointer; display:flex; align-items:center; gap:12px;" data-pick-team="${t.id}">
        <span class="team-swatch" style="background:${t.color}; width:16px; height:16px;"></span>
        <span class="card-title">${escapeHtml(t.name)}</span>
      </button>
    `).join('')}
  `;
  main.querySelectorAll('[data-pick-team]').forEach((btn) => btn.onclick = () => {
    gameRef(session.gameCode, `players/${session.playerId}/teamId`).set(btn.dataset.pickTeam);
  });
}

/* ===================== Game menu ===================== */

function openGameMenu() {
  const isGm = session.role === 'gm';
  const proposalCount = Object.keys(gameData.proposals || {}).length;
  openModal(`
    <h2>Swamp Menu</h2>
    <div class="code-display">${session.gameCode}</div>
    <p class="card-sub" style="text-align:center; color:rgba(237,224,192,0.6); margin-top:-10px; margin-bottom:18px;">Share this code with your fellow ogres</p>
    ${isGm ? `<button class="btn btn-gold btn-block" id="menu-setup" style="margin-bottom:10px;">Setup: clans, watering holes &amp; decrees</button>` : ''}
    ${isGm ? `<button class="btn btn-ghost-light btn-block" id="menu-members" style="margin-bottom:10px;">The Ogre roster</button>` : ''}
    ${isGm ? `<button class="btn btn-ghost-light btn-block" id="menu-judge" style="margin-bottom:10px;">Swamp Lord's judgment (single ogre)</button>` : ''}
    ${isGm ? `<button class="btn btn-ghost-light btn-block" id="menu-proposals" style="margin-bottom:10px;">Review proposals${proposalCount ? ` (${proposalCount})` : ''}</button>` : ''}
    <button class="btn btn-ghost-light btn-block" id="menu-propose" style="margin-bottom:10px;">Propose a decree</button>
    <button class="btn btn-ghost-light btn-block" id="menu-copy" style="margin-bottom:10px;">Copy swamp code</button>
    <button class="btn btn-danger btn-block" id="menu-leave">Leave this swamp</button>
  `, () => {
    if (isGm) {
      document.getElementById('menu-setup').onclick = () => { closeModal(); openSetupModal(); };
      document.getElementById('menu-members').onclick = () => { closeModal(); openMembersModal(); };
      document.getElementById('menu-judge').onclick = () => { closeModal(); customJudgmentFlow(); };
      document.getElementById('menu-proposals').onclick = () => { closeModal(); reviewProposalsFlow(); };
    }
    document.getElementById('menu-propose').onclick = () => { closeModal(); proposeFlow(); };
    document.getElementById('menu-copy').onclick = () => {
      navigator.clipboard?.writeText(session.gameCode).then(() => toast('Code copied!')).catch(() => toast(session.gameCode));
    };
    document.getElementById('menu-leave').onclick = () => {
      clearSession(); session = null; gameData = null; closeModal(); renderLanding();
    };
  });
}

/* ===================== The Ogre Roster (GM: view & remove members) ===================== */

function openMembersModal() {
  const players = Object.entries(gameData.players).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.joinedAt - b.joinedAt);
  openModal(`
    <h2>The Ogre Roster</h2>
    ${players.length ? players.map((p) => {
      const team = p.teamId ? gameData.teams[p.teamId] : null;
      return `
      <div class="list-item" style="border-bottom-color:rgba(237,224,192,0.15);">
        <div class="list-item-main" style="display:flex; align-items:center; gap:10px;">
          ${team ? `<span class="team-swatch" style="background:${team.color}"></span>` : ''}
          <div>
            <p class="list-item-title" style="color:var(--parchment);">${escapeHtml(p.name)}</p>
            <p class="list-item-sub">${team ? escapeHtml(team.name) : 'No clan yet'}</p>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-ghost-light btn-sm" data-view-player="${p.id}">View profile</button>
        </div>
      </div>`;
    }).join('') : `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No ogres have wandered into the swamp yet.</p>`}
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="members-close">Done</button></div>
  `, (root) => {
    document.getElementById('members-close').onclick = closeModal;
    root.querySelectorAll('[data-view-player]').forEach((el) => el.onclick = () => playerProfileModal(el.dataset.viewPlayer));
  });
}

function playerProfileModal(playerId) {
  const p = gameData.players[playerId];
  if (!p) { closeModal(); return; }
  const team = p.teamId ? gameData.teams[p.teamId] : null;
  const holes = sortedHoles();
  let total = 0;
  const rows = holes.map((h) => {
    const pts = playerHolePoints(playerId, h);
    total += pts;
    const cell = gameData.scores[playerId] && gameData.scores[playerId][h.id];
    const sips = cell ? cell.sips : null;
    const locked = cell ? !!cell.locked : false;
    return `<div class="list-item" style="border-bottom-color:rgba(0,0,0,0.1);">
      <p class="list-item-title">${escapeHtml(h.name)}</p>
      <p class="list-item-sub">${sips === null || sips === undefined ? 'not yet' : sips + ' sips'}${locked ? ' · locked in' : ''}</p>
    </div>`;
  }).join('');
  total += (function () {
    let t = 0;
    Object.values(gameData.changeLog).forEach((entry) => { if (entry.playerId === playerId && (entry.type === 'houserule' || entry.type === 'custom' || entry.type === 'proposal')) t += entry.delta; });
    return t;
  })();
  openModal(`
    <h2>${escapeHtml(p.name)}${team ? ` <span class="role-badge player" style="background:${team.color};">${escapeHtml(team.name)}</span>` : ''}</h2>
    <p class="card-sub" style="color:rgba(237,224,192,0.6); margin-bottom:12px;">Joined the swamp ${new Date(p.joinedAt).toLocaleString()}</p>
    <div class="card">${rows || '<p class="card-sub">No watering holes visited yet.</p>'}</div>
    <p class="card-sub" style="color:rgba(237,224,192,0.7); margin-bottom:16px;">Running total: ${total > 0 ? '+' : ''}${total}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="back-members">Back</button>
      <button class="btn btn-danger" id="remove-player">Banish from the swamp</button>
    </div>
  `, () => {
    document.getElementById('back-members').onclick = () => openMembersModal();
    document.getElementById('remove-player').onclick = () => {
      if (confirm(`Remove ${p.name} from the swamp? This cannot be undone.`)) {
        gameRef(session.gameCode, `players/${playerId}`).remove().then(() => {
          toast(`${p.name} has been banished from the swamp.`);
          openMembersModal();
        });
      }
    };
  });
}

/* ===================== Swamp Lord's judgment on a single ogre ===================== */

function customJudgmentFlow() {
  const players = Object.entries(gameData.players).map(([id, p]) => ({ id, ...p })).filter((p) => p.teamId);
  if (!players.length) { toast('No ogres to judge yet — assign clans first.'); return; }
  openModal(`
    <h2>Swamp Lord's Judgment</h2>
    <div class="field">
      <label>Ogre</label>
      <select id="judge-player">${players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Points (positive = penalty, negative = reward)</label>
      <input type="number" id="judge-points" value="1" />
    </div>
    <div class="field">
      <label>Reason</label>
      <input type="text" id="judge-reason" placeholder="e.g. Best ogre impression of the night" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-judge">Cancel</button>
      <button class="btn btn-primary" id="save-judge">Decree it</button>
    </div>
  `, () => {
    document.getElementById('cancel-judge').onclick = closeModal;
    document.getElementById('save-judge').onclick = () => {
      const playerId = document.getElementById('judge-player').value;
      const points = parseInt(document.getElementById('judge-points').value, 10) || 0;
      const reason = document.getElementById('judge-reason').value.trim() || "Swamp Lord's decree";
      const player = gameData.players[playerId];
      const team = player.teamId ? gameData.teams[player.teamId] : null;
      pushLog({ type: 'custom', teamId: player.teamId, teamName: team ? team.name : '—', playerId, playerName: player.name, delta: points, reason });
      closeModal();
      toast('Decree issued.');
    };
  });
}

/* ===================== Proposals (players propose penalty/reward for anyone) ===================== */

function proposeFlow() {
  const players = Object.entries(gameData.players).map(([id, p]) => ({ id, ...p })).filter((p) => p.teamId);
  if (!players.length) { toast('No ogres to propose a decree for yet.'); return; }
  const myId = session.role === 'player' ? session.playerId : null;
  openModal(`
    <h2>Propose a Swamp Decree</h2>
    <div class="field">
      <label>Ogre</label>
      <select id="propose-player">${players.map((p) => `<option value="${p.id}" ${p.id === myId ? 'selected' : ''}>${escapeHtml(p.name)}${p.id === myId ? ' (me)' : ''}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Points (positive = penalty, negative = reward)</label>
      <input type="number" id="propose-points" value="1" />
    </div>
    <div class="field">
      <label>Reason</label>
      <input type="text" id="propose-reason" placeholder="e.g. Told the worst joke of the night" />
    </div>
    <p class="card-sub" style="color:rgba(237,224,192,0.55);">Sent to the Swamp Lord for approval before it counts.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-propose">Cancel</button>
      <button class="btn btn-primary" id="save-propose">Send proposal</button>
    </div>
  `, () => {
    document.getElementById('cancel-propose').onclick = closeModal;
    document.getElementById('save-propose').onclick = () => {
      const targetId = document.getElementById('propose-player').value;
      const points = parseInt(document.getElementById('propose-points').value, 10) || 0;
      const reason = document.getElementById('propose-reason').value.trim();
      if (!reason) { toast('Give a reason for the decree.'); return; }
      const target = gameData.players[targetId];
      const fromName = session.role === 'gm' ? 'the Swamp Lord' : (currentPlayerName() || 'an ogre');
      const id = uid();
      gameRef(session.gameCode, `proposals/${id}`).set({
        targetPlayerId: targetId, targetPlayerName: target.name, teamId: target.teamId || null,
        points, reason, fromName, ts: Date.now(),
      }).then(() => { closeModal(); toast('Proposal sent to the Swamp Lord!'); });
    };
  });
}

function reviewProposalsFlow() {
  const proposals = Object.entries(gameData.proposals || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.ts - b.ts);
  openModal(`
    <h2>Proposed Decrees</h2>
    ${proposals.length ? proposals.map((p) => `
      <div class="list-item" style="border-bottom-color:rgba(237,224,192,0.15); align-items:flex-start;">
        <div class="list-item-main">
          <p class="list-item-title" style="color:var(--parchment);">${escapeHtml(p.targetPlayerName)} · ${p.points > 0 ? '+' : ''}${p.points} pts</p>
          <p class="list-item-sub">${escapeHtml(p.reason)} — proposed by ${escapeHtml(p.fromName)}</p>
        </div>
        <div class="list-item-actions">
          <button class="icon-action" style="color:var(--forest-light);" data-approve="${p.id}">✓</button>
          <button class="icon-action" style="color:var(--crimson-light);" data-deny="${p.id}">✕</button>
        </div>
      </div>
    `).join('') : `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No proposals waiting on your word, Swamp Lord.</p>`}
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="proposals-close">Done</button></div>
  `, (root) => {
    document.getElementById('proposals-close').onclick = closeModal;
    root.querySelectorAll('[data-approve]').forEach((el) => el.onclick = () => {
      const p = proposals.find((x) => x.id === el.dataset.approve);
      if (!p) return;
      const team = p.teamId ? gameData.teams[p.teamId] : null;
      pushLog({
        type: 'proposal', teamId: p.teamId || null, teamName: team ? team.name : '—',
        playerId: p.targetPlayerId, playerName: p.targetPlayerName,
        delta: p.points, reason: `Approved proposal: ${p.reason}`,
      });
      gameRef(session.gameCode, `proposals/${p.id}`).remove().then(() => { closeModal(); reviewProposalsFlow(); toast('Decree approved.'); });
    });
    root.querySelectorAll('[data-deny]').forEach((el) => el.onclick = () => {
      gameRef(session.gameCode, `proposals/${el.dataset.deny}`).remove().then(() => { closeModal(); reviewProposalsFlow(); toast('Proposal denied.'); });
    });
  });
}

/* ===================== Setup (GM) ===================== */

function openSetupModal() {
  openModal(`
    <h2>Chart the Swamp</h2>
    <div class="field">
      <label>Swamp name</label>
      <input type="text" id="setup-course-name" value="${escapeHtml(gameData.meta.courseName)}" />
    </div>
    <button class="btn btn-gold btn-block" id="setup-save-name" style="margin-bottom:18px;">Save name</button>

    <div class="card-row" style="margin-bottom:8px;">
      <p class="card-title" style="color:var(--parchment); font-family:var(--font-display);">Clans (teams)</p>
      <button class="btn btn-ghost-light btn-sm" id="setup-add-team">+ Add clan</button>
    </div>
    <div id="setup-team-list" style="margin-bottom:20px;">${sortedTeams().map((t) => `
      <div class="list-item" style="border-bottom-color:rgba(237,224,192,0.15);">
        <div class="list-item-main" style="display:flex; align-items:center; gap:10px;">
          <span class="team-swatch" style="background:${t.color}"></span>
          <p class="list-item-title" style="color:var(--parchment);">${escapeHtml(t.name)}</p>
        </div>
        <div class="list-item-actions">
          <button class="icon-action" style="color:rgba(237,224,192,0.6);" data-edit-team="${t.id}">✎</button>
          <button class="icon-action" style="color:var(--crimson-light);" data-del-team="${t.id}">✕</button>
        </div>
      </div>`).join('') || `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No clans yet.</p>`}
    </div>

    <div class="card-row" style="margin-bottom:8px;">
      <p class="card-title" style="color:var(--parchment); font-family:var(--font-display);">Watering holes</p>
      <button class="btn btn-ghost-light btn-sm" id="setup-add-hole">+ Add watering hole</button>
    </div>
    <div id="setup-hole-list" style="margin-bottom:20px;">${sortedHoles().map((h, i) => `
      <div class="list-item" style="border-bottom-color:rgba(237,224,192,0.15);">
        <div class="list-item-main">
          <p class="list-item-title" style="color:var(--parchment);">${i + 1}. ${escapeHtml(h.name)}</p>
          <p class="list-item-sub">${escapeHtml(h.drink)} · Par ${h.par}</p>
        </div>
        <div class="list-item-actions">
          <button class="icon-action" style="color:rgba(237,224,192,0.6);" data-hole-up="${h.id}">↑</button>
          <button class="icon-action" style="color:rgba(237,224,192,0.6);" data-hole-down="${h.id}">↓</button>
          <button class="icon-action" style="color:rgba(237,224,192,0.6);" data-edit-hole="${h.id}">✎</button>
          <button class="icon-action" style="color:var(--crimson-light);" data-del-hole="${h.id}">✕</button>
        </div>
      </div>`).join('') || `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No watering holes yet.</p>`}
    </div>

    <div class="card-row" style="margin-bottom:8px;">
      <p class="card-title" style="color:var(--parchment); font-family:var(--font-display);">Swamp decrees</p>
      <button class="btn btn-ghost-light btn-sm" id="setup-add-rule">+ Add decree</button>
    </div>
    <div id="setup-rule-list">${allRules().map((r) => `
      <div class="list-item" style="border-bottom-color:rgba(237,224,192,0.15);">
        <p class="list-item-title" style="color:var(--parchment);">${escapeHtml(r.label)}</p>
        <div class="list-item-actions">
          <button class="btn btn-ghost-light btn-sm" data-edit-rule="${r.id}">${r.points > 0 ? '+' : ''}${r.points} pts</button>
          <button class="icon-action" style="color:var(--crimson-light);" data-del-rule="${r.id}">✕</button>
        </div>
      </div>`).join('') || `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No decrees yet — add your own house rules here.</p>`}
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="setup-close">Done</button>
    </div>
  `, (root) => {
    document.getElementById('setup-close').onclick = closeModal;
    document.getElementById('setup-save-name').onclick = () => {
      gameRef(session.gameCode, 'meta/courseName').set(root.querySelector('#setup-course-name').value.trim() || "The Ogre's Open");
      toast('Swamp renamed.');
    };
    document.getElementById('setup-add-team').onclick = () => teamFlow();
    document.getElementById('setup-add-hole').onclick = () => holeFlow();
    document.getElementById('setup-add-rule').onclick = () => ruleFlow();
    root.querySelectorAll('[data-edit-team]').forEach((el) => el.onclick = () => teamFlow(el.dataset.editTeam));
    root.querySelectorAll('[data-del-team]').forEach((el) => el.onclick = () => gameRef(session.gameCode, `teams/${el.dataset.delTeam}`).remove());
    root.querySelectorAll('[data-edit-hole]').forEach((el) => el.onclick = () => holeFlow(el.dataset.editHole));
    root.querySelectorAll('[data-del-hole]').forEach((el) => el.onclick = () => gameRef(session.gameCode, `holes/${el.dataset.delHole}`).remove());
    root.querySelectorAll('[data-hole-up]').forEach((el) => el.onclick = () => moveHole(el.dataset.holeUp, -1));
    root.querySelectorAll('[data-hole-down]').forEach((el) => el.onclick = () => moveHole(el.dataset.holeDown, 1));
    root.querySelectorAll('[data-edit-rule]').forEach((el) => el.onclick = () => ruleFlow(el.dataset.editRule));
    root.querySelectorAll('[data-del-rule]').forEach((el) => el.onclick = () => gameRef(session.gameCode, `rules/${el.dataset.delRule}`).remove());
  });
}

function moveHole(id, dir) {
  const holes = sortedHoles();
  const idx = holes.findIndex((h) => h.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= holes.length) return;
  const a = holes[idx], b = holes[swapIdx];
  const updates = {};
  updates[`holes/${a.id}/order`] = b.order;
  updates[`holes/${b.id}/order`] = a.order;
  gameRef(session.gameCode).update(updates).then(() => { closeModal(); openSetupModal(); });
}

function teamFlow(editId) {
  const existing = editId ? { id: editId, ...gameData.teams[editId] } : null;
  const usedColors = sortedTeams().filter((t) => !existing || t.id !== existing.id).map((t) => t.color);
  const suggested = TEAM_COLORS.find((c) => !usedColors.includes(c)) || TEAM_COLORS[0];
  openModal(`
    <h2>${existing ? 'Edit clan' : 'Found a clan'}</h2>
    <div class="field">
      <label>Clan name</label>
      <input type="text" id="team-name" placeholder="e.g. The Onion Layers" value="${existing ? escapeHtml(existing.name) : ''}" />
    </div>
    <div class="field">
      <label>Banner colour</label>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${TEAM_COLORS.map((c) => `<button type="button" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:3px solid ${(existing ? existing.color : suggested) === c ? '#fff' : 'transparent'};"></button>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-team">Cancel</button>
      <button class="btn btn-primary" id="save-team">${existing ? 'Save' : 'Found clan'}</button>
    </div>
  `, (root) => {
    let chosenColor = existing ? existing.color : suggested;
    root.querySelectorAll('[data-color]').forEach((btn) => btn.onclick = () => {
      chosenColor = btn.dataset.color;
      root.querySelectorAll('[data-color]').forEach((b) => b.style.border = '3px solid transparent');
      btn.style.border = '3px solid #fff';
    });
    document.getElementById('cancel-team').onclick = closeModal;
    document.getElementById('save-team').onclick = () => {
      const name = document.getElementById('team-name').value.trim();
      if (!name) return;
      const id = existing ? existing.id : uid();
      gameRef(session.gameCode, `teams/${id}`).set({ name, color: chosenColor }).then(() => { closeModal(); openSetupModal(); });
    };
  });
}

function holeFlow(editId) {
  const existing = editId ? { id: editId, ...gameData.holes[editId] } : null;
  openModal(`
    <h2>${existing ? 'Edit watering hole' : 'Add a watering hole'}</h2>
    <div class="field">
      <label>Watering hole name</label>
      <input type="text" id="hole-name" placeholder="e.g. The Ogre's Bucket" value="${existing ? escapeHtml(existing.name) : ''}" />
    </div>
    <div class="field">
      <label>Drink</label>
      <input type="text" id="hole-drink" placeholder="e.g. Pint of ale" value="${existing ? escapeHtml(existing.drink) : ''}" />
    </div>
    <div class="field">
      <label>Par (sips)</label>
      <input type="number" id="hole-par" min="1" max="20" value="${existing ? existing.par : 5}" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-hole">Cancel</button>
      <button class="btn btn-primary" id="save-hole">${existing ? 'Save' : 'Add watering hole'}</button>
    </div>
  `, () => {
    document.getElementById('cancel-hole').onclick = closeModal;
    document.getElementById('save-hole').onclick = () => {
      const name = document.getElementById('hole-name').value.trim();
      const drink = document.getElementById('hole-drink').value.trim() || 'Drink';
      const par = Math.max(1, parseInt(document.getElementById('hole-par').value, 10) || 5);
      if (!name) return;
      const id = existing ? existing.id : uid();
      const order = existing ? existing.order : (sortedHoles().length ? Math.max(...sortedHoles().map((h) => h.order)) + 1 : 0);
      gameRef(session.gameCode, `holes/${id}`).set({ name, drink, par, order }).then(() => { closeModal(); openSetupModal(); });
    };
  });
}

function ruleFlow(editId) {
  const existing = editId ? { id: editId, ...gameData.rules[editId] } : null;
  openModal(`
    <h2>${existing ? 'Edit decree' : 'New swamp decree'}</h2>
    <div class="field">
      <label>What happened</label>
      <input type="text" id="rule-label" placeholder="e.g. Sang a shanty unprompted" value="${existing ? escapeHtml(existing.label) : ''}" />
    </div>
    <div class="field">
      <label>Points (positive = penalty, negative = bonus)</label>
      <input type="number" id="rule-points" value="${existing ? existing.points : 2}" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-rule">Cancel</button>
      <button class="btn btn-primary" id="save-rule">${existing ? 'Save' : 'Add decree'}</button>
    </div>
  `, () => {
    document.getElementById('cancel-rule').onclick = closeModal;
    document.getElementById('save-rule').onclick = () => {
      const label = document.getElementById('rule-label').value.trim();
      if (!label) return;
      const points = parseInt(document.getElementById('rule-points').value, 10) || 0;
      const id = existing ? existing.id : uid();
      gameRef(session.gameCode, `rules/${id}`).set({ label, points }).then(() => { closeModal(); openSetupModal(); });
    };
  });
}

/* ===================== Card tab ===================== */

function renderCard() {
  const holes = sortedHoles();
  const teams = sortedTeams();
  if (!holes.length || !teams.length) {
    main.innerHTML = emptyState('The swamp is empty', session.role === 'gm' ? 'Add clans and watering holes from the Swamp Menu to begin.' : "Your Swamp Lord hasn't charted the watering holes yet.");
    return;
  }

  if (session.role === 'gm') renderGmCard(holes, teams);
  else renderPlayerCard(holes, teams);
}

function holePagerHtml(idx, total) {
  return `
    <div class="hole-pager">
      <button class="btn btn-ghost-light" id="prev-hole" ${idx === 0 ? 'disabled style="opacity:0.4;"' : ''}>‹ Prev</button>
      <div class="hole-indicator">
        <div class="hole-num">Hole ${idx + 1}</div>
        <div class="hole-of">of ${total} watering holes</div>
      </div>
      <button class="btn btn-ghost-light" id="next-hole" ${idx === total - 1 ? 'disabled style="opacity:0.4;"' : ''}>Next ›</button>
    </div>`;
}

function renderGmCard(holes, teams) {
  const idx = Math.min(gmActiveHoleIndex, holes.length - 1);
  const hole = holes[idx];
  main.innerHTML = `
    ${holePagerHtml(idx, holes.length)}
    <div class="card">
      <p class="card-title">${escapeHtml(hole.name)}</p>
      <p class="card-sub">${escapeHtml(hole.drink)}</p>
      <div class="par-badge">Par <b>${hole.par}</b> sips</div>
    </div>
    ${teams.map((t) => renderGmTeamGroup(t, hole)).join('')}
  `;
  document.getElementById('prev-hole').onclick = () => { gmActiveHoleIndex = Math.max(0, idx - 1); render(); };
  document.getElementById('next-hole').onclick = () => { gmActiveHoleIndex = Math.min(holes.length - 1, idx + 1); render(); };
  wireCardControls(hole);
}

function renderGmTeamGroup(team, hole) {
  const players = playersOfTeam(team.id);
  if (!players.length) return '';
  return `
    <div class="card">
      <div class="team-score-row" style="margin-bottom:10px;">
        <span class="team-swatch" style="background:${team.color}"></span>
        <p class="team-score-name">${escapeHtml(team.name)}</p>
      </div>
      ${players.map((p) => renderPlayerScoreRow(p, hole, team, false)).join('')}
    </div>
  `;
}

function renderPlayerCard(holes, teams) {
  const idx = Math.min(playerActiveHoleIndex, holes.length - 1);
  const hole = holes[idx];
  const me = gameData.players[session.playerId];
  const myTeam = teams.find((t) => t.id === me.teamId);
  const teammates = myTeam ? playersOfTeam(myTeam.id).filter((p) => p.id !== session.playerId) : [];

  main.innerHTML = `
    ${holePagerHtml(idx, holes.length)}
    <div class="card">
      <p class="card-title">${escapeHtml(hole.name)}</p>
      <p class="card-sub">${escapeHtml(hole.drink)}</p>
      <div class="par-badge">Par <b>${hole.par}</b> sips</div>
    </div>
    ${myTeam ? renderPlayerScoreCard(me, hole, myTeam, teammates) : emptyState('No clan yet', 'Ask your Swamp Lord to add you to a clan.')}
  `;
  document.getElementById('prev-hole').onclick = () => { playerActiveHoleIndex = Math.max(0, idx - 1); render(); };
  document.getElementById('next-hole').onclick = () => { playerActiveHoleIndex = Math.min(holes.length - 1, idx + 1); render(); };
  if (myTeam) wireCardControls(hole);
}

function renderPlayerScoreCard(me, hole, team, teammates) {
  return `
    <div class="card">
      <div class="team-score-row" style="margin-bottom:4px;">
        <span class="team-swatch" style="background:${team.color}"></span>
        <p class="team-score-name">${escapeHtml(team.name)}</p>
      </div>
      ${renderPlayerScoreRow(me, hole, team, true)}
      ${teammates.length ? `
        <div style="margin-top:14px; padding-top:10px; border-top:1px dashed rgba(0,0,0,0.12);">
          <p class="card-sub" style="margin-bottom:4px;">Fellow clan members</p>
          ${teammates.map((p) => {
            const cell = gameData.scores[p.id] && gameData.scores[p.id][hole.id];
            const sips = cell ? cell.sips : null;
            const locked = cell && cell.locked;
            return `<div class="teammate-row"><span class="teammate-name">${escapeHtml(p.name)}</span><span class="teammate-sips">${sips === null || sips === undefined ? 'not yet' : sips + ' sips' + (locked ? ' 🔒' : ' (not locked)')}</span></div>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ownRow = true when this row belongs to the player viewing their own card (as opposed to the GM viewing anyone's row)
function renderPlayerScoreRow(player, hole, team, ownRow) {
  const cell = (gameData.scores[player.id] && gameData.scores[player.id][hole.id]) || { sips: null, ruleFlags: {}, locked: false };
  const sips = cell.sips;
  const locked = !!cell.locked;
  const diff = sips === null || sips === undefined ? null : sips - hole.par;
  const label = diff === null ? '—' : scoreLabel(diff);
  const tagClass = diff === null ? 'par' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par';
  const rules = allRules();
  const isGm = session.role === 'gm';
  const canAdjust = isGm || (ownRow && !locked);
  return `
    <div style="margin-bottom:14px;" data-player-block="${player.id}">
      <div class="card-row" style="margin-bottom:8px;">
        <span class="card-sub" style="margin:0; font-weight:600; color:var(--ink);">${ownRow ? 'You' : escapeHtml(player.name)}</span>
        <span class="score-tag ${tagClass}">${locked ? '🔒 ' : ''}${label}</span>
      </div>
      <div class="card-row">
        <span class="card-sub" style="margin:0;">Sips taken</span>
        <div class="stepper">
          <button ${canAdjust ? '' : 'disabled style="opacity:0.3;"'} data-dec="${player.id}">−</button>
          <span class="stepper-val">${sips === null || sips === undefined ? '–' : sips}</span>
          <button ${canAdjust ? '' : 'disabled style="opacity:0.3;"'} data-inc="${player.id}">+</button>
        </div>
      </div>
      ${canAdjust ? `<div class="house-rules">
        ${rules.map((r) => {
          const on = !!(cell.ruleFlags && cell.ruleFlags[r.id]);
          const cls = !on ? '' : r.points >= 0 ? 'active-plus' : 'active-minus';
          return `<button type="button" class="house-chip ${cls}" data-rule-player="${player.id}" data-rule-id="${r.id}">${escapeHtml(r.label)} ${r.points > 0 ? '+' : ''}${r.points}</button>`;
        }).join('')}
      </div>` : ''}
      ${ownRow && !isGm ? (locked
          ? `<p class="card-sub" style="margin-top:8px; color:var(--forest);">✓ Locked in — ask your Swamp Lord if you need it changed.</p>`
          : `<button class="btn btn-gold btn-sm" style="margin-top:10px;" data-lock="${player.id}" ${sips === null || sips === undefined ? 'disabled style="opacity:0.4;"' : ''}>Lock it in</button>`
        ) : ''}
    </div>
  `;
}

function wireCardControls(hole) {
  main.querySelectorAll('[data-dec]').forEach((el) => el.onclick = () => adjustSips(el.dataset.dec, hole, -1));
  main.querySelectorAll('[data-inc]').forEach((el) => el.onclick = () => adjustSips(el.dataset.inc, hole, 1));
  main.querySelectorAll('[data-rule-player]').forEach((el) => el.onclick = () => toggleRule(el.dataset.rulePlayer, hole, el.dataset.ruleId));
  main.querySelectorAll('[data-lock]').forEach((el) => el.onclick = () => lockScore(el.dataset.lock, hole));
}

function playerTeam(playerId) {
  const p = gameData.players[playerId];
  return p ? gameData.teams[p.teamId] : null;
}

function adjustSips(playerId, hole, delta) {
  const isGm = session.role === 'gm';
  const path = `scores/${playerId}/${hole.id}`;
  const cell = (gameData.scores[playerId] && gameData.scores[playerId][hole.id]) || { sips: hole.par, ruleFlags: {}, locked: false };
  if (cell.locked && !isGm) return; // locked rows can only be changed by the Swamp Lord
  const oldPts = playerHolePoints(playerId, hole);
  const newSips = Math.max(0, (cell.sips === null || cell.sips === undefined ? hole.par : cell.sips) + delta);
  gameRef(session.gameCode, `${path}/sips`).set(newSips).then(() => {
    if (isGm) {
      const newPts = (newSips - hole.par) + ruleFlagPoints(cell.ruleFlags);
      const team = playerTeam(playerId);
      const player = gameData.players[playerId];
      pushLog({
        type: 'sip', teamId: player.teamId, teamName: team ? team.name : '—',
        playerId, playerName: player.name,
        delta: newPts - oldPts,
        reason: `${hole.name}: sips set to ${newSips} by the Swamp Lord`,
      });
    }
    // Player's own (unlocked) adjustments are staged only — nothing hits the Chronicle
    // until they tap "Lock it in" via lockScore().
  });
}

function lockScore(playerId, hole) {
  const cell = (gameData.scores[playerId] && gameData.scores[playerId][hole.id]) || { sips: null, ruleFlags: {} };
  if (cell.sips === null || cell.sips === undefined) { toast('Add your sips first.'); return; }
  if (cell.locked) return;
  const path = `scores/${playerId}/${hole.id}/locked`;
  gameRef(session.gameCode, path).set(true).then(() => {
    const pts = (cell.sips - hole.par) + ruleFlagPoints(cell.ruleFlags);
    const team = playerTeam(playerId);
    const player = gameData.players[playerId];
    pushLog({
      type: 'sip', teamId: player.teamId, teamName: team ? team.name : '—',
      playerId, playerName: player.name,
      delta: pts,
      reason: `${hole.name}: locked in at ${cell.sips} sips`,
    });
    toast('Locked in!');
  });
}

function ruleFlagPoints(flags) {
  if (!flags) return 0;
  let t = 0;
  Object.keys(flags).forEach((id) => { if (flags[id] && gameData.rules[id]) t += gameData.rules[id].points; });
  return t;
}

function toggleRule(playerId, hole, ruleId) {
  const cell = (gameData.scores[playerId] && gameData.scores[playerId][hole.id]) || { sips: null, ruleFlags: {} };
  const on = !!(cell.ruleFlags && cell.ruleFlags[ruleId]);
  const path = `scores/${playerId}/${hole.id}/ruleFlags/${ruleId}`;
  const rule = gameData.rules[ruleId];
  const action = on ? gameRef(session.gameCode, path).remove() : gameRef(session.gameCode, path).set(true);
  action.then(() => {
    const team = playerTeam(playerId);
    const player = gameData.players[playerId];
    pushLog({
      type: 'houserule', teamId: player.teamId, teamName: team ? team.name : '—',
      playerId, playerName: player.name,
      delta: on ? -rule.points : rule.points,
      reason: `${on ? 'Removed' : 'Decree'}: ${rule.label} at ${hole.name}`,
    });
  });
}

/* ===================== Quests tab (Extra Layers) ===================== */

function renderQuests() {
  if (session.role === 'gm') renderQuestsGm();
  else renderQuestsPlayer();
}

function renderQuestsGm() {
  const quests = Object.entries(gameData.quests).map(([id, q]) => ({ id, ...q }));
  const teams = sortedTeams();
  main.innerHTML = `
    <p class="section-eyebrow">Hole II</p>
    <h2 class="section-title">Extra Layers</h2>
    <p class="card-sub" style="color:rgba(237,224,192,0.55); margin-bottom:16px;">Only you can see this board — every ogre has layers, and these stay hidden until peeled back (completed).</p>
    <button class="btn btn-ghost-light btn-block" id="add-quest" style="margin-bottom:16px;">+ Peel a new layer</button>
    ${quests.length ? quests.map((q) => renderQuestTicketGm(q, teams)).join('') : emptyState('No layers yet', 'Add reusable extra layers — they stay saved for every future round.')}
  `;
  document.getElementById('add-quest').onclick = () => questFlow();
  main.querySelectorAll('[data-edit-quest]').forEach((el) => el.onclick = () => questFlow(el.dataset.editQuest));
  main.querySelectorAll('[data-del-quest]').forEach((el) => el.onclick = () => gameRef(session.gameCode, `quests/${el.dataset.delQuest}`).remove());
  main.querySelectorAll('[data-toggle-quest-team]').forEach((el) => el.onclick = () => toggleQuestForTeam(el.dataset.questId, el.dataset.toggleQuestTeam));
}

function renderQuestTicketGm(q, teams) {
  const done = gameData.questLog[q.id] || {};
  return `
    <div class="quest-ticket">
      <div class="quest-seal">✓</div>
      <div class="quest-ticket-body">
        <div class="card-row">
          <p class="quest-ticket-title">${escapeHtml(q.title)}</p>
          <span class="quest-points ${q.points < 0 ? 'negative' : ''}">${q.points > 0 ? '+' : ''}${q.points} pts</span>
        </div>
        ${q.desc ? `<p class="quest-ticket-desc">${escapeHtml(q.desc)}</p>` : ''}
      </div>
      <div class="quest-perf"></div>
      <div class="quest-ticket-stub">
        ${teams.map((t) => `
          <button type="button" class="house-chip ${done[t.id] ? 'active-plus' : ''}" data-toggle-quest-team="${t.id}" data-quest-id="${q.id}">
            ${done[t.id] ? '✓ ' : ''}${escapeHtml(t.name)}
          </button>
        `).join('')}
        <div style="flex:1;"></div>
        <button class="icon-action" data-edit-quest="${q.id}">✎</button>
        <button class="icon-action" style="color:var(--crimson);" data-del-quest="${q.id}">✕</button>
      </div>
    </div>
  `;
}

function toggleQuestForTeam(questId, teamId) {
  const done = !!(gameData.questLog[questId] && gameData.questLog[questId][teamId]);
  const path = `questLog/${questId}/${teamId}`;
  const q = gameData.quests[questId];
  const team = gameData.teams[teamId];
  const action = done ? gameRef(session.gameCode, path).remove() : gameRef(session.gameCode, path).set(true);
  action.then(() => {
    pushLog({
      type: 'quest', teamId, teamName: team ? team.name : '—',
      delta: done ? -q.points : q.points,
      reason: `${done ? 'Reversed' : 'Peeled back'} extra layer: ${q.title}`,
    });
  });
}

function questFlow(editId) {
  const existing = editId ? { id: editId, ...gameData.quests[editId] } : null;
  openModal(`
    <h2>${existing ? 'Edit layer' : 'Inscribe an extra layer'}</h2>
    <div class="field">
      <label>Title</label>
      <input type="text" id="quest-title" placeholder="e.g. Charm a stranger" value="${existing ? escapeHtml(existing.title) : ''}" />
    </div>
    <div class="field">
      <label>Description (optional)</label>
      <input type="text" id="quest-desc" placeholder="What counts as completing it" value="${existing ? escapeHtml(existing.desc || '') : ''}" />
    </div>
    <div class="field">
      <label>Points (negative lowers score, like a bonus)</label>
      <input type="number" id="quest-points" value="${existing ? existing.points : -2}" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-quest">Cancel</button>
      <button class="btn btn-primary" id="save-quest">${existing ? 'Save' : 'Inscribe'}</button>
    </div>
  `, () => {
    document.getElementById('cancel-quest').onclick = closeModal;
    document.getElementById('save-quest').onclick = () => {
      const title = document.getElementById('quest-title').value.trim();
      if (!title) return;
      const desc = document.getElementById('quest-desc').value.trim();
      const points = parseInt(document.getElementById('quest-points').value, 10) || 0;
      const id = existing ? existing.id : uid();
      gameRef(session.gameCode, `quests/${id}`).set({ title, desc, points }).then(closeModal);
    };
  });
}

function renderQuestsPlayer() {
  const me = gameData.players[session.playerId];
  const myTeamId = me ? me.teamId : null;
  const completedForMyTeam = [];
  Object.entries(gameData.questLog).forEach(([questId, teamsMap]) => {
    if (myTeamId && teamsMap && teamsMap[myTeamId] && gameData.quests[questId]) {
      completedForMyTeam.push({ id: questId, ...gameData.quests[questId] });
    }
  });
  main.innerHTML = `
    <p class="section-eyebrow">Hole II</p>
    <h2 class="section-title">Extra Layers</h2>
    <div class="quest-ticket">
      <div class="locked-quest">
        🔒 The Swamp Lord keeps these secret. Completed layers appear below once revealed.
      </div>
    </div>
    ${completedForMyTeam.length ? completedForMyTeam.map((q) => `
      <div class="quest-ticket">
        <div class="quest-seal">✓</div>
        <div class="quest-ticket-body">
          <p class="quest-ticket-title">${escapeHtml(q.title)}</p>
          ${q.desc ? `<p class="quest-ticket-desc">${escapeHtml(q.desc)}</p>` : ''}
        </div>
        <div class="quest-perf"></div>
        <div class="quest-ticket-stub"><span class="quest-points ${q.points < 0 ? 'negative' : ''}">${q.points > 0 ? '+' : ''}${q.points} pts earned</span></div>
      </div>
    `).join('') : ''}
  `;
}

/* ===================== Board tab ===================== */

function renderBoard() {
  const teams = sortedTeams();
  if (!teams.length) { main.innerHTML = emptyState('No standings yet', 'Clans will appear here once formed.'); return; }
  const standings = teams.map((t) => ({ team: t, total: teamTotal(t.id) })).sort((a, b) => a.total - b.total);
  const isGm = session.role === 'gm';
  main.innerHTML = `
    <p class="section-eyebrow">Hole III</p>
    <h2 class="section-title">Standings</h2>
    <div class="card">
      ${standings.map((s, i) => `
        <div class="leader-row">
          <span class="leader-rank">${i + 1}</span>
          <span class="team-swatch" style="background:${s.team.color}"></span>
          <span class="leader-name">${escapeHtml(s.team.name)}</span>
          <span class="leader-score ${s.total < 0 ? 'under' : s.total > 0 ? 'over' : ''}">${s.total > 0 ? '+' : ''}${s.total}</span>
        </div>
      `).join('')}
    </div>
    ${isGm ? `<button class="btn btn-ghost-light btn-block" id="adjust-score">Swamp Lord's judgment (whole clan)</button>` : ''}
    <p class="card-sub" style="color:rgba(237,224,192,0.55); padding: 0 4px; margin-top:14px;">Lowest score wins, same as golf. Totals include watering holes visited, decrees invoked, and layers peeled back.</p>
  `;
  if (isGm) document.getElementById('adjust-score').onclick = () => adjustScoreFlow(teams);
}

function adjustScoreFlow(teams) {
  openModal(`
    <h2>Swamp Lord's Judgment</h2>
    <div class="field">
      <label>Clan</label>
      <select id="adjust-team">${teams.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>Points (positive = penalty, negative = bonus)</label>
      <input type="number" id="adjust-points" value="1" />
    </div>
    <div class="field">
      <label>Reason</label>
      <input type="text" id="adjust-reason" placeholder="e.g. Best costume bonus" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-adjust">Cancel</button>
      <button class="btn btn-primary" id="save-adjust">Decree it</button>
    </div>
  `, () => {
    document.getElementById('cancel-adjust').onclick = closeModal;
    document.getElementById('save-adjust').onclick = () => {
      const teamId = document.getElementById('adjust-team').value;
      const points = parseInt(document.getElementById('adjust-points').value, 10) || 0;
      const reason = document.getElementById('adjust-reason').value.trim() || "Swamp Lord's adjustment";
      const team = gameData.teams[teamId];
      pushLog({ type: 'gm', teamId, teamName: team.name, delta: points, reason });
      closeModal();
    };
  });
}

/* ===================== Chronicle (log) tab ===================== */

function renderLog() {
  const entries = Object.values(gameData.changeLog).sort((a, b) => b.ts - a.ts);
  main.innerHTML = `
    <p class="section-eyebrow">Hole IV</p>
    <h2 class="section-title">Chronicle</h2>
    <div class="card">
      ${entries.length ? entries.map((e) => `
        <div class="log-entry">
          <div class="log-entry-top">
            <span class="log-reason">${escapeHtml(e.reason)}</span>
            <span class="log-delta ${e.delta > 0 ? 'pos' : e.delta < 0 ? 'neg' : ''}">${e.delta > 0 ? '+' : ''}${e.delta}</span>
          </div>
          <div class="log-meta">${escapeHtml(e.teamName || '')}${e.playerName ? ' · ' + escapeHtml(e.playerName) : ''} · ${typeLabel(e.type)} · ${new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `).join('') : `<p class="card-sub">No swamp tales told yet.</p>`}
    </div>
  `;
}

function typeLabel(type) {
  return {
    sip: 'Watering hole entry',
    houserule: 'Swamp decree',
    quest: 'Extra layer',
    gm: "Swamp Lord's judgment",
    custom: "Swamp Lord's decree",
    proposal: 'Approved proposal',
  }[type] || type;
}

/* ===================== Shared ===================== */

function emptyState(title, sub) {
  return `<div class="empty-state">${sealSvg()}<p class="empty-title">${escapeHtml(title)}</p><p>${escapeHtml(sub)}</p></div>`;
}

/* ===================== Init ===================== */

boot();
