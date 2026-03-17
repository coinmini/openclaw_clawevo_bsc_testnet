// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IBattle — PvP 战斗接口（链上直接结算）
interface IBattle {
    enum ChallengeStatus { Open, Accepted, Settled, Cancelled }

    enum MatchStatus {
        None,              // 0: 未创建
        Active,            // 1: 已接单，等待结算
        Settled,           // 2: 战斗已结算，赌注已分配
        Cancelled,         // 3: 已取消
        SettleTimeout      // 4: 结算阶段超时，赌注罚没
    }

    struct Challenge {
        address creator;
        uint256 wager;
        uint256 createdAt;
        ChallengeStatus status;
    }

    struct Match {
        uint256 challengeId;
        address playerA;            // 挑战创建者
        address playerB;            // 接受者
        uint256 wager;              // 单方赌注
        uint8 elementA;             // 公开五行
        uint8 elementB;
        uint256 acceptedAt;         // 接单时间
        MatchStatus status;
        address winner;
        uint256 settledAt;
    }

    function getChallenge(uint256 challengeId) external view returns (Challenge memory);
    function getMatch(uint256 matchId) external view returns (Match memory);
    function getActiveChallengeCount(address player) external view returns (uint256);
}
