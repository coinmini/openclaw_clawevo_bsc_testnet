// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../Treasure.sol";

/// @title TreasureHarness — 测试用包装合约，暴露 internal 函数
contract TreasureHarness is Treasure {
    constructor(
        address _lingshi,
        address _treasury,
        address _register,
        address _equipment,
        address _pill
    ) Treasure(_lingshi, _treasury, _register, _equipment, _pill) {}

    function exposed_resolveLowDiffDrop(uint256 roll)
        external
        view
        returns (Treasure.DropQuality)
    {
        return _resolveLowDiffDrop(roll);
    }

    function exposed_resolveHighDiffDrop(uint256 roll)
        external
        view
        returns (Treasure.DropQuality)
    {
        return _resolveHighDiffDrop(roll);
    }
}
