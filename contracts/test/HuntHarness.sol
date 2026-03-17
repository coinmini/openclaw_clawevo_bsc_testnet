// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../Hunt.sol";

/// @title HuntHarness — 测试用包装合约，暴露 internal 函数
contract HuntHarness is Hunt {
    constructor(
        address _lingshi,
        address _gameConfig,
        address _treasury,
        address _register,
        address _equipment,
        address _pill,
        address _beast,
        address _tao
    ) Hunt(_lingshi, _gameConfig, _treasury, _register, _equipment, _pill, _beast, _tao) {}

    function exposed_lowDiffDrop(uint256 roll)
        external
        view
        returns (uint8 quality, uint256 reward)
    {
        quality = _resolveLowDiffDrop(roll);
        reward = dropRewards[quality];
    }

    function exposed_midDiffDrop(uint256 roll)
        external
        view
        returns (uint8 quality, uint256 reward)
    {
        quality = _resolveMidDiffDrop(roll);
        reward = dropRewards[quality];
    }

    function exposed_highDiffDrop(uint256 roll)
        external
        view
        returns (uint8 quality, uint256 reward)
    {
        quality = _resolveHighDiffDrop(roll);
        reward = dropRewards[quality];
    }

    function exposed_getEquipmentBonusBP(address player, uint8 playerElement, uint8 playerOrigin)
        external
        view
        returns (uint256 bonusAtkBP, uint256 bonusDefBP)
    {
        return _getEquipmentBonusBP(player, playerElement, playerOrigin);
    }

    function exposed_calculateBattle(
        uint256 atkA, uint256 defA, uint256 elemModA,
        uint256 atkB, uint256 defB, uint256 elemModB,
        uint256 kRatioBP
    ) external pure returns (uint8 winner) {
        return _calculateBattle(atkA, defA, elemModA, atkB, defB, elemModB, kRatioBP);
    }

    function exposed_getElementModifier(uint8 elemA, uint8 elemB, uint256 perception, uint8 faction)
        external
        view
        returns (uint256)
    {
        return _getElementModifier(elemA, elemB, perception, faction);
    }
}
