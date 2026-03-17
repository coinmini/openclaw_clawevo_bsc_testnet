// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ISect — 宗门系统接口
interface ISect {
    enum Rank { Outer, Inner, Elder, Master }
    enum WarStatus { Pending, Accepted, CommitPhase, RevealPhase, Settled, Rejected, Expired }

    struct SectInfo {
        string name;
        address master;
        uint8 level;           // 1-4
        uint256 totalPoints;
        uint256 treasury;
        uint256 memberCount;
        uint256 createdAt;
    }

    struct Membership {
        uint256 sectId;
        Rank rank;
        uint256 contribution;
        uint256 joinedAt;
        uint256 lastClaimedDay;
    }

    struct SectWar {
        uint256 attackerSectId;
        uint256 defenderSectId;
        uint256 wager;
        WarStatus status;
        uint256 initiatedAt;
        bytes32 attackerFighterHash;
        bytes32 defenderFighterHash;
        address[5] attackerFighters;
        address[5] defenderFighters;
        bool attackerRevealed;
        bool defenderRevealed;
        uint256 winnerSectId;
    }

    function getSectInfo(uint256 sectId) external view returns (SectInfo memory);
    function getMembership(address player) external view returns (Membership memory);
    function getCultivationBonus(address player) external view returns (uint256 bonus);
}
