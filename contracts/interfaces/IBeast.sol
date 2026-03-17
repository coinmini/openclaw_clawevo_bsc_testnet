// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IBeast — 灵兽 NFT 接口
interface IBeast {
    struct BeastInfo {
        uint8 star;
        uint8 element;
        uint16 powerRate;
        uint8 level;
        uint8 speciesId;
    }

    function getBeastInfo(uint256 tokenId) external view returns (BeastInfo memory);
    function getEquippedBeast(address player) external view returns (uint256);
}
