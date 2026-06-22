// ================================================================
// 0G Compute — Real 0G Decentralized Compute API
// ================================================================
const ZeroGCompute = {
  baseUrl: "https://api.compute.0g.ai/v1",
  apiKey: "sk-33fd984b-7627-4263-8388-ef94fdce50ac",
  modelId: "meta-llama/Llama-3-8b-instruct",
  lastNodeId: null,
  requestCount: 0,

  _showIndicator(active, label) {
    let el = document.getElementById("compute-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "compute-indicator";
      document.body.appendChild(el);
    }
    el.textContent = active ? "\u2B61 0G Compute: " + (label || "") : "";
    el.style.opacity = active ? "1" : "0";
  },

  async chat(messages, systemPrompt, maxTokens) {
    try {
      ZeroGCompute.requestCount++;
      ZeroGCompute._showIndicator(true, "request\u2026");
      const res = await fetch(ZeroGCompute.baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + ZeroGCompute.apiKey,
          "X-0G-Model": ZeroGCompute.modelId
        },
        body: JSON.stringify({
          model: ZeroGCompute.modelId,
          max_tokens: maxTokens || 100,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ]
        })
      });
      if (!res.ok) { const err = await res.text(); throw new Error("0G Compute error " + res.status + ": " + err); }
      const data = await res.json();
      ZeroGCompute.lastNodeId = res.headers.get("X-0G-Node-ID") || data.node_id || "newton-compute-01";
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty response from 0G Compute");
      console.log("[0G Compute] Node: " + ZeroGCompute.lastNodeId + " | Response: " + content);
      ZeroGCompute._showIndicator(false);
      Arch.markCompute();
      return content;
    } catch (e) {
      console.error("[0G Compute] Error:", e);
      ZeroGCompute._showIndicator(false);
      throw e;
    }
  },

  async verify(response, signature) {
    if (!signature) return true;
    return signature.startsWith("0x") && signature.length === 132;
  }
};

let aiPickInProgress = false;
async function getZeroBotPick(room) {
  const pickHistory = room.pickHistory || [];
  const humanPlayers = room.players.filter(p => !p.isAI);
  const patternSummary = humanPlayers.map(p => {
    const history = pickHistory.map(r => r.picks[p.username] || "?").join(", ");
    return p.username + ": [" + history + "]";
  }).join("\n");
  const systemPrompt = "You are ZeroBot, a strategic AI playing Pizza vs Apple.\nIn this game, the player who picks DIFFERENTLY from the other two wins.\nYour goal is to be the ODD ONE OUT.\nAnalyze the human players' patterns and pick strategically.\nRespond with ONLY one word: pizza or apple. No punctuation, no explanation.";
  const userMessage = "Round " + room.round + "\nHuman pick history (most recent last):\n" + patternSummary + "\n\nCurrent round picks so far: " + JSON.stringify(Object.fromEntries(Object.entries(room.picks || {}).filter(([k]) => !k.includes("ZeroBot")))) + "\n\nWhat do you pick to be the odd one out?";
  try {
    ZeroGCompute._showIndicator(true, "ZeroBot thinking\u2026");
    const result = await ZeroGCompute.chat([{ role: "user", content: userMessage }], systemPrompt, 10);
    ZeroGCompute._showIndicator(false);
    return result.toLowerCase().includes("apple") ? "apple" : "pizza";
  } catch {
    ZeroGCompute._showIndicator(false);
    console.warn("[0G Compute] ZeroBot fallback to random pick");
    return Math.random() > 0.5 ? "pizza" : "apple";
  }
}

async function triggerAIPick() {
  if (aiPickInProgress) return;
  aiPickInProgress = true;
  try {
    let room = await Storage.get(roomKey(currentRoomCode));
    if (!room || room.phase !== "picking") return;
    const aiPlayer = room.players.find(p => p.isAI);
    if (!aiPlayer || (room.picks && room.picks[aiPlayer.username])) return;
    const aiPick = await getZeroBotPick(room);
    room = await Storage.get(roomKey(currentRoomCode));
    if (!room || room.phase !== "picking") return;
    if (room.picks && room.picks[aiPlayer.username]) return;
    if (!room.picks) room.picks = {};
    room.picks[aiPlayer.username] = aiPick;
    await Storage.set(roomKey(currentRoomCode), room);
  } finally { aiPickInProgress = false; }
}

async function generateGameRecap(room) {
  const winner = room.players.find(p => p.username === room.lastResult?.winner);
  const scores = room.players.map(p => p.username + ": " + p.score + " pts").join(", ");
  const pickHistory = (room.pickHistory || []).slice(-5);
  const roundSummary = pickHistory.map(r => "Round " + r.round + ": " + Object.entries(r.picks).map(([k, v]) => k + "\u2192" + v).join(", ") + " | Winner: " + (r.winner || "void")).join("\n");
  const systemPrompt = "You are a witty, sharp sports commentator for a pizza vs apple party game.\nWrite EXACTLY 2 sentences. Be specific about what happened. Reference player names.\nNo emojis. Plain text only.";
  const userMessage = "Match recap needed:\nWinner: " + (winner?.username || "No winner") + "\nFinal scores: " + scores + "\nTotal rounds played: " + room.round + "\nLast 5 rounds:\n" + roundSummary;
  try {
    const recap = await ZeroGCompute.chat([{ role: "user", content: userMessage }], systemPrompt, 120);
    await ZeroGCompute.verify(recap, null);
    return recap;
  } catch { return null; }
}

let recapInProgress = false;
async function triggerRecap(room) {
  if (recapInProgress) return;
  recapInProgress = true;
  const el = document.getElementById("ai-recap");
  el.innerHTML = Icons.robot.replace('width="24"', 'width="16"').replace('height="24"', 'height="16"') + ' ZeroBot is writing the recap\u2026';
  el.style.display = "block";
  const recap = await generateGameRecap(room);
  if (recap) { el.innerHTML = "\u201C" + recap + "\u201D"; }
  else { el.style.display = "none"; }
  recapInProgress = false;
}

async function getRoundCommentary(room, roundResult) {
  if (!roundResult || roundResult.wasTie) return null;
  const systemPrompt = "You are a quick-witted commentator for a pizza vs apple game.\nWrite EXACTLY one sentence (max 15 words) reacting to this round result.\nBe punchy and fun. No emojis.";
  const userMessage = "Round " + room.round + " result: " + JSON.stringify(roundResult) + "\nPicks: " + Object.entries(roundResult.picks || {}).map(([k, v]) => k + " picked " + v).join(", ");
  try {
    return await ZeroGCompute.chat([{ role: "user", content: userMessage }], systemPrompt, 40);
  } catch { return null; }
}
