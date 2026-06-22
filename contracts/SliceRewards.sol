// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SliceToken {
    function mint(address to, uint256 amount) external pure {}
    function balanceOf(address /* account */) external pure returns (uint256) { return 0; }
    function totalSupply() external pure returns (uint256) { return 0; }
}

contract SliceRewards {

    SliceToken public sliceToken;
    address public owner;

    uint256 public constant GAME_WIN_REWARD = 10 * 1e18;
    uint256 public constant ROUND_WIN_REWARD = 1 * 1e18;

    mapping(address => uint256) public totalEarned;
    mapping(address => uint256) public gamesWonRewarded;
    mapping(address => uint256) public roundsWonRewarded;
    mapping(string => bool) private _gameRewarded;
    mapping(string => mapping(uint256 => mapping(address => bool))) private _roundRewarded;

    event GameWinRewarded(address indexed player, string roomCode, uint256 amount);
    event RoundWinRewarded(address indexed player, string roomCode, uint256 round, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _sliceToken) {
        sliceToken = SliceToken(_sliceToken);
        owner = msg.sender;
    }

    function rewardGameWin(string calldata roomCode) external {
        require(!_gameRewarded[roomCode], "Game already rewarded");
        _gameRewarded[roomCode] = true;
        sliceToken.mint(msg.sender, GAME_WIN_REWARD);
        totalEarned[msg.sender] += GAME_WIN_REWARD;
        gamesWonRewarded[msg.sender]++;
        emit GameWinRewarded(msg.sender, roomCode, GAME_WIN_REWARD);
    }

    function rewardRoundWin(string calldata roomCode, uint256 round) external {
        require(!_roundRewarded[roomCode][round][msg.sender], "Round already rewarded");
        _roundRewarded[roomCode][round][msg.sender] = true;
        sliceToken.mint(msg.sender, ROUND_WIN_REWARD);
        totalEarned[msg.sender] += ROUND_WIN_REWARD;
        roundsWonRewarded[msg.sender]++;
        emit RoundWinRewarded(msg.sender, roomCode, round, ROUND_WIN_REWARD);
    }

    function getPlayerRewardStats(address player) external view returns (
        uint256 totalEarnedAmount,
        uint256 gamesWon,
        uint256 roundsWon,
        uint256 currentBalance
    ) {
        return (
            totalEarned[player],
            gamesWonRewarded[player],
            roundsWonRewarded[player],
            sliceToken.balanceOf(player)
        );
    }

    function getTotalSliceMinted() external view returns (uint256) {
        return sliceToken.totalSupply();
    }

    function updateSliceToken(address _newToken) external onlyOwner {
        sliceToken = SliceToken(_newToken);
    }
}
