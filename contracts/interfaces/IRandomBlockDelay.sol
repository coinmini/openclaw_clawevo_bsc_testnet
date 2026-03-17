// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IRandomBlockDelay — Block-delay 随机数合约接口
interface IRandomBlockDelay {
    event Committed(address indexed caller, address indexed player, uint256 blockNumber);
    event Revealed(address indexed caller, address indexed player, uint256 random);

    /// @notice 记录 commit（caller 在 startXxx 时调用）
    /// @param player 玩家地址
    /// @return key 存储键
    function commit(address player) external returns (bytes32 key);

    /// @notice 生成随机数（caller 在 finishXxx 时调用）
    /// @param player 玩家地址
    /// @return random 伪随机 uint256
    function reveal(address player) external returns (uint256 random);

    /// @notice 检查是否可以 reveal
    function canReveal(address player) external view returns (bool);

    /// @notice 获取 commit 区块号（0 表示无 pending commit）
    function getCommitBlock(address player) external view returns (uint256);
}
