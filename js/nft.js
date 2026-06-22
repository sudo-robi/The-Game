// ================================================================
// NFT Winner Certificate Minting
// ================================================================

const NFT_CONTRACT_ADDRESS = "0xD168D3185E1A972b32719169e42Bb949De61B6d9";

const NFT_ABI = [
  "function mint(string username, string roomCode, uint256 score, uint256 totalRounds, string daCommitment, string metadataRoot) external returns (uint256)",
  "function getCertificate(uint256 tokenId) external view returns (tuple(address winner, string username, string roomCode, uint256 score, uint256 totalRounds, uint256 timestamp, string daCommitment, string metadataRoot, uint256 tokenId))",
  "function getPlayerTokens(address player) external view returns (uint256[])",
  "function isRoomMinted(string roomCode) external view returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "event CertificateMinted(uint256 indexed tokenId, address indexed winner, string username, string roomCode, uint256 score, string metadataRoot)"
];

const NFTMinter = {
  contract: null,
  readContract: null,

  async init() {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      NFTMinter.contract = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, signer);
      NFTMinter.readContract = new ethers.Contract(
        NFT_CONTRACT_ADDRESS, NFT_ABI, provider
      );
      console.log("[NFT] Minter initialized at", NFT_CONTRACT_ADDRESS);
    } catch (e) {
      console.error("[NFT] Init failed:", e);
    }
  },

  async checkAlreadyMinted(roomCode) {
    try {
      return await NFTMinter.readContract.isRoomMinted(roomCode);
    } catch { return false; }
  },

  async getMyTokens() {
    if (!NFTMinter.readContract || !Wallet.address) return [];
    try {
      const tokenIds = await NFTMinter.readContract.getPlayerTokens(Wallet.address);
      const certs = await Promise.all(
        tokenIds.map(id => NFTMinter.readContract.getCertificate(id))
      );
      return certs.map((c, i) => ({
        tokenId: tokenIds[i].toNumber(),
        winner: c.winner,
        username: c.username,
        roomCode: c.roomCode,
        score: c.score.toNumber(),
        totalRounds: c.totalRounds.toNumber(),
        timestamp: c.timestamp.toNumber() * 1000,
        daCommitment: c.daCommitment,
        metadataRoot: c.metadataRoot
      }));
    } catch (e) {
      console.error("[NFT] getMyTokens failed:", e);
      return [];
    }
  },

  async mint(room, daCommitment) {
    if (!NFTMinter.contract) return null;

    try {
      // build metadata object
      const metadata = {
        name: `Pizza vs Apple — Win Certificate #${Date.now()}`,
        description: `${Wallet.displayName()} won a game of Pizza vs Apple`,
        attributes: [
          { trait_type: "Winner", value: Wallet.displayName() },
          { trait_type: "Room Code", value: room.roomCode },
          { trait_type: "Score", value: room.players.find(p => p.score >= 10)?.score },
          { trait_type: "Total Rounds", value: room.round },
          { trait_type: "Timestamp", value: new Date().toISOString() },
          { trait_type: "Network", value: "0G Newton Testnet" },
          { trait_type: "DA Commitment", value: daCommitment || "none" }
        ],
        game: "Pizza vs Apple",
        roomCode: room.roomCode,
        finalScores: room.players.map(p => ({
          username: p.username,
          address: p.address,
          score: p.score
        })),
        recap: room.aiRecap || null,
        daCommitment: daCommitment || null
      };

      // upload metadata to 0G Storage
      NFTMinter._showMintStatus("Uploading metadata to 0G Storage…", "pending");
      const metadataRoot = await Storage.set(
        `nft-metadata:${room.roomCode}`,
        metadata
      ) || "";

      // mint the NFT
      NFTMinter._showMintStatus("Minting certificate on-chain…", "pending");
      const winner = room.players.find(p => p.score >= 10);

      const tx = await NFTMinter.contract.mint(
        winner.username,
        room.roomCode,
        winner.score,
        room.round,
        daCommitment || "",
        metadataRoot || ""
      );

      NFTMinter._showMintStatus("Waiting for confirmation…", "pending");
      const receipt = await tx.wait();

      // extract tokenId from event
      const event = receipt.events?.find(e => e.event === "CertificateMinted");
      const tokenId = event?.args?.tokenId?.toNumber() || null;

      NFTMinter._showMintStatus("Certificate minted!", "success");
      console.log("[NFT] Minted tokenId:", tokenId, "| tx:", receipt.transactionHash);

      Arch.markNFT();

      return { tokenId, txHash: receipt.transactionHash, metadataRoot };

    } catch (e) {
      NFTMinter._showMintStatus("Mint failed — " + (e.reason || e.message), "error");
      console.error("[NFT] Mint failed:", e);
      return null;
    }
  },

  _showMintStatus(message, state) {
    const el = document.getElementById("mint-status");
    if (!el) return;
    const colors = { pending: "#ff9800", success: "#4caf50", error: "#f44336" };
    el.style.color = colors[state] || "#fff";
    el.textContent = message;
  }
};
