// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title MockVRFCoordinator — 模拟 Binance Oracle VRF Coordinator（仅用于测试）
/// @notice 模拟 Binance Oracle VRF Coordinator 的请求/回调流程
contract MockVRFCoordinator {
    /// @dev 自增请求 ID
    uint256 private _nextRequestId = 1;

    /// @notice requestId → 消费者合约地址
    mapping(uint256 => address) public requestConsumers;

    // ── Core ──

    /// @notice 模拟 VRF 请求（记录消费者，返回自增 requestId）
    function requestRandomWords(
        bytes32, // keyHash
        uint64, // subId (Binance Oracle uses uint64)
        uint16, // minimumRequestConfirmations
        uint32, // callbackGasLimit
        uint32 // numWords
    ) external returns (uint256 requestId) {
        requestId = _nextRequestId;
        _nextRequestId++;

        requestConsumers[requestId] = msg.sender;
    }

    /// @notice 模拟 VRF 回调（调用消费者的 rawFulfillRandomWords）
    /// @param requestId 请求 ID
    /// @param randomWords 随机数数组
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        address consumer = requestConsumers[requestId];
        require(consumer != address(0), "MockVRFCoordinator: unknown requestId");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory reason) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(success, string(reason));
    }

    /// @notice 便捷函数：用单个随机值完成回调
    /// @param requestId 请求 ID
    /// @param randomValue 单个随机数值
    function fulfillRandomWordsWithValue(uint256 requestId, uint256 randomValue) external {
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = randomValue;

        address consumer = requestConsumers[requestId];
        require(consumer != address(0), "MockVRFCoordinator: unknown requestId");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory reason) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(success, string(reason));
    }

    /// @notice 获取下一个将分配的 requestId
    function nextRequestId() external view returns (uint256) {
        return _nextRequestId;
    }
}
