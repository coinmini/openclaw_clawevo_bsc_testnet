// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ISecretRealm — 秘境副本接口
interface ISecretRealm {
    struct PlayerProgress {
        uint8 realmId;
        uint8 currentLayer;     // 0-2 已通过层数
        uint256 blockNumber;    // 最后通关区块
        bool dropClaimed;
        bool active;
        bool isSolo;
    }

    struct Party {
        address leader;
        address[3] members;
        uint8 memberCount;
        uint8 realmId;
        bool entered;
        uint256 createdAt;
    }

    function getProgress(address player) external view returns (PlayerProgress memory);
    function getParty(uint256 partyId) external view returns (Party memory);
}
