// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IEquipment — 装备 NFT 接口
interface IEquipment {
    enum EquipmentType { WEAPON, ARMOR }
    enum Quality { WHITE, GREEN, BLUE, PURPLE }

    struct EquipmentData {
        EquipmentType eType;
        Quality quality;
        uint16 bonusBP;
        uint8 enhanceLevel;
        uint8 elementAffinity;
        uint8 originAffinity;
        uint8 factionAffinity;
    }

    function getEquipmentData(uint256 tokenId) external view returns (EquipmentData memory);
    function getEquipped(address player, EquipmentType slot) external view returns (uint256);
    function getSpiritMaterials(address player) external view returns (uint256);
    function mint(
        address to,
        EquipmentType eType,
        Quality quality,
        uint16 bonusBP,
        uint8 elemAff,
        uint8 origAff,
        uint8 factAff
    ) external returns (uint256);
    function consumeMaterials(address player, uint256 amount) external;
    function addMaterials(address player, uint256 amount) external;
}
