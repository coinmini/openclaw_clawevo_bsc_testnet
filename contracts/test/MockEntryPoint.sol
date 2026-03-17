// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PackedUserOperation, PostOpMode} from "../libraries/ERC4337Types.sol";
import "../Paymaster.sol";
import "../GameAccount.sol";

/// @title MockEntryPoint — 模拟 EntryPoint v0.7 用于测试
/// @notice Simulates ERC-4337 EntryPoint for Paymaster unit tests
contract MockEntryPoint {
    // ── State ──
    mapping(address => uint256) private _deposits;

    // ── Deposit Management ──

    /// @notice Deposit BNB for an account
    /// @param account The account to credit
    function depositTo(address account) external payable {
        _deposits[account] += msg.value;
    }

    /// @notice Get deposit balance for an account
    /// @param account The account to query
    /// @return The deposit balance in wei
    function balanceOf(address account) external view returns (uint256) {
        return _deposits[account];
    }

    /// @notice Withdraw from an account's deposit
    /// @param withdrawAddress Destination address
    /// @param withdrawAmount Amount to withdraw
    function withdrawTo(
        address payable withdrawAddress,
        uint256 withdrawAmount
    ) external {
        // In a real EntryPoint, msg.sender would need to be the depositor.
        // For testing, we allow any caller and deduct from the sender's deposit.
        require(
            _deposits[msg.sender] >= withdrawAmount,
            "MockEntryPoint: insufficient deposit"
        );
        _deposits[msg.sender] -= withdrawAmount;
        (bool success, ) = withdrawAddress.call{value: withdrawAmount}("");
        require(success, "MockEntryPoint: transfer failed");
    }

    // ── Paymaster Simulation ──

    /// @notice Simulate EntryPoint calling validatePaymasterUserOp on a paymaster
    /// @param paymaster The paymaster contract to call
    /// @param op The packed user operation
    /// @param opHash The user operation hash
    /// @param maxCost Maximum gas cost
    /// @return context The context bytes returned by the paymaster
    /// @return validationData The validation data returned by the paymaster
    function callValidatePaymasterUserOp(
        address paymaster,
        PackedUserOperation calldata op,
        bytes32 opHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData) {
        return Paymaster(paymaster).validatePaymasterUserOp(op, opHash, maxCost);
    }

    /// @notice Simulate EntryPoint calling postOp on a paymaster
    /// @param paymaster The paymaster contract to call
    /// @param mode The post-op mode
    /// @param context The context from validatePaymasterUserOp
    /// @param gasCost The actual gas cost
    /// @param feePerGas The actual fee per gas
    function callPostOp(
        address paymaster,
        uint8 mode,
        bytes calldata context,
        uint256 gasCost,
        uint256 feePerGas
    ) external {
        Paymaster(paymaster).postOp(
            PostOpMode(mode),
            context,
            gasCost,
            feePerGas
        );
    }

    // ── Account Simulation ──

    /// @notice Simulate EntryPoint calling validateUserOp on a GameAccount
    /// @param account The account contract to call
    /// @param op The packed user operation
    /// @param opHash The user operation hash
    /// @param missingFunds Missing account funds to pay
    /// @return validationData 0 = valid, 1 = invalid
    function callValidateUserOp(
        address account,
        PackedUserOperation calldata op,
        bytes32 opHash,
        uint256 missingFunds
    ) external returns (uint256 validationData) {
        return GameAccount(payable(account)).validateUserOp(op, opHash, missingFunds);
    }

    /// @notice Allow contract to receive BNB
    receive() external payable {}
}
