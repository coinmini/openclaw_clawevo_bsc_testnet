// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IGameAccount — 托管钱包接口
/// @notice ERC-4337 智能钱包，支持 managed（托管）和 autonomous（自主）两种模式
interface IGameAccount {
    // ── Events ──
    event Executed(address indexed target, uint256 value, bytes data);
    event BatchExecuted(uint256 count);
    event Migrated(address indexed account);

    // ── Views ──
    function owner() external view returns (address);
    function managed() external view returns (bool);
    function factory() external view returns (address);
    function entryPoint() external view returns (address);
    function lingshi() external view returns (address);

    // ── Actions ──
    /// @notice 执行单笔调用（selector: 0xb61d27f6，兼容 SimpleAccount）
    function execute(address target, uint256 value, bytes calldata data) external;

    /// @notice 批量执行调用
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external;

    // ── Lifecycle ──
    /// @notice 初始化（仅工厂调用一次）
    function initialize(address owner_, address entryPoint_, address lingshi_) external;

    /// @notice 切换托管模式（仅工厂调用）
    function setManaged(bool managed_) external;
}
