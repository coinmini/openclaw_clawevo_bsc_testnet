// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ITao — 道侣系统接口
interface ITao {
    struct Partnership {
        address partnerA;
        address partnerB;
        uint256 since;
        uint256 dualCultCount;
        uint256 huntCount;
    }

    function getPartner(address cultivator) external view returns (address);
    function getPartnership(address cultivator) external view returns (Partnership memory);
    function isInCooldown(address cultivator) external view returns (bool inCooldown, uint256 cooldownEnd);
    function getCultivationBonus(address cultivator) external view returns (uint256 heartBonus, uint256 luckBonus);
}
