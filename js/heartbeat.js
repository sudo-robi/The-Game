// ================================================================
// Heartbeat system (uses Wallet.address for keys)
// ================================================================
function heartbeatKey(code, address) { return "heartbeat:" + code + ":" + address; }

const Heartbeat = {
  _interval: null, _roomCode: null, _address: null,
  start(roomCode, address) {
    Heartbeat.stop(); Heartbeat._roomCode = roomCode; Heartbeat._address = address;
    Heartbeat._pulse(); Heartbeat._interval = setInterval(() => Heartbeat._pulse(), 5000);
  },
  stop() {
    if (Heartbeat._interval != null) { clearInterval(Heartbeat._interval); Heartbeat._interval = null; }
    Heartbeat._roomCode = null; Heartbeat._address = null;
  },
  async _pulse() {
    if (!Heartbeat._roomCode || !Heartbeat._address) return;
    await Storage.set(heartbeatKey(Heartbeat._roomCode, Heartbeat._address), { timestamp: Date.now(), address: Heartbeat._address });
    await Heartbeat._checkAll(); await Heartbeat._checkHostMigration();
  },
  async _checkAll() {
    const room = await Storage.get(roomKey(Heartbeat._roomCode));
    if (!room) return;
    let changed = false; const now = Date.now();
    for (const player of room.players) {
      if (player.isAI) continue;
      const addr = player.address;
      if (!addr) continue;
      const hb = await Storage.get(heartbeatKey(Heartbeat._roomCode, addr));
      const isConnected = hb && hb.timestamp != null && now - hb.timestamp < 12000;
      if (player.connected !== isConnected) { player.connected = isConnected; changed = true; }
    }
    if (changed) {
      const fresh = await Storage.get(roomKey(Heartbeat._roomCode));
      if (!fresh) return;
      for (const player of fresh.players) {
        if (player.isAI) continue;
        const addr = player.address;
        if (!addr) continue;
        const hb = await Storage.get(heartbeatKey(Heartbeat._roomCode, addr));
        const isConnected = hb && hb.timestamp != null && now - hb.timestamp < 12000;
        if (player.connected !== isConnected) player.connected = isConnected;
      }
      await Storage.set(roomKey(Heartbeat._roomCode), fresh);
    }
  },
  async _checkHostMigration() {
    const room = await Storage.get(roomKey(Heartbeat._roomCode));
    if (!room || room.players.length < 2) return;
    if (room.players[0].connected) return;
    if (room.players[0].isAI) return;
    const addr = room.players[0].address;
    if (!addr) return;
    const hb = await Storage.get(heartbeatKey(Heartbeat._roomCode, addr));
    const isGone = !hb || hb.timestamp == null || Date.now() - hb.timestamp > 15000;
    if (!isGone) return;
    const fresh = await Storage.get(roomKey(Heartbeat._roomCode));
    if (!fresh || fresh.players.length < 2) return;
    if (fresh.players[0].connected) return;
    if (fresh.players[0].isAI) return;
    const secondAddr = fresh.players[1].address;
    if (!secondAddr) return;
    const secondHb = await Storage.get(heartbeatKey(Heartbeat._roomCode, secondAddr));
    if (!secondHb || secondHb.timestamp == null || Date.now() - secondHb.timestamp > 12000) return;
    const promoted = fresh.players.splice(1, 1)[0];
    fresh.players.unshift(promoted);
    await Storage.set(roomKey(Heartbeat._roomCode), fresh);
  }
};

function updateDisconnectBanner(players) {
  if (!players) return;
  const disconnected = players.filter(p => !p.connected);
  const banner = document.getElementById("disconnect-banner");
  if (disconnected.length === 0) { banner.style.display = "none"; return; }
  const names = disconnected.map(p => p.username).join(", ");
  banner.innerHTML = Icons.warning + ' <span>' + names + " disconnected \u2014 waiting for them to rejoin\u2026</span>";
  banner.style.display = "flex";
}

window.addEventListener("beforeunload", () => {
  if (currentRoomCode && Heartbeat._address) { Storage.set(heartbeatKey(currentRoomCode, Heartbeat._address), { timestamp: null }); }
  Heartbeat.stop();
});
