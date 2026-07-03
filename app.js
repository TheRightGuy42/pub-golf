/* ===================== Constants ===================== */

const TEAM_COLORS = ['#B08D2F', '#7A1F2B', '#3F5B3A', '#4C6B8A', '#6B4E8A', '#8A5B2F'];

const DEFAULT_RULES = [
  { key: 'spill', label: 'Spilled the ale', points: 2 },
  { key: 'nohands', label: 'No hands', points: -1 },
  { key: 'sick', label: 'Cast up their guts', points: 9 },
  { key: 'dnf', label: "Failed the quaff", points: 5 },
];

function scoreLabel(diff) {
  if (diff <= -4) return 'Legendary';
  if (diff === -3) return 'Heroic';
  if (diff === -2) return 'Valiant';
  if (diff === -1) return 'Swift';
  if (diff === 0) return 'True';
  if (diff === 1) return 'Faltering';
  if (diff === 2) return 'Reckless';
  if (diff === 3) return 'Cursed';
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
        <p class="tagline">This copy of The Tavern Open isn't connected to a quest log yet.</p>
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
  courseNameEl.textContent = 'Gather Thy Guild';
  eyebrowEl.textContent = 'The Tavern Open';
  main.innerHTML = `
    <div class="landing">
      <div class="landing-seal">${sealSvg()}</div>
      <h1>The Tavern Open</h1>
      <p class="tagline">A quest log for those who golf with ale.</p>

      <div class="card">
        <p class="card-title">Join a quest already underway</p>
        <div class="field on-parchment" style="margin-top:12px;">
          <label>Quest code</label>
          <input type="text" id="join-code" placeholder="e.g. RQNVK" maxlength="8" style="text-transform:uppercase;" />
        </div>
        <button class="btn btn-primary btn-block" id="join-btn">Join the guild</button>
      </div>

      <div class="divider">or</div>

      <div class="card">
        <p class="card-title">Found the Quest Master's mantle?</p>
        <p class="card-sub" style="margin:6px 0 14px;">Start a new round and receive a code to share with your party.</p>
        <button class="btn btn-gold btn-block" id="create-btn">Begin a new quest</button>
      </div>
    </div>
  `;
  document.getElementById('join-btn').onclick = () => startJoinFlow(document.getElementById('join-code').value.trim().toUpperCase());
  document.getElementById('create-btn').onclick = () => startCreateFlow();
}

/* ===================== Create game (GM) ===================== */

function startCreateFlow() {
  openModal(`
    <h2>Found a New Quest</h2>
    <div class="field">
      <label>Campaign name</label>
      <input type="text" id="course-name-input" placeholder="e.g. Friday's Fellowship Crawl" />
    </div>
    <div class="field">
      <label>Your name (Quest Master)</label>
      <input type="text" id="gm-name-input" placeholder="e.g. Aldric" />
    </div>
    <div class="field">
      <label>Set a Quest Master passcode</label>
      <input type="password" id="gm-pass-input" placeholder="Only you'll need this" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-create">Cancel</button>
      <button class="btn btn-primary" id="confirm-create">Found it</button>
    </div>
  `, () => {
    document.getElementById('cancel-create').onclick = closeModal;
    document.getElementById('confirm-create').onclick = () => {
      const courseName = document.getElementById('course-name-input').value.trim() || 'The Tavern Open';
      const gmName = document.getElementById('gm-name-input').value.trim() || 'Quest Master';
      const gmPasscode = document.getElementById('gm-pass-input').value.trim();
      if (!gmPasscode) { toast('Set a passcode so you can rejoin as Quest Master.'); return; }
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
  const rules = {};
  DEFAULT_RULES.forEach((r) => { rules[uid()] = { label: r.label, points: r.points }; });

  gameRef(code).set({ meta, rules }).then(() => {
    closeModal();
    saveSession({ gameCode: code, role: 'gm', gmPasscode });
    session = loadSession();
    toast(`Quest founded! Code: ${code}`);
    attachToGame(code);
  }).catch((e) => toast('Could not reach the realm — check your connection.'));
}

/* ===================== Join game (Player) ===================== */

function startJoinFlow(code) {
  if (!code) { toast('Enter a quest code first.'); return; }
  gameRef(code, 'meta').once('value').then((snap) => {
    if (!snap.exists()) { toast('No quest found with that code.'); return; }
    const meta = snap.val();
    openModal(`
      <h2>Join ${escapeHtml(meta.courseName)}</h2>
      <div class="field">
        <label>Your name</label>
        <input type="text" id="player-name-input" placeholder="e.g. Rowan" />
      </div>
      <p class="card-sub" style="color:rgba(237,224,192,0.6); margin-bottom:16px;">You'll pick or be assigned a guild once inside.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost-light" id="cancel-join">Cancel</button>
        <button class="btn btn-primary" id="confirm-join">Enter the tavern</button>
      </div>
      <div class="divider">or</div>
      <button class="btn btn-ghost-light btn-block" id="gm-instead">I am this quest's Quest Master</button>
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
    <h2>Quest Master Login</h2>
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
      toast('This quest no longer exists.');
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
    if (entry.type === 'gm' && entry.teamId === teamId) total += entry.delta;
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
  courseNameEl.textContent = gameData.meta.courseName || 'The Tavern Open';
  eyebrowEl.innerHTML = role === 'gm' ? 'Quest Master' : `Adventurer <span class="role-badge player">${escapeHtml(currentPlayerName())}</span>`;
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
  if (activeTab === 'quests') tabBar.querySelector('[data-tab="quests"]').innerHTML = `<span class="tab-num">II</span><span>Quests</span>`;

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
    <h2 class="section-title">Pick a guild, ${escapeHtml(currentPlayerName())}</h2>
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
  openModal(`
    <h2>Quest Menu</h2>
    <div class="code-display">${session.gameCode}</div>
    <p class="card-sub" style="text-align:center; color:rgba(237,224,192,0.6); margin-top:-10px; margin-bottom:18px;">Share this code with your party</p>
    ${isGm ? `<button class="btn btn-gold btn-block" id="menu-setup" style="margin-bottom:10px;">Setup: teams, taverns &amp; rules</button>` : ''}
    <button class="btn btn-ghost-light btn-block" id="menu-copy" style="margin-bottom:10px;">Copy quest code</button>
    <button class="btn btn-danger btn-block" id="menu-leave">Leave this quest</button>
  `, () => {
    if (isGm) document.getElementById('menu-setup').onclick = () => { closeModal(); openSetupModal(); };
    document.getElementById('menu-copy').onclick = () => {
      navigator.clipboard?.writeText(session.gameCode).then(() => toast('Code copied!')).catch(() => toast(session.gameCode));
    };
    document.getElementById('menu-leave').onclick = () => {
      clearSession(); session = null; gameData = null; closeModal(); renderLanding();
    };
  });
}

/* ===================== Setup (GM) ===================== */

function openSetupModal() {
  openModal(`
    <h2>Chart the Quest</h2>
    <div class="field">
      <label>Campaign name</label>
      <input type="text" id="setup-course-name" value="${escapeHtml(gameData.meta.courseName)}" />
    </div>
    <button class="btn btn-gold btn-block" id="setup-save-name" style="margin-bottom:18px;">Save name</button>

    <div class="card-row" style="margin-bottom:8px;">
      <p class="card-title" style="color:var(--parchment); font-family:var(--font-display);">Guilds (teams)</p>
      <button class="btn btn-ghost-light btn-sm" id="setup-add-team">+ Add guild</button>
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
      </div>`).join('') || `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No guilds yet.</p>`}
    </div>

    <div class="card-row" style="margin-bottom:8px;">
      <p class="card-title" style="color:var(--parchment); font-family:var(--font-display);">Taverns (holes)</p>
      <button class="btn btn-ghost-light btn-sm" id="setup-add-hole">+ Add tavern</button>
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
      </div>`).join('') || `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No taverns yet.</p>`}
    </div>

    <div class="card-row" style="margin-bottom:8px;">
      <p class="card-title" style="color:var(--parchment); font-family:var(--font-display);">Tavern decrees (house rules)</p>
      <button class="btn btn-ghost-light btn-sm" id="setup-add-rule">+ Add decree</button>
    </div>
    <div id="setup-rule-list">${allRules().map((r) => `
      <div class="list-item" style="border-bottom-color:rgba(237,224,192,0.15);">
        <p class="list-item-title" style="color:var(--parchment);">${escapeHtml(r.label)}</p>
        <div class="list-item-actions">
          <button class="btn btn-ghost-light btn-sm" data-edit-rule="${r.id}">${r.points > 0 ? '+' : ''}${r.points} pts</button>
          <button class="icon-action" style="color:var(--crimson-light);" data-del-rule="${r.id}">✕</button>
        </div>
      </div>`).join('') || `<p class="card-sub" style="color:rgba(237,224,192,0.5);">No decrees yet.</p>`}
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="setup-close">Done</button>
    </div>
  `, (root) => {
    document.getElementById('setup-close').onclick = closeModal;
    document.getElementById('setup-save-name').onclick = () => {
      gameRef(session.gameCode, 'meta/courseName').set(root.querySelector('#setup-course-name').value.trim() || 'The Tavern Open');
      toast('Campaign renamed.');
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
    <h2>${existing ? 'Edit guild' : 'Found a guild'}</h2>
    <div class="field">
      <label>Guild name</label>
      <input type="text" id="team-name" placeholder="e.g. The Ale Wolves" value="${existing ? escapeHtml(existing.name) : ''}" />
    </div>
    <div class="field">
      <label>Banner colour</label>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${TEAM_COLORS.map((c) => `<button type="button" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:3px solid ${(existing ? existing.color : suggested) === c ? '#fff' : 'transparent'};"></button>`).join('')}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost-light" id="cancel-team">Cancel</button>
      <button class="btn btn-primary" id="save-team">${existing ? 'Save' : 'Found guild'}</button>
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
    <h2>${existing ? 'Edit tavern' : 'Add a tavern'}</h2>
    <div class="field">
      <label>Tavern name</label>
      <input type="text" id="hole-name" placeholder="e.g. The Fox &amp; Hound" value="${existing ? escapeHtml(existing.name) : ''}" />
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
      <button class="btn btn-primary" id="save-hole">${existing ? 'Save' : 'Add tavern'}</button>
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
    <h2>${existing ? 'Edit decree' : 'New tavern decree'}</h2>
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
    main.innerHTML = emptyState('The scroll is blank', session.role === 'gm' ? 'Add guilds and taverns from the Quest Menu to begin.' : "Your Quest Master hasn't charted the taverns yet.");
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
        <div class="hole-num">${idx + 1}</div>
        <div class="hole-of">of ${total} taverns</div>
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
      ${players.map((p) => renderPlayerScoreRow(p, hole, team)).join('')}
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
    ${myTeam ? renderPlayerScoreCard(me, hole, myTeam, teammates) : emptyState('No guild yet', 'Ask your Quest Master to add you to a guild.')}
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
          <p class="card-sub" style="margin-bottom:4px;">Fellow guild members</p>
          ${teammates.map((p) => {
            const cell = gameData.scores[p.id] && gameData.scores[p.id][hole.id];
            const sips = cell ? cell.sips : null;
            return `<div class="teammate-row"><span class="teammate-name">${escapeHtml(p.name)}</span><span class="teammate-sips">${sips === null || sips === undefined ? 'not yet' : sips + ' sips'}</span></div>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderPlayerScoreRow(player, hole, team, ownRow) {
  const cell = (gameData.scores[player.id] && gameData.scores[player.id][hole.id]) || { sips: null, ruleFlags: {} };
  const sips = cell.sips;
  const diff = sips === null || sips === undefined ? null : sips - hole.par;
  const label = diff === null ? '—' : scoreLabel(diff);
  const tagClass = diff === null ? 'par' : diff < 0 ? 'under' : diff > 0 ? 'over' : 'par';
  const rules = allRules();
  const canEdit = session.role === 'gm' || ownRow;
  return `
    <div style="margin-bottom:14px;" data-player-block="${player.id}">
      <div class="card-row" style="margin-bottom:8px;">
        <span class="card-sub" style="margin:0; font-weight:600; color:var(--ink);">${ownRow ? 'You' : escapeHtml(player.name)}</span>
        <span class="score-tag ${tagClass}">${label}</span>
      </div>
      <div class="card-row">
        <span class="card-sub" style="margin:0;">Sips taken</span>
        <div class="stepper">
          <button ${canEdit ? '' : 'disabled style="opacity:0.3;"'} data-dec="${player.id}">−</button>
          <span class="stepper-val">${sips === null || sips === undefined ? '–' : sips}</span>
          <button ${canEdit ? '' : 'disabled style="opacity:0.3;"'} data-inc="${player.id}">+</button>
        </div>
      </div>
      ${canEdit ? `<div class="house-rules">
        ${rules.map((r) => {
          const on = !!(cell.ruleFlags && cell.ruleFlags[r.id]);
          const cls = !on ? '' : r.points >= 0 ? 'active-plus' : 'active-minus';
          return `<button type="button" class="house-chip ${cls}" data-rule-player="${player.id}" data-rule-id="${r.id}">${escapeHtml(r.label)} ${r.points > 0 ? '+' : ''}${r.points}</button>`;
        }).join('')}
      </div>` : ''}
    </div>
  `;
}

function wireCardControls(hole) {
  main.querySelectorAll('[data-dec]').forEach((el) => el.onclick = () => adjustSips(el.dataset.dec, hole, -1));
  main.querySelectorAll('[data-inc]').forEach((el) => el.onclick = () => adjustSips(el.dataset.inc, hole, 1));
  main.querySelectorAll('[data-rule-player]').forEach((el) => el.onclick = () => toggleRule(el.dataset.rulePlayer, hole, el.dataset.ruleId));
}

function playerTeam(playerId) {
  const p = gameData.players[playerId];
  return p ? gameData.teams[p.teamId] : null;
}

function adjustSips(playerId, hole, delta) {
  const path = `scores/${playerId}/${hole.id}`;
  const cell = (gameData.scores[playerId] && gameData.scores[playerId][hole.id]) || { sips: hole.par, ruleFlags: {} };
  const oldPts = playerHolePoints(playerId, hole);
  const newSips = Math.max(0, (cell.sips === null || cell.sips === undefined ? hole.par : cell.sips) + delta);
  gameRef(session.gameCode, `${path}/sips`).set(newSips).then(() => {
    const newPts = (newSips - hole.par) + ruleFlagPoints(cell.ruleFlags);
    const team = playerTeam(playerId);
    const player = gameData.players[playerId];
    pushLog({
      type: 'sip', teamId: player.teamId, teamName: team ? team.name : '—',
      playerId, playerName: player.name,
      delta: newPts - oldPts,
      reason: `${hole.name}: sips set to ${newSips}`,
    });
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

/* ===================== Quests tab ===================== */

function renderQuests() {
  if (session.role === 'gm') renderQuestsGm();
  else renderQuestsPlayer();
}

function renderQuestsGm() {
  const quests = Object.entries(gameData.quests).map(([id, q]) => ({ id, ...q }));
  const teams = sortedTeams();
  main.innerHTML = `
    <p class="section-eyebrow">Hole II</p>
    <h2 class="section-title">Side Quests</h2>
    <p class="card-sub" style="color:rgba(237,224,192,0.55); margin-bottom:16px;">Only you can see this board — quests stay secret to the party until completed.</p>
    <button class="btn btn-ghost-light btn-block" id="add-quest" style="margin-bottom:16px;">+ Inscribe a new quest</button>
    ${quests.length ? quests.map((q) => renderQuestTicketGm(q, teams)).join('') : emptyState('No quests inscribed', 'Add reusable side quests — they stay saved for every future round.')}
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
      reason: `${done ? 'Reversed' : 'Completed'} side quest: ${q.title}`,
    });
  });
}

function questFlow(editId) {
  const existing = editId ? { id: editId, ...gameData.quests[editId] } : null;
  openModal(`
    <h2>${existing ? 'Edit quest' : 'Inscribe a side quest'}</h2>
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
    <h2 class="section-title">Side Quests</h2>
    <div class="quest-ticket">
      <div class="locked-quest">
        🔒 The Quest Master keeps these secret. Completed quests appear below once revealed.
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
  if (!teams.length) { main.innerHTML = emptyState('No standings yet', 'Guilds will appear here once formed.'); return; }
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
    ${isGm ? `<button class="btn btn-ghost-light btn-block" id="adjust-score">Quest Master's judgment (adjust a guild's score)</button>` : ''}
    <p class="card-sub" style="color:rgba(237,224,192,0.55); padding: 0 4px; margin-top:14px;">Lowest score wins, same as golf. Totals include taverns visited, decrees invoked, and quests completed.</p>
  `;
  if (isGm) document.getElementById('adjust-score').onclick = () => adjustScoreFlow(teams);
}

function adjustScoreFlow(teams) {
  openModal(`
    <h2>Quest Master's Judgment</h2>
    <div class="field">
      <label>Guild</label>
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
      const reason = document.getElementById('adjust-reason').value.trim() || 'Quest Master adjustment';
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
      `).join('') : `<p class="card-sub">No deeds recorded yet.</p>`}
    </div>
  `;
}

function typeLabel(type) {
  return { sip: 'Tavern entry', houserule: 'Decree', quest: 'Side quest', gm: "Quest Master's judgment" }[type] || type;
}

/* ===================== Shared ===================== */

function emptyState(title, sub) {
  return `<div class="empty-state">${sealSvg()}<p class="empty-title">${escapeHtml(title)}</p><p>${escapeHtml(sub)}</p></div>`;
}

/* ===================== Init ===================== */

boot();

