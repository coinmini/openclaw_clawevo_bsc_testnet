// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IRandomBlockDelay.sol";
import "./libraries/RandomLib.sol";

/// @title RandomBlockDelay — Block-delay Blockhash 随机数合约（Layer 1）
/// @notice 统一管理 commit-reveal 两步随机数生成，供活动合约调用
/// @dev 只有 authorizedCallers 可以调用 commit/reveal
contract RandomBlockDelay is IRandomBlockDelay, Ownable {
    /// @notice commit 区块号存储：key => blockNumber
    mapping(bytes32 => uint256) public commitBlocks;

    /// @notice 授权调用者
    mapping(address => bool) public authorizedCallers;

    /// @notice blockhash 可用窗口（BSC 默认 256）
    uint256 public maxWindow;

    /// @dev 全局 nonce，递增保证随机数不重复
    uint256 private _nonce;

    error NotAuthorized();
    error AlreadyCommitted();
    error NoCommit();
    error TooEarly();
    error WindowExpired();

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(address owner_) Ownable(owner_) {
        maxWindow = 256;
    }

    // ──── Admin ────

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    function setMaxWindow(uint256 window) external onlyOwner {
        require(window > 0 && window <= 256, "RandomBlockDelay: invalid window");
        maxWindow = window;
    }

    // ──── Core ────

    /// @inheritdoc IRandomBlockDelay
    function commit(address player) external onlyAuthorized returns (bytes32 key) {
        key = _key(msg.sender, player);
        if (commitBlocks[key] != 0) revert AlreadyCommitted();

        commitBlocks[key] = block.number;
        emit Committed(msg.sender, player, block.number);
    }

    /// @inheritdoc IRandomBlockDelay
    function reveal(address player) external onlyAuthorized returns (uint256 random) {
        bytes32 key = _key(msg.sender, player);
        uint256 commitBlock = commitBlocks[key];

        if (commitBlock == 0) revert NoCommit();
        if (block.number <= commitBlock) revert TooEarly();
        if (block.number - commitBlock > maxWindow) revert WindowExpired();

        // 生成随机数
        random = RandomLib.randomFromBlockhash(commitBlock, player, _nonce);
        _nonce++;

        // 清除 commit（防重放）
        delete commitBlocks[key];
        emit Revealed(msg.sender, player, random);
    }

    // ──── View ────

    /// @inheritdoc IRandomBlockDelay
    function canReveal(address player) external view returns (bool) {
        bytes32 key = _key(msg.sender, player);
        uint256 commitBlock = commitBlocks[key];

        if (commitBlock == 0) return false;
        if (block.number <= commitBlock) return false;
        if (block.number - commitBlock > maxWindow) return false;
        return true;
    }

    /// @inheritdoc IRandomBlockDelay
    function getCommitBlock(address player) external view returns (uint256) {
        return commitBlocks[_key(msg.sender, player)];
    }

    /// @notice 获取当前 nonce
    function nonce() external view returns (uint256) {
        return _nonce;
    }

    // ──── Internal ────

    function _key(address caller, address player) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(caller, player));
    }
}
