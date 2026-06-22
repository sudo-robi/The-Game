// ================================================================
// 0G Data Availability module (Real 0G DA API)
// ================================================================
const ZeroGDA = {
  rpcUrl: "https://rpc-da-testnet.0g.ai",
  apiKey: "sk-33fd984b-7627-4263-8388-ef94fdce50ac",
  namespace: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("pizza-vs-apple")).padEnd(66, "0").slice(0, 66),
  submissionCount: 0,
  commitments: [],

  _encodeBlob(data) {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
    padded.set(bytes);
    return padded;
  },

  _toHex(bytes) {
    return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  _showDAIndicator(active, label) {
    let el = document.getElementById("da-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "da-indicator";
      document.body.appendChild(el);
    }
    el.textContent = active ? "\uD83D\uDCE1 " + (label || "") : "";
    el.style.opacity = active ? "1" : "0";
  },

  async submit(data) {
    try {
      const blob = ZeroGDA._encodeBlob(data);
      const hexBlob = ZeroGDA._toHex(blob);
      const res = await fetch(ZeroGDA.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ZeroGDA.apiKey },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "das_submitBlob",
          params: [{ namespace: ZeroGDA.namespace, data: hexBlob, gasLimit: "0x100000" }],
          id: Date.now()
        })
      });
      if (!res.ok) throw new Error("DA submit HTTP error: " + res.status);
      const json = await res.json();
      if (json.error) throw new Error("DA RPC error: " + json.error.message);
      const commitment = json.result?.commitment || json.result;
      ZeroGDA.submissionCount++;
      ZeroGDA.commitments.push({ commitment, timestamp: Date.now(), data });
      console.log("[0G DA] Submitted blob | Commitment: " + commitment);
      return commitment;
    } catch (e) {
      console.error("[0G DA] Submit error:", e);
      return null;
    }
  },

  async fetchAll() {
    try {
      const res = await fetch(ZeroGDA.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ZeroGDA.apiKey },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "das_getBlobsByNamespace",
          params: [{ namespace: ZeroGDA.namespace, limit: 50, offset: 0 }],
          id: Date.now()
        })
      });
      if (!res.ok) throw new Error("DA fetch HTTP error: " + res.status);
      const json = await res.json();
      if (json.error) throw new Error("DA RPC error: " + json.error.message);
      const blobs = json.result?.blobs || [];
      return blobs.map(blob => {
        try {
          const bytes = new Uint8Array(blob.data.match(/.{1,2}/g).map(b => parseInt(b, 16)));
          const text = new TextDecoder().decode(bytes).replace(/\0/g, "");
          return JSON.parse(text);
        } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      console.error("[0G DA] Fetch error:", e);
      return [];
    }
  },

  async verifyCommitment(commitment) {
    try {
      const res = await fetch(ZeroGDA.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ZeroGDA.apiKey },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "das_getCommitmentStatus",
          params: [{ commitment }], id: Date.now()
        })
      });
      const json = await res.json();
      return json.result?.status === "finalized";
    } catch { return false; }
  },

  _roomNamespace(roomCode) {
    const raw = "pizza-room-" + roomCode;
    return ethers.utils.hexlify(ethers.utils.toUtf8Bytes(raw)).padEnd(66, "0").slice(0, 66);
  },

  async registerRoom(roomCode, rootHash) {
    try {
      const blob = { roomCode, rootHash, timestamp: Date.now() };
      const encoded = ZeroGDA._encodeBlob(blob);
      const hexBlob = ZeroGDA._toHex(encoded);
      const res = await fetch(ZeroGDA.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ZeroGDA.apiKey },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "das_submitBlob",
          params: [{ namespace: ZeroGDA._roomNamespace(roomCode), data: hexBlob, gasLimit: "0x100000" }],
          id: Date.now()
        })
      });
      if (!res.ok) throw new Error("DA register HTTP error: " + res.status);
      const json = await res.json();
      if (json.error) throw new Error("DA register RPC error: " + json.error.message);
      return json.result?.commitment || json.result;
    } catch (e) {
      console.warn("[DA] registerRoom failed:", e);
      return null;
    }
  },

  async discoverRoom(roomCode) {
    try {
      const res = await fetch(ZeroGDA.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ZeroGDA.apiKey },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "das_getBlobsByNamespace",
          params: [{ namespace: ZeroGDA._roomNamespace(roomCode), limit: 1, offset: 0 }],
          id: Date.now()
        })
      });
      if (!res.ok) throw new Error("DA discover HTTP error: " + res.status);
      const json = await res.json();
      if (json.error) throw new Error("DA discover RPC error: " + json.error.message);
      const blobs = json.result?.blobs || [];
      if (!blobs.length) return null;
      const latest = blobs[blobs.length - 1];
      const bytes = new Uint8Array(latest.data.match(/.{1,2}/g).map(b => parseInt(b, 16)));
      const text = new TextDecoder().decode(bytes).replace(/\0/g, "");
      const parsed = JSON.parse(text);
      return parsed.rootHash || null;
    } catch (e) {
      console.warn("[DA] discoverRoom failed:", e);
      return null;
    }
  }
};

async function submitGameResultToDA(room) {
  const winnerPlayer = room.players.find(p => p.score >= 10);
  const resultData = {
    version: "1.0", namespace: "pizza-vs-apple", timestamp: Date.now(),
    roomCode: room.roomCode,
    winner: {
      username: winnerPlayer?.username,
      address: winnerPlayer?.address,
      score: Math.max(...room.players.map(p => p.score))
    },
    finalScores: room.players.map(p => ({
      username: p.username, address: p.address || null, score: p.score, isAI: p.isAI || false
    })),
    totalRounds: room.round,
    pickHistory: room.pickHistory || [],
    chainId: "0x2518",
    submittedBy: Wallet.address
  };
  let signature = null;
  try {
    const message = JSON.stringify({ winner: resultData.winner.address, roomCode: resultData.roomCode, timestamp: resultData.timestamp });
    signature = await Wallet.sign(message);
    resultData.signature = signature;
  } catch { console.warn("[0G DA] Could not sign result \u2014 submitting unsigned"); }
  ZeroGDA._showDAIndicator(true, "Submitting to DA\u2026");
  const commitment = await ZeroGDA.submit(resultData);
  ZeroGDA._showDAIndicator(false);
  return commitment;
}

async function verifyAndDisplayCommitment(commitment, room) {
  const statusEl = document.getElementById("da-status");
  if (!commitment) {
    statusEl.innerHTML = '<span style="color:#f44336">\u2717 DA submission failed</span>';
    return;
  }
  statusEl.innerHTML = '<span style="color:#ff9800">\u23F3 Verifying on 0G DA\u2026</span>';
  room.daCommitment = commitment;
  await Storage.set(roomKey(currentRoomCode), room);
  Arch.markDA();
  let verified = false;
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 5000));
    verified = await ZeroGDA.verifyCommitment(commitment);
    if (verified) break;
  }
  const short = commitment.slice(0, 8) + "\u2026" + commitment.slice(-6);
  const explorerUrl = "https://da-scan.0g.ai/commitment/" + commitment;
  statusEl.innerHTML = verified
    ? '<span style="color:#4caf50">\u2713 Verified on 0G DA</span><a href="' + explorerUrl + '" target="_blank" style="color:#ff6b00;margin-left:8px;font-family:monospace;font-size:12px">' + short + ' \u2197</a>'
    : '<span style="color:#ff9800">\u23F3 Pending finalization</span><span style="font-family:monospace;font-size:11px;color:#666;margin-left:8px">' + short + '</span>';
  const confirmEl = document.getElementById("da-confirm");
  confirmEl.innerHTML = Icons.signal.replace('width="16"', 'width="14"').replace('height="16"', 'height="14"') + ' Result recorded on 0G DA <code>' + commitment.slice(0, 12) + '\u2026</code>';
}

async function submitToDA(room) {
  const host = room.players[0];
  if (!host || host.username !== currentUser) return;
  ZeroGDA._showDAIndicator(true, "Submitting to DA\u2026");
  const commitment = await submitGameResultToDA(room);
  ZeroGDA._showDAIndicator(false);
  verifyAndDisplayCommitment(commitment, room);
  const scoreArray = room.players.filter(p => !p.isAI).map(p => p.score);
  const winnerPlayer = room.players.find(p => p.username === room.lastResult?.winner);
  const txHash = await ScoreRegistry.recordGame(currentRoomCode, winnerPlayer?.address || Wallet.address, scoreArray, commitment || "");
  if (txHash) {
    const el = document.getElementById("tx-status");
    if (el) el.innerHTML = '<span class="tx-indicator done">\u2713 On-chain: <a href="https://chainscan-newton.0g.ai/tx/' + txHash + '" target="_blank" style="color:#8b5cf6">' + txHash.slice(0, 6) + '\u2026' + txHash.slice(-4) + '</a></span>';
    Arch.markContract();
    Arch._updateContractInfo();
  }
  room.players.forEach(p => {
    if (p.isAI) return;
    const pAddr = p.address || Wallet.address;
    if (pAddr.toLowerCase() !== (winnerPlayer?.address || Wallet.address).toLowerCase()) {
      ScoreRegistry.recordParticipation(pAddr, p.score).catch(() => {});
    }
  });
}
