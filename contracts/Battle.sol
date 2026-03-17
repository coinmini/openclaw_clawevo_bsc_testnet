// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IGameConfig.sol";
import "./interfaces/IBattle.sol";
import "./interfaces/IEquipment.sol";
import "./interfaces/IBeast.sol";
import "./Register.sol";
import "./libraries/Constants.sol";
import "./libraries/EquipmentLib.sol";

/// @title Battle — 1v1 PK 系统（链上直接结算）
/// @notice 两阶段流程：挂单 → 接单+结算（或接单 → 结算）
contract Battle is IBattle {
    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;
    IGameConfig public immutable gameConfig;
    IEquipment public immutable equipment;
    IBeast public immutable beast;
    address public owner;

    // ── 约战单 ──
    mapping(uint256 => Challenge) private _challenges;
    uint256 public nextChallengeId;

    // ── 对战记录 ──
    mapping(uint256 => Match) private _matches;
    uint256 public nextMatchId;

    // ── 玩家活跃挂单数 ──
    mapping(address => uint256) public activeChallengeCount;

    // ── 五行克制表 ──
    mapping(uint8 => uint8) public restrains;

    // ── Events ──
    event ChallengeCreated(uint256 indexed challengeId, address indexed creator, uint256 wager);
    event ChallengeCancelled(uint256 indexed challengeId, address indexed creator);
    event ChallengeAccepted(uint256 indexed challengeId, uint256 indexed matchId, address indexed acceptor);
    event MatchSettled(uint256 indexed matchId, address indexed winner, uint256 payout);
    event SettleTimeoutClaimed(uint256 indexed matchId, uint256 confiscatedAmount);

    // ── Configurable parameters ──
    uint256 public challengeDuration;
    uint256 public maxActiveChallenges;
    uint256 public battleFeeBP;
    uint256 public minBattleWager;
    uint256 public settleTimeout;

    event ChallengeDurationUpdated(uint256 oldValue, uint256 newValue);
    event MaxActiveChallengesUpdated(uint256 oldValue, uint256 newValue);
    event BattleFeeBPUpdated(uint256 oldValue, uint256 newValue);
    event MinBattleWagerUpdated(uint256 oldValue, uint256 newValue);
    event SettleTimeoutUpdated(uint256 oldValue, uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Battle: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _treasury,
        address _register,
        address _gameConfig,
        address _equipment,
        address _beast
    ) {
        require(_lingshi != address(0), "Battle: zero lingshi");
        require(_treasury != address(0), "Battle: zero treasury");
        require(_register != address(0), "Battle: zero register");
        require(_gameConfig != address(0), "Battle: zero config");
        require(_equipment != address(0), "Battle: zero equipment");
        require(_beast != address(0), "Battle: zero beast");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);
        gameConfig = IGameConfig(_gameConfig);
        equipment = IEquipment(_equipment);
        beast = IBeast(_beast);
        owner = msg.sender;

        nextChallengeId = 1;
        nextMatchId = 1;

        challengeDuration = Constants.CHALLENGE_DURATION;
        maxActiveChallenges = Constants.MAX_ACTIVE_CHALLENGES;
        battleFeeBP = Constants.BATTLE_FEE_BP;
        minBattleWager = Constants.MIN_BATTLE_WAGER;
        settleTimeout = Constants.SETTLE_TIMEOUT;

        // 五行克制: 金→木, 木→土, 土→水, 水→火, 火→金
        restrains[0] = 1; // 金克木
        restrains[1] = 4; // 木克土 (4=土)
        restrains[2] = 3; // 水克火
        restrains[3] = 0; // 火克金
        restrains[4] = 2; // 土克水
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setChallengeDuration(uint256 newValue) external onlyOwner {
        require(newValue >= 1 hours && newValue <= 7 days, "Battle: invalid duration");
        uint256 old = challengeDuration;
        challengeDuration = newValue;
        emit ChallengeDurationUpdated(old, newValue);
    }

    function setMaxActiveChallenges(uint256 newValue) external onlyOwner {
        require(newValue > 0 && newValue <= 100, "Battle: invalid max");
        uint256 old = maxActiveChallenges;
        maxActiveChallenges = newValue;
        emit MaxActiveChallengesUpdated(old, newValue);
    }

    function setBattleFeeBP(uint256 newValue) external onlyOwner {
        require(newValue <= 1000, "Battle: fee > 10%");
        uint256 old = battleFeeBP;
        battleFeeBP = newValue;
        emit BattleFeeBPUpdated(old, newValue);
    }

    function setMinBattleWager(uint256 newValue) external onlyOwner {
        uint256 old = minBattleWager;
        minBattleWager = newValue;
        emit MinBattleWagerUpdated(old, newValue);
    }

    function setSettleTimeout(uint256 newValue) external onlyOwner {
        require(newValue >= 1 minutes && newValue <= 1 hours, "Battle: invalid settle timeout");
        uint256 old = settleTimeout;
        settleTimeout = newValue;
        emit SettleTimeoutUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Battle: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ═══════════════════════════════════════════
    //          PHASE 1: 挂单 & 撤销
    // ═══════════════════════════════════════════

    /// @notice 创建约战单，冻结赌注
    function createChallenge(uint256 wager) external returns (uint256) {
        require(register.isRegistered(msg.sender), "Battle: not registered");
        require(wager >= minBattleWager, "Battle: wager too low");
        require(
            activeChallengeCount[msg.sender] < maxActiveChallenges,
            "Battle: max challenges reached"
        );
        require(
            lingshi.balanceOf(msg.sender) >= wager,
            "Battle: insufficient LS"
        );

        // 冻结赌注
        lingshi.transferFrom(msg.sender, address(this), wager);

        uint256 challengeId = nextChallengeId++;
        _challenges[challengeId] = Challenge({
            creator: msg.sender,
            wager: wager,
            createdAt: block.timestamp,
            status: ChallengeStatus.Open
        });
        activeChallengeCount[msg.sender]++;

        emit ChallengeCreated(challengeId, msg.sender, wager);
        return challengeId;
    }

    /// @notice 撤销约战单，退还赌注
    function cancelChallenge(uint256 challengeId) external {
        Challenge storage c = _challenges[challengeId];
        require(c.status == ChallengeStatus.Open, "Battle: not open");
        require(c.creator == msg.sender, "Battle: not creator");

        c.status = ChallengeStatus.Cancelled;
        activeChallengeCount[msg.sender]--;

        lingshi.transfer(msg.sender, c.wager);

        emit ChallengeCancelled(challengeId, msg.sender);
    }

    // ═══════════════════════════════════════════
    //     PHASE 2: 接受约战（创建 Active Match）
    // ═══════════════════════════════════════════

    /// @notice 接受约战，冻结等额赌注，创建 Active Match
    function acceptChallenge(uint256 challengeId) external {
        Challenge storage c = _challenges[challengeId];
        require(c.status == ChallengeStatus.Open, "Battle: not open");
        require(c.creator != msg.sender, "Battle: cannot accept own");
        require(register.isRegistered(msg.sender), "Battle: accepter not registered");
        require(
            block.timestamp <= c.createdAt + challengeDuration,
            "Battle: challenge expired"
        );
        require(
            lingshi.balanceOf(msg.sender) >= c.wager,
            "Battle: accepter insufficient LS"
        );

        // 冻结等额赌注
        lingshi.transferFrom(msg.sender, address(this), c.wager);

        c.status = ChallengeStatus.Accepted;
        activeChallengeCount[c.creator]--;

        // 快照五行到 Match
        Register.Cultivator memory culA = register.getCultivator(c.creator);
        Register.Cultivator memory culB = register.getCultivator(msg.sender);

        uint256 matchId = nextMatchId++;
        _matches[matchId] = Match({
            challengeId: challengeId,
            playerA: c.creator,
            playerB: msg.sender,
            wager: c.wager,
            elementA: culA.element,
            elementB: culB.element,
            acceptedAt: block.timestamp,
            status: MatchStatus.Active,
            winner: address(0),
            settledAt: 0
        });

        emit ChallengeAccepted(challengeId, matchId, msg.sender);
    }

    // ═══════════════════════════════════════════
    //     PHASE 3: 链上战斗结算
    // ═══════════════════════════════════════════

    /// @notice 链上直接计算战斗结果并结算赌注
    function settleBattle(uint256 matchId) external {
        Match storage m = _matches[matchId];
        require(m.status == MatchStatus.Active, "Battle: not active");
        require(
            msg.sender == m.playerA || msg.sender == m.playerB,
            "Battle: not participant"
        );
        require(
            block.timestamp <= m.acceptedAt + settleTimeout,
            "Battle: settle timeout"
        );

        uint8 winnerCode = _resolveBattle(m.playerA, m.playerB);

        address winner;
        if (winnerCode == 1) winner = m.playerA;
        else if (winnerCode == 2) winner = m.playerB;

        m.winner = winner;
        m.status = MatchStatus.Settled;
        m.settledAt = block.timestamp;
        _challenges[m.challengeId].status = ChallengeStatus.Settled;

        uint256 payout = _distributeWager(m.playerA, m.playerB, m.wager, winner);

        emit MatchSettled(matchId, winner, payout);
    }

    /// @dev 读取双方属性+装备+灵兽，计算战斗结果
    function _resolveBattle(address playerA, address playerB) internal view returns (uint8) {
        Register.Cultivator memory cA = register.getCultivator(playerA);
        Register.Cultivator memory cB = register.getCultivator(playerB);

        (uint256 effAtkA, uint256 effDefA) = _getEffectiveStats(playerA, cA);
        (uint256 effAtkB, uint256 effDefB) = _getEffectiveStats(playerB, cB);

        uint256 elemModA = _getElementModifier(cA.element, cB.element, cA.perception, cA.faction);
        uint256 elemModB = _getElementModifier(cB.element, cA.element, cB.perception, cB.faction);

        return _calculateBattle(effAtkA, effDefA, elemModA, effAtkB, effDefB, elemModB, gameConfig.kRatioBP());
    }

    /// @dev 计算含装备+灵兽加成的有效攻防
    function _getEffectiveStats(address player, Register.Cultivator memory c)
        internal view returns (uint256 effAtk, uint256 effDef)
    {
        (uint256 bonusAtkBP, uint256 bonusDefBP) = _getEquipmentBonusBP(player, c.element, c.origin);
        effAtk = c.attack + c.attack * bonusAtkBP / Constants.BP;
        effDef = c.defense + c.defense * bonusDefBP / Constants.BP;
    }

    // ═══════════════════════════════════════════
    //              超时处理
    // ═══════════════════════════════════════════

    /// @notice 结算阶段超时：无人调用 settleBattle，100% 罚没
    function claimSettleTimeout(uint256 matchId) external {
        Match storage m = _matches[matchId];
        require(m.status == MatchStatus.Active, "Battle: not active");
        require(
            block.timestamp > m.acceptedAt + settleTimeout,
            "Battle: timeout not reached"
        );

        m.status = MatchStatus.SettleTimeout;
        m.settledAt = block.timestamp;
        _challenges[m.challengeId].status = ChallengeStatus.Settled;

        // 100% 罚没到 Treasury
        uint256 totalWager = m.wager * 2;
        lingshi.approve(address(treasury), totalWager);
        treasury.collectFee(address(this), totalWager);

        emit SettleTimeoutClaimed(matchId, totalWager);
    }

    // ═══════════════════════════════════════════
    //              VIEW 函数
    // ═══════════════════════════════════════════

    function getChallenge(uint256 challengeId) external view override returns (Challenge memory) {
        return _challenges[challengeId];
    }

    function getMatch(uint256 matchId) external view override returns (Match memory) {
        return _matches[matchId];
    }

    function getActiveChallengeCount(address player) external view override returns (uint256) {
        return activeChallengeCount[player];
    }

    // ═══════════════════════════════════════════
    //         ON-CHAIN BATTLE CALCULATION
    // ═══════════════════════════════════════════

    /// @dev 五行修正系数 (返回 /10000 的乘数)
    /// @param elemAttacker 攻方五行
    /// @param elemDefender 守方五行
    /// @param perception 攻方神识
    /// @param faction 攻方门派
    function _getElementModifier(
        uint8 elemAttacker,
        uint8 elemDefender,
        uint256 perception,
        uint8 faction
    ) internal view returns (uint256) {
        // 克制: base 13000 + 神识阶梯加成 + 阵修加成
        if (restrains[elemAttacker] == elemDefender) {
            uint256 mod = 13000;
            if (perception >= 750) {
                mod += 1500;
            } else if (perception >= 500) {
                mod += 1000;
            } else if (perception >= 250) {
                mod += 500;
            }
            if (faction == 2) {
                mod += 1000; // 阵修 bonus
            }
            return mod;
        }

        // 相生: 金生水(0→2), 水生木(2→1), 木生火(1→3), 火生土(3→4), 土生金(4→0)
        if ((elemAttacker == 0 && elemDefender == 2) ||
            (elemAttacker == 2 && elemDefender == 1) ||
            (elemAttacker == 1 && elemDefender == 3) ||
            (elemAttacker == 3 && elemDefender == 4) ||
            (elemAttacker == 4 && elemDefender == 0)) {
            return 10800;
        }

        return 10000; // 无关
    }

    /// @dev CrossMultiplyCombat 公式计算战斗结果
    /// @return winner 1=A wins, 2=B wins, 0=draw
    function _calculateBattle(
        uint256 atkA,
        uint256 defA,
        uint256 elemModA,
        uint256 atkB,
        uint256 defB,
        uint256 elemModB,
        uint256 kRatioBP
    ) internal pure returns (uint8 winner) {
        uint256 sumAtk = atkA + atkB;
        uint256 commonTerm = sumAtk * kRatioBP;
        uint256 bracketA = defB * 20000 + commonTerm;
        uint256 bracketB = defA * 20000 + commonTerm;
        uint256 lhs = atkA * elemModA * bracketA;
        uint256 rhs = atkB * elemModB * bracketB;
        if (lhs > rhs) return 1; // A wins
        if (lhs < rhs) return 2; // B wins
        return 0; // draw
    }

    // ══════════════════════════════════════════
    //       装备/灵兽加成计算 (返回 BP)
    // ══════════════════════════════════════════

    /// @dev 获取玩家装备+灵兽攻防加成 (basis points)
    function _getEquipmentBonusBP(address player, uint8 playerElement, uint8 playerOrigin)
        internal
        view
        returns (uint256 bonusAtkBP, uint256 bonusDefBP)
    {
        // 武器加成 → bonusAtkBP
        uint256 weaponId = equipment.getEquipped(player, IEquipment.EquipmentType.WEAPON);
        if (weaponId != 0) {
            IEquipment.EquipmentData memory w = equipment.getEquipmentData(weaponId);
            bonusAtkBP = uint256(EquipmentLib.getEffectiveBonusBP(w, playerElement, playerOrigin));
        }

        // 防具加成 → bonusDefBP
        uint256 armorId = equipment.getEquipped(player, IEquipment.EquipmentType.ARMOR);
        if (armorId != 0) {
            IEquipment.EquipmentData memory a = equipment.getEquipmentData(armorId);
            bonusDefBP = uint256(EquipmentLib.getEffectiveBonusBP(a, playerElement, playerOrigin));
        }

        // 灵兽加成（同时加攻和防）
        uint256 beastId = beast.getEquippedBeast(player);
        if (beastId != 0) {
            IBeast.BeastInfo memory b = beast.getBeastInfo(beastId);
            bonusAtkBP += uint256(b.powerRate);
            bonusDefBP += uint256(b.powerRate);
        }
    }

    // ═══════════════════════════════════════════
    //              内部函数
    // ═══════════════════════════════════════════

    /// @dev 分配赌注：手续费 → Treasury，余额 → 胜者或平分
    function _distributeWager(
        address playerA,
        address playerB,
        uint256 wager,
        address winner
    ) internal returns (uint256 payout) {
        uint256 totalWager = wager * 2;
        uint256 fee = (totalWager * battleFeeBP) / Constants.BP;
        payout = totalWager - fee;

        if (fee > 0) {
            lingshi.approve(address(treasury), fee);
            treasury.collectFee(address(this), fee);
        }

        if (winner != address(0)) {
            lingshi.transfer(winner, payout);
        } else {
            uint256 halfPayout = payout / 2;
            lingshi.transfer(playerA, halfPayout);
            lingshi.transfer(playerB, payout - halfPayout);
        }
    }
}
