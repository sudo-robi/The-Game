// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PizzaVsAppleNFT {

    string public name = "Pizza vs Apple Winner";
    string public symbol = "PVAW";
    uint256 public totalSupply;

    struct WinCertificate {
        address winner;
        string username;
        string roomCode;
        uint256 score;
        uint256 totalRounds;
        uint256 timestamp;
        string daCommitment;
        string metadataRoot;
        uint256 tokenId;
    }

    mapping(uint256 => WinCertificate) public certificates;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(address => uint256[]) public playerTokens;
    mapping(string => bool) private _roomMinted;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed winner,
        string username,
        string roomCode,
        uint256 score,
        string metadataRoot
    );

    function transferFrom(address, address, uint256) external pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert("Soulbound: non-transferable");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("Soulbound: non-transferable");
    }

    function approve(address, uint256) external pure {
        revert("Soulbound: non-transferable");
    }

    function setApprovalForAll(address, bool) external pure {
        revert("Soulbound: non-transferable");
    }

    function mint(
        string calldata username,
        string calldata roomCode,
        uint256 score,
        uint256 totalRounds,
        string calldata daCommitment,
        string calldata metadataRoot
    ) external returns (uint256) {
        require(!_roomMinted[roomCode], "NFT already minted for this room");

        uint256 tokenId = ++totalSupply;
        _roomMinted[roomCode] = true;
        _owners[tokenId] = msg.sender;
        _balances[msg.sender]++;

        certificates[tokenId] = WinCertificate({
            winner: msg.sender,
            username: username,
            roomCode: roomCode,
            score: score,
            totalRounds: totalRounds,
            timestamp: block.timestamp,
            daCommitment: daCommitment,
            metadataRoot: metadataRoot,
            tokenId: tokenId
        });

        playerTokens[msg.sender].push(tokenId);

        emit Transfer(address(0), msg.sender, tokenId);
        emit CertificateMinted(
            tokenId,
            msg.sender,
            username,
            roomCode,
            score,
            metadataRoot
        );

        return tokenId;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return _owners[tokenId];
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }

    function getPlayerTokens(address player) external view returns (uint256[] memory) {
        return playerTokens[player];
    }

    function getCertificate(uint256 tokenId) external view returns (WinCertificate memory) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return certificates[tokenId];
    }

    function isRoomMinted(string calldata roomCode) external view returns (bool) {
        return _roomMinted[roomCode];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        WinCertificate memory cert = certificates[tokenId];
        return string(abi.encodePacked(
            "https://storagescan-newton.0g.ai/?rootHash=",
            cert.metadataRoot
        ));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x01ffc9a7;
    }
}
