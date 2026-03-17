// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/ISect.sol";
import "./Register.sol";
import "./libraries/Constants.sol";

/// @title Sect — 宗门系统
/// @notice 宗门创建/管理/经济/5v5 宗门战
contract Sect is ISect {
    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;
    address public owner;

    // ── 宗门信息 ──
    mapping(uint256 => SectInfo) private _sects;
    uint256 public nextSectId;

    // ── 成员关系 ──
    mapping(address => Membership) private _memberships;

    // ── 宗门战 ──
    mapping(uint256 => SectWar) private _wars;
    uint256 public nextWarId;

    // ── 宗门战志愿者 ──
    mapping(uint256 => mapping(address => bool)) public warVolunteers;
    mapping(uint256 => uint256) public volunteerCount; // sectWarId → count per sect

    // ── 等级配置 ──
    uint256[4] public memberCaps;      // [44, 80, 150, 300]
    uint256[4] public dailyPools;      // [200, 500, 1500, 5000] LS
    // 灵脉加成 [level][rank]: 外/内/长老 (BP)
    uint256[3][4] public spiritBonus;

    // ── Events ──
    event SectCreated(uint256 indexed sectId, address indexed master, string name);
    event MemberJoined(uint256 indexed sectId, address indexed member);
    event MemberLeft(uint256 indexed sectId, address indexed member);
    event MemberKicked(uint256 indexed sectId, address indexed member);
    event MemberPromoted(uint256 indexed sectId, address indexed member, Rank newRank);
    event DailyRewardClaimed(uint256 indexed sectId, address indexed member, uint256 amount);
    event DonationMade(uint256 indexed sectId, address indexed member, uint256 amount, uint256 contribution);
    event SectWarInitiated(uint256 indexed warId, uint256 attackerSectId, uint256 defenderSectId, uint256 wager);
    event SectWarAccepted(uint256 indexed warId);
    event SectWarRejected(uint256 indexed warId);
    event FighterOrderCommitted(uint256 indexed warId, uint256 indexed sectId);
    event FighterOrderRevealed(uint256 indexed warId, uint256 indexed sectId);
    event SectWarSettled(uint256 indexed warId, uint256 winnerSectId);

    constructor(
        address _lingshi,
        address _treasury,
        address _register
    ) {
        require(_lingshi != address(0), "Sect: zero lingshi");
        require(_treasury != address(0), "Sect: zero treasury");
        require(_register != address(0), "Sect: zero register");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);
        owner = msg.sender;
        nextSectId = 1;
        nextWarId = 1;

        // 等级配置 (index 0 = level 1)
        memberCaps = [uint256(44), 80, 150, 300];
        dailyPools = [uint256(200 ether), 500 ether, 1500 ether, 5000 ether];

        // 灵脉加成 BP: [外门/内门/长老]
        spiritBonus[0] = [uint256(1000), 1200, 1500]; // Lv1: +10%/+12%/+15%
        spiritBonus[1] = [uint256(1500), 1800, 2200]; // Lv2: +15%/+18%/+22%
        spiritBonus[2] = [uint256(2000), 2400, 3000]; // Lv3: +20%/+24%/+30%
        spiritBonus[3] = [uint256(2500), 3000, 3700]; // Lv4: +25%/+30%/+37%
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    event MemberCapsUpdated(uint256[4] newCaps);
    event DailyPoolsUpdated(uint256[4] newPools);
    event SpiritBonusUpdated(uint8 level, uint256[3] newBonus);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Sect: not owner");
        _;
    }

    function setMemberCaps(uint256[4] calldata newCaps) external onlyOwner {
        for (uint8 i = 0; i < 4; i++) {
            require(newCaps[i] > 0, "Sect: zero cap");
        }
        memberCaps = newCaps;
        emit MemberCapsUpdated(newCaps);
    }

    function setDailyPools(uint256[4] calldata newPools) external onlyOwner {
        dailyPools = newPools;
        emit DailyPoolsUpdated(newPools);
    }

    function setSpiritBonus(uint8 level, uint256[3] calldata newBonus) external onlyOwner {
        require(level < 4, "Sect: invalid level");
        spiritBonus[level] = newBonus;
        emit SpiritBonusUpdated(level, newBonus);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Sect: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ══════════════════════════════════════════
    //              宗门管理
    // ══════════════════════════════════════════

    /// @notice 创建宗门
    function createSect(string calldata name) external returns (uint256) {
        require(register.isRegistered(msg.sender), "Sect: not registered");
        require(_memberships[msg.sender].sectId == 0, "Sect: already in sect");
        require(bytes(name).length > 0 && bytes(name).length <= 32, "Sect: invalid name");

        Register.Cultivator memory c = register.getCultivator(msg.sender);
        require(c.realm >= Constants.SECT_CREATION_REALM_REQ, "Sect: realm too low");

        // 扣除创建费
        require(
            lingshi.balanceOf(msg.sender) >= Constants.SECT_CREATION_FEE,
            "Sect: insufficient LS"
        );
        lingshi.transferFrom(msg.sender, address(this), Constants.SECT_CREATION_FEE);
        lingshi.approve(address(treasury), Constants.SECT_CREATION_FEE);
        treasury.collectFee(address(this), Constants.SECT_CREATION_FEE);

        uint256 sectId = nextSectId++;
        _sects[sectId] = SectInfo({
            name: name,
            master: msg.sender,
            level: 1,
            totalPoints: 0,
            treasury: 0,
            memberCount: 1,
            createdAt: block.timestamp
        });

        _memberships[msg.sender] = Membership({
            sectId: sectId,
            rank: Rank.Master,
            contribution: 0,
            joinedAt: block.timestamp,
            lastClaimedDay: block.timestamp / 1 days
        });

        emit SectCreated(sectId, msg.sender, name);
        return sectId;
    }

    /// @notice 加入宗门
    function joinSect(uint256 sectId) external {
        require(register.isRegistered(msg.sender), "Sect: not registered");
        require(_memberships[msg.sender].sectId == 0, "Sect: already in sect");

        SectInfo storage sect = _sects[sectId];
        require(sect.master != address(0), "Sect: not found");
        require(sect.memberCount < memberCaps[sect.level - 1], "Sect: full");

        sect.memberCount++;
        _memberships[msg.sender] = Membership({
            sectId: sectId,
            rank: Rank.Outer,
            contribution: 0,
            joinedAt: block.timestamp,
            lastClaimedDay: block.timestamp / 1 days
        });

        emit MemberJoined(sectId, msg.sender);
    }

    /// @notice 离开宗门
    function leaveSect() external {
        Membership storage m = _memberships[msg.sender];
        require(m.sectId != 0, "Sect: not in sect");
        require(m.rank != Rank.Master, "Sect: master cannot leave");

        SectInfo storage sect = _sects[m.sectId];
        sect.memberCount--;

        uint256 sectId = m.sectId;
        delete _memberships[msg.sender];

        emit MemberLeft(sectId, msg.sender);
    }

    /// @notice 宗主提升成员等级
    function promoteMember(address member, Rank newRank) external {
        Membership storage masterMem = _memberships[msg.sender];
        require(masterMem.rank == Rank.Master, "Sect: not master");

        Membership storage memberMem = _memberships[member];
        require(memberMem.sectId == masterMem.sectId, "Sect: not same sect");
        require(newRank > memberMem.rank, "Sect: can only promote");
        require(newRank != Rank.Master, "Sect: cannot promote to master");

        memberMem.rank = newRank;

        emit MemberPromoted(masterMem.sectId, member, newRank);
    }

    /// @notice 宗主踢出成员
    function kickMember(address member) external {
        Membership storage masterMem = _memberships[msg.sender];
        require(masterMem.rank == Rank.Master, "Sect: not master");

        Membership storage memberMem = _memberships[member];
        require(memberMem.sectId == masterMem.sectId, "Sect: not same sect");
        require(member != msg.sender, "Sect: cannot kick self");

        SectInfo storage sect = _sects[masterMem.sectId];
        sect.memberCount--;

        uint256 sectId = memberMem.sectId;
        delete _memberships[member];

        emit MemberKicked(sectId, member);
    }

    // ══════════════════════════════════════════
    //              宗门经济
    // ══════════════════════════════════════════

    /// @notice 领取每日灵石奖励
    function claimDailyReward() external {
        Membership storage m = _memberships[msg.sender];
        require(m.sectId != 0, "Sect: not in sect");

        uint256 today = block.timestamp / 1 days;
        require(today > m.lastClaimedDay, "Sect: already claimed today");

        SectInfo storage sect = _sects[m.sectId];
        uint256 pool = dailyPools[sect.level - 1];
        uint256 reward = pool / sect.memberCount;

        m.lastClaimedDay = today;

        if (reward > 0) {
            lingshi.mint(msg.sender, reward);
        }

        emit DailyRewardClaimed(m.sectId, msg.sender, reward);
    }

    /// @notice 捐赠灵石换取贡献度
    function donateToTreasury(uint256 amount) external {
        Membership storage m = _memberships[msg.sender];
        require(m.sectId != 0, "Sect: not in sect");
        require(amount > 0, "Sect: zero amount");
        require(
            lingshi.balanceOf(msg.sender) >= amount,
            "Sect: insufficient LS"
        );

        // 计算贡献度 (每10LS=1贡献)
        uint256 contribution = amount / (Constants.SECT_DONATION_CONTRIB_RATIO * 1 ether);
        if (contribution > Constants.SECT_DAILY_DONATION_CONTRIB_CAP) {
            contribution = Constants.SECT_DAILY_DONATION_CONTRIB_CAP;
        }

        // 转移灵石到宗门金库
        lingshi.transferFrom(msg.sender, address(this), amount);

        SectInfo storage sect = _sects[m.sectId];
        sect.treasury += amount;
        sect.totalPoints += contribution;
        m.contribution += contribution;

        emit DonationMade(m.sectId, msg.sender, amount, contribution);
    }

    // ══════════════════════════════════════════
    //              宗门战 (5v5 Commit-Reveal)
    // ══════════════════════════════════════════

    /// @notice 发起宗门战挑战
    function challengeSect(uint256 defenderSectId, uint256 wager) external {
        Membership storage m = _memberships[msg.sender];
        require(m.rank == Rank.Master, "Sect: not master");
        require(wager >= Constants.SECT_MIN_WAGER, "Sect: wager too low");

        SectInfo storage attackerSect = _sects[m.sectId];
        SectInfo storage defenderSect = _sects[defenderSectId];
        require(defenderSect.master != address(0), "Sect: target not found");
        require(m.sectId != defenderSectId, "Sect: cannot challenge self");

        // 从宗门金库扣除赌注
        require(attackerSect.treasury >= wager, "Sect: insufficient treasury");
        attackerSect.treasury -= wager;

        uint256 warId = nextWarId++;
        SectWar storage war = _wars[warId];
        war.attackerSectId = m.sectId;
        war.defenderSectId = defenderSectId;
        war.wager = wager;
        war.status = WarStatus.Pending;
        war.initiatedAt = block.timestamp;

        emit SectWarInitiated(warId, m.sectId, defenderSectId, wager);
    }

    /// @notice 接受宗门战挑战
    function acceptSectWar(uint256 warId) external {
        SectWar storage war = _wars[warId];
        require(war.status == WarStatus.Pending, "Sect: war not pending");
        require(
            block.timestamp <= war.initiatedAt + Constants.SECT_CHALLENGE_WINDOW,
            "Sect: challenge expired"
        );

        Membership storage m = _memberships[msg.sender];
        require(m.rank == Rank.Master, "Sect: not master");
        require(m.sectId == war.defenderSectId, "Sect: not defender master");

        // 从防守方金库扣等额赌注
        SectInfo storage defenderSect = _sects[war.defenderSectId];
        require(defenderSect.treasury >= war.wager, "Sect: insufficient treasury");
        defenderSect.treasury -= war.wager;

        war.status = WarStatus.CommitPhase;

        emit SectWarAccepted(warId);
    }

    /// @notice 拒绝宗门战 (支付 20% 罚款)
    function rejectSectWar(uint256 warId) external {
        SectWar storage war = _wars[warId];
        require(war.status == WarStatus.Pending, "Sect: war not pending");

        Membership storage m = _memberships[msg.sender];
        require(m.rank == Rank.Master, "Sect: not master");
        require(m.sectId == war.defenderSectId, "Sect: not defender master");

        // 计算罚款
        uint256 penalty = (war.wager * Constants.SECT_REJECT_PENALTY_BP) / Constants.BP;

        SectInfo storage defenderSect = _sects[war.defenderSectId];
        if (defenderSect.treasury >= penalty) {
            defenderSect.treasury -= penalty;
        } else {
            penalty = defenderSect.treasury;
            defenderSect.treasury = 0;
        }

        // 退还攻击方赌注 + 罚款
        SectInfo storage attackerSect = _sects[war.attackerSectId];
        attackerSect.treasury += war.wager + penalty;

        war.status = WarStatus.Rejected;

        emit SectWarRejected(warId);
    }

    /// @notice 提交出战顺序哈希
    function commitFighterOrder(uint256 warId, bytes32 fighterHash) external {
        SectWar storage war = _wars[warId];
        require(war.status == WarStatus.CommitPhase, "Sect: not commit phase");
        require(
            block.timestamp <= war.initiatedAt + Constants.SECT_CHALLENGE_WINDOW + Constants.SECT_COMMIT_PERIOD,
            "Sect: commit period expired"
        );

        Membership storage m = _memberships[msg.sender];
        require(m.rank == Rank.Master, "Sect: not master");

        if (m.sectId == war.attackerSectId) {
            require(war.attackerFighterHash == bytes32(0), "Sect: already committed");
            war.attackerFighterHash = fighterHash;
        } else if (m.sectId == war.defenderSectId) {
            require(war.defenderFighterHash == bytes32(0), "Sect: already committed");
            war.defenderFighterHash = fighterHash;
        } else {
            revert("Sect: not participant");
        }

        emit FighterOrderCommitted(warId, m.sectId);

        // 双方都提交后进入 reveal 阶段
        if (war.attackerFighterHash != bytes32(0) && war.defenderFighterHash != bytes32(0)) {
            war.status = WarStatus.RevealPhase;
        }
    }

    /// @notice 揭示出战顺序
    function revealFighterOrder(
        uint256 warId,
        address[5] calldata fighters,
        bytes32 salt
    ) external {
        SectWar storage war = _wars[warId];
        require(war.status == WarStatus.RevealPhase, "Sect: not reveal phase");

        Membership storage m = _memberships[msg.sender];
        require(m.rank == Rank.Master, "Sect: not master");

        bytes32 computedHash = keccak256(abi.encodePacked(
            fighters[0], fighters[1], fighters[2], fighters[3], fighters[4], salt
        ));

        if (m.sectId == war.attackerSectId) {
            require(!war.attackerRevealed, "Sect: already revealed");
            require(computedHash == war.attackerFighterHash, "Sect: hash mismatch");
            war.attackerFighters = fighters;
            war.attackerRevealed = true;
        } else if (m.sectId == war.defenderSectId) {
            require(!war.defenderRevealed, "Sect: already revealed");
            require(computedHash == war.defenderFighterHash, "Sect: hash mismatch");
            war.defenderFighters = fighters;
            war.defenderRevealed = true;
        } else {
            revert("Sect: not participant");
        }

        emit FighterOrderRevealed(warId, m.sectId);

        // 双方都揭示后结算
        if (war.attackerRevealed && war.defenderRevealed) {
            _settleWar(warId);
        }
    }

    // ── View 函数 ──

    function getSectInfo(uint256 sectId) external view override returns (SectInfo memory) {
        return _sects[sectId];
    }

    function getMembership(address player) external view override returns (Membership memory) {
        return _memberships[player];
    }

    function getWar(uint256 warId) external view returns (SectWar memory) {
        return _wars[warId];
    }

    /// @notice 获取灵脉修炼加成
    function getCultivationBonus(address player) external view override returns (uint256 bonus) {
        Membership memory m = _memberships[player];
        if (m.sectId == 0) return 0;

        SectInfo memory sect = _sects[m.sectId];
        uint8 rankIndex = uint8(m.rank);
        if (rankIndex > 2) rankIndex = 2; // Master 用长老加成

        bonus = spiritBonus[sect.level - 1][rankIndex];
    }

    // ══════════════════════════════════════════
    //              内部函数
    // ══════════════════════════════════════════

    /// @dev 结算宗门战 (5v5 确定性)
    function _settleWar(uint256 warId) internal {
        SectWar storage war = _wars[warId];

        uint256 attackerWins = 0;
        uint256 defenderWins = 0;

        for (uint8 i = 0; i < 5; i++) {
            address atk = war.attackerFighters[i];
            address def = war.defenderFighters[i];

            // 跳过空地址
            if (atk == address(0) || def == address(0)) continue;

            // 获取基础战力
            Register.Cultivator memory cA = register.getCultivator(atk);
            Register.Cultivator memory cD = register.getCultivator(def);

            // 简化 PvP: 比较 attack + defense 总和
            uint256 powerA = cA.attack + cA.defense;
            uint256 powerB = cD.attack + cD.defense;

            if (powerA > powerB) {
                attackerWins++;
            } else if (powerB > powerA) {
                defenderWins++;
            }
            // 平局不计分
        }

        uint256 totalWager = war.wager * 2;
        uint256 fee = (totalWager * Constants.SECT_WAR_FEE_BP) / Constants.BP;
        uint256 payout = totalWager - fee;

        // 手续费
        if (fee > 0) {
            lingshi.approve(address(treasury), fee);
            treasury.collectFee(address(this), fee);
        }

        uint256 winnerSectId;
        if (attackerWins > defenderWins) {
            winnerSectId = war.attackerSectId;
        } else if (defenderWins > attackerWins) {
            winnerSectId = war.defenderSectId;
        } else {
            // 平局各退一半
            SectInfo storage aSect = _sects[war.attackerSectId];
            SectInfo storage dSect = _sects[war.defenderSectId];
            uint256 half = payout / 2;
            aSect.treasury += half;
            dSect.treasury += payout - half;
            war.winnerSectId = 0;
            war.status = WarStatus.Settled;
            emit SectWarSettled(warId, 0);
            return;
        }

        // 胜方获得赌注
        _sects[winnerSectId].treasury += payout;
        war.winnerSectId = winnerSectId;
        war.status = WarStatus.Settled;

        emit SectWarSettled(warId, winnerSectId);
    }
}
