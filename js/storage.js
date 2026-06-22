// ================================================================
// Storage adapter
//   Layer 1: localStorage — instant local cache
//   Layer 2: 0G DA — cross-device sync (full room state)
//   Layer 3: 0G Storage — best-effort persistent backup
// ================================================================

const STORAGE_DATA_PREFIX = "0g_data_";

const ZeroGStorage = {
  _uploadCount: 0,
  _lastRootHash: null,
  _roomRootCache: {},
  nodeUrl: "https://indexer-storage-testnet-turbo.0g.ai",

  async init() {
    // Nothing to probe — DA and Storage are used best-effort
  },

  _showIndicator(status) {
    const el = document.getElementById("storage-indicator");
    if (!el) return;
    el.className = status;
    if (status === "loading") { el.textContent = "\u2191 Storage"; el.style.display = "flex"; }
    else if (status === "success") { el.textContent = "\u2713 Storage"; el.style.display = "flex"; setTimeout(() => { el.style.display = "none"; }, 2000); }
    else if (status === "error") { el.textContent = "\u2717 Storage"; el.style.display = "flex"; }
    else { el.style.display = "none"; }
  },

  _updateArchInfo() {
    const info = document.getElementById("arch-storage-info");
    if (!info) return;
    info.textContent = "U:" + this._uploadCount + " | " + (this.nodeUrl ? this.nodeUrl.replace("https://", "").slice(0, 16) + "\u2026" : "N/A");
  },

  _updateRootDisplay() {
    const el = document.getElementById("storage-root-display");
    if (!el) return;
    if (this._lastRootHash) {
      el.style.display = "flex";
      el.textContent = "\u26A1 Root: 0x" + this._lastRootHash.slice(0, 6) + "\u2026" + this._lastRootHash.slice(-4);
      el.onclick = () => window.open("https://storagescan-newton.0g.ai/?rootHash=" + this._lastRootHash, "_blank");
    } else {
      el.style.display = "none";
      el.onclick = null;
    }
  },

  async set(key, value) {
    this._showIndicator("loading");

    // Layer 1 — localStorage (instant local write)
    try {
      localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(value));
    } catch {}

    // Layer 2 — DA cross-device sync (fire-and-forget)
    ZeroGDA.submitRoomState(key, value);

    // Layer 3 — 0G Storage upload (best-effort, fire-and-forget)
    this._tryStorageUpload(key, value);

    this._uploadCount++;
    this._showIndicator("success");
    this._updateArchInfo();
    return true;
  },

  // Best-effort Storage upload in background
  async _tryStorageUpload(key, value) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
        const formData = new FormData();
        formData.append("file", blob, key + ".json");
        const res = await fetch(this.nodeUrl + "/upload", {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const rootHash = data.rootHash || data.root;
        this._lastRootHash = rootHash;
        this._updateRootDisplay();
        const roomCode = key.startsWith("room:") ? key.slice(5) : null;
        if (roomCode) {
          this._roomRootCache[roomCode] = rootHash;
        }
        return;
      } catch (e) {
        console.warn("[Storage] _tryStorageUpload attempt", attempt, e);
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
  },

  async get(key) {
    // Layer 1 — localStorage (fast local cache)
    try {
      const local = localStorage.getItem(STORAGE_DATA_PREFIX + key);
      if (local) return JSON.parse(local);
    } catch {}

    // Layer 2 — DA cross-device fetch
    const daState = await ZeroGDA.fetchRoomState(key);
    if (daState) {
      // Cache in localStorage for future fast reads
      try { localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(daState)); } catch {}
      return daState;
    }

    // Layer 3 — 0G Storage download (via root hash from DA or cache)
    const roomCode = key.startsWith("room:") ? key.slice(5) : null;
    if (roomCode) {
      let rootHash = this._roomRootCache[roomCode];
      if (!rootHash) {
        rootHash = await ZeroGDA.discoverRoom(roomCode);
        if (rootHash) this._roomRootCache[roomCode] = rootHash;
      }
      if (rootHash) {
        try {
          const res = await fetch(this.nodeUrl + "/download?root=" + rootHash, {
            signal: AbortSignal.timeout(10000)
          });
          if (res.ok) {
            const text = await res.text();
            let parsed;
            try { parsed = JSON.parse(text); } catch { parsed = JSON.parse(atob(text)); }
            if (parsed) {
              try { localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(parsed)); } catch {}
              return parsed;
            }
          }
        } catch (e) {
          console.warn("[Storage] 0G download failed:", e);
        }
      }
    }

    return null;
  },

  async delete(key) {
    localStorage.removeItem(STORAGE_DATA_PREFIX + key);
  }
};

const Storage = ZeroGStorage;

const Poller = {
  _interval: null, _prev: null, _onUpdate: null, _roomCode: null,
  start(roomCode, onUpdate) {
    Poller.stop();
    Poller._roomCode = roomCode; Poller._onUpdate = onUpdate; Poller._prev = null;
    Poller._tick();
    Poller._interval = setInterval(Poller._tick, 4000);
  },
  stop() {
    if (Poller._interval != null) { clearInterval(Poller._interval); Poller._interval = null; }
    Poller._onUpdate = null; Poller._prev = null; Poller._roomCode = null;
    Poller._showSpinner(false);
  },
  async _tick() {
    if (!Poller._roomCode || !Poller._onUpdate) return;
    Poller._showSpinner(true);
    const state = await Storage.get(roomKey(Poller._roomCode));
    Poller._showSpinner(false);
    if (!state) return;
    const serialized = JSON.stringify(state);
    if (serialized !== JSON.stringify(Poller._prev)) { Poller._prev = state; Poller._onUpdate(state); }
  },
  _showSpinner(visible) {
    let el = document.getElementById("poll-spinner");
    if (!el) {
      el = document.createElement("div");
      el.id = "poll-spinner";
      document.body.appendChild(el);
    }
    el.style.opacity = visible ? "1" : "0";
  }
};

function roomKey(code) { return "room:" + code; }
