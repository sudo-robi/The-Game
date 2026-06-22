# 🍕 Pizza vs Apple
### A Web3 Multiplayer Party Game on 0G Network

> **Zero Cup Hackathon Submission — 0G Labs**
> Built by [sudo-robi](https://github.com/sudo-robi)

---

## What Is This?

Pizza vs Apple is a real-time 3-player multiplayer party game where the odd one out wins. Every round, three players secretly choose between 🍕 Pizza or 🍎 Apple. If two players pick the same thing, the lone player who picked differently earns +2 points. First to 10 points wins the game.

It sounds simple. It is not simple. It is a mind game.

The entire game runs on **0G Network infrastructure** — decentralized storage for game state, decentralized compute for the AI opponent, and data availability for tamper-evident result logging. Winners receive on-chain proof of their victory: a score registry entry, a soulbound NFT certificate, and $SLICE token rewards.


## Table of Contents

- [How to Play](#how-to-play)
- [0G Network Integration](#0g-network-integration)
- [Smart Contracts](#smart-contracts)
- [Architecture](#architecture)
- [Game Mechanics](#game-mechanics)
- [Tech Stack](#tech-stack)
- [Running Locally](#running-locally)
- [Contract Addresses](#contract-addresses)
- [Project Structure](#project-structure)
- [Walkthrough for Judges](#walkthrough-for-judges)

---

## How to Play

### Step 1 — Connect Your Wallet
Open the game and click **Connect Wallet**. MetaMask will prompt you to switch to the **0G Newton Testnet** (Chain ID: 9496). The game adds the network automatically if you don't have it.

Your identity in the game is your wallet address (or ENS name if you have one). No usernames, no accounts, no passwords.

### Step 2 — Create or Join a Room
One player clicks **Create Room** and gets a 4-character room code like `X7KP`. They share it with two friends. The other two players click **Join Room**, enter the code, and wait in the lobby.

Room state is written to **0G Decentralized Storage** the moment it is created. Every player's device polls the room state every 4 seconds to stay in sync — no central server involved.

### Step 3 — Pick Pizza or Apple
Once all 3 players are in the room the game begins. Each player secretly clicks either 🍕 or 🍎. No one sees anyone else's pick while choosing.

Once all 3 picks are locked in, the choices are revealed simultaneously.

### Step 4 — Scoring
| Outcome | Result |
|---|---|
| 2-1 split | The lone odd-one-out earns **+2 points** and **+1 $SLICE** |
| 3-0 split (all same) | Void round — no points, pick again |

First player to reach **10 points** wins the game.

### Step 5 — Win and Earn
When the game ends:
- The winner's result is submitted to **0G DA** with a cryptographic commitment hash
- The result is recorded **on-chain** via the `PizzaVsApple` score registry contract
- The winner earns **+10 $SLICE** tokens
- The winner can mint a **soulbound NFT certificate** stored on 0G Storage
- An **AI-generated match recap** is produced via 0G Compute

A new game automatically starts in the same room with all scores reset.

---

## 0G Network Integration

This project uses all three layers of the 0G infrastructure stack. Each layer does real, load-bearing work — nothing is decorative.

### 🗄️ 0G Decentralized Storage
**What it does:** Stores all live game state — room objects, player picks, scores, round history, heartbeats, and NFT metadata.

**Why it is needed:** There is no central server. The game is a shared single-file web app. 0G Storage is the backend. Every write to room state (player joins, pick submitted, score updated) is an upload to a real 0G storage node. Every poll cycle is a download from that node.

**Key operations:**
- `Storage.set("room:{code}", roomObject)` — writes room state on every game action
- `Storage.get("room:{code}")` — polled every 4 seconds by all players to detect state changes
- `Storage.set("nft-metadata:{roomCode}", metadata)` — uploads NFT metadata before minting
- `Storage.set("heartbeat:{roomCode}:{address}", timestamp)` — liveness signal every 5 seconds

The root hash of every write is displayed on-screen. Players can verify their room state on [storagescan-newton.0g.ai](https://storagescan-newton.0g.ai).

---

### 🧠 0G Decentralized Compute
**What it does:** Powers ZeroBot (the AI opponent) and generates post-game recaps and round commentary.

**Why it is needed:** ZeroBot is not a random number generator. It reads the last 5 rounds of pick history for all human players, sends that context to the 0G inference endpoint running `meta-llama/Llama-3-8b-instruct`, and picks strategically to be the odd one out. The compute node ID is shown in the architecture panel so judges can verify real inference is happening.

**Key operations:**
- **ZeroBot pick** — called when ZeroBot needs to choose pizza or apple. Sends pick history as context, receives a strategic decision.
- **Post-game recap** — 2-sentence witty match summary generated after every game ends.
- **Round commentary** — 1-sentence reaction generated after every non-void round, displayed on the reveal screen before picks are shown.

If 0G Compute is unavailable, ZeroBot falls back to a random pick and commentary fails silently. The game always continues.

---

### 📡 0G Data Availability
**What it does:** Records every completed game result as a tamper-evident blob on the 0G DA layer. Powers the global cross-room leaderboard.

**Why it is needed:** On-chain smart contract calls record who won. But the full match data — every pick, every round, the AI recap, all player addresses — needs to be stored cheaply and verifiably. 0G DA is exactly this: cheap, verifiable, permanent data.

**Key operations:**
- On game over, the room creator submits a full `resultData` blob to `das_submitBlob` including winner address, final scores, pick history, AI recap, and a wallet signature
- The DA commitment hash is displayed on the game over screen and linked to [da-scan.0g.ai](https://da-scan.0g.ai)
- The global leaderboard fetches all `pizza-vs-apple` namespace blobs via `das_getBlobsByNamespace`, decodes them, and aggregates wins per wallet address

Every result blob is signed by the winner's wallet before submission, making results cryptographically attributable.

---

## Smart Contracts

Four contracts are deployed on **0G Newton Testnet (Chain ID: 9496)**.

### `PizzaVsApple.sol` — Score Registry
The on-chain source of truth for game results and player stats.

| Function | Description |
|---|---|
| `recordGame(roomCode, winnerUsername, winnerScore, totalRounds, daCommitment)` | Called by winner's wallet at game end. Links to DA commitment. |
| `recordRoundWin(string roomCode, uint256 round)` | Called by round winner after each round. |
| `recordParticipation(username, score)` | Called by non-winning players to log their participation. |
| `getTopPlayers(limit)` | Returns ranked leaderboard sorted by wins. |
| `getPlayerStats(address)` | Returns full stats for any wallet. |
| `getTotalGames()` | Returns total games recorded on-chain. |

### `PizzaVsAppleNFT.sol` — Soulbound Winner Certificate
ERC-721 compliant, fully non-transferable (soulbound). One NFT per room, mintable only by the winner.

| Function | Description |
|---|---|
| `mint(username, roomCode, score, totalRounds, daCommitment, metadataRoot)` | Mints a winner certificate. Reverts if room already minted. |
| `getCertificate(tokenId)` | Returns full certificate data. |
| `getPlayerTokens(address)` | Returns all token IDs owned by a player. |
| `tokenURI(tokenId)` | Returns link to metadata on 0G Storage. |

Transfer functions (`transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`) all revert with `"Soulbound: non-transferable"`.

### `SliceToken.sol` — $SLICE ERC-20
Standard ERC-20 with a minter role system. Only authorized minters (the `SliceRewards` contract) can mint new tokens.

| Function | Description |
|---|---|
| `mint(to, amount)` | Only callable by authorized minters. |
| `addMinter(address)` | Owner only. Authorizes a new minter. |
| `transfer`, `approve`, `transferFrom` | Standard ERC-20. |

### `SliceRewards.sol` — Token Distribution
Handles $SLICE distribution with replay protection. Each room can only be rewarded once. Each round can only reward each player once.

| Function | Description |
|---|---|
| `rewardGameWin(roomCode)` | Mints 10 $SLICE to caller. Reverts if room already rewarded. |
| `rewardRoundWin(roomCode, round)` | Mints 1 $SLICE to caller. Reverts if already rewarded for this round. |
| `getPlayerRewardStats(address)` | Returns total earned, games won, rounds won, current balance. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Player's Browser                        │
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐  │
│  │  Game UI    │   │   Poller    │   │  Wallet Module  │  │
│  │  (Vanilla   │◄──│  (4s poll) │   │  (ethers.js)    │  │
│  │   JS/HTML)  │   └──────┬──────┘   └────────┬────────┘  │
│  └──────┬──────┘          │                    │           │
└─────────┼─────────────────┼────────────────────┼───────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────┐  ┌─────────────┐  ┌─────────────────────┐
│  0G Storage     │  │  0G Storage │  │  0G Newton Testnet  │
│  (Write room    │  │  (Read room │  │  (Chain ID: 9496)   │
│   state)        │  │   state)    │  │                     │
└─────────────────┘  └─────────────┘  │  ┌───────────────┐  │
                                       │  │ PizzaVsApple  │  │
┌─────────────────┐                   │  │ Score Registry│  │
│  0G Compute     │                   │  ├───────────────┤  │
│  (ZeroBot pick  │                   │  │ PizzaVsApple  │  │
│   + recap +     │                   │  │ NFT (PVAW)    │  │
│   commentary)   │                   │  ├───────────────┤  │
└─────────────────┘                   │  │ SliceToken    │  │
                                       │  │ ($SLICE)      │  │
┌─────────────────┐                   │  ├───────────────┤  │
│  0G DA          │                   │  │ SliceRewards  │  │
│  (Game result   │                   │  └───────────────┘  │
│   blobs +       │                   └─────────────────────┘
│   leaderboard)  │
└─────────────────┘
```

### How Multiplayer Works Without a Server

Traditional multiplayer games need a WebSocket server to broadcast state changes. This game has no server. Instead:

1. Every game action writes the new room state to 0G Storage
2. Every player's browser polls 0G Storage every 4 seconds
3. When polled state differs from last known state, the UI updates
4. All game logic runs client-side — pick evaluation, score calculation, phase transitions

This works because 0G Storage is shared and persistent. The room object in storage is the single source of truth. Any player reading it gets the current game state.

Race conditions (two players trying to evaluate picks simultaneously) are handled with a random 200-400ms jitter before evaluation and a re-read guard: before writing a result, the evaluating player re-reads storage and only proceeds if phase is still `"picking"`.

---

## Game Mechanics

### Round Flow
```
All 3 players in room
        │
        ▼
   phase: "picking"
   Players choose pizza or apple
   Picks written to storage as they come in
        │
        ▼ (all 3 picks detected)
   Evaluate picks
   ├── 2-1 split → winner gets +2 pts, phase: "reveal"
   └── 3-0 split → void round, phase: "reveal"
        │
        ▼
   phase: "reveal"
   All picks shown simultaneously
   AI commentary displayed
   Host clicks Next Round
        │
        ▼
   Check for winner (score ≥ 10)
   ├── Winner found → phase: "gameover"
   └── No winner → round++, phase: "picking"
        │
        ▼
   phase: "gameover"
   Results submitted to DA
   Contract calls made
   NFT mint available
   5-second countdown → reset → phase: "picking"
```

### ZeroBot AI Logic
ZeroBot joins when only 2 humans are in the room after 20 seconds. Its pick is not random — it sends the last 5 rounds of human pick history to 0G Compute and asks the model to choose strategically. The model is instructed to analyze patterns and pick the option more likely to be different from both humans.

If both humans have been picking Pizza consistently, ZeroBot will pick Apple. If picks are random, ZeroBot reasons about what a pattern-seeking player would do and tries to subvert it.

### Disconnect Handling
Every player sends a heartbeat to 0G Storage every 5 seconds. If a heartbeat is older than 12 seconds, the player is marked disconnected and a warning banner appears. If `players[0]` (the host) is disconnected for more than 15 seconds, the next player is promoted to host automatically to prevent the game from stalling.

Players can rejoin at any time using the same wallet address and room code.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — single file, no framework |
| Wallet | ethers.js v5.7, MetaMask, WalletConnect |
| Decentralized Storage | 0G Storage (indexer-storage-testnet-standard.0g.ai) |
| Decentralized Compute | 0G Compute (api.compute.0g.ai) — Llama 3 8B |
| Data Availability | 0G DA (rpc-da-testnet.0g.ai) |
| Smart Contracts | Solidity 0.8.19, deployed on 0G Newton Testnet |
| Icons | Inline SVG — no external icon library |
| Audio | Web Audio API — no external files |

---

## Running Locally

No build step. No dependencies. No Node.js required.

```bash
git clone https://github.com/sudo-robi/The-Game
cd The-Game
```

Open `index.html` in your browser. That is it.

For multiplayer to work across devices, host the file anywhere static:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

Then share your local IP with other players on the same network, or deploy to any static host (Vercel, Netlify, GitHub Pages).

---

## Contract Addresses

All contracts deployed on **0G Newton Testnet (Chain ID: 9496)**:

| Contract | Address |
|---|---|
| PizzaVsApple (Score Registry) | [`0x61dAF0E077555362ea135C1C56c808aA8b0e71F8`](https://chainscan-newton.0g.ai/address/0x61dAF0E077555362ea135C1C56c808aA8b0e71F8) |
| PizzaVsAppleNFT (Soulbound Certificate) | [`0xD168D3185E1A972b32719169e42Bb949De61B6d9`](https://chainscan-newton.0g.ai/address/0xD168D3185E1A972b32719169e42Bb949De61B6d9) |
| SliceToken ($SLICE ERC-20) | [`0x255C053490060Df61D374A42D95Fd570D25418a7`](https://chainscan-newton.0g.ai/address/0x255C053490060Df61D374A42D95Fd570D25418a7) |
| SliceRewards (Token Distribution) | [`0x5CEed60c98b7F98e79016295AAdaCC5166D2e0Ab`](https://chainscan-newton.0g.ai/address/0x5CEed60c98b7F98e79016295AAdaCC5166D2e0Ab) |

> Verify on [chainscan-newton.0g.ai](https://chainscan-newton.0g.ai)

---

## Project Structure

```
The-Game/
│
├── index.html              # Game UI — all screens, game logic
├── style.css               # All styles
├── vercel.json             # Static deployment config
│
├── js/
│   ├── icons.js            # Inline SVG icon definitions
│   ├── wallet.js           # MetaMask connection (minimal, optional)
│   ├── storage.js          # 0G Storage + localStorage fallback + Poller
│   ├── heartbeat.js        # 5s liveness heartbeat via storage
│   ├── contract.js         # PizzaVsApple ScoreRegistry ABI + calls
│   ├── compute.js          # 0G Compute — ZeroBot pick, recap, commentary
│   ├── da.js               # 0G DA — blob submission + leaderboard fetch
│   ├── arch.js             # Architecture panel, badges, pick SVGs, leaderboard link
│   ├── nft.js              # NFTMinter — soulbound certificate minting
│   ├── slice.js            # SliceRewards — $SLICE token rewards
│   └── app.js              # Game state machine, all screens, orchestration
│
├── contracts/
│   ├── PizzaVsApple.sol        # Score registry
│   ├── PizzaVsAppleNFT.sol     # Soulbound NFT certificates
│   ├── SliceToken.sol          # $SLICE ERC-20 token
│   └── SliceRewards.sol        # Token distribution with replay protection
│
└── README.md
```

---

## Walkthrough for Judges

This section walks through exactly what happens when you open the game, what 0G infrastructure is being called at each step, and where to verify it.

---

### Step 1 — Open the App and Connect Wallet

The first screen is a wallet connect page. Click **Connect Wallet**.

MetaMask opens. If you are not on 0G Newton Testnet, the app calls `wallet_addEthereumChain` automatically to add it. No manual network setup needed.

Once connected, the app calls `ZeroGStorage.init()`, `ScoreRegistry.init()`, `NFTMinter.init()`, and `SliceRewards.init()` — initializing all four contract instances and querying the optimal 0G storage node.

Your on-chain stats load immediately from `ScoreRegistry.getPlayerStats(address)` and `SliceRewards.getPlayerRewardStats(address)`.

---

### Step 2 — Create a Room

Click **Create Room**. A 4-character room code is generated. The following room object is written to **0G Storage**:

```json
{
  "roomCode": "X7KP",
  "players": [{ "username": "0x1234...abcd", "address": "0x1234...abcd", "score": 0, "connected": true }],
  "phase": "lobby",
  "round": 1,
  "picks": {},
  "lastResult": null,
  "pickHistory": []
}
```

The root hash returned by 0G Storage is shown below the room code on the waiting screen. Click it to verify on storagescan-newton.0g.ai.

---

### Step 3 — Second and Third Players Join

Two other wallets open the same app link, enter the room code, and click **Join Room**. Each join reads the room from 0G Storage, adds the player to `players[]`, and writes the updated room back.

The waiting screen polls 0G Storage every 4 seconds. When all 3 players are detected, the game transitions to `phase: "picking"` automatically.

---

### Step 4 — Playing Rounds

Each player clicks Pizza or Apple. The pick is written to `room.picks[address]` in 0G Storage. The other players' polling detects the new pick within 4 seconds.

When all 3 picks are in, the first player to detect it runs evaluation (with jitter to prevent collisions). The winner is determined, scores updated, `phase` set to `"reveal"`, and the full room state written back to 0G Storage.

Simultaneously, a request goes to **0G Compute** for a one-sentence round commentary. The model ID and compute node ID are shown in the architecture panel (button, bottom right).

---

### Step 5 — Adding ZeroBot (Optional)

If only 2 humans are in the waiting room after 20 seconds, an **Add AI Player** button appears. Clicking it adds ZeroBot to `players[]`.

When ZeroBot needs to pick, the pick history of all human players is sent to `api.compute.0g.ai` with the Llama 3 8B model. The response is a single word: `pizza` or `apple`. This is written to `room.picks["🤖 ZeroBot"]` in storage.

---

### Step 6 — Game Over

When a player reaches 10 points, the following sequence runs (room creator only):

**1. Submit to 0G DA**
```
POST rpc-da-testnet.0g.ai → das_submitBlob
Payload: full result JSON signed by winner's wallet
Returns: commitment hash
```
The commitment hash appears on screen and links to da-scan.0g.ai.

**2. Record on-chain**
```
PizzaVsApple.recordGame(roomCode, winnerUsername, score, rounds, daCommitment)
```
Transaction hash shown on screen, links to chainscan-newton.0g.ai.

**3. Claim $SLICE**
```
SliceRewards.rewardGameWin(roomCode) → mints 10 SLICE to winner
```
Round wins throughout the game already claimed 1 SLICE each via `rewardRoundWin`.

**4. Generate AI recap**
```
POST api.compute.0g.ai → Llama 3 8B
Prompt: full match summary
Returns: 2-sentence witty recap
```
Shown below the winner name in italic text.

**5. Mint NFT (winner only)**
```
Storage.set("nft-metadata:{roomCode}", metadata) → uploads to 0G Storage → returns rootHash
PizzaVsAppleNFT.mint(username, roomCode, score, rounds, daCommitment, rootHash)
```
Soulbound. Non-transferable. One per room. Token URI points to metadata on 0G Storage.

---

### Where to Verify Everything

| What | Where |
|---|---|
| Room state on 0G Storage | storagescan-newton.0g.ai/?rootHash={hash} |
| DA game result blob | da-scan.0g.ai/commitment/{commitment} |
| Score registry tx | chainscan-newton.0g.ai/tx/{txHash} |
| NFT certificate | chainscan-newton.0g.ai/token/{NFTAddress} |
| $SLICE balance | chainscan-newton.0g.ai/token/{SliceAddress} |
| 0G Compute node | Architecture panel in-app |

---

### Things That Make This a Real 0G App

- Room state lives on 0G Storage nodes, not localStorage or a server. Pull the network cable on the host's machine mid-game and other players keep playing.
- ZeroBot's picks are provably from a 0G Compute node — the node ID is shown in-app.
- Game results are signed by the winner's wallet before DA submission. Anyone can verify the winner didn't tamper with the result.
- NFT metadata is on 0G Storage, not IPFS. The `tokenURI` points directly to a 0G storage root hash.
- The global leaderboard is built entirely from DA blobs — no database, no API, no trust.

---

## Author

**Robi** — [@sudo-robi](https://github.com/sudo-robi)

Builder in Web3 security, AI systems, and on-chain gaming.

*Pizza vs Apple — because the odd one out always wins.*
