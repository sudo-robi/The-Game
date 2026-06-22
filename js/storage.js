// ================================================================
// 0G Storage adapter — uploads room state to 0G Storage,
// uses 0G DA for cross-device room discovery (roomCode → rootHash),
// falls back to localStorage when 0G is unreachable.
// ================================================================

const STORAGE_MODE_KEY = "0g_storage_mode";
const STORAGE_DATA_PREFIX = "0g_data_";

const ZeroGStorage = {
  _useLocalFallback: true,
  _uploadCount: 0,
  _lastRootHash: null,
  _roomRootCache: {},
  nodeUrl: "https://indexer-storage-testnet-turbo.0g.ai",

  async init() {
    const mode = sessionStorage.getItem(STORAGE_MODE_KEY);
    if (mode === "local") {
      this._useLocalFallback = true;
      return;
    }
    try {
      const res = await fetch(this.nodeUrl + "/nodes", {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();
      if (data.nodes?.length) {
        this.nodeUrl = data.nodes[0].url || this.nodeUrl;
        this._useLocalFallback = false;
      }
    } catch {
      console.warn("[Storage] 0G Storage unreachable, using localStorage");
      this._useLocalFallback = true;
      sessionStorage.setItem(STORAGE_MODE_KEY, "local");
    }
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
    const mode = this._useLocalFallback ? "local" : (this.nodeUrl ? this.nodeUrl.replace("https://", "").slice(0, 16) + "\u2026" : "N/A");
    info.textContent = "U:" + this._uploadCount + " | " + mode;
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

    // Always save to localStorage as a fast local cache
    try {
      localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(value));
    } catch {}

    if (this._useLocalFallback) {
      this._uploadCount++;
      this._showIndicator("success");
      this._updateArchInfo();
      return true;
    }

    // Try 0G Storage upload
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
        this._uploadCount++;
        this._showIndicator("success");
        this._updateArchInfo();
        this._updateRootDisplay();

        // Cache root hash for this room key (e.g. "room:ABCD" → "0x...")
        const roomCode = key.startsWith("room:") ? key.slice(5) : null;
        if (roomCode) {
          this._roomRootCache[roomCode] = rootHash;
          // Fire-and-forget DA registration for cross-device discovery
          ZeroGDA.registerRoom(roomCode, rootHash);
        }
        return data;
      } catch (e) {
        console.error("[Storage] 0G upload error:", e);
        if (attempt === 0) {
          this._showIndicator("error");
          await new Promise(r => setTimeout(r, 1500));
        } else {
          console.warn("[Storage] 0G upload failed twice, falling back to localStorage");
          this._useLocalFallback = true;
          sessionStorage.setItem(STORAGE_MODE_KEY, "local");
          this._uploadCount++;
          this._showIndicator("success");
          this._updateArchInfo();
          return true;
        }
      }
    }
    return null;
  },

  async get(key) {
    // Try localStorage first (fast local cache)
    try {
      const local = localStorage.getItem(STORAGE_DATA_PREFIX + key);
      if (local) return JSON.parse(local);
    } catch {}

    // If 0G Storage was used, try downloading by root hash
    const roomCode = key.startsWith("room:") ? key.slice(5) : null;
    if (!this._useLocalFallback && roomCode) {
      let rootHash = this._roomRootCache[roomCode];

      // Try DA discovery if we don't have the root hash cached
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
              // Cache in localStorage for future fast reads
              localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(parsed));
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
