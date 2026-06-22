// ================================================================
// 0G Architecture tracking
// ================================================================
const Arch = {
  used: { storage: true, compute: false, da: false, contract: false, nft: false, slice: false },
  update() {
    document.getElementById("arch-storage").className = "arch-dot " + (Arch.used.storage ? "active" : "inactive");
    document.getElementById("arch-compute").className = "arch-dot " + (Arch.used.compute ? "active" : "inactive");
    document.getElementById("arch-da").className = "arch-dot " + (Arch.used.da ? "active" : "inactive");
    document.getElementById("arch-contract").className = "arch-dot " + (Arch.used.contract ? "contract" : "inactive");
    document.getElementById("arch-nft").className = "arch-dot " + (Arch.used.nft ? "active" : "inactive");
    document.getElementById("arch-slice").className = "arch-dot " + (Arch.used.slice ? "active" : "inactive");
  },
  markCompute() { Arch.used.compute = true; Arch.update(); Arch._updateComputeInfo(); },
  markDA() { Arch.used.da = true; Arch.update(); Arch._updateDAInfo(); },
  markContract() { Arch.used.contract = true; Arch.update(); setTimeout(() => Arch._updateContractInfo(), 0); },
  markNFT() { Arch.used.nft = true; Arch.update(); setTimeout(() => Arch._updateNFTInfo(), 0); },
  markSlice() { Arch.used.slice = true; Arch.update(); setTimeout(() => Arch._updateSliceInfo(), 0); },
  _updateComputeInfo() {
    const el = document.getElementById("arch-compute-info");
    if (!el) return;
    const node = ZeroGCompute.lastNodeId || "newton-compute-01";
    el.textContent = "Node: " + node + " | Calls: " + ZeroGCompute.requestCount;
  },
  _updateDAInfo() {
    const el = document.getElementById("arch-da-info");
    if (!el) return;
    const lastCommit = ZeroGDA.commitments.length > 0 ? ZeroGDA.commitments.slice(-1)[0].commitment.slice(0, 6) + "\u2026" + ZeroGDA.commitments.slice(-1)[0].commitment.slice(-4) : "none";
    el.textContent = "Sub: " + ZeroGDA.submissionCount + " | " + lastCommit;
  },
  async _updateContractInfo() {
    const el = document.getElementById("arch-contract-info");
    if (!el) return;
    const total = await ScoreRegistry.getTotalGames();
    el.textContent = "Games: " + total + " | 0x61da\u2026e71F8";
  },
  async _updateNFTInfo() {
    const el = document.getElementById("arch-nft-info");
    if (!el) return;
    try {
      if (NFTMinter.readContract) {
        const supply = await NFTMinter.readContract.totalSupply();
        el.textContent = "Minted: " + supply.toNumber();
      }
    } catch { el.textContent = "Not minted"; }
  },
  async _updateSliceInfo() {
    const info = document.getElementById("arch-slice-info");
    const minted = document.getElementById("arch-slice-minted");
    if (!info || !minted) return;
    info.textContent = "0x255C\u202618a7 / 0x5CEE\u2026e0Ab";
    try {
      const total = await SliceRewards.getTotalMinted();
      minted.textContent = total.toFixed(0) + " $SLICE minted";
    } catch { minted.textContent = "Not minted"; }
  }
};
Arch.update();

document.getElementById("arch-btn").addEventListener("click", () => {
  document.getElementById("arch-panel").classList.toggle("open");
});

// ================================================================
// Badges
// ================================================================
(function initBadges() {
  document.getElementById("badges").innerHTML =
    '<span class="badge">' + Icons.bolt + ' 0G Storage</span>' +
    '<span class="badge">' + Icons.brain + ' 0G Compute</span>' +
    '<span class="badge">' + Icons.signal + ' 0G DA</span>' +
    '<span class="badge" style="border-color:#8b5cf6;color:#8b5cf6">' + Icons.star + ' 0G Contract</span>' +
    '<span class="badge" style="border-color:#ff6b00;color:#ff6b00">' + Icons.crown + ' NFT</span>';
  const badgeRow = document.getElementById("badge-row");
  if (badgeRow) {
    badgeRow.innerHTML =
      '<span class="badge-item">' + Icons.bolt + ' Storage</span>' +
      '<span class="badge-item">' + Icons.brain + ' Compute</span>' +
      '<span class="badge-item">' + Icons.signal + ' DA</span>' +
      '<span class="badge-item" style="border-color:#8b5cf6;color:#8b5cf6">' + Icons.star + ' Contract</span>' +
      '<span class="badge-item" style="border-color:#ff6b00;color:#ff6b00">' + Icons.crown + ' NFT</span>';
  }
})();

// ================================================================
// Pick card SVGs
// ================================================================
document.getElementById("pick-pizza-svg").innerHTML = Icons.pizza;
document.getElementById("pick-apple-svg").innerHTML = Icons.apple;

// ================================================================
// Connect screen icon + leaderboard link
// ================================================================
document.getElementById("connect-icon").innerHTML = Icons.pizza.replace('width="64"', 'width="48"').replace('height="64"', 'height="48"');
const connectScreen = document.getElementById("screen-connect");
const lbLink = document.createElement("div");
lbLink.style.marginTop = "0.75rem";
lbLink.innerHTML = '<button class="btn-subtle" id="connect-leaderboard-btn">' + Icons.globe.replace('width="24"', 'width="16"').replace('height="24"', 'height="16"') + ' Global Leaderboard</button>';
connectScreen.querySelector(".card").appendChild(lbLink);


