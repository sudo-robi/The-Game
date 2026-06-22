// ================================================================
// Storage adapter — localStorage only (instant, works offline).
// ================================================================

const STORAGE_DATA_PREFIX = "0g_data_";

const ZeroGStorage = {
  _uploadCount: 0,

  async init() {},

  async loadIndex() {},

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
    info.textContent = "localStorage";
  },

  async set(key, value) {
    this._showIndicator("loading");
    try {
      localStorage.setItem(STORAGE_DATA_PREFIX + key, JSON.stringify(value));
    } catch {}
    this._uploadCount++;
    this._showIndicator("success");
    this._updateArchInfo();
    return true;
  },

  async get(key) {
    try {
      const local = localStorage.getItem(STORAGE_DATA_PREFIX + key);
      if (local) return JSON.parse(local);
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
