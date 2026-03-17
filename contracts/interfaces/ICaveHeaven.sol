// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ICaveHeaven — 洞天系统接口
interface ICaveHeaven {
    enum Tier { None, CaveHeaven, BlessedLand, SpiritLand }

    struct CaveInfo {
        Tier tier;
        uint256 openedAt;
        uint256 upgradedAt;
        uint256 cultivationHours;
        uint256 lastMaintenanceDay;
    }

    function getCaveInfo(address player) external view returns (CaveInfo memory);
    function getCultivationMultiplier(address player) external view returns (uint256);
    function getDaoXinBonus(address player) external view returns (uint256);
    function addCultivationHours(address player, uint256 seconds_) external;
}
