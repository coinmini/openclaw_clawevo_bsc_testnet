// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IVRFConsumer.sol";

// ── Vendored Binance Oracle VRF Types ──
// Inlined from github.com/binance-cloud/binance-oracle VRFCoordinatorInterface.sol
// Binance Oracle VRF uses BNB (not LINK) for payment, subId is uint64.

interface VRFCoordinatorInterface {
    /// @notice Request random words from Binance Oracle VRF Coordinator
    /// @param keyHash Corresponds to a particular oracle job
    /// @param subId The ID of the VRF subscription (uint64)
    /// @param minimumRequestConfirmations Block confirmations before response
    /// @param callbackGasLimit Gas for fulfillRandomWords callback
    /// @param numWords Number of uint256 random values requested
    /// @return requestId Unique identifier of the request
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId);

    function createSubscription() external returns (uint64 subId);
    function getSubscription(uint64 subId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] memory consumers);
    function addConsumer(uint64 subId, address consumer) external;
    function removeConsumer(uint64 subId, address consumer) external;
    function cancelSubscription(uint64 subId, address to) external;
    function pendingRequestExists(uint64 subId) external view returns (bool);
}

/// @title BinanceVRFConsumer — VRF 随机数消费者（Layer 0）
/// @notice 对接 Binance Oracle VRF Coordinator，为高风险事件（如渡劫）提供可验证随机数
/// @dev 不继承 VRFConsumerBase，手动实现 rawFulfillRandomWords 回调模式
contract BinanceVRFConsumer is IVRFConsumer, Ownable {
    // ── Errors ──

    error NotAuthorized();
    error AlreadyPending();
    error NoResult();
    error OnlyCoordinator();

    // ── Immutables ──

    /// @notice VRF Coordinator 合约地址
    VRFCoordinatorInterface public immutable coordinator;

    /// @notice Gas lane key hash
    bytes32 public immutable keyHash;

    /// @notice VRF 订阅 ID（Binance Oracle 使用 uint64）
    uint64 public immutable subscriptionId;

    /// @notice 最少区块确认数
    uint16 public immutable requestConfirmations;

    /// @notice 回调 gas 上限
    uint32 public immutable callbackGasLimit;

    // ── State ──

    /// @notice 授权调用者（如 Cultivation 合约）
    mapping(address => bool) public authorizedCallers;

    /// @notice requestId → 玩家地址
    mapping(uint256 => address) public requestToPlayer;

    /// @notice 玩家 → 当前待处理的 requestId（0 表示无待处理）
    mapping(address => uint256) public pendingRequests;

    /// @notice 玩家 → 已完成的随机数结果（0 表示未完成）
    mapping(address => uint256) public fulfilledResults;

    // ── Modifiers ──

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert NotAuthorized();
        _;
    }

    // ── Constructor ──

    /// @param coordinator_ VRF Coordinator 合约地址
    /// @param owner_ 合约 Owner
    /// @param keyHash_ Gas lane key hash
    /// @param subscriptionId_ VRF 订阅 ID（uint64）
    /// @param requestConfirmations_ 最少区块确认数
    /// @param callbackGasLimit_ 回调 gas 上限
    constructor(
        address coordinator_,
        address owner_,
        bytes32 keyHash_,
        uint64 subscriptionId_,
        uint16 requestConfirmations_,
        uint32 callbackGasLimit_
    ) Ownable(owner_) {
        coordinator = VRFCoordinatorInterface(coordinator_);
        keyHash = keyHash_;
        subscriptionId = subscriptionId_;
        requestConfirmations = requestConfirmations_;
        callbackGasLimit = callbackGasLimit_;
    }

    // ── Admin ──

    /// @notice 设置授权调用者
    /// @param caller 调用者地址
    /// @param authorized 是否授权
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    // ── Core ──

    /// @inheritdoc IVRFConsumer
    function requestRandom(address player) external onlyAuthorized returns (uint256 requestId) {
        if (pendingRequests[player] != 0) revert AlreadyPending();

        requestId = coordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            1 // numWords: 只请求 1 个随机数
        );

        requestToPlayer[requestId] = player;
        pendingRequests[player] = requestId;

        emit RandomRequested(msg.sender, player, requestId);
    }

    /// @notice VRF Coordinator 回调函数
    /// @dev 只有 Coordinator 合约可以调用
    /// @param requestId 请求 ID
    /// @param randomWords 随机数数组
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        if (msg.sender != address(coordinator)) revert OnlyCoordinator();

        address player = requestToPlayer[requestId];

        fulfilledResults[player] = randomWords[0];

        delete pendingRequests[player];
        delete requestToPlayer[requestId];

        emit RandomFulfilled(player, requestId, randomWords[0]);
    }

    /// @inheritdoc IVRFConsumer
    function consumeResult(address player) external onlyAuthorized returns (uint256 randomWord) {
        randomWord = fulfilledResults[player];
        if (randomWord == 0) revert NoResult();

        delete fulfilledResults[player];
    }

    // ── View ──

    /// @inheritdoc IVRFConsumer
    function hasPendingRequest(address player) external view returns (bool) {
        return pendingRequests[player] != 0;
    }

    /// @inheritdoc IVRFConsumer
    function getResult(address player) external view returns (uint256) {
        return fulfilledResults[player];
    }
}
