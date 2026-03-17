// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPaymaster.sol";
import {PackedUserOperation, PostOpMode, IEntryPoint} from "./libraries/ERC4337Types.sol";

// ── Paymaster Contract ──

/// @title Paymaster — ERC-4337 Gas 代付合约
/// @notice 为游戏内白名单合约的 UserOperation 代付 gas，包含每日预算和熔断机制
contract Paymaster is Ownable, IGamePaymaster {
    // ── Custom Errors ──
    error OnlyEntryPoint();
    error ContractPaused();
    error CircuitBreakerActive();
    error TargetNotWhitelisted();
    error UserDailyLimitExceeded();
    error CallDataTooShort();
    error InvalidBudget();
    error InvalidTxLimit();

    // ── Constants ──
    uint256 private constant SECONDS_PER_DAY = 86400;
    uint256 private constant MAX_DAILY_BUDGET = 10 ether;
    uint256 private constant MAX_USER_TX_LIMIT = 200;
    /// @dev Selector for SimpleAccount.execute(address,uint256,bytes)
    bytes4 private constant EXECUTE_SELECTOR = 0xb61d27f6;

    // ── Immutables ──
    IEntryPoint public immutable entryPoint;

    // ── Whitelist ──
    mapping(address => bool) public whitelistedTargets;

    // ── Global daily budget ──
    uint256 public dailyBudget;
    uint256 public currentDaySpent;
    uint256 public currentDay;
    bool public circuitBroken;

    // ── Per-user daily tracking ──
    uint256 public userDailyTxLimit;
    mapping(address => uint256) private userDayTxCount;
    mapping(address => uint256) private userLastDay;

    // ── Pause ──
    bool public paused;

    // ── Modifiers ──
    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }

    // ── Constructor ──

    /// @notice Deploy Paymaster with EntryPoint reference and initial owner
    /// @param entryPoint_ ERC-4337 EntryPoint contract address
    /// @param owner_ Initial contract owner
    constructor(
        address entryPoint_,
        address owner_
    ) Ownable(owner_) {
        entryPoint = IEntryPoint(entryPoint_);
        dailyBudget = 1 ether;
        userDailyTxLimit = 50;
        currentDay = block.timestamp / SECONDS_PER_DAY;
    }

    // ── ERC-4337 Core ──

    /// @notice Validate a UserOperation for gas sponsorship
    /// @param userOp The packed user operation
    /// @param userOpHash Hash of the user operation (unused, kept for interface compliance)
    /// @param maxCost Maximum gas cost the paymaster agrees to cover (unused, kept for interface compliance)
    /// @return context Encoded sender address for postOp tracking
    /// @return validationData Always 0 (signature-less paymaster)
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        // Suppress unused parameter warnings
        (userOpHash, maxCost);

        if (paused) revert ContractPaused();

        // Reset global day state if needed (must happen before circuit breaker check)
        uint256 today = block.timestamp / SECONDS_PER_DAY;
        if (currentDay < today) {
            currentDay = today;
            currentDaySpent = 0;
            circuitBroken = false;
        }

        if (circuitBroken) revert CircuitBreakerActive();

        // Extract target address from callData (SimpleAccount.execute pattern)
        address target = _extractTarget(userOp.callData);
        if (!whitelistedTargets[target]) revert TargetNotWhitelisted();

        // Per-user daily limit check
        address sender = userOp.sender;

        uint256 txCount = userDayTxCount[sender];
        uint256 lastDay = userLastDay[sender];

        if (lastDay < today) {
            // New day for this user: reset count
            txCount = 0;
        }

        if (txCount >= userDailyTxLimit) revert UserDailyLimitExceeded();

        // Update per-user tracking
        userDayTxCount[sender] = txCount + 1;
        userLastDay[sender] = today;

        context = abi.encode(sender);
        validationData = 0;
    }

    /// @notice Post-operation callback to track actual gas spending
    /// @param mode Post-op mode (unused)
    /// @param context Encoded sender from validatePaymasterUserOp
    /// @param actualGasCost Actual gas cost in wei
    /// @param actualUserOpFeePerGas Actual fee per gas (unused)
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external onlyEntryPoint {
        // Suppress unused parameter warnings
        (mode, actualUserOpFeePerGas);

        address sender = abi.decode(context, (address));

        currentDaySpent += actualGasCost;

        emit GasSponsored(sender, actualGasCost);

        // Check circuit breaker
        if (currentDaySpent >= dailyBudget) {
            circuitBroken = true;
            emit CircuitBroken(currentDay, currentDaySpent, dailyBudget);
        }
    }

    // ── Admin Functions ──

    /// @notice Update the daily gas budget
    /// @param newBudget New budget in wei (max 10 BNB)
    function setDailyBudget(uint256 newBudget) external onlyOwner {
        if (newBudget == 0 || newBudget > MAX_DAILY_BUDGET) revert InvalidBudget();
        uint256 oldBudget = dailyBudget;
        dailyBudget = newBudget;
        emit DailyBudgetUpdated(oldBudget, newBudget);
    }

    /// @notice Update the per-user daily transaction limit
    /// @param newLimit New limit (max 200)
    function setUserDailyTxLimit(uint256 newLimit) external onlyOwner {
        if (newLimit == 0 || newLimit > MAX_USER_TX_LIMIT) revert InvalidTxLimit();
        uint256 oldLimit = userDailyTxLimit;
        userDailyTxLimit = newLimit;
        emit UserDailyTxLimitUpdated(oldLimit, newLimit);
    }

    /// @notice Add or remove a target contract from the whitelist
    /// @param target Contract address to whitelist/unwhitelist
    /// @param allowed Whether the target is allowed
    function setWhitelistedTarget(address target, bool allowed) external onlyOwner {
        whitelistedTargets[target] = allowed;
        emit TargetWhitelisted(target, allowed);
    }

    /// @notice Batch add or remove target contracts from the whitelist
    /// @param targets Array of contract addresses
    /// @param allowed Whether the targets are allowed
    function batchSetWhitelistedTargets(
        address[] calldata targets,
        bool allowed
    ) external onlyOwner {
        for (uint256 i = 0; i < targets.length; i++) {
            whitelistedTargets[targets[i]] = allowed;
            emit TargetWhitelisted(targets[i], allowed);
        }
    }

    /// @notice Pause the paymaster
    function pause() external onlyOwner {
        paused = true;
    }

    /// @notice Unpause the paymaster
    function unpause() external onlyOwner {
        paused = false;
    }

    /// @notice Manually reset the circuit breaker
    function resetCircuitBreaker() external onlyOwner {
        circuitBroken = false;
        emit CircuitReset(currentDay);
    }

    /// @notice Deposit BNB to the EntryPoint for this paymaster
    function depositToEntryPoint() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /// @notice Withdraw BNB from the EntryPoint
    /// @param to Destination address
    /// @param amount Amount to withdraw in wei
    function withdrawFromEntryPoint(
        address payable to,
        uint256 amount
    ) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    /// @notice Get this paymaster's deposit balance at the EntryPoint
    /// @return The deposit balance in wei
    function getEntryPointDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    // ── View Functions ──

    /// @notice Check whether a user operation from sender to target can be sponsored
    /// @param user The UserOperation sender
    /// @param target The target contract being called
    /// @return True if the operation would be sponsored
    function canSponsor(address user, address target) external view returns (bool) {
        if (paused) return false;
        if (circuitBroken) return false;
        if (!whitelistedTargets[target]) return false;

        uint256 today = block.timestamp / SECONDS_PER_DAY;
        uint256 txCount = userDayTxCount[user];
        uint256 lastDay = userLastDay[user];

        if (lastDay < today) {
            txCount = 0;
        }

        if (txCount >= userDailyTxLimit) return false;

        return true;
    }

    /// @notice Get the daily transaction count for a user
    /// @param user The user address
    /// @return count Current tx count for today (0 if day has rolled over)
    function getUserDayTxCount(address user) external view returns (uint256 count) {
        uint256 today = block.timestamp / SECONDS_PER_DAY;
        if (userLastDay[user] < today) return 0;
        return userDayTxCount[user];
    }

    // ── Internal ──

    /// @dev Extract the target address from SimpleAccount.execute callData
    /// @param callData The full callData from the UserOperation
    /// @return target The decoded target address
    function _extractTarget(bytes calldata callData) internal pure returns (address target) {
        // callData must have at least 4 (selector) + 32 (address) = 36 bytes
        if (callData.length < 36) revert CallDataTooShort();

        // Verify it's the execute selector
        bytes4 selector = bytes4(callData[:4]);
        if (selector != EXECUTE_SELECTOR) revert TargetNotWhitelisted();

        // Decode the target address from the first argument
        target = abi.decode(callData[4:36], (address));
    }
}
