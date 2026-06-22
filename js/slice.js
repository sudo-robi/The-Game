// ================================================================
// $SLICE Token Reward Module
// ================================================================

const SLICE_TOKEN_ADDRESS = "0x255C053490060Df61D374A42D95Fd570D25418a7";
const SLICE_REWARDS_ADDRESS = "0x5CEed60c98b7F98e79016295AAdaCC5166D2e0Ab";

const SLICE_TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const SLICE_REWARDS_ABI = [
  "function rewardGameWin(string roomCode) external",
  "function rewardRoundWin(string roomCode, uint256 round) external",
  "function getPlayerRewardStats(address player) external view returns (uint256 totalEarnedAmount, uint256 gamesWon, uint256 roundsWon, uint256 currentBalance)",
  "function getTotalSliceMinted() external view returns (uint256)",
  "event GameWinRewarded(address indexed player, string roomCode, uint256 amount)",
  "event RoundWinRewarded(address indexed player, string roomCode, uint256 round, uint256 amount)"
];

const SliceRewards = {
  tokenContract: null,
  rewardsContract: null,
  readTokenContract: null,
  readRewardsContract: null,
  currentBalance: 0,
  sessionEarned: 0,

  async init() {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      SliceRewards.tokenContract = new ethers.Contract(
        SLICE_TOKEN_ADDRESS, SLICE_TOKEN_ABI, signer
      );
      SliceRewards.rewardsContract = new ethers.Contract(
        SLICE_REWARDS_ADDRESS, SLICE_REWARDS_ABI, signer
      );
      SliceRewards.readTokenContract = new ethers.Contract(
        SLICE_TOKEN_ADDRESS, SLICE_TOKEN_ABI, provider
      );
      SliceRewards.readRewardsContract = new ethers.Contract(
        SLICE_REWARDS_ADDRESS, SLICE_REWARDS_ABI, provider
      );

      await SliceRewards.refreshBalance();
      console.log("[SLICE] Initialized | Balance:", SliceRewards.currentBalance);
    } catch (e) {
      console.error("[SLICE] Init failed:", e);
    }
  },

  async refreshBalance() {
    try {
      if (!SliceRewards.readTokenContract || !Wallet.address) return;
      const raw = await SliceRewards.readTokenContract.balanceOf(Wallet.address);
      SliceRewards.currentBalance = parseFloat(ethers.utils.formatEther(raw));
      SliceRewards._updateBalanceDisplay();
    } catch (e) {
      console.error("[SLICE] Balance refresh failed:", e);
    }
  },

  async claimGameWin(roomCode) {
    if (!SliceRewards.rewardsContract) return;
    try {
      SliceRewards._showRewardToast("Claiming 10 $SLICE for winning\u2026", "pending");
      const tx = await SliceRewards.rewardsContract.rewardGameWin(roomCode);
      await tx.wait();
      SliceRewards.sessionEarned += 10;
      await SliceRewards.refreshBalance();
      SliceRewards._showRewardToast("+10 $SLICE claimed!", "success");
      console.log("[SLICE] Game win reward claimed");
    } catch (e) {
      if (e.reason?.includes("already rewarded")) {
        SliceRewards._showRewardToast("Reward already claimed for this room", "info");
      } else {
        console.error("[SLICE] claimGameWin failed:", e);
      }
    }
  },

  async claimRoundWin(roomCode, round) {
    if (!SliceRewards.rewardsContract) return;
    try {
      const tx = await SliceRewards.rewardsContract.rewardRoundWin(roomCode, round);
      await tx.wait();
      SliceRewards.sessionEarned += 1;
      await SliceRewards.refreshBalance();
      SliceRewards._showRewardToast("+1 $SLICE for round win!", "success");
      console.log("[SLICE] Round " + round + " win reward claimed");
    } catch (e) {
      if (!e.reason?.includes("already rewarded")) {
        console.error("[SLICE] claimRoundWin failed:", e);
      }
    }
  },

  async getMyStats() {
    if (!SliceRewards.readRewardsContract || !Wallet.address) return null;
    try {
      const stats = await SliceRewards.readRewardsContract.getPlayerRewardStats(
        Wallet.address
      );
      return {
        totalEarned: parseFloat(ethers.utils.formatEther(stats.totalEarnedAmount)),
        gamesWon: stats.gamesWon.toNumber(),
        roundsWon: stats.roundsWon.toNumber(),
        currentBalance: parseFloat(ethers.utils.formatEther(stats.currentBalance))
      };
    } catch (e) {
      console.error("[SLICE] getMyStats failed:", e);
      return null;
    }
  },

  async getTotalMinted() {
    try {
      const raw = await SliceRewards.readRewardsContract.getTotalSliceMinted();
      return parseFloat(ethers.utils.formatEther(raw));
    } catch { return 0; }
  },

  _updateBalanceDisplay() {
    const els = document.querySelectorAll(".slice-balance");
    els.forEach(el => {
      el.textContent = SliceRewards.currentBalance.toFixed(0) + " $SLICE";
    });
  },

  _showRewardToast(message, state) {
    let toast = document.getElementById("slice-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "slice-toast";
      toast.style.cssText = "position:fixed;top:80px;right:16px;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:bold;opacity:0;transition:opacity 0.3s;z-index:9999;max-width:240px";
      document.body.appendChild(toast);
    }
    const styles = {
      pending: "background:#1a1200;border:1px solid #ff9800;color:#ff9800",
      success: "background:#0a1a0a;border:1px solid #4caf50;color:#4caf50",
      info: "background:#111;border:1px solid #555;color:#888"
    };
    toast.style.backgroundColor = "";
    toast.style.border = "";
    toast.style.color = "";
    toast.style.cssText = toast.style.cssText + ";" + (styles[state] || styles.info);
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 3500);
  }
};
