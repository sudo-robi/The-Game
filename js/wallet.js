// ================================================================
// Wallet Connection Module
// ================================================================

// showToast and showScreen are defined in app.js (loaded after this file)

const Wallet = {
  address: null, shortAddress: null, ensName: null, provider: null, walletType: null,
  async connectMetaMask() {
    const provider = await Wallet._waitForProvider();
    if (!provider) throw new Error("No wallet detected. Make sure MetaMask is installed and unlocked.");
    let accounts;
    try {
      accounts = await provider.request({ method: "eth_requestAccounts" });
    } catch (e) {
      if (e.code === 4001) throw new Error("Connection rejected in MetaMask.");
      if (e.code === -32002) throw new Error("MetaMask is busy. Complete the pending popup first.");
      throw new Error("MetaMask error: " + (e.message || "unknown"));
    }
    if (!accounts || !accounts.length) throw new Error("No accounts returned.");
    Wallet.address = accounts[0];
    Wallet.shortAddress = accounts[0].slice(0, 6) + "..." + accounts[0].slice(-4);
    Wallet.provider = provider;
    Wallet.walletType = "metamask";
    await Wallet._resolveENS(accounts[0]);
    Wallet._listenAccountsChanged();
    return Wallet.displayName();
  },
  _resolveENS: async function(addr) {
    try {
      const res = await fetch("https://api.ensideas.com/ens/resolve/" + addr);
      const data = await res.json();
      Wallet.ensName = data.name || null;
    } catch { Wallet.ensName = null; }
  },
  _listenAccountsChanged() {
    const p = Wallet.provider;
    if (!p || !p.on) return;
    try {
      p.on("accountsChanged", (accts) => {
        if (accts.length === 0) { Wallet.address = null; showScreen("screen-connect"); }
        else { location.reload(); }
      });
    } catch {}
  },
  _findProvider() {
    if (window.ethereum && typeof window.ethereum.request === "function") return window.ethereum;
    return null;
  },
  async _waitForProvider() {
    if (Wallet._findProvider()) return Wallet._findProvider();
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (Wallet._findProvider()) return Wallet._findProvider();
    }
    return null;
  },
  displayName() { return Wallet.ensName || Wallet.shortAddress; },
  isConnected() { return !!Wallet.address; },
  async sign(message) {
    const provider = Wallet.provider;
    if (!provider) throw new Error("Wallet not connected");
    const addr = Wallet.address;
    const msgHex = "0x" + Array.from(new TextEncoder().encode(message)).map(b => b.toString(16).padStart(2, "0")).join("");
    try {
      return await provider.request({ method: "personal_sign", params: [msgHex, addr] });
    } catch {
      return await provider.request({ method: "eth_sign", params: [addr, msgHex] });
    }
  }
};
