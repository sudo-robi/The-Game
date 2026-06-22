const CONTRACT_ADDRESS = "0x61dAF0E077555362ea135C1C56c808aA8b0e71F8";
const CONTRACT_ABI = [
  "function recordGame(string calldata _roomCode, address winner, uint256[] calldata scores, string calldata commitmentHash) external",
  "function recordRoundWin(address player) external",
  "function recordParticipation(address player, uint256 score) external",
  "function getPlayerStats(address player) external view returns (tuple(uint256 wins, uint256 games, uint256 totalRoundsWon, uint256 totalScore))",
  "function getTopPlayers(uint256 limit) external view returns (tuple(address player, uint256 wins, uint256 games, uint256 totalScore)[])",
  "function getTotalGames() external view returns (uint256)",
  "function getGameHistory(uint256 index) external view returns (tuple(string roomCode, address winner, uint256[] scores, string commitmentHash, uint256 timestamp))"
];
const ScoreRegistry = {
  _contract: null,
  _signer: null,
  _initialized: false,
  init() {
    if (ScoreRegistry._initialized) return;
    try {
      const provider = Wallet.provider || (window.ethereum ? new ethers.providers.Web3Provider(window.ethereum) : null);
      if (!provider) { console.warn("[ScoreRegistry] No provider available"); return; }
      ScoreRegistry._signer = provider.getSigner();
      ScoreRegistry._contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ScoreRegistry._signer);
      ScoreRegistry._initialized = true;
      console.log("[ScoreRegistry] Initialized at", CONTRACT_ADDRESS);
    } catch (e) { console.warn("[ScoreRegistry] Init failed:", e); }
  },
  async recordGame(roomCode, winnerAddress, scores, commitmentHash) {
    ScoreRegistry.init();
    if (!ScoreRegistry._contract) return null;
    try {
      Arch.markContract();
      const tx = await ScoreRegistry._contract.recordGame(roomCode, winnerAddress, scores, commitmentHash);
      const receipt = await tx.wait();
      return receipt.transactionHash;
    } catch (e) { console.warn("[ScoreRegistry] recordGame failed:", e); return null; }
  },
  async recordRoundWin(playerAddress) {
    ScoreRegistry.init();
    if (!ScoreRegistry._contract) return;
    try {
      const tx = await ScoreRegistry._contract.recordRoundWin(playerAddress);
      await tx.wait();
    } catch (e) { console.warn("[ScoreRegistry] recordRoundWin failed:", e); }
  },
  async recordParticipation(playerAddress, score) {
    ScoreRegistry.init();
    if (!ScoreRegistry._contract) return;
    try {
      const tx = await ScoreRegistry._contract.recordParticipation(playerAddress, score);
      await tx.wait();
    } catch (e) { console.warn("[ScoreRegistry] recordParticipation failed:", e); }
  },
  async getMyStats() {
    ScoreRegistry.init();
    if (!ScoreRegistry._contract || !Wallet.address) return null;
    try {
      const stats = await ScoreRegistry._contract.getPlayerStats(Wallet.address);
      return { wins: stats.wins.toNumber(), games: stats.games.toNumber(), totalRoundsWon: stats.totalRoundsWon.toNumber(), totalScore: stats.totalScore.toNumber() };
    } catch (e) { console.warn("[ScoreRegistry] getMyStats failed:", e); return null; }
  },
  async getTopPlayers(limit) {
    ScoreRegistry.init();
    if (!ScoreRegistry._contract) return [];
    try {
      const list = await ScoreRegistry._contract.getTopPlayers(limit || 50);
      return list.map(p => ({ address: p.player, wins: p.wins.toNumber(), games: p.games.toNumber(), totalScore: p.totalScore.toNumber() }));
    } catch (e) { console.warn("[ScoreRegistry] getTopPlayers failed:", e); return []; }
  },
  async getTotalGames() {
    ScoreRegistry.init();
    if (!ScoreRegistry._contract) return 0;
    try {
      const total = await ScoreRegistry._contract.getTotalGames();
      return total.toNumber();
    } catch (e) { return 0; }
  }
};
