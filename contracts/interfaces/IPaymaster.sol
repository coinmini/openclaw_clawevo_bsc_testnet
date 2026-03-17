// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IGamePaymaster — Paymaster 事件接口
/// @notice ERC-4337 gas 代付合约的项目内接口，仅定义事件
interface IGamePaymaster {
    event GasSponsored(address indexed sender, uint256 actualGasCost);
    event CircuitBroken(uint256 day, uint256 totalSpent, uint256 budget);
    event CircuitReset(uint256 day);
    event DailyBudgetUpdated(uint256 oldBudget, uint256 newBudget);
    event UserDailyTxLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event TargetWhitelisted(address indexed target, bool allowed);
}
