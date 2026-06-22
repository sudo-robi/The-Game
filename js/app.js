// ================================================================
// Room state schema
// ================================================================
// {
//   roomCode: "ABCD",
//   players: [{ username: "Alice", score: 0, connected: true, isAI: false }],
//   phase: "lobby",
//   round: 1,
//   picks: {},
//   lastResult: null,
//   consecutiveVoids: 0,
//   roundHistory: [],
//   pickHistory: [],
//   daCommitment: null
// }

// ================================================================
// Identity — wallet address or anonymous session ID
// ================================================================
function getIdentity() {
  if (Wallet.address) return Wallet.address;
  let id = sessionStorage.getItem("sessionId");
  if (!id) { id = "anon_" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("sessionId", id); }
  return id;
}

// ================================================================
// Toast
// ================================================================
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}

// ================================================================
// Pick sound
// ================================================================
function playPickSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

// ================================================================
// Debug panel
// ================================================================
const isDebug = window.location.search.includes("debug=1");
const debugContainer = document.getElementById("debug-toggle");
if (isDebug) {
  debugContainer.innerHTML =
    '<div id="debug-panel">' +
      '<div class="panel"><h3>Storage</h3><div class="btn-group">' +
        '<button id="writeDummy">Write dummy room</button>' +
        '<button id="readRoom">Read room back</button>' +
      '</div><div class="status" id="storageStatus">Ready</div></div>' +
      '<div class="panel"><h3>Poller</h3><div class="btn-group">' +
        '<button id="startPoller">Start poller</button>' +
        '<button id="stopPoller">Stop poller</button>' +
      '</div><div class="status" id="pollerStatus">Stopped</div></div>' +
      '<div class="panel"><h3>Console</h3><pre id="console"><span style="color:#666">\u2014 log output appears here \u2014</span></pre></div>' +
    '</div>' +
    '<button id="debug-btn">Debug</button>';
  const logEl = document.getElementById("console");
  const storageStatus = document.getElementById("storageStatus");
  const pollerStatus = document.getElementById("pollerStatus");
  const SAMPLE_ROOM = { roomCode: "ABCD", players: [{ username: "Alice", score: 0, connected: true }, { username: "Bob", score: 0, connected: true }, { username: "Carol", score: 0, connected: false }], phase: "lobby", round: 1, picks: {}, lastResult: null, consecutiveVoids: 0, roundHistory: [], pickHistory: [] };
  function log(msg) { const line = document.createElement("div"); line.textContent = "> " + msg; logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight; }
  document.getElementById("writeDummy").addEventListener("click", async () => { await Storage.set(roomKey("ABCD"), SAMPLE_ROOM); storageStatus.textContent = "Written dummy room: ABCD"; log("STORAGE: wrote dummy room under key \"" + roomKey("ABCD") + "\""); });
  document.getElementById("readRoom").addEventListener("click", async () => { const data = await Storage.get(roomKey("ABCD")); if (data) { storageStatus.textContent = "Read OK"; log("STORAGE: read room = " + JSON.stringify(data, null, 2)); } else { storageStatus.textContent = "No room found (null)"; log("STORAGE: read returned null"); } });
  const debugPoller = Poller;
  document.getElementById("startPoller").addEventListener("click", () => { debugPoller.start("ABCD", (state) => { log("POLLER: state changed \u2014 " + JSON.stringify(state, null, 2)); }); pollerStatus.textContent = "Polling room:ABCD every 4s"; log("POLLER: started on room:ABCD"); });
  document.getElementById("stopPoller").addEventListener("click", () => { debugPoller.stop(); pollerStatus.textContent = "Stopped"; log("POLLER: stopped"); });
  const debugBtn = document.getElementById("debug-btn");
  const debugPanel = document.getElementById("debug-panel");
  debugBtn.addEventListener("click", () => { const open = debugPanel.classList.toggle("open"); debugBtn.classList.toggle("active"); debugBtn.textContent = open ? "Close" : "Debug"; });
}

// ================================================================
// Game state
// ================================================================
let currentUser = "";
let currentRoomCode = "";
const gamePoller = Poller;
let gameoverCountdown = null;
let prevScores = {};
let aiOfferTimer = null;
let _lbBefore = "";

// ================================================================
// Screen navigation
// ================================================================
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomCode() { let c = ""; for (let i = 0; i < 4; i++) c += CHARS[Math.floor(Math.random() * 26)]; return c; }
async function generateUniqueCode() { for (let a = 0; a < 20; a++) { const code = randomCode(); const ex = await Storage.get(roomKey(code)); if (!ex) return code; } return randomCode(); }

// ================================================================
// Screen 1 — Connect
// ================================================================
const connectError = document.getElementById("connect-error");

function getUsername() {
  const input = document.getElementById("username-input");
  return input ? input.value.trim() : "";
}
function saveUsername(name) {
  sessionStorage.setItem("username", name);
  currentUser = name;
  document.getElementById("lobby-username").textContent = name;
}
function enterLobbyWithUsername() {
  const name = getUsername();
  if (!name) { connectError.textContent = "Please enter your name."; return; }
  connectError.textContent = "";
  saveUsername(name);
  checkSavedRoom();
  showScreen("screen-lobby");
  loadMyStats();
  NFTMinter.init();
  SliceRewards.init();
}

document.getElementById("play-btn").addEventListener("click", enterLobbyWithUsername);
document.getElementById("username-input").addEventListener("keydown", (e) => { if (e.key === "Enter") enterLobbyWithUsername(); });
document.getElementById("connect-leaderboard-btn").addEventListener("click", () => enterLeaderboard("screen-connect"));

// ================================================================
// Saved room
// ================================================================
function checkSavedRoom() {
  const saved = sessionStorage.getItem("roomCode");
  const section = document.getElementById("rejoin-section");
  if (saved) { section.style.display = "block"; section.innerHTML = '<button class="btn btn-outline" id="rejoin-btn">Rejoin Room ' + saved + '</button>'; document.getElementById("rejoin-btn").addEventListener("click", () => rejoinRoom(saved)); }
  else { section.style.display = "none"; section.innerHTML = ""; }
}
async function rejoinRoom(code) {
  const room = await Storage.get(roomKey(code));
  if (!room) { showLobbyError("Room not found or expired"); sessionStorage.removeItem("roomCode"); checkSavedRoom(); return; }
  const player = room.players.find(p => p.address?.toLowerCase() === getIdentity().toLowerCase());
  if (!player) { showLobbyError("Player not found in that room"); return; }
  player.connected = true; await Storage.set(roomKey(code), room);
  currentRoomCode = code; Heartbeat.start(currentRoomCode, getIdentity());
  switch (room.phase) { case "lobby": enterWaitingRoom(); break; case "picking": enterPickingPhase(); break; case "reveal": enterRevealPhase(room); break; case "gameover": enterGameOver(room); break; default: enterWaitingRoom(); }
}
function showLobbyError(msg) { document.getElementById("join-error").textContent = msg; }

// ================================================================
// Screen 2
// ================================================================
const joinSection = document.getElementById("join-section");
const joinCodeInput = document.getElementById("join-code-input");
const joinError = document.getElementById("join-error");
joinCodeInput.addEventListener("input", () => { joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z]/g, ""); });
document.getElementById("join-room-btn").addEventListener("click", () => joinCodeInput.focus());
document.getElementById("create-room-btn").addEventListener("click", async () => {
  const code = await generateUniqueCode();
  const room = { roomCode: code, players: [{ username: currentUser, address: getIdentity(), score: 0, connected: true }], phase: "lobby", round: 1, picks: {}, lastResult: null, consecutiveVoids: 0, roundHistory: [], pickHistory: [], daCommitment: null };
  await Storage.set(roomKey(code), room); currentRoomCode = code; sessionStorage.setItem("roomCode", code); Heartbeat.start(currentRoomCode, getIdentity()); enterWaitingRoom();
});
document.getElementById("join-submit-btn").addEventListener("click", async () => {
  const code = joinCodeInput.value.trim();
  if (!code || code.length !== 4) { joinError.textContent = "Enter a valid 4-character room code"; return; }
  joinError.textContent = "Searching for room\u2026"; let room = await Storage.get(roomKey(code));
  if (!room) {
    await new Promise(r => setTimeout(r, 3000));
    room = await Storage.get(roomKey(code));
  }
  if (!room) { joinError.textContent = "Room not found. Make sure the code is correct and the room has been created."; return; }
  if (room.players.length >= 3) { joinError.textContent = "This room is full."; return; }
  if (!room.players.find(p => p.address?.toLowerCase() === getIdentity().toLowerCase())) { room.players.push({ username: currentUser, address: getIdentity(), score: 0, connected: true }); await Storage.set(roomKey(code), room); }
  currentRoomCode = code; sessionStorage.setItem("roomCode", code); Heartbeat.start(currentRoomCode, getIdentity()); enterWaitingRoom();
});

// ================================================================
// Screen 3 — Waiting Room
// ================================================================
function enterWaitingRoom() {
  showScreen("screen-waiting");
  document.getElementById("room-code-display").textContent = currentRoomCode;
  document.getElementById("waiting-status").textContent = "Waiting for players\u2026 (0/3 joined)";
  document.getElementById("player-list").innerHTML = ""; clearAIOffer();
  gamePoller.start(currentRoomCode, (state) => {
    if (!state) return;
    const players = state.players || [];
    updateDisconnectBanner(players);
    const list = document.getElementById("player-list"); list.innerHTML = "";
    players.forEach(p => {
      const li = document.createElement("li");
      const nameSpan = document.createElement("span"); nameSpan.textContent = p.username;
      li.appendChild(nameSpan);
      if (p.isAI) { const aiTag = document.createElement("span"); aiTag.innerHTML = Icons.robot.replace('width="24"', 'width="16"').replace('height="24"', 'height="16"'); aiTag.style.display = "inline-flex"; aiTag.style.alignItems = "center"; li.appendChild(aiTag); }
      if (p.username === currentUser) { const you = document.createElement("span"); you.className = "you"; you.textContent = "(you)"; li.appendChild(you); }
      if (!p.connected) { const disc = document.createElement("span"); disc.className = "disc"; disc.textContent = "(disconnected)"; li.appendChild(disc); }
      list.appendChild(li);
    });
    document.getElementById("waiting-status").textContent = "Waiting for players\u2026 (" + players.length + "/3 joined)";
    const humans = players.filter(p => !p.isAI); const hasAI = players.some(p => p.isAI);
    if (players.length < 3 && humans.length === 2 && !hasAI) {
      if (!aiOfferTimer) { aiOfferTimer = setTimeout(() => { const area = document.getElementById("ai-hint-area"); area.innerHTML = '<button class="btn btn-purple" id="add-ai-btn">' + Icons.robot.replace('width="24"', 'width="18"').replace('height="24"', 'height="18"') + ' Add AI Player</button>'; document.getElementById("add-ai-btn").addEventListener("click", addAIPlayer); }, 20000); }
    } else { clearAIOffer(); }
    if (players.length === 3) { clearAIOffer(); gamePoller.stop(); transitionToPicking(); }
  });
}
function clearAIOffer() { if (aiOfferTimer) { clearTimeout(aiOfferTimer); aiOfferTimer = null; } document.getElementById("ai-hint-area").innerHTML = ""; }
async function addAIPlayer() {
  const room = await Storage.get(roomKey(currentRoomCode)); if (!room) return;
  if (room.players.some(p => p.isAI)) return;
  room.players.push({ username: "\uD83E\uDD16 ZeroBot", score: 0, connected: true, isAI: true });
  room.pickHistory = room.pickHistory || []; await Storage.set(roomKey(currentRoomCode), room); clearAIOffer();
}

// ================================================================
// Screen 4 — Picking Phase
// ================================================================
async function transitionToPicking() {
  const room = await Storage.get(roomKey(currentRoomCode));
  if (!room || room.phase !== "lobby") return;
  room.picks = {}; room.lastResult = null; room.phase = "picking";
  await Storage.set(roomKey(currentRoomCode), room); enterPickingPhase();
}
function enterPickingPhase() {
  showScreen("screen-picking");
  document.getElementById("pick-cards").style.display = "flex";
  document.getElementById("pick-status").textContent = "";
  document.querySelectorAll(".pick-card").forEach(c => c.classList.remove("locked", "disabled"));
  prevScores = {}; gamePoller.start(currentRoomCode, handlePickingUpdate);
}
function handlePickingUpdate(state) {
  if (!state) return;
  updateDisconnectBanner(state.players); updateScoreboard(state.players);
  document.getElementById("round-num").textContent = state.round;
  const bar = document.getElementById("slice-bar-picking");
  if (bar) {
    bar.style.display = Wallet.isConnected() ? "flex" : "none";
    bar.querySelector("span strong").textContent = state.round;
  }
  if (state.phase === "picking") {
    document.getElementById("pick-cards").style.display = "flex"; document.getElementById("pick-status").textContent = "";
    const myPick = state.picks && state.picks[currentUser];
    const allPicked = state.picks && Object.keys(state.picks).length === 3;
    const aiPlayer = state.players.find(p => p.isAI);
    const aiNeedsPick = aiPlayer && state.picks && !state.picks[aiPlayer.username];
    const anyHumanPicked = state.picks && Object.keys(state.picks).some(k => !state.players.find(p => p.username === k)?.isAI);
    if (myPick) {
      document.querySelectorAll(".pick-card").forEach(c => c.classList.add("locked"));
      document.querySelectorAll(".pick-card").forEach(c => c.classList.remove("disabled"));
      document.getElementById("pick-status").textContent = "Locked in \u2713 \u2014 Waiting for other players\u2026";
    } else {
      document.querySelectorAll(".pick-card").forEach(c => c.classList.remove("locked", "disabled"));
      document.getElementById("pick-status").textContent = "Pick one!";
    }
    if (aiNeedsPick && anyHumanPicked) triggerAIPick();
    if (allPicked) evaluateRound();
  } else if (state.phase === "reveal") { gamePoller.stop(); enterRevealPhase(state); }
}
function updateScoreboard(players) {
  const el = document.getElementById("scoreboard"); el.innerHTML = "";
  players.forEach(p => {
    const prev = prevScores[p.username] != null ? prevScores[p.username] : p.score;
    const increased = p.score > prev; prevScores[p.username] = p.score;
    const row = document.createElement("div"); row.className = "scoreboard-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "scoreboard-name" + (p.username === currentUser ? " me" : "") + (!p.connected ? " disc" : "");
    nameSpan.textContent = p.username;
    if (p.isAI) { const tag = document.createElement("span"); tag.className = "ai-tag"; tag.innerHTML = Icons.robot; nameSpan.appendChild(tag); }
    const scoreSpan = document.createElement("span");
    scoreSpan.className = "scoreboard-score" + (increased ? " flash" : "");
    scoreSpan.textContent = p.score + " pts";
    row.appendChild(nameSpan); row.appendChild(scoreSpan); el.appendChild(row);
  });
}
async function evaluateRound() {
  await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
  const room = await Storage.get(roomKey(currentRoomCode));
  if (!room || room.phase !== "picking") return;
  const picks = room.picks || {}; const pickList = Object.values(picks);
  if (pickList.length < 3) return;
  const picksSnapshot = { ...picks };
  const pizzaCount = pickList.filter(v => v === "pizza").length;
  const appleCount = pickList.filter(v => v === "apple").length;
  let result;
  if (pizzaCount === 3 || appleCount === 3) {
    room.consecutiveVoids = (room.consecutiveVoids || 0) + 1;
    result = { winner: null, wasTie: true };
  } else {
    room.consecutiveVoids = 0;
    const minorityPick = pizzaCount === 1 ? "pizza" : "apple";
    const winnerName = Object.entries(picks).find(([, v]) => v === minorityPick)[0];
    const winnerPlayer = room.players.find(p => p.username === winnerName);
    if (winnerPlayer) winnerPlayer.score += 2;
    result = { winner: winnerName, wasTie: false };
    if (winnerPlayer && !winnerPlayer.isAI && Wallet.address) {
      ScoreRegistry.recordRoundWin(Wallet.address);
    }
  }
  result.picks = picksSnapshot;
  room.lastResult = result; room.picks = {}; room.phase = "reveal";
  room.pickHistory = room.pickHistory || [];
  room.pickHistory.push({ round: room.round, picks: { ...picksSnapshot }, winner: result.winner, wasVoid: result.wasTie || false });
  if (room.pickHistory.length > 20) room.pickHistory = room.pickHistory.slice(-20);
  room.roundHistory = room.roundHistory || [];
  room.roundHistory.push({ round: room.round, winner: result.winner, wasTie: result.wasTie });
  if (room.roundHistory.length > 5) room.roundHistory = room.roundHistory.slice(-5);
  await Storage.set(roomKey(currentRoomCode), room);

  if (result && result.winner) {
    const wp = room.players.find(p => p.username === result.winner);
    if (wp && !wp.isAI && Wallet.isConnected() && wp.address?.toLowerCase() === Wallet.address?.toLowerCase()) {
      SliceRewards.claimRoundWin(room.roomCode, room.round);
    }
  }
}

document.getElementById("pick-pizza").addEventListener("click", async () => { await handlePick("pizza"); });
document.getElementById("pick-apple").addEventListener("click", async () => { await handlePick("apple"); });
async function handlePick(choice) {
  const room = await Storage.get(roomKey(currentRoomCode));
  if (!room || room.phase !== "picking") return;
  if (room.picks && room.picks[currentUser]) return;
  if (!room.picks) room.picks = {};
  room.picks[currentUser] = choice; await Storage.set(roomKey(currentRoomCode), room); playPickSound();
}

// ================================================================
// Screen 5 — Reveal Phase
// ================================================================
function enterRevealPhase(state) {
  showScreen("screen-reveal");
  const result = state.lastResult; const players = state.players || []; const picks = (result && result.picks) || {};
  document.getElementById("reveal-round-num").textContent = state.round;
  const bar = document.getElementById("slice-bar-reveal");
  if (bar) {
    bar.style.display = Wallet.isConnected() ? "flex" : "none";
    bar.querySelector("span strong").textContent = state.round;
  }
  const picksEl = document.getElementById("reveal-picks"); picksEl.innerHTML = "";
  players.forEach((p, i) => {
    const pick = picks[p.username];
    const isWinner = result && !result.wasTie && result.winner === p.username;
    const row = document.createElement("div"); row.className = "reveal-pick-row" + (isWinner ? " winner" : "");
    const nameSpan = document.createElement("span"); nameSpan.className = "name";
    nameSpan.textContent = p.username + (p.username === currentUser ? " (you)" : "");
    if (p.isAI) { const t = document.createElement("span"); t.innerHTML = Icons.robot; nameSpan.appendChild(t); }
    const emojiSpan = document.createElement("span"); emojiSpan.className = "pick-icon-svg";
    if (pick === "pizza") emojiSpan.innerHTML = Icons.pizza;
    else if (pick === "apple") emojiSpan.innerHTML = Icons.apple;
    else emojiSpan.textContent = "\u2014";
    row.appendChild(nameSpan); row.appendChild(emojiSpan); picksEl.appendChild(row);
    setTimeout(() => row.classList.add("show"), i * 150);
  });
  const resultEl = document.getElementById("reveal-result"); resultEl.className = "reveal-result"; resultEl.innerHTML = "";
  if (result) {
    const voids = state.consecutiveVoids || 0;
    if (result.wasTie) {
      resultEl.classList.add(voids >= 5 ? "void-warn" : "tie");
      if (voids >= 5) {
        resultEl.innerHTML = Icons.handshake + ' Is everyone coordinating? Try to be the odd one out!';
      } else {
        resultEl.innerHTML = Icons.handshake + ' All picked the same \u2014 Void Round! Pick again.';
      }
    } else {
      resultEl.classList.add("win");
      resultEl.innerHTML = Icons.star + ' ' + result.winner + ' is the Odd One Out! +2 points';
    }
  }
  const commentaryEl = document.getElementById("reveal-commentary");
  if (result && !result.wasTie) {
    commentaryEl.textContent = "\u2026";
    getRoundCommentary(state, result).then(text => {
      if (text) commentaryEl.textContent = "\u201C" + text + "\u201D";
      else commentaryEl.textContent = "";
    });
  } else { commentaryEl.textContent = ""; }
  updateRevealScoreboard(players);
  const actionEl = document.getElementById("reveal-action"); actionEl.innerHTML = "";
  const isHost = players.length > 0 && players[0].username === currentUser;
  if (isHost) {
    const btn = document.createElement("button"); btn.className = "btn"; btn.textContent = "Next Round \u2192";
    btn.addEventListener("click", nextRound); actionEl.appendChild(btn);
  } else { const msg = document.createElement("div"); msg.className = "reveal-waiting"; msg.textContent = "Waiting for host to continue\u2026"; actionEl.appendChild(msg); }
  const historyEl = document.getElementById("round-history-list"); historyEl.innerHTML = "";
  (state.roundHistory || []).forEach(h => {
    const entry = document.createElement("div"); entry.className = "history-entry";
    const roundSpan = document.createElement("span"); roundSpan.className = "h-round"; roundSpan.textContent = "Round " + h.round;
    const resultSpan = document.createElement("span"); resultSpan.className = "h-result" + (h.wasTie ? " tied" : " won");
    if (h.wasTie) resultSpan.textContent = "Tie";
    else resultSpan.innerHTML = Icons.star.replace('width="24"', 'width="12"').replace('height="24"', 'height="12"') + ' ' + h.winner + ' won (+2)';
    entry.appendChild(roundSpan); entry.appendChild(resultSpan); historyEl.appendChild(entry);
  });
  gamePoller.start(currentRoomCode, handleRevealUpdate);
}
function handleRevealUpdate(state) {
  if (!state) return;
  if (state.phase === "picking") { gamePoller.stop(); enterPickingPhase(); return; }
  if (state.phase === "gameover") { gamePoller.stop(); enterGameOver(state); return; }
  updateDisconnectBanner(state.players || []); updateRevealScoreboard(state.players || []);
}
function updateRevealScoreboard(players) {
  const el = document.getElementById("reveal-scoreboard"); el.innerHTML = "";
  players.forEach(p => {
    const prev = prevScores[p.username] != null ? prevScores[p.username] : p.score;
    const increased = p.score > prev; prevScores[p.username] = p.score;
    const row = document.createElement("div"); row.className = "scoreboard-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "scoreboard-name" + (p.username === currentUser ? " me" : "") + (!p.connected ? " disc" : "");
    nameSpan.textContent = p.username;
    if (p.isAI) { const t = document.createElement("span"); t.className = "ai-tag"; t.innerHTML = Icons.robot; nameSpan.appendChild(t); }
    const scoreSpan = document.createElement("span"); scoreSpan.className = "scoreboard-score" + (increased ? " flash" : ""); scoreSpan.textContent = p.score + " pts";
    row.appendChild(nameSpan); row.appendChild(scoreSpan); el.appendChild(row);
  });
}
async function nextRound() {
  const room = await Storage.get(roomKey(currentRoomCode));
  if (!room) return;
  const maxScore = Math.max(...room.players.map(p => p.score));
  const isGameOver = maxScore >= 10;
  if (isGameOver) { room.phase = "gameover"; }
  else { room.round += 1; room.picks = {}; room.lastResult = null; room.phase = "picking"; }
  await Storage.set(roomKey(currentRoomCode), room);
  if (isGameOver) { gamePoller.stop(); enterGameOver(room); }
  else { gamePoller.stop(); prevScores = {}; enterPickingPhase(); }
}

// ================================================================
// Screen 6 — Game Over
// ================================================================
function enterGameOver(state) {
  showScreen("screen-gameover");
  const players = state.players || [];
  const sorted = [...players].sort((a, b) => { if (b.score !== a.score) return b.score - a.score; return players.indexOf(a) - players.indexOf(b); });
  const winner = sorted[0];
  document.getElementById("gameover-trophy").innerHTML = Icons.trophy;
  document.getElementById("gameover-name").textContent = winner.username + " Wins!";
  document.getElementById("da-confirm").innerHTML = "";
  document.getElementById("ai-recap").style.display = "none";
  const sb = document.getElementById("gameover-scoreboard"); sb.innerHTML = "";
  sorted.forEach((p, i) => {
    const row = document.createElement("div"); row.className = "scoreboard-item" + (i === 0 ? " winner" : "");
    const nameSpan = document.createElement("span"); nameSpan.className = "scoreboard-name" + (p.username === currentUser ? " me" : "");
    nameSpan.textContent = p.username;
    if (i === 0) { const c = document.createElement("span"); c.innerHTML = Icons.crown; nameSpan.appendChild(c); }
    if (p.isAI) { const t = document.createElement("span"); t.className = "ai-tag"; t.innerHTML = Icons.robot; nameSpan.appendChild(t); }
    const scoreSpan = document.createElement("span"); scoreSpan.className = "scoreboard-score"; scoreSpan.textContent = p.score + " pts";
    row.appendChild(nameSpan); row.appendChild(scoreSpan); sb.appendChild(row);
  });
  updateDisconnectBanner(players);
  const isHost = players.length > 0 && players[0].username === currentUser;
  startCountdown(isHost);
  gamePoller.start(currentRoomCode, handleGameOverUpdate);
  document.getElementById("gameover-leaderboard-btn").innerHTML = Icons.globe.replace('width="24"', 'width="16"').replace('height="24"', 'height="16"') + ' View Global Leaderboard';
  document.getElementById("gameover-leaderboard-btn").onclick = () => { gamePoller.stop(); stopCountdown(); enterLeaderboard("screen-gameover"); };
  submitToDA(state);
  triggerRecap(state);
  populateNFTPreview(state);

  const gw = winner;
  if (Wallet.isConnected() && gw.address?.toLowerCase() === Wallet.address?.toLowerCase() && !gw.isAI) {
    SliceRewards.claimGameWin(state.roomCode);
  }
  setTimeout(() => populateSliceSummary(state), 2000);
}
function handleGameOverUpdate(state) {
  if (!state) return;
  if (state.phase === "picking") { gamePoller.stop(); stopCountdown(); prevScores = {}; enterPickingPhase(); }
  updateDisconnectBanner(state.players || []);
}
function startCountdown(isHost) {
  stopCountdown(); let count = 5; const el = document.getElementById("countdown"); el.textContent = "New game starting in " + count + "\u2026";
  gameoverCountdown = setInterval(() => { count--; if (count > 0) { el.textContent = "New game starting in " + count + "\u2026"; } else { el.textContent = "New game starting!"; stopCountdown(); if (isHost) resetRoom(); } }, 1000);
}
function stopCountdown() { if (gameoverCountdown != null) { clearInterval(gameoverCountdown); gameoverCountdown = null; } }
async function resetRoom() {
  SliceRewards.sessionEarned = 0;
  const room = await Storage.get(roomKey(currentRoomCode)); if (!room) return;
  room.players.forEach(p => { p.score = 0; }); room.round = 1; room.picks = {}; room.lastResult = null; room.consecutiveVoids = 0; room.roundHistory = []; room.pickHistory = []; room.daCommitment = null; room.phase = "picking";
  await Storage.set(roomKey(currentRoomCode), room);
  gamePoller.stop(); prevScores = {}; enterPickingPhase();
}

// ================================================================
// Screen 7 — Global Leaderboard
// ================================================================
let lbInterval = null;
function enterLeaderboard(backScreen) {
  showScreen("screen-leaderboard");
  _lbBefore = backScreen;
  const titleEl = document.querySelector(".leaderboard-title");
  titleEl.innerHTML = Icons.globe + ' All-Time Leaderboard';
  const subEl = document.querySelector(".leaderboard-sub");
  subEl.innerHTML = Icons.signal.replace('width="16"', 'width="12"').replace('height="16"', 'height="12"') + ' Powered by 0G Data Availability';
  document.getElementById("lb-loading").innerHTML = Icons.signal.replace('width="16"', 'width="14"').replace('height="16"', 'height="14"') + ' Fetching from 0G DA\u2026';
  document.getElementById("lb-loading").style.display = "flex";
  document.getElementById("lb-empty").style.display = "none";
  document.getElementById("lb-table-wrap").style.display = "none";
  document.getElementById("lb-refresh").textContent = "";
  document.getElementById("lb-back-btn").onclick = () => { if (lbInterval) { clearInterval(lbInterval); lbInterval = null; } showScreen(backScreen); };
  loadGlobalLeaderboard();
  if (lbInterval) clearInterval(lbInterval);
  lbInterval = setInterval(loadGlobalLeaderboard, 30000);
}
async function loadGlobalLeaderboard() {
  const tbody = document.getElementById("lb-body");
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666;padding:20px">\uD83D\uDCE1 Fetching from 0G DA + Contract\u2026</td></tr>';
  const [entries, contractPlayers, contractTotal] = await Promise.all([
    ZeroGDA.fetchAll(),
    ScoreRegistry.getTopPlayers(50),
    ScoreRegistry.getTotalGames()
  ]);
  const stats = {};
  entries.forEach(entry => {
    entry.finalScores?.forEach(player => {
      if (player.isAI) return;
      const key = (player.address || player.username).toLowerCase();
      if (!stats[key]) {
        stats[key] = { username: player.username, address: player.address, wins: 0, games: 0, totalScore: 0, onChain: false };
      }
      stats[key].games++;
      stats[key].totalScore += player.score;
      if (entry.winner?.address === player.address) stats[key].wins++;
    });
  });
  contractPlayers.forEach(cp => {
    const key = cp.address.toLowerCase();
    if (!stats[key]) {
      stats[key] = { username: cp.address, address: cp.address, wins: 0, games: 0, totalScore: 0, onChain: true };
    }
    stats[key].onChain = true;
  });
  if (!Object.keys(stats).length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666;padding:20px">No games recorded yet. Be the first to finish a game!</td></tr>';
    document.getElementById("lb-empty").style.display = "none";
    document.getElementById("da-total").textContent = "";
    return;
  }
  const ranked = Object.values(stats).sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore);

  const sliceBalances = await Promise.all(
    ranked.map(async p => {
      try {
        if (!p.address || !SliceRewards.readTokenContract) return "N/A";
        const raw = await SliceRewards.readTokenContract.balanceOf(p.address);
        return parseFloat(ethers.utils.formatEther(raw)).toFixed(0);
      } catch { return "N/A"; }
    })
  );

  tbody.innerHTML = ranked.map((p, i) => {
    const isCurrentPlayer = p.address?.toLowerCase() === Wallet.address?.toLowerCase();
    const winRate = p.games ? Math.round((p.wins / p.games) * 100) : 0;
    return '<tr style="' + (isCurrentPlayer ? 'background:#1a1a00;border-left:3px solid #ff6b00' : '') + '">' +
      '<td style="padding:10px;color:#888">#' + (i + 1) + '</td>' +
      '<td style="padding:10px"><span style="font-family:monospace;font-size:13px">' + p.username + '</span>' +
      (isCurrentPlayer ? '<span style="color:#ff6b00;font-size:11px;margin-left:6px">YOU</span>' : '') +
      (p.onChain ? '<span style="color:#8b5cf6;font-size:10px;margin-left:4px" title="Verified on-chain">\u26D3</span>' : '') + '</td>' +
      '<td style="padding:10px;text-align:center">' + p.wins + '</td>' +
      '<td style="padding:10px;text-align:center;color:#888">' + p.games + '</td>' +
      '<td style="padding:10px;text-align:center;font-family:monospace;color:#ff9800">' + sliceBalances[i] + '</td>' +
      '<td style="padding:10px;text-align:center;color:#4caf50">' + winRate + '%</td></tr>';
  }).join("");
  document.getElementById("lb-empty").style.display = "none";
  document.getElementById("lb-table-wrap").style.display = "block";
  document.getElementById("da-total").textContent = (contractTotal || entries.length) + " games recorded | " + (contractTotal ? contractTotal + " on-chain" : entries.length + " on DA");
  document.getElementById("lb-refresh").textContent = "Auto-refreshes every 30s";
  Arch.markDA();
}

// ================================================================
// My Stats
// ================================================================
async function loadMyStats() {
  const container = document.getElementById("my-stats");
  if (!container) return;
  const [contractStats, sliceStats] = await Promise.all([
    ScoreRegistry.getMyStats(),
    SliceRewards.getMyStats()
  ]);
  const wins = contractStats?.wins || 0;
  const totalGames = contractStats?.games || 0;
  const roundsWon = contractStats?.totalRoundsWon || 0;
  const totalScore = contractStats?.totalScore || 0;
  const sliceBalance = sliceStats?.currentBalance?.toFixed(0) || "0";
  const sliceEarned = sliceStats?.totalEarned?.toFixed(0) || "0";
  if (!totalGames && !wins) { container.style.display = "none"; return; }
  container.style.display = "block";
  container.innerHTML =
    '<div style="background:#111;border:1px solid #222;border-radius:8px;padding:12px;margin-top:12px">' +
      '<p style="color:#888;font-size:12px;margin:0 0 8px">' + Icons.star.replace('width="24"', 'width="12"').replace('height="24"', 'height="12"') + ' YOUR ON-CHAIN STATS</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><span style="color:#ff6b00;font-size:20px;font-weight:bold">' + wins + '</span><br><span style="color:#666;font-size:11px">WINS</span></div>' +
        '<div><span style="color:#fff;font-size:20px;font-weight:bold">' + totalGames + '</span><br><span style="color:#666;font-size:11px">GAMES</span></div>' +
        '<div><span style="color:#4caf50;font-size:20px;font-weight:bold">' + roundsWon + '</span><br><span style="color:#666;font-size:11px">ROUNDS WON</span></div>' +
        '<div><span style="color:#ff9800;font-size:20px;font-weight:bold">' + sliceBalance + '</span><br><span style="color:#666;font-size:11px">$SLICE BALANCE</span></div>' +
      '</div>' +
      '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1a1a1a;color:#555;font-size:11px;text-align:center">' +
        'Total $SLICE earned all time: <span style="color:#ff9800">' + sliceEarned + '</span>' +
      '</div>' +
    '</div>';
}

// ================================================================
// Enter key
// ================================================================
joinCodeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("join-submit-btn").click(); });

// ================================================================
// Silent reconnect on page load
// ================================================================
(async function silentReconnect() {
  await ZeroGStorage.loadIndex();
  const loadingEl = document.getElementById("storage-loading");
  if (loadingEl) {
    loadingEl.style.opacity = "0";
    setTimeout(() => { loadingEl.style.display = "none"; }, 500);
  }
  const savedUsername = sessionStorage.getItem("username");
  if (savedUsername) {
    currentUser = savedUsername;
    document.getElementById("lobby-username").textContent = savedUsername;
    await ZeroGStorage.init();
    ScoreRegistry.init();
    NFTMinter.init();
    SliceRewards.init();
    checkSavedRoom();
    showScreen("screen-lobby");
    loadMyStats();
    return;
  }
  showScreen("screen-connect");
})();

// ================================================================
// NFT Certificate — populate preview on game over
// ================================================================
function populateNFTPreview(room) {
  const winner = room.players.find(p => p.score >= 10);
  if (!winner) return;

  document.getElementById("nft-winner-name").textContent = winner.username;
  document.getElementById("nft-room-code").textContent = `Room: ${room.roomCode}`;
  document.getElementById("nft-score").textContent = winner.score;
  document.getElementById("nft-rounds").textContent = room.round;
  document.getElementById("nft-players").textContent = room.players.length;
  document.getElementById("nft-da-hash").textContent =
    room.daCommitment
      ? `DA: ${room.daCommitment.slice(0, 20)}…`
      : "DA: pending…";

  document.getElementById("nft-trophy-icon").innerHTML = Icons.trophy;

  NFTMinter.checkAlreadyMinted(room.roomCode).then(minted => {
    if (minted) {
      document.getElementById("mint-btn").style.display = "none";
      document.getElementById("already-minted").style.display = "block";
    }
  });

  const isWinner = winner.username === currentUser;
  document.getElementById("nft-section").style.display = isWinner ? "block" : "none";

  if (isWinner) {
    if (!Wallet.isConnected()) {
      document.getElementById("mint-status").textContent = "Connect your wallet to mint a certificate";
      document.getElementById("mint-status").style.color = "#ff9800";
    }
    loadMyCertificates();
  }
}

async function handleMintNFT() {
  const btn = document.getElementById("mint-btn");
  const statusEl = document.getElementById("mint-status");
  btn.disabled = true;
  btn.style.opacity = "0.6";
  btn.textContent = "Preparing…";

  if (typeof window.ethereum === "undefined") {
    statusEl.textContent = "MetaMask not detected. Please install MetaMask to mint.";
    statusEl.style.color = "#f44336";
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.textContent = "🏅 Mint Your Win Certificate";
    return;
  }

  if (!Wallet.isConnected()) {
    btn.textContent = "Connecting wallet\u2026";
    try {
      await Wallet.connectMetaMask();
      await NFTMinter.init();
      await SliceRewards.init();
    } catch (e) {
      statusEl.textContent = e.message || "Failed to connect wallet";
      statusEl.style.color = "#f44336";
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "🏅 Mint Your Win Certificate";
      return;
    }
  }

  if (!NFTMinter.contract) {
    try {
      await NFTMinter.init();
    } catch {}
  }
  if (!NFTMinter.contract) {
    statusEl.textContent = "NFT minter unavailable. Try reloading.";
    statusEl.style.color = "#f44336";
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.textContent = "🏅 Mint Your Win Certificate";
    return;
  }

  btn.textContent = "Minting…";

  const room = await Storage.get(roomKey(currentRoomCode));
  if (!room) {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.textContent = "🏅 Mint Your Win Certificate";
    return;
  }

  const result = await NFTMinter.mint(room, room.daCommitment || "");

  if (result) {
    const { tokenId, txHash } = result;
    const short = txHash.slice(0, 10) + "…" + txHash.slice(-8);
    const explorerUrl = `https://chainscan-newton.0g.ai/tx/${txHash}`;

    document.getElementById("mint-result").innerHTML = `
      <div style="background:#0a1a0a;border:1px solid #4caf50;border-radius:12px;padding:16px;text-align:center">
        <p style="color:#4caf50;font-size:16px;font-weight:bold;margin:0 0 4px">✓ Certificate Minted!</p>
        <p style="color:#888;font-size:12px;margin:0 0 8px">Token ID: #${tokenId}</p>
        <a href="${explorerUrl}" target="_blank" style="color:#ff6b00;font-family:monospace;font-size:12px">${short} ↗</a>
      </div>
    `;

    btn.style.display = "none";
    document.getElementById("already-minted").style.display = "block";
    loadMyCertificates();
  } else {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.textContent = "🏅 Mint Your Win Certificate";
  }
}

document.getElementById("mint-btn").addEventListener("click", handleMintNFT);

async function populateSliceSummary(room) {
  const el = document.getElementById("slice-summary");
  if (!el) return;
  const stats = await SliceRewards.getMyStats();
  if (!stats || !Wallet.isConnected()) { el.style.display = "none"; return; }
  el.style.display = "block";
  document.getElementById("slice-game-earned").textContent = SliceRewards.sessionEarned;
  document.getElementById("slice-total-balance").textContent = stats.currentBalance.toFixed(0);
  const roundEarned = SliceRewards.sessionEarned > 0 ? SliceRewards.sessionEarned - 10 : 0;
  document.getElementById("slice-rounds-earned").textContent = Math.max(0, roundEarned);
  Arch.markSlice();
}

async function loadMyCertificates() {
  const tokens = await NFTMinter.getMyTokens();
  if (!tokens.length) return;

  const container = document.getElementById("my-certs");
  container.innerHTML = `
    <p style="color:#888;font-size:12px;letter-spacing:1px;margin-bottom:12px">
      YOUR CERTIFICATES (${tokens.length})
    </p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${tokens.map(t => `
        <div style="
          background:#111;border:1px solid #222;border-radius:10px;
          padding:12px 16px;display:flex;justify-content:space-between;
          align-items:center
        ">
          <div>
            <span style="color:#ff6b00;font-size:12px;font-family:monospace">
              #${t.tokenId}
            </span>
            <span style="color:#fff;font-size:13px;margin-left:8px">
              Room ${t.roomCode}
            </span>
            <span style="color:#888;font-size:11px;margin-left:8px">
              ${t.score} pts · ${t.totalRounds} rounds
            </span>
          </div>
          <div style="color:#555;font-size:11px">
            ${new Date(t.timestamp).toLocaleDateString()}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
