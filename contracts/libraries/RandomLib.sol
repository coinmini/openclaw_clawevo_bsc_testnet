// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title RandomLib — Block-delay 随机数工具库
/// @notice 使用 blockhash + sender + nonce 生成伪随机数
library RandomLib {
    /// @notice 基于 blockhash 生成随机数
    /// @param delayBlock 记录 intent 时的区块号
    /// @param sender 发起者地址
    /// @param nonce 递增计数器
    /// @return 伪随机 uint256
    function randomFromBlockhash(
        uint256 delayBlock,
        address sender,
        uint256 nonce
    ) internal view returns (uint256) {
        bytes32 bh = blockhash(delayBlock);
        require(bh != bytes32(0), "RandomLib: blockhash unavailable");
        return uint256(keccak256(abi.encodePacked(bh, sender, nonce)));
    }

    /// @notice 生成 [0, max) 范围内的随机数
    function randomInRange(
        uint256 delayBlock,
        address sender,
        uint256 nonce,
        uint256 max
    ) internal view returns (uint256) {
        require(max > 0, "RandomLib: max must be > 0");
        return randomFromBlockhash(delayBlock, sender, nonce) % max;
    }
}
