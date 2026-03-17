// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ERC4337Types — ERC-4337 v0.7 Vendored Types
/// @notice Shared types for Paymaster and GameAccount contracts

/// @dev Packed user operation struct per ERC-4337 v0.7
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

/// @dev PostOp mode enum per ERC-4337
enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
}

/// @dev Minimal IEntryPoint interface for Paymaster/Account interactions
interface IEntryPoint {
    function balanceOf(address account) external view returns (uint256);
    function depositTo(address account) external payable;
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
}
