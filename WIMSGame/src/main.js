import './style.css';
import { World, drawMap } from './world.js';
import { GameAudio } from './audio.js';
import { makeNeighborhood, canMove, nearestPorch, screenDirection, scoreFor, safeName, ROUND_SECONDS, HIT_COST, PROPS } from './rules.js';

const $ = selector => document.querySelector(selector);
const sandwich = `<svg viewBox="0 0 64 42" aria-hidden="true"><path d="M8 22C0 5 19 2 31 4c16-5 31 4 26 18Z" fill="#ecb449" stroke="currentColor" stroke-width="2.6"/><path d="m6 23 8 5 8-4 10 5 10-5 9 4 7-5v8H6Z" fill="#83a44c" stroke="currentColor" stroke-width="2.6"/><path d="M7 32h50c1 9-47 9-50 0Z" fill="#ecb449" stroke="currentColor" stroke-width="2.6"/><path d="M14 12h4m11-2h4m10 3h4" stroke="#fff6db" stroke-width="2.8" stroke-linecap="round"/></svg>`;
const arrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

$('#app').innerHTML = `
<header class="site-header">
  <a class="wordmark" href="../" aria-label="Back to whereismysandwich.com">${sandwich}<span>WHERE IS MY<br><strong>SANDWICH?</strong></span></a>
  <div class="edition"><span class="live-dot"></span> THE HUNGRY HUMAN SIMULATOR <span class="edition-no">VOL. 01</span></div>
  <nav aria-label="Game tools"><a class="header-btn back-link" href="../" aria-label="Back to the case file">&larr; <span>Case File</span></a><button id="board-open" class="header-btn" aria-label="Leaderboard">🏆 <span>Leaderboard</span></button><button id="audio" class="icon-btn" aria-label="Turn sound on" aria-pressed="false">♫<span class="sound-slash">/</span></button><button id="help" class="icon-btn" aria-label="How to play">?</button></nav>
</header>
<main id="game-shell">
  <canvas id="world" aria-label="3D neighborhood game. Use keyboard arrows or WASD to move and E to check porches." tabindex="0"></canvas>
  <div class="canvas-vignette"></div>
  <section id="intro" class="intro" aria-labelledby="intro-title">
    <div class="intro-copy">
      <div class="eyebrow"><span class="little-line"></span> A VERY PERSONAL FOOD EMERGENCY</div>
      <h1 id="intro-title">WHERE IS <br>MY <span class="sandwich-word">SANDWICH<span class="underline"></span></span><span class="question">?</span></h1>
      <p class="intro-description">Your food is “delivered.” <br>Your doorstep is suspiciously empty.<br><strong>Time to take matters into your own hands.</strong></p>
      <button id="start" class="primary-btn">FIND MY SANDWICH ${arrow}</button>
      <div class="intro-meta"><span>100 seconds.</span><span>16 suspicious porches.</span><span>One very hungry you.</span></div>
      <div class="control-chips"><span><kbd>W A S D</kbd> or arrows</span><span><kbd>E</kbd> check porch</span><span class="touch-chip">Touch controls ready</span></div>
    </div>
    <div class="phone-area">
      <div class="sticker">DELIVERED*<small>*to literally somewhere</small></div>
      <div class="phone">
        <div class="phone-status"><span>6:02</span><span class="phone-notch"></span><span>▮▮▮ ▰</span></div>
        <div class="phone-app"><span class="app-logo">S<span>F</span></span><div>SUPER FOODS<small>Delivery update</small></div><span class="notification-dot"></span></div>
        <div class="delivery-heading">Your order <br>has arrived. <span>✓</span></div>
        <div class="delivery-photo"><img class="photo-image" alt="Delivery photo showing the unfamiliar porch where your sandwich was left"><span class="photo-label">PHOTO PROOF. ALLEGEDLY.</span></div>
        <div class="phone-detail"><span>Left at your front door</span><small>Enjoy your meal! :)</small></div>
        <div class="phone-reaction">“That's not my house.”</div>
        <div class="phone-home"></div>
      </div>
      <div class="photo-note"><span>↖</span> Your only lead.<br>Remember this porch.</div>
    </div>
    <div class="world-caption"><span class="live-dot"></span> WELCOME TO THE WRONG NEIGHBORHOOD</div>
  </section>
  <div id="hud" class="hud" hidden>
    <div class="hunger-card"><div class="hunger-title"><span>HUNGER METER</span><strong id="hunger-time">100s</strong></div><div class="hunger-track"><div id="hunger-fill"></div></div><div class="hunger-caption"><span id="hunger-mood">Mildly inconvenienced</span><span id="checked-count">0 / 16 porches</span></div></div>
    <div class="hud-left"><span class="objective-tag">OPERATION: LUNCH</span><strong>Find the porch in the photo.</strong><button id="photo-open" class="photo-btn"><img class="photo-image" alt="Your delivery photo"><span>VIEW THE CLUE <kbd>Q</kbd></span></button></div>
    <div class="map-card"><div><span>THE NEIGHBORHOOD</span><span class="map-you">● YOU</span></div><canvas id="map" width="180" height="180" aria-label="Neighborhood map. The orange dot is you."></canvas><small>Different street. Same appetite.</small></div>
    <button id="pause" class="pause-btn" aria-label="Pause game">Ⅱ</button><button id="end-replay" class="primary-btn end-replay" hidden>HUNT ANOTHER SANDWICH →</button>
    <div class="bottom-bar"><span class="desktop-controls"><kbd>WASD</kbd> move <kbd>E</kbd> check <kbd>SHIFT</kbd> sprint <kbd>P</kbd> pause</span><span id="street-name">Pickle Lane</span></div>
    <div id="porch-prompt" class="porch-prompt" hidden><span id="porch-label"></span><button id="check-desktop"><kbd>E</kbd> CHECK PORCH ${arrow}</button></div>
    <div class="touch-controls"><div id="joystick" class="joystick" role="group" aria-label="Movement joystick"><div class="joystick-cross">✣</div><div id="joystick-thumb"></div></div><div class="touch-actions"><button id="sprint" class="sprint-btn">↯<span>SPRINT</span></button><button id="check-touch" class="check-btn">${sandwich}<span>CHECK</span></button></div></div>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div id="hit-flash" class="hit-flash"></div>
  <div id="load-error" class="load-error" hidden><h2>This sandwich needs 3D.</h2><p>Your browser couldn't start WebGL. Try a current browser with hardware acceleration enabled.</p><button onclick="location.reload()" class="primary-btn">TRY AGAIN</button></div>
</main>
<footer class="site-footer"><span>ONE SANDWICH. A WHOLE UNNECESSARY ADVENTURE.</span><span>FICTIONAL DELIVERY SERVICE. REAL HUNGER ENERGY. ${sandwich}</span></footer>
<dialog id="modal" aria-labelledby="modal-title"><button id="modal-close" class="modal-close" aria-label="Close dialog">×</button><div id="modal-content"></div></dialog>`;

const audio = new GameAudio();
const seed = crypto.getRandomValues(new Uint32Array(1))[0];
const neighborhood = makeNeighborhood(seed);
let world;
try { world = new World($('#world'), neighborhood); }
catch (error) {
  console.error('Unable to start the 3D game:', error);
  $('#load-error').hidden = false;
  $('#intro').hidden = true;
}
const state = {
  mode: 'intro', playing: false, hunger: ROUND_SECONDS, elapsed: 0,
  hits: 0, checked: new Set(), nearby: null, invincible: 0,
  player: { x: -26, z: -20, moving: false, angle: 0 },
};
const input = { keys: new Set(), joy: { x: 0, y: 0 }, sprint: false, waypoint: null };
let joystickPointer = null;
let ticket = null;
let roundId = 0;
let previousTime = performance.now();
let animationTime = 0;
let lastMap = 0;
let pauseBeforeDialog = false;
let toastTimer;
let boardMode = 'local';
let runResult = null;
let saving = false;
let scoreSaved = false;

function syncPhoto() {
  if (!world) return;
  document.querySelectorAll('.photo-image').forEach(img => { img.src = world.photo; });
}
syncPhoto();

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2900);
}

async function api(path, options = {}) {
  const response = await fetch(new URL(`api/${path}`, new URL('.', location.href)), { ...options, signal: AbortSignal.timeout(4500), headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error(`Leaderboard ${response.status}`);
  return response.json();
}

function localScores() {
  try {
    const parsed = JSON.parse(localStorage.getItem('wims-scores-v1') || '[]');
    return Array.isArray(parsed) ? parsed.filter(s => Number.isFinite(s.score) && typeof s.name === 'string').slice(0, 10) : [];
  } catch { return []; }
}

async function getScores() {
  try { const data = await api('scores'); boardMode = 'global'; return data.scores; }
  catch { boardMode = 'local'; return localScores(); }
}

function setMode(mode) {
  state.mode = mode; state.playing = mode === 'playing';
  $('#intro').hidden = mode !== 'intro';
  $('#hud').hidden = mode === 'intro';
  $('#game-shell').classList.toggle('in-game', mode !== 'intro');
}

function resetInputs() {
  joystickPointer = null;
  input.keys.clear(); input.joy = { x: 0, y: 0 }; input.sprint = false; input.waypoint = null;
  $('#joystick-thumb').style.transform = 'translate(-50%, -50%)';
  $('#sprint').classList.remove('pressed');
  state.player.moving = false;
}

function startGame() {
  if (!world) return;
  if ($('#modal').open) $('#modal').close();
  pauseBeforeDialog = false;
  audio.unlock(); audio.play('start');
  world.reset(); resetInputs();
  // Re-roll the actual porch; the photo and hints always come from that porch.
  if (roundId > 0) {
    const last = neighborhood.target;
    const candidates = neighborhood.houses.filter(h => h.id >= 4 && h.id !== last);
    neighborhood.target = candidates[Math.floor(Math.random() * candidates.length)].id;
  }
  world.takePhoto(neighborhood.houses[neighborhood.target]); syncPhoto();
  Object.assign(state, { hunger: ROUND_SECONDS, elapsed: 0, hits: 0, checked: new Set(), nearby: null, invincible: 0 });
  Object.assign(state.player, { x: -26, z: -20, moving: false });
  ticket = null; runResult = null; saving = false; scoreSaved = false;
  const current = ++roundId;
  api('runs', { method: 'POST', body: JSON.stringify({ seed }) }).then(data => { if (current === roundId) ticket = data.token; }).catch(() => {});
  setMode('playing'); updateHud();
  $('#end-replay').hidden = true;
  $('#world').focus({ preventScroll: true });
  notify('Study the photo. Cross the street. Recover lunch.');
}

function updateHud() {
  $('#hunger-time').textContent = `${Math.max(0, Math.ceil(state.hunger))}s`;
  $('#hunger-fill').style.width = `${Math.max(0, state.hunger / ROUND_SECONDS * 100)}%`;
  $('#hunger-fill').style.backgroundColor = state.hunger < 25 ? '#d85b37' : state.hunger < 50 ? '#e6a238' : '#91a854';
  $('#hunger-mood').textContent = state.hunger > 70 ? 'Mildly inconvenienced' : state.hunger > 40 ? 'Aggressively peckish' : state.hunger > 20 ? 'Running on crumbs' : 'The hangry is happening';
  $('#checked-count').textContent = `${state.checked.size} / 16 porches`;
  $('#porch-prompt').hidden = !state.nearby || state.mode !== 'playing';
  $('#check-touch').disabled = !state.nearby;
  if (state.nearby) {
    $('#porch-label').textContent = `${state.nearby.number} ${state.nearby.street}`;
    $('#check-desktop').innerHTML = `<kbd>E</kbd> ${state.checked.has(state.nearby.id) ? 'ALREADY CHECKED' : 'CHECK PORCH'} ${arrow}`;
  }
  const block = (state.player.x > 0 ? 1 : 0) + (state.player.z > 0 ? 2 : 0);
  $('#street-name').textContent = neighborhood.houses[block * 4].street;
}

function checkPorch() {
  if (!state.playing || !state.nearby) { if (state.playing) notify('Get closer to a front door to check its delivery bag.'); return; }
  const h = state.nearby;
  if (state.checked.has(h.id)) { notify('Already checked. Still a bag of disappointment.'); return; }
  state.checked.add(h.id);
  if (h.id === neighborhood.target) { finish(true); return; }
  world.bags[h.id].visible = false;
  world.addOwner(h); audio.play('wrong');
  const messages = ['That is a bag of socks. Owner approaching!', 'Just decorative gravel. “GET OFF MY LAWN!”', 'Someone ordered one single olive. Keep moving!', 'A delivery of emotional support napkins. Run!', 'No sandwich. Just 37 condiment packets.'];
  notify(messages[h.id % messages.length]); updateHud();
}

function damage(message, obstacle) {
  if (state.invincible > 0) return;
  state.hunger = Math.max(0, state.hunger - HIT_COST); state.hits++; state.invincible = 2.4;
  audio.play('hit'); notify(`${message} −${HIT_COST} hunger!`);
  const dx = state.player.x - obstacle.x, dz = state.player.z - obstacle.z;
  const size = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < 6; i++) movePlayer(dx / size * 0.25, dz / size * 0.25);
  input.waypoint = null;
  $('#hit-flash').classList.add('active');
  setTimeout(() => $('#hit-flash').classList.remove('active'), 250);
}

function movePlayer(dx, dz) {
  const p = state.player;
  if (canMove(p.x + dx, p.z, neighborhood.houses)) p.x += dx;
  if (canMove(p.x, p.z + dz, neighborhood.houses)) p.z += dz;
}

function chase(mesh, goal, speed, dt) {
  const dx = goal.x - mesh.position.x, dz = goal.z - mesh.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.15) {
    const step = Math.min(speed * dt, distance);
    const x = dx / distance * step, z = dz / distance * step;
    if (canMove(mesh.position.x + x, mesh.position.z, neighborhood.houses, 0.35)) mesh.position.x += x;
    if (canMove(mesh.position.x, mesh.position.z + z, neighborhood.houses, 0.35)) mesh.position.z += z;
    mesh.rotation.y = Math.atan2(dx, dz);
  }
  return distance;
}

function update(dt) {
  state.elapsed += dt;
  let x = 0, y = 0;
  const keys = input.keys;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  x += input.joy.x; y += input.joy.y;
  let direction = screenDirection(x, y);
  if (Math.hypot(x, y) > 0.08) input.waypoint = null;
  else if (input.waypoint) {
    const dx = input.waypoint.x - state.player.x, dz = input.waypoint.z - state.player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.4) input.waypoint = null;
    else direction = { x: dx / distance, z: dz / distance };
  }
  const moving = Math.hypot(direction.x, direction.z) > 0.08;
  const sprint = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight') || input.sprint);
  const speed = sprint ? 10.5 : 6.3;
  const before = { x: state.player.x, z: state.player.z };
  movePlayer(direction.x * speed * dt, direction.z * speed * dt);
  state.player.moving = Math.hypot(state.player.x - before.x, state.player.z - before.z) > 0.005;
  if (moving) state.player.angle = Math.atan2(direction.x, direction.z);
  // Stop click movement at obstacles instead of endlessly walking against a wall.
  if (input.waypoint && !state.player.moving) input.waypoint = null;
  state.hunger = Math.max(0, state.hunger - dt * (sprint ? 1.65 : 1));
  state.invincible = Math.max(0, state.invincible - dt);
  world.cars.forEach(car => {
    car.at += car.speed * car.dir * dt;
    if (car.at > 42) car.at = -42;
    if (car.at < -42) car.at = 42;
    const cx = car.axis === 'x' ? car.at : car.lane;
    const cz = car.axis === 'z' ? car.at : car.lane;
    const dx = Math.abs(state.player.x - cx), dz = Math.abs(state.player.z - cz);
    if (dx < (car.axis === 'x' ? 2.1 : 1.3) && dz < (car.axis === 'z' ? 2.1 : 1.3)) damage('SUPER delivery. Super bad timing.', { x: cx, z: cz });
  });
  world.dogs.forEach(dog => {
    const distance = Math.hypot(state.player.x - dog.mesh.position.x, state.player.z - dog.mesh.position.z);
    dog.chasing = state.elapsed > 4 && distance < (dog.chasing ? 10 : 4.8);
    const goal = dog.chasing ? state.player : { x: dog.home.x + Math.sin(animationTime * 0.7 + dog.phase) * 1.8, z: dog.home.z + Math.cos(animationTime * 0.7 + dog.phase) * 1.8 };
    chase(dog.mesh, goal, dog.chasing ? 4.6 : 1.8, dt);
    dog.mesh.position.y = Math.abs(Math.sin(animationTime * 12 + dog.phase)) * 0.08;
    if (distance < 1) damage('Dog thinks you are the sandwich.', dog.mesh.position);
  });
  world.owners = world.owners.filter(owner => {
    owner.ttl -= dt;
    if (owner.ttl <= 0) { world.scene.remove(owner.mesh); return false; }
    const distance = chase(owner.mesh, state.player, 4.1, dt);
    if (distance < 1.1) damage('A spirited discussion about property lines.', owner.mesh.position);
    return true;
  });
  state.nearby = nearestPorch(state.player.x, state.player.z, neighborhood.houses);
  updateHud();
  if (state.hunger <= 0) finish(false);
}

function openModal(html, pause = true) {
  pauseBeforeDialog = pause && state.mode === 'playing';
  if (pauseBeforeDialog) { state.playing = false; resetInputs(); }
  $('#modal-content').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
  $('#modal-close').focus();
}

function resumeAfterDialog() {
  if (!pauseBeforeDialog) return;
  if (state.mode === 'playing') { state.playing = true; $('#world').focus({ preventScroll: true }); }
  pauseBeforeDialog = false; resetInputs();
}
function closeGameDialog() { $('#modal').close(); resumeAfterDialog(); }
$('#modal').addEventListener('close', resumeAfterDialog);
$('#modal').addEventListener('cancel', event => { event.preventDefault(); closeGameDialog(); });
$('#modal-close').addEventListener('click', closeGameDialog);
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const r = $('#modal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeGameDialog(); } });

function showPhoto() {
  if (!world) return;
  const h = neighborhood.houses[neighborhood.target];
  openModal(`<div class="eyebrow">YOUR ONLY LEAD</div><h2 id="modal-title">That's not my house.</h2><img class="clue-large" src="${world.photo}" alt="The destination porch with a ${h.door.name} door and ${PROPS[h.prop]}"><div class="clue-details"><span>LOOK FOR</span><strong>A ${h.door.name} door + a ${PROPS[h.prop]}.</strong><p>The address plate is in the photo. Street names appear as you move. The game is paused while you investigate.</p></div><button id="photo-resume" class="primary-btn">GOT IT. LET'S GO. ${arrow}</button>`);
  $('#photo-resume').addEventListener('click', closeGameDialog);
}

function showHelp() {
  openModal(`<div class="eyebrow">AN UNNECESSARY ADVENTURE</div><h2 id="modal-title">Lunch is out there.</h2><ol class="how-list"><li><strong>Study the delivery photo.</strong><span>Remember the door color, address plate, and garden ornament. Press Q to take another look.</span></li><li><strong>Search the neighborhood.</strong><span>WASD or arrows move you in screen directions. Mouse users can click a destination. On mobile, drag the joystick.</span></li><li><strong>Check the front porches.</strong><span>Stand near a front door and press E or tap CHECK. A wrong porch may summon a territorial homeowner.</span></li><li><strong>Stay hungry. Stay moving.</strong><span>You have 100 seconds of hunger. Dogs, owners, and traffic cost 8 seconds per hit. Hold Shift or SPRINT to run, but running drains hunger faster.</span></li><li><strong>Find lunch. Become a legend.</strong><span>Your score rewards hunger left, fewer hits, and fewer wrong porches. P or Escape pauses. Opening a clue or leaderboard also pauses.</span></li></ol><p class="fine-print">SUPER FOODS is a fictional delivery service. No actual sandwiches were harmed. Yet.</p>`);
}

function pauseGame() {
  if (!state.playing) return;
  openModal(`<div class="eyebrow">A MOMENT TO DIGEST</div><h2 id="modal-title">Hold the mayo.</h2><p class="modal-description">Your Hunger Meter is paused.<br>The neighborhood can wait.</p><button id="resume" class="primary-btn">BACK TO THE HUNT ${arrow}</button><button id="restart" class="secondary-btn">Start a fresh hunt</button>`);
  $('#resume').addEventListener('click', closeGameDialog);
  $('#restart').addEventListener('click', startGame);
}

function finish(won) {
  setMode(won ? 'won' : 'lost'); resetInputs();
  $('#end-replay').hidden = false;
  $('#porch-prompt').hidden = true;
  audio.play(won ? 'win' : 'lose');
  const target = neighborhood.houses[neighborhood.target];
  runResult = { score: scoreFor(state.hunger, state.hits, state.checked.size), hunger: state.hunger, elapsed: state.elapsed, hits: state.hits, checked: state.checked.size, seed };
  const results = won ? `<div class="result-sandwich">${sandwich}</div><div class="eyebrow">DELIVERED. FINALLY.</div><h2 id="modal-title">SANDWICH<br>SECURED.</h2><p class="modal-description">Against all odds, lunch has been located.<br>It only took an entire neighborhood expedition.</p><div class="result-stats"><div><strong>${runResult.score.toLocaleString()}</strong><span>POINTS</span></div><div><strong>${state.elapsed.toFixed(1)}s</strong><span>HUNT TIME</span></div><div><strong>${state.hits}</strong><span>INCIDENTS</span></div></div><form id="score-form"><label for="player-name">YOUR NAME IN SANDWICH HISTORY</label><div class="score-input"><input id="player-name" name="name" maxlength="18" placeholder="Hungry human" autocomplete="nickname"><button type="submit" class="primary-btn">SAVE SCORE ${arrow}</button></div><p id="save-status" role="status"></p></form>` : `<div class="result-sandwich sad">${sandwich}</div><div class="eyebrow">HUNGER HAS ENTERED THE CHAT</div><h2 id="modal-title">OFFICIALLY<br>HANGRY.</h2><p class="modal-description">Customer support suggests you eat the receipt.<br>We suggest another attempt.</p><div class="missed-clue">Your sandwich was at <strong>${target.number} ${target.street}</strong><br>${target.door.name} door · ${PROPS[target.prop]}</div>`;
  openModal(`${results}<button id="play-again" class="${won ? 'secondary-btn' : 'primary-btn'}">${won ? 'HUNT ANOTHER SANDWICH' : 'I STILL WANT MY SANDWICH'} ${arrow}</button><button id="results-board" class="text-btn">View the leaderboard →</button>`, false);
  $('#play-again').addEventListener('click', startGame);
  $('#results-board').addEventListener('click', showBoard);
  if (won) {
    try { $('#player-name').value = localStorage.getItem('wims-player-name') || ''; } catch {}
    $('#score-form').addEventListener('submit', saveScore);
  }
}

async function saveScore(event) {
  event.preventDefault(); if (saving || scoreSaved || !runResult) return;
  saving = true;
  const button = $('#score-form button'); button.disabled = true; button.textContent = 'SAVING…';
  const name = safeName($('#player-name').value);
  const result = { ...runResult, name, date: new Date().toISOString() };
  try { localStorage.setItem('wims-player-name', name); } catch {}
  let message;
  try {
    if (!ticket) throw new Error('Offline round');
    await api('scores', { method: 'POST', body: JSON.stringify({ ...result, token: ticket }) });
    message = 'Saved to the shared leaderboard. Lunch legend status: achieved.';
    boardMode = 'global';
  } catch {
    try {
      const scores = [...localScores(), result].sort((a, b) => b.score - a.score || a.elapsed - b.elapsed).slice(0, 10);
      localStorage.setItem('wims-scores-v1', JSON.stringify(scores));
      message = 'Saved on this device. Shared leaderboard is currently unavailable.';
      boardMode = 'local';
    } catch { message = 'Storage is unavailable in this browser. Your score: ' + result.score.toLocaleString(); }
  }
  saving = false; scoreSaved = true;
  if ($('#save-status')) { $('#save-status').textContent = message; button.textContent = 'SAVED ✓'; }
}

async function showBoard() {
  openModal(`<div class="eyebrow">THE HALL OF HUNGER</div><h2 id="modal-title">Lunch legends.</h2><p id="board-loading" class="modal-description">Finding the fastest hungry humans…</p>`);
  const scores = await getScores();
  if (!$('#modal').open || !$('#board-loading')) return;
  $('#board-loading').remove();
  const mode = document.createElement('div'); mode.className = 'board-scope'; mode.textContent = boardMode === 'global' ? 'SHARED LEADERBOARD' : 'ON THIS DEVICE'; $('#modal-content').append(mode);
  const list = document.createElement('ol'); list.className = 'leaderboard';
  if (!scores.length) {
    const empty = document.createElement('p'); empty.className = 'empty-board'; empty.textContent = 'No lunch legends yet. Find your sandwich and claim the first spot.'; $('#modal-content').append(empty);
  }
  scores.slice(0, 10).forEach((entry, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1).padStart(2, '0');
    const name = document.createElement('strong'); name.textContent = entry.name;
    const time = document.createElement('small'); time.textContent = `${Number(entry.elapsed).toFixed(1)}s`;
    const score = document.createElement('b'); score.textContent = Number(entry.score).toLocaleString();
    li.append(rank, name, time, score); list.append(li);
  });
  $('#modal-content').append(list);
  const note = document.createElement('p'); note.className = 'fine-print'; note.textContent = 'More hunger left + fewer incidents + fewer wrong porches = more points.'; $('#modal-content').append(note);
}

$('#start').addEventListener('click', startGame);
$('#end-replay').addEventListener('click', startGame);
$('#help').addEventListener('click', showHelp);
$('#photo-open').addEventListener('click', showPhoto);
$('#board-open').addEventListener('click', showBoard);
$('#pause').addEventListener('click', pauseGame);
$('#check-desktop').addEventListener('click', checkPorch);
$('#check-touch').addEventListener('click', checkPorch);
$('#audio').addEventListener('click', () => {
  audio.unlock(); audio.enabled = !audio.enabled;
  $('#audio').setAttribute('aria-pressed', String(audio.enabled));
  $('#audio').setAttribute('aria-label', audio.enabled ? 'Turn sound off' : 'Turn sound on');
  $('.sound-slash').hidden = audio.enabled; audio.play('check');
});

window.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA/.test(event.target.tagName) || $('#modal').open) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && state.playing) event.preventDefault();
  if (!state.playing) return;
  input.keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE' || event.code === 'Space') checkPorch();
  if (event.code === 'KeyQ') showPhoto();
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); pauseGame(); }
});
window.addEventListener('keyup', event => input.keys.delete(event.code));
window.addEventListener('blur', () => { resetInputs(); if (state.playing) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) pauseGame(); });
window.addEventListener('resize', () => world?.resize());
$('#world').addEventListener('pointerdown', event => {
  if (!state.playing || event.pointerType === 'touch' || event.button !== 0) return;
  const point = world.screenToWorld(event.clientX, event.clientY);
  if (point) input.waypoint = { x: Math.max(-40, Math.min(40, point.x)), z: Math.max(-40, Math.min(40, point.z)) };
  $('#world').focus({ preventScroll: true });
});

function joystickMove(event) {
  if (event.pointerId !== joystickPointer) return;
  const rect = $('#joystick').getBoundingClientRect();
  let x = event.clientX - (rect.left + rect.width / 2), y = event.clientY - (rect.top + rect.height / 2);
  const max = rect.width * 0.32; const distance = Math.hypot(x, y);
  if (distance > max) { x = x / distance * max; y = y / distance * max; }
  input.joy = { x: x / max, y: y / max };
  $('#joystick-thumb').style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}
$('#joystick').addEventListener('pointerdown', event => {
  if (!state.playing || joystickPointer !== null) return;
  event.preventDefault(); joystickPointer = event.pointerId;
  $('#joystick').setPointerCapture(event.pointerId); joystickMove(event);
});
$('#joystick').addEventListener('pointermove', joystickMove);
function releaseJoystick(event) {
  if (event.pointerId !== joystickPointer) return;
  joystickPointer = null; input.joy = { x: 0, y: 0 };
  $('#joystick-thumb').style.transform = 'translate(-50%, -50%)';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#joystick').addEventListener(type, releaseJoystick);
$('#sprint').addEventListener('pointerdown', event => { if (!state.playing) return; event.preventDefault(); $('#sprint').setPointerCapture(event.pointerId); input.sprint = true; $('#sprint').classList.add('pressed'); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#sprint').addEventListener(type, () => { input.sprint = false; $('#sprint').classList.remove('pressed'); });

function frame(now) {
  const dt = Math.max(0, Math.min((now - previousTime) / 1000, 2)); previousTime = now;
  animationTime += dt;
  if (world) {
    // Consume real elapsed time even on a slow/throttled renderer. Small physics
    // steps keep fast cars from jumping through the player between frames.
    let remaining = dt;
    while (state.playing && remaining > 0.000001) {
      const step = Math.min(remaining, 1 / 30);
      update(step); remaining -= step;
    }
    world.render(state, animationTime, dt);
    if (now - lastMap > 100 && state.mode !== 'intro') { drawMap($('#map'), state, neighborhood, world.dogs, world.owners, world.cars); lastMap = now; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
