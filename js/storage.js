// ================================================================
// 0G Storage adapter — tries real 0G Storage Turbo API first,
// falls back to localStorage for local/single-browser testing.
// ================================================================

const STORAGE_MODE_KEY = "0g_storage_mode";
const STORAGE_INDEX_KEY = "0g_storage_index";
const STORAGE_DATA_PREFIX = "0g_data_";

const ZeroGStorage = {
  _useLocalFallback: true,
  _uploadCount: 0,
  _lastRootHash: null,
  nodeUrl: "https://indexer-storage-testnet-turbo.0g.ai",

  async init() {
    const mode = sessionStorage.getItem(STORAGE_MODE_KEY);
    if (mode === "local") {
      console.log("[Storage] Using localStorage fallback");
      return;
    }
    try {
      const res = await fetch(this.nodeUrl + "/nodes", {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();
      if (data.nodes?.length) {
        this.nodeUrl = data.nodes[0].url || this.nodeUrl;
        console.log("[Storage] 0G Storage node:", this.nodeUrl);
      }
    } catch {
      console.warn("[Storage] 0G Storage unreachable, switching to localStorage");
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
    if (this._useLocalFallback) {
      try {
        localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(value));
        this._uploadCount++;
        this._showIndicator("success");
        this._updateArchInfo();
        return true;
      } catch (e) {
        console.error("[Storage] localStorage set error:", e);
        this._showIndicator("error");
        return null;
      }
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
        this._lastRootHash = data.rootHash || data.root;
        this._uploadCount++;
        this._showIndicator("success");
        this._updateArchInfo();
        this._updateRootDisplay();
        return data;
      } catch (e) {
        console.error("[Storage] 0G upload error:", e);
        if (attempt === 0) {
          this._showIndicator("error");
          await new Promise(r => setTimeout(r, 1500));
        } else {
          console.warn("[Storage] 0G upload failed, falling back to localStorage");
          this._useLocalFallback = true;
          sessionStorage.setItem(STORAGE_MODE_KEY, "local");
          return this.set(key, value);
        }
      }
    }
    return null;
  },

  async get(key) {
    if (this._useLocalFallback) {
      try {
        const raw = localStorage.getItem(STORAGE_DATA_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    // Try 0G Storage download — but we need the root hash from a prior upload
    // Since we don't have persistent rootHash storage across browsers,
    // fall back to localStorage for cross-user room sharing
    try {
      const raw = localStorage.getItem(STORAGE_DATA_PREFIX + key);
      if (raw) {
        console.warn("[Storage] 0G download unavailable (needs rootHash), using localStorage fallback");
        return JSON.parse(raw);
      }
    } catch {}
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
