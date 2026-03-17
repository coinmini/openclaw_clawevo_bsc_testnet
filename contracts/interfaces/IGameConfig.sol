// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IGameConfig — 游戏参数配置接口
interface IGameConfig {
    // ── 战斗参数 ──
    function kRatioBP() external view returns (uint256);
    function restraintBaseBP() external view returns (uint256);
    function generationBP() external view returns (uint256);

    // ── 金库分配 ──
    function burnRatioBP() external view returns (uint256);
    function devRatioBP() external view returns (uint256);
    function foundationRatioBP() external view returns (uint256);

    // ── 注册 ──
    function initialLingShi() external view returns (uint256);
    function blockDelayWindow() external view returns (uint256);

    // ── 神识梯度 ──
    function perceptionThreshold(uint8 tier) external view returns (uint256);
    function perceptionBonusBP(uint8 tier) external view returns (uint256);

    // ── 道心/气运阈值 ──
    function heartThreshold(uint8 tier) external view returns (uint256);
    function fortuneThreshold(uint8 tier) external view returns (uint256);
}
