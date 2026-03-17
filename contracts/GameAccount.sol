// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PackedUserOperation, IEntryPoint} from "./libraries/ERC4337Types.sol";
import "./interfaces/IGameAccount.sol";

/// @title GameAccount — ERC-4337 托管智能钱包
/// @notice Minimal smart wallet with managed mode (灵石 transfer locked) and autonomous mode
/// @dev Deployed as EIP-1167 minimal proxy via GameAccountFactory
contract GameAccount is IGameAccount {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ── Custom Errors ──
    error OnlyEntryPoint();
    error OnlyEntryPointOrOwner();
    error OnlyFactory();
    error AlreadyInitialized();
    error NotInitialized();
    error ManagedTransferBlocked();
    error ExecutionFailed();

    // ── LingShi Transfer Selectors ──
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;     // transfer(address,uint256)
    bytes4 private constant TRANSFER_FROM_SELECTOR = 0x23b872dd; // transferFrom(address,address,uint256)
    bytes4 private constant APPROVE_SELECTOR = 0x095ea7b3;       // approve(address,uint256)

    // ── ERC-4337 Validation Constants ──
    uint256 private constant SIG_VALIDATION_SUCCESS = 0;
    uint256 private constant SIG_VALIDATION_FAILED = 1;

    // ── Storage ──
    address private _owner;
    bool private _managed;
    address private _factory;
    address private _entryPoint;
    address private _lingshi;
    bool private _initialized;

    // ── Views ──

    function owner() external view override returns (address) {
        return _owner;
    }

    function managed() external view override returns (bool) {
        return _managed;
    }

    function factory() external view override returns (address) {
        return _factory;
    }

    function entryPoint() external view override returns (address) {
        return _entryPoint;
    }

    function lingshi() external view override returns (address) {
        return _lingshi;
    }

    // ── Initialization ──

    /// @notice Initialize the account (called once by Factory during clone creation)
    /// @param owner_ The owner EOA that signs UserOps
    /// @param entryPoint_ The ERC-4337 EntryPoint address
    /// @param lingshi_ The LingShi ERC-20 token address
    function initialize(
        address owner_,
        address entryPoint_,
        address lingshi_
    ) external override {
        if (_initialized) revert AlreadyInitialized();

        _owner = owner_;
        _entryPoint = entryPoint_;
        _lingshi = lingshi_;
        _factory = msg.sender;
        _managed = true;
        _initialized = true;
    }

    // ── ERC-4337 Validation ──

    /// @notice Validate a UserOperation signature (called by EntryPoint)
    /// @param userOp The packed user operation
    /// @param userOpHash Hash of the user operation
    /// @param missingAccountFunds Amount of funds to pay EntryPoint
    /// @return validationData 0 = valid, 1 = invalid
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != _entryPoint) revert OnlyEntryPoint();

        // Suppress unused parameter warning
        (userOp);

        // Verify ECDSA signature
        bytes32 ethHash = userOpHash.toEthSignedMessageHash();
        address recovered = ethHash.recover(userOp.signature);

        validationData = (recovered == _owner)
            ? SIG_VALIDATION_SUCCESS
            : SIG_VALIDATION_FAILED;

        // Pay prefund to EntryPoint if needed
        if (missingAccountFunds > 0) {
            (bool success, ) = _entryPoint.call{value: missingAccountFunds}("");
            // Ignore failure (EntryPoint will handle it)
            (success);
        }
    }

    // ── Execution ──

    /// @notice Execute a single call (selector: 0xb61d27f6)
    /// @param target The target contract address
    /// @param value BNB value to send
    /// @param data The calldata to forward
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external override {
        if (msg.sender != _entryPoint && msg.sender != _owner) {
            revert OnlyEntryPointOrOwner();
        }

        _checkManagedRestrictions(target, data);

        (bool success, ) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        emit Executed(target, value, data);
    }

    /// @notice Execute multiple calls in a batch
    /// @param targets The target contract addresses
    /// @param values BNB values for each call
    /// @param datas The calldata for each call
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external override {
        if (msg.sender != _entryPoint && msg.sender != _owner) {
            revert OnlyEntryPointOrOwner();
        }

        require(
            targets.length == values.length && values.length == datas.length,
            "GameAccount: length mismatch"
        );

        for (uint256 i = 0; i < targets.length; i++) {
            _checkManagedRestrictions(targets[i], datas[i]);

            (bool success, ) = targets[i].call{value: values[i]}(datas[i]);
            if (!success) revert ExecutionFailed();
        }

        emit BatchExecuted(targets.length);
    }

    // ── Factory Controls ──

    /// @notice Switch managed mode (only callable by Factory)
    /// @param managed_ New managed mode state
    function setManaged(bool managed_) external override {
        if (msg.sender != _factory) revert OnlyFactory();
        _managed = managed_;

        if (!managed_) {
            emit Migrated(address(this));
        }
    }

    // ── Receive BNB ──

    receive() external payable {}

    // ── Internal ──

    /// @dev Check managed mode restrictions on target + selector
    function _checkManagedRestrictions(
        address target,
        bytes calldata data
    ) internal view {
        if (!_managed) return;
        if (target != _lingshi) return;

        // Block LingShi transfer/transferFrom/approve in managed mode
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);
            if (
                selector == TRANSFER_SELECTOR ||
                selector == TRANSFER_FROM_SELECTOR ||
                selector == APPROVE_SELECTOR
            ) {
                revert ManagedTransferBlocked();
            }
        }
    }
}
