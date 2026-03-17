// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ITreasury — 金库接口
interface ITreasury {
    event FeeCollected(
        address indexed payer,
        uint256 totalAmount,
        uint256 burned,
        uint256 toDevWallet,
        uint256 toFoundation
    );

    /// @notice 收取灵石手续费并按比例分配（调用方需先 approve）
    function collectFee(address payer, uint256 amount) external;
}
