// ================================================================
// 0G Storage adapter — shared global index + per-key tagged files.
//
// The global index (key → rootHash) lives on 0G Storage itself as a
// tagged file, so every browser can discover rooms created by any
// other browser.
// ================================================================

const STORAGE_DATA_PREFIX = "0g_data_";

const ZeroGStorage = {
  baseUrl: "https://indexer-storage-testnet-standard.0g.ai",
  apiKey: "sk-33fd984b-7627-4263-8388-ef94fdce50ac",
  INDEX_NAMESPACE: "pizza-vs-apple-index-v1",
  _index: {},
  _indexRootHash: null,
  _uploadCount: 0,
  _lastRootHash: null,

  async loadIndex() {
    try {
      const res = await fetch(
        ZeroGStorage.baseUrl + "/query?tag=" + encodeURIComponent(ZeroGStorage.INDEX_NAMESPACE),
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.rootHash) {
          ZeroGStorage._indexRootHash = data.rootHash;
          const indexData = await ZeroGStorage._fetchByHash(data.rootHash);
          if (indexData) ZeroGStorage._index = indexData;
        }
      }
    } catch (e) {
      console.warn("[Storage] Could not load global index, starting fresh:", e);
    }
    // Merge local sessionStorage index as fallback
    try {
      const local = sessionStorage.getItem("0g_storage_index");
      if (local) {
        const parsed = JSON.parse(local);
        ZeroGStorage._index = { ...ZeroGStorage._index, ...parsed };
      }
    } catch {}
  },

  async _fetchByHash(rootHash) {
    try {
      const res = await fetch(
        ZeroGStorage.baseUrl + "/download?rootHash=" + encodeURIComponent(rootHash),
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return null;
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = JSON.parse(atob(text)); }
      return parsed;
    } catch {
      return null;
    }
  },

  async _saveIndex() {
    // Load latest index first to reduce chance of overwriting concurrent writes
    try {
      const latest = await fetch(
        ZeroGStorage.baseUrl + "/query?tag=" + encodeURIComponent(ZeroGStorage.INDEX_NAMESPACE),
        { signal: AbortSignal.timeout(3000) }
      );
      if (latest.ok) {
        const d = await latest.json();
        if (d.rootHash) {
          const remote = await ZeroGStorage._fetchByHash(d.rootHash);
          if (remote) ZeroGStorage._index = { ...remote, ...ZeroGStorage._index };
        }
      }
    } catch {}
    try {
      const blob = new Blob([JSON.stringify(ZeroGStorage._index)], { type: "application/json" });
      const form = new FormData();
      form.append("file", blob, ZeroGStorage.INDEX_NAMESPACE + ".json");
      form.append("tag", ZeroGStorage.INDEX_NAMESPACE);
      const res = await fetch(ZeroGStorage.baseUrl + "/upload", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        ZeroGStorage._indexRootHash = data.rootHash;
      }
    } catch (e) {
      console.warn("[Storage] Could not save global index:", e);
    }
    sessionStorage.setItem("0g_storage_index", JSON.stringify(ZeroGStorage._index));
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
    info.textContent = "U:" + this._uploadCount + " | " + (this._indexRootHash ? "index:0x" + this._indexRootHash.slice(0, 6) + "\u2026" : "no index");
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

    try {
      const content = JSON.stringify(value);
      const blob = new Blob([content], { type: "application/json" });
      const form = new FormData();
      form.append("file", blob, key + ".json");
      form.append("tag", key);

      const res = await fetch(this.baseUrl + "/upload", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error("Upload failed: " + res.status);

      const data = await res.json();
      const rootHash = data.rootHash || data.root;
      this._lastRootHash = rootHash;
      this._index[key] = rootHash;

      // Fire-and-forget: save updated index so other browsers can find it
      this._saveIndex();

      this._uploadCount++;
      this._showIndicator("success");
      this._updateArchInfo();
      this._updateRootDisplay();

      // Also fire DA registration as secondary discovery
      const roomCode = key.startsWith("room:") ? key.slice(5) : null;
      if (roomCode) {
        ZeroGDA.registerRoom(roomCode, rootHash);
      }

      return true;
    } catch (e) {
      console.error("[Storage] set failed:", e);
      this._showIndicator("error");
      this._uploadCount++;
      this._updateArchInfo();
      return true;
    }
  },

  async get(key) {
    // Layer 1 — localStorage (fast local cache)
    try {
      const local = localStorage.getItem(STORAGE_DATA_PREFIX + key);
      if (local) return JSON.parse(local);
    } catch {}

    // Layer 2 — index lookup
    let rootHash = ZeroGStorage._index[key];

    // If not in local index cache, reload global index and retry
    if (!rootHash) {
      await ZeroGStorage.loadIndex();
      rootHash = ZeroGStorage._index[key];
    }

    // If still not found, try querying by tag directly
    if (!rootHash) {
      try {
        const res = await fetch(
          ZeroGStorage.baseUrl + "/query?tag=" + encodeURIComponent(key),
          { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.rootHash) {
            rootHash = data.rootHash;
            ZeroGStorage._index[key] = rootHash;
          }
        }
      } catch {}
    }

    if (rootHash) {
      const parsed = await ZeroGStorage._fetchByHash(rootHash);
      if (parsed) {
        try { localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(parsed)); } catch {}
        return parsed;
      }
    }

    // Layer 3 — DA fallback (secondary discovery)
    const roomCode = key.startsWith("room:") ? key.slice(5) : null;
    if (roomCode) {
      rootHash = await ZeroGDA.discoverRoom(roomCode);
      if (rootHash) {
        ZeroGStorage._index[key] = rootHash;
        const res = await fetch(this.baseUrl + "/download?rootHash=" + encodeURIComponent(rootHash), {
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
      }
    }

    return null;
  },

  async delete(key) {
    localStorage.removeItem(STORAGE_DATA_PREFIX + key);
    delete ZeroGStorage._index[key];
    await ZeroGStorage._saveIndex();
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
    if (!state) {
      // Index may be stale — reload and retry once
      await ZeroGStorage.loadIndex();
      const retry = await Storage.get(roomKey(Poller._roomCode));
      if (retry) { Poller._prev = retry; Poller._onUpdate(retry); }
      return;
    }
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
