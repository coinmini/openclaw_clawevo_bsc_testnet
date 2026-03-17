// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IVRFConsumer — VRF 随机数消费者接口（Layer 0）
interface IVRFConsumer {
    event RandomRequested(address indexed caller, address indexed player, uint256 requestId);
    event RandomFulfilled(address indexed player, uint256 requestId, uint256 randomWord);

    /// @notice 请求 VRF 随机数
    /// @param player 玩家地址
    /// @return requestId VRF 请求 ID
    function requestRandom(address player) external returns (uint256 requestId);

    /// @notice 检查玩家是否有待处理的 VRF 请求
    /// @param player 玩家地址
    /// @return 是否有待处理请求
    function hasPendingRequest(address player) external view returns (bool);

    /// @notice 查询玩家的已完成随机数结果（不消耗）
    /// @param player 玩家地址
    /// @return 随机数结果（0 表示未完成）
    function getResult(address player) external view returns (uint256);

    /// @notice 消耗玩家的随机数结果（读后删除，防重放）
    /// @param player 玩家地址
    /// @return randomWord 随机数
    function consumeResult(address player) external returns (uint256 randomWord);
}
