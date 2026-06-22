// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PizzaVsApple {

    struct GameResult {
        string roomCode;
        address winner;
        string winnerUsername;
        uint256 winnerScore;
        uint256 totalRounds;
        uint256 timestamp;
        string daCommitment;
    }

    struct PlayerStats {
        uint256 wins;
        uint256 gamesPlayed;
        uint256 totalScore;
        uint256 roundsWon;
    }

    GameResult[] public gameHistory;
    mapping(address => PlayerStats) public playerStats;
    mapping(address => string) public playerUsernames;
    address[] public registeredPlayers;
    mapping(address => bool) private _isRegistered;

    event GameRecorded(
        string roomCode,
        address indexed winner,
        string winnerUsername,
        uint256 winnerScore,
        uint256 totalRounds,
        string daCommitment,
        uint256 timestamp
    );

    event RoundWon(
        address indexed player,
        string roomCode,
        uint256 round
    );

    event PlayerRegistered(
        address indexed player,
        string username
    );

    function recordGame(
        string calldata roomCode,
        string calldata winnerUsername,
        uint256 winnerScore,
        uint256 totalRounds,
        string calldata daCommitment
    ) external {
        if (!_isRegistered[msg.sender]) {
            _isRegistered[msg.sender] = true;
            registeredPlayers.push(msg.sender);
            emit PlayerRegistered(msg.sender, winnerUsername);
        }

        playerUsernames[msg.sender] = winnerUsername;

        PlayerStats storage stats = playerStats[msg.sender];
        stats.wins++;
        stats.gamesPlayed++;
        stats.totalScore += winnerScore;

        gameHistory.push(GameResult({
            roomCode: roomCode,
            winner: msg.sender,
            winnerUsername: winnerUsername,
            winnerScore: winnerScore,
            totalRounds: totalRounds,
            timestamp: block.timestamp,
            daCommitment: daCommitment
        }));

        emit GameRecorded(
            roomCode,
            msg.sender,
            winnerUsername,
            winnerScore,
            totalRounds,
            daCommitment,
            block.timestamp
        );
    }

    function recordRoundWin(
        string calldata roomCode,
        uint256 round
    ) external {
        if (!_isRegistered[msg.sender]) {
            _isRegistered[msg.sender] = true;
            registeredPlayers.push(msg.sender);
        }
        playerStats[msg.sender].roundsWon++;
        if (playerStats[msg.sender].gamesPlayed == 0) {
            playerStats[msg.sender].gamesPlayed = 1;
        }
        emit RoundWon(msg.sender, roomCode, round);
    }

    function recordParticipation(
        string calldata username,
        uint256 score
    ) external {
        if (!_isRegistered[msg.sender]) {
            _isRegistered[msg.sender] = true;
            registeredPlayers.push(msg.sender);
            emit PlayerRegistered(msg.sender, username);
        }
        playerUsernames[msg.sender] = username;
        playerStats[msg.sender].gamesPlayed++;
        playerStats[msg.sender].totalScore += score;
    }

    function getTopPlayers(uint256 limit) external view returns (
        address[] memory addresses,
        string[] memory usernames,
        uint256[] memory wins,
        uint256[] memory games,
        uint256[] memory scores
    ) {
        uint256 count = registeredPlayers.length < limit
            ? registeredPlayers.length
            : limit;

        addresses = new address[](count);
        usernames = new string[](count);
        wins = new uint256[](count);
        games = new uint256[](count);
        scores = new uint256[](count);

        address[] memory sorted = new address[](registeredPlayers.length);
        for (uint i = 0; i < registeredPlayers.length; i++) {
            sorted[i] = registeredPlayers[i];
        }
        for (uint i = 1; i < sorted.length; i++) {
            address key = sorted[i];
            int j = int(i) - 1;
            while (j >= 0 && playerStats[sorted[uint(j)]].wins < playerStats[key].wins) {
                sorted[uint(j + 1)] = sorted[uint(j)];
                j--;
            }
            sorted[uint(j + 1)] = key;
        }

        for (uint i = 0; i < count; i++) {
            addresses[i] = sorted[i];
            usernames[i] = playerUsernames[sorted[i]];
            wins[i] = playerStats[sorted[i]].wins;
            games[i] = playerStats[sorted[i]].gamesPlayed;
            scores[i] = playerStats[sorted[i]].totalScore;
        }
    }

    function getPlayerStats(address player) external view returns (
        uint256 wins,
        uint256 gamesPlayed,
        uint256 totalScore,
        uint256 roundsWon,
        string memory username
    ) {
        PlayerStats memory s = playerStats[player];
        return (s.wins, s.gamesPlayed, s.totalScore, s.roundsWon, playerUsernames[player]);
    }

    function getTotalGames() external view returns (uint256) {
        return gameHistory.length;
    }

    function getGameHistory(uint256 offset, uint256 limit) external view returns (
        GameResult[] memory
    ) {
        uint256 end = offset + limit > gameHistory.length
            ? gameHistory.length
            : offset + limit;
        uint256 size = end > offset ? end - offset : 0;
        GameResult[] memory results = new GameResult[](size);
        for (uint i = 0; i < size; i++) {
            results[i] = gameHistory[offset + i];
        }
        return results;
    }
}
