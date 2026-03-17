// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/IGameConfig.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IEquipment.sol";
import "./interfaces/IBeast.sol";
import "./interfaces/IPill.sol";
import "./interfaces/ITao.sol";
import "./Register.sol";
import "./libraries/Constants.sol";
import "./libraries/RandomLib.sol";
import "./libraries/EquipmentLib.sol";

/// @title Hunt — 区域打野（链上战斗结算 + Block-delay 掉落）
/// @notice TX1: hunt/huntDual（链上战斗结算 + 发灵石）→ TX2: claimHuntDrop（装备掉落）
contract Hunt {
    // ── 区域怪物数据 ──
    struct MonsterRegion {
        uint8 difficulty;     // 1-4
        uint8 element;        // 0-4
        uint256 monsterAtk;   // 怪物攻击
        uint256 monsterDef;   // 怪物防御
        uint256 reward;       // 灵石奖励
        uint256 roadFee;      // 路费
    }

    // ── 打野状态 ──
    struct HuntResult {
        uint8 regionId;
        uint256 blockNumber;  // 战斗完成区块（用于掉落随机）
        bool won;             // 是否胜利
        bool dropClaimed;     // 掉落是否已领取
    }

    ILingShi public immutable lingshi;
    IGameConfig public immutable gameConfig;
    ITreasury public immutable treasury;
    Register public immutable register;
    IEquipment public immutable equipment;
    IPill public immutable pill;
    IBeast public immutable beast;
    ITao public immutable tao;
    address public owner;

    uint8 public constant REGION_COUNT = 6;
    uint256 public cooldown;

    // 区域配置
    MonsterRegion[6] public monsterRegions;

    // 五行克制: 金(0)克木(1), 木(1)克土(4), 土(4)克水(2), 水(2)克火(3), 火(3)克金(0)
    mapping(uint8 => uint8) public restrains;

    // 玩家状态
    mapping(address => HuntResult) public lastHunt;
    mapping(address => uint256) public lastHuntTime;

    uint256 private _nonce;

    // ── 掉落概率 CDF (累积, /10000) ──
    uint256[4] public lowDiffDropCDF;    // NONE/WHITE/GREEN/BLUE
    uint256[5] public midDiffDropCDF;    // NONE/WHITE/GREEN/BLUE/PURPLE
    uint256[6] public highDiffDropCDF;   // NONE/WHITE/GREEN/BLUE/PURPLE/VEIN

    // ── 掉落奖励值 (LS) ──
    uint256[6] public dropRewards;       // [NONE, WHITE, GREEN, BLUE, PURPLE, VEIN]

    // ── 丹药掉落参数 ──
    uint256 public pillDropRateBP;       // 丹药掉落概率 (BP, /10000)
    uint8 public pillDropMinDifficulty;  // 最低难度要求
    uint8 public pillDropMinQuality;     // 最低品质要求 (掉落品质 >= 此值才判定丹药)

    // ── Events ──
    event HuntStarted(
        address indexed player,
        uint8 regionId,
        bool won
    );
    event HuntDualStarted(
        address indexed player1,
        address indexed player2,
        uint8 regionId,
        bool won
    );
    event HuntDropClaimed(
        address indexed player,
        uint8 regionId,
        uint8 dropQuality,
        uint256 dropReward,
        uint256 equipmentTokenId
    );
    event CooldownUpdated(uint256 oldValue, uint256 newValue);
    event MonsterRegionUpdated(uint8 regionId);
    event LowDiffDropCDFUpdated(uint256[4] newCDF);
    event MidDiffDropCDFUpdated(uint256[5] newCDF);
    event HighDiffDropCDFUpdated(uint256[6] newCDF);
    event DropRewardsUpdated(uint256[6] newRewards);
    event PillDropRateBPUpdated(uint256 oldValue, uint256 newValue);
    event PillDropMinDifficultyUpdated(uint8 oldValue, uint8 newValue);
    event PillDropMinQualityUpdated(uint8 oldValue, uint8 newValue);
    event PillDropped(address indexed player, uint8 pillType, uint8 regionId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Hunt: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _gameConfig,
        address _treasury,
        address _register,
        address _equipment,
        address _pill,
        address _beast,
        address _tao
    ) {
        require(_lingshi != address(0), "Hunt: zero lingshi");
        require(_gameConfig != address(0), "Hunt: zero config");
        require(_treasury != address(0), "Hunt: zero treasury");
        require(_register != address(0), "Hunt: zero register");
        require(_equipment != address(0), "Hunt: zero equipment");
        require(_pill != address(0), "Hunt: zero pill");
        require(_beast != address(0), "Hunt: zero beast");
        require(_tao != address(0), "Hunt: zero tao");

        lingshi = ILingShi(_lingshi);
        gameConfig = IGameConfig(_gameConfig);
        treasury = ITreasury(_treasury);
        register = Register(_register);
        equipment = IEquipment(_equipment);
        pill = IPill(_pill);
        beast = IBeast(_beast);
        tao = ITao(_tao);
        owner = msg.sender;

        cooldown = 5 minutes;

        // 五行克制: 金(0)克木(1), 木(1)克土(4), 土(4)克水(2), 水(2)克火(3), 火(3)克金(0)
        restrains[0] = 1;
        restrains[1] = 4;
        restrains[4] = 2;
        restrains[2] = 3;
        restrains[3] = 0;

        // 6 个区域: difficulty, element, monsterAtk, monsterDef, reward, roadFee
        monsterRegions[0] = MonsterRegion(1, 1, 150, 100, 20 ether, 10 ether);   // 碧翠原野, 木
        monsterRegions[1] = MonsterRegion(2, 2, 350, 250, 25 ether, 12 ether);   // 临海港口, 水
        monsterRegions[2] = MonsterRegion(2, 3, 400, 300, 30 ether, 12 ether);   // 火焰岛屿, 火
        monsterRegions[3] = MonsterRegion(3, 2, 800, 600, 40 ether, 15 ether);   // 冰封高峰, 水
        monsterRegions[4] = MonsterRegion(4, 0, 1800, 1200, 80 ether, 20 ether); // 雷霆废墟, 金
        monsterRegions[5] = MonsterRegion(4, 1, 2000, 1500, 80 ether, 25 ether); // 幽影密林, 木

        // 低难度掉落 CDF: 30% NONE, 35% WHITE, 25% GREEN, 10% BLUE
        lowDiffDropCDF = [uint256(3000), 6500, 9000, 10000];

        // 中难度掉落 CDF: 20% NONE, 30% WHITE, 25% GREEN, 15% BLUE, 10% PURPLE
        midDiffDropCDF = [uint256(2000), 5000, 7500, 9000, 10000];

        // 高难度掉落 CDF: 10% NONE, 25% WHITE, 30% GREEN, 20% BLUE, 10% PURPLE, 5% VEIN
        highDiffDropCDF = [uint256(1000), 3500, 6500, 8500, 9500, 10000];

        // 掉落奖励: NONE=0, WHITE=5, GREEN=15, BLUE=50, PURPLE=100, VEIN=150
        dropRewards[0] = 0;
        dropRewards[1] = 5 ether;
        dropRewards[2] = 15 ether;
        dropRewards[3] = 50 ether;
        dropRewards[4] = 100 ether;
        dropRewards[5] = 150 ether;

        // 丹药掉落: 难度>=3, 品质>=BLUE(3), 15% 概率
        pillDropRateBP = 1500;
        pillDropMinDifficulty = 3;
        pillDropMinQuality = 3;
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setCooldown(uint256 newCooldown) external onlyOwner {
        require(newCooldown <= 24 hours, "Hunt: cooldown too large");
        uint256 old = cooldown;
        cooldown = newCooldown;
        emit CooldownUpdated(old, newCooldown);
    }

    function setMonsterRegion(
        uint8 regionId,
        uint8 difficulty,
        uint8 element,
        uint256 monsterAtk,
        uint256 monsterDef,
        uint256 reward,
        uint256 roadFee
    ) external onlyOwner {
        require(regionId < REGION_COUNT, "Hunt: invalid region");
        require(difficulty >= 1 && difficulty <= 4, "Hunt: invalid difficulty");
        require(element < Constants.ELEMENT_COUNT, "Hunt: invalid element");
        monsterRegions[regionId] = MonsterRegion(difficulty, element, monsterAtk, monsterDef, reward, roadFee);
        emit MonsterRegionUpdated(regionId);
    }

    function setLowDiffDropCDF(uint256[4] calldata newCDF) external onlyOwner {
        require(newCDF[3] == 10000, "Hunt: CDF must end at 10000");
        for (uint8 i = 1; i < 4; i++) {
            require(newCDF[i] >= newCDF[i - 1], "Hunt: CDF not monotonic");
        }
        lowDiffDropCDF = newCDF;
        emit LowDiffDropCDFUpdated(newCDF);
    }

    function setMidDiffDropCDF(uint256[5] calldata newCDF) external onlyOwner {
        require(newCDF[4] == 10000, "Hunt: CDF must end at 10000");
        for (uint8 i = 1; i < 5; i++) {
            require(newCDF[i] >= newCDF[i - 1], "Hunt: CDF not monotonic");
        }
        midDiffDropCDF = newCDF;
        emit MidDiffDropCDFUpdated(newCDF);
    }

    function setHighDiffDropCDF(uint256[6] calldata newCDF) external onlyOwner {
        require(newCDF[5] == 10000, "Hunt: CDF must end at 10000");
        for (uint8 i = 1; i < 6; i++) {
            require(newCDF[i] >= newCDF[i - 1], "Hunt: CDF not monotonic");
        }
        highDiffDropCDF = newCDF;
        emit HighDiffDropCDFUpdated(newCDF);
    }

    function setDropRewards(uint256[6] calldata newRewards) external onlyOwner {
        dropRewards = newRewards;
        emit DropRewardsUpdated(newRewards);
    }

    function setPillDropRateBP(uint256 newValue) external onlyOwner {
        require(newValue <= Constants.BP, "Hunt: rate > 100%");
        uint256 old = pillDropRateBP;
        pillDropRateBP = newValue;
        emit PillDropRateBPUpdated(old, newValue);
    }

    function setPillDropMinDifficulty(uint8 newValue) external onlyOwner {
        require(newValue >= 1 && newValue <= 4, "Hunt: invalid difficulty");
        uint8 old = pillDropMinDifficulty;
        pillDropMinDifficulty = newValue;
        emit PillDropMinDifficultyUpdated(old, newValue);
    }

    function setPillDropMinQuality(uint8 newValue) external onlyOwner {
        require(newValue <= 5, "Hunt: invalid quality");
        uint8 old = pillDropMinQuality;
        pillDropMinQuality = newValue;
        emit PillDropMinQualityUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Hunt: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ═══════════════════════════════════════════
    //              GAME FUNCTIONS
    // ═══════════════════════════════════════════

    /// @notice 单人打野（链上战斗结算）
    /// @param regionId 区域 ID (0-5)
    function hunt(uint8 regionId) external {
        require(register.isRegistered(msg.sender), "Hunt: not registered");
        require(regionId < REGION_COUNT, "Hunt: invalid region");
        require(
            block.timestamp >= lastHuntTime[msg.sender] + cooldown,
            "Hunt: cooldown active"
        );
        require(
            !lastHunt[msg.sender].won || lastHunt[msg.sender].dropClaimed,
            "Hunt: claim previous drop first"
        );

        MonsterRegion memory region = monsterRegions[regionId];
        Register.Cultivator memory c = register.getCultivator(msg.sender);

        // 扣路费
        require(
            lingshi.balanceOf(msg.sender) >= region.roadFee,
            "Hunt: insufficient LS"
        );
        lingshi.transferFrom(msg.sender, address(this), region.roadFee);
        lingshi.approve(address(treasury), region.roadFee);
        treasury.collectFee(address(this), region.roadFee);

        // 计算装备加成
        (uint256 bonusAtkBP, uint256 bonusDefBP) = _getEquipmentBonusBP(msg.sender, c.element, c.origin);
        uint256 effectiveAtk = c.attack + c.attack * bonusAtkBP / Constants.BP;
        uint256 effectiveDef = c.defense + c.defense * bonusDefBP / Constants.BP;

        // 五行修正
        uint256 playerElemMod = _getElementModifier(c.element, region.element, c.perception, c.faction);
        uint256 monsterElemMod = _getElementModifier(region.element, c.element, 0, 0);

        // 链上战斗计算
        uint256 kRatio = gameConfig.kRatioBP();
        uint8 result = _calculateBattle(
            effectiveAtk, effectiveDef, playerElemMod,
            region.monsterAtk, region.monsterDef, monsterElemMod,
            kRatio
        );
        bool won = result == 1;

        lastHunt[msg.sender] = HuntResult({
            regionId: regionId,
            blockNumber: block.number,
            won: won,
            dropClaimed: !won // 败了无需领掉落，直接标记完成
        });
        lastHuntTime[msg.sender] = block.timestamp;

        // 胜利则发放灵石奖励
        if (won) {
            lingshi.mint(msg.sender, region.reward);
        }

        emit HuntStarted(msg.sender, regionId, won);
    }

    /// @notice 道侣联合打野（链上战斗结算）
    /// @param regionId 区域 ID (0-5)
    function huntDual(uint8 regionId) external {
        address partner = tao.getPartner(msg.sender);
        require(partner != address(0), "Hunt: no partner");

        _validateDualHuntPreconditions(regionId, partner);

        MonsterRegion memory region = monsterRegions[regionId];

        // 双方扣路费
        _collectDualRoadFee(partner, region.roadFee);

        // 链上计算联合战斗结果
        bool won = _resolveDualBattle(msg.sender, partner, region) == 1;

        // 双方存结果
        _storeDualHuntResult(regionId, partner, won);

        if (won) {
            lingshi.mint(msg.sender, region.reward);
            lingshi.mint(partner, region.reward);
        }

        emit HuntDualStarted(msg.sender, partner, regionId, won);
    }

    function _validateDualHuntPreconditions(uint8 regionId, address partner) internal view {
        require(register.isRegistered(msg.sender), "Hunt: caller not registered");
        require(register.isRegistered(partner), "Hunt: partner not registered");
        require(regionId < REGION_COUNT, "Hunt: invalid region");
        require(block.timestamp >= lastHuntTime[msg.sender] + cooldown, "Hunt: caller cooldown active");
        require(block.timestamp >= lastHuntTime[partner] + cooldown, "Hunt: partner cooldown active");
        require(!lastHunt[msg.sender].won || lastHunt[msg.sender].dropClaimed, "Hunt: caller claim drop first");
        require(!lastHunt[partner].won || lastHunt[partner].dropClaimed, "Hunt: partner claim drop first");
    }

    function _collectDualRoadFee(address partner, uint256 roadFee) internal {
        require(lingshi.balanceOf(msg.sender) >= roadFee, "Hunt: caller insufficient LS");
        require(lingshi.balanceOf(partner) >= roadFee, "Hunt: partner insufficient LS");
        lingshi.transferFrom(msg.sender, address(this), roadFee);
        lingshi.transferFrom(partner, address(this), roadFee);
        uint256 totalFee = roadFee * 2;
        lingshi.approve(address(treasury), totalFee);
        treasury.collectFee(address(this), totalFee);
    }

    function _storeDualHuntResult(uint8 regionId, address partner, bool won) internal {
        lastHunt[msg.sender] = HuntResult({
            regionId: regionId,
            blockNumber: block.number,
            won: won,
            dropClaimed: !won
        });
        lastHunt[partner] = HuntResult({
            regionId: regionId,
            blockNumber: block.number,
            won: won,
            dropClaimed: !won
        });
        lastHuntTime[msg.sender] = block.timestamp;
        lastHuntTime[partner] = block.timestamp;
    }

    /// @dev 计算含装备+灵兽加成的有效攻防
    function _getEffectiveStats(address player) internal view returns (uint256 effAtk, uint256 effDef) {
        Register.Cultivator memory c = register.getCultivator(player);
        (uint256 bonusAtkBP, uint256 bonusDefBP) = _getEquipmentBonusBP(player, c.element, c.origin);
        effAtk = c.attack + c.attack * bonusAtkBP / Constants.BP;
        effDef = c.defense + c.defense * bonusDefBP / Constants.BP;
    }

    /// @dev 道侣联合战斗结算（提取以避免 stack too deep）
    function _resolveDualBattle(address caller, address partner, MonsterRegion memory region) internal view returns (uint8) {
        (uint256 combinedAtk, uint256 combinedDef) = _combineDualStats(caller, partner);
        return _dualBattleVsMonster(caller, combinedAtk, combinedDef, region);
    }

    function _combineDualStats(address caller, address partner) internal view returns (uint256 combinedAtk, uint256 combinedDef) {
        (uint256 effAtk1, uint256 effDef1) = _getEffectiveStats(caller);
        (uint256 effAtk2, uint256 effDef2) = _getEffectiveStats(partner);
        uint256 s = Constants.DUAL_HUNT_SCALE_BP;
        combinedAtk = (effAtk1 + effAtk2) * s / Constants.BP;
        combinedDef = (effDef1 + effDef2) * s / Constants.BP;
    }

    function _dualBattleVsMonster(address caller, uint256 atkA, uint256 defA, MonsterRegion memory region) internal view returns (uint8) {
        Register.Cultivator memory c = register.getCultivator(caller);
        uint256 pMod = _getElementModifier(c.element, region.element, c.perception, c.faction);
        uint256 mMod = _getElementModifier(region.element, c.element, 0, 0);
        return _calculateBattle(atkA, defA, pMod, region.monsterAtk, region.monsterDef, mMod, gameConfig.kRatioBP());
    }

    // ═══════════════════════════════════════════
    //         ON-CHAIN BATTLE CALCULATION
    // ═══════════════════════════════════════════

    /// @dev 五行修正系数 (返回 /10000 的乘数)
    /// @param elemAttacker 攻方五行
    /// @param elemDefender 守方五行
    /// @param perception 攻方神识 (怪物为 0)
    /// @param faction 攻方门派 (怪物为 0)
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

    // ═══════════════════════════════════════════
    //              CLAIM DROP
    // ═══════════════════════════════════════════

    /// @notice 领取打野掉落（Block-delay 随机）
    function claimHuntDrop() external {
        HuntResult storage result = lastHunt[msg.sender];
        require(result.won, "Hunt: no winning hunt");
        require(!result.dropClaimed, "Hunt: drop already claimed");
        require(block.number > result.blockNumber, "Hunt: same block");

        uint256 rand = RandomLib.randomFromBlockhash(
            result.blockNumber,
            msg.sender,
            _nonce
        );
        _nonce++;

        uint256 roll = rand % 10000;
        MonsterRegion memory region = monsterRegions[result.regionId];

        // 掉落品质: 根据难度不同概率
        uint8 quality;

        if (region.difficulty <= 2) {
            quality = _resolveLowDiffDrop(roll);
        } else if (region.difficulty == 3) {
            quality = _resolveMidDiffDrop(roll);
        } else {
            quality = _resolveHighDiffDrop(roll);
        }

        uint256 dropReward = dropRewards[quality];
        result.dropClaimed = true;

        if (dropReward > 0) {
            lingshi.mint(msg.sender, dropReward);
        }

        // 铸造装备 NFT（品质 1-4 = WHITE-PURPLE，0=NONE 和 5=VEIN 不铸装备）
        uint256 equipTokenId = 0;
        if (quality >= 1 && quality <= 4) {
            equipTokenId = _mintEquipmentDrop(
                msg.sender,
                IEquipment.Quality(quality - 1), // Hunt: 1=WHITE...4=PURPLE → Equipment: 0-3
                rand
            );
        }

        // 丹药掉落判定（难度 + 品质门槛 + 概率）
        if (region.difficulty >= pillDropMinDifficulty && quality >= pillDropMinQuality) {
            uint256 pillRoll = (rand >> 128) % Constants.BP;
            if (pillRoll < pillDropRateBP) {
                uint8 pillType = _getPillTypeByDifficulty(region.difficulty);
                pill.mint(msg.sender, pillType, 1);
                emit PillDropped(msg.sender, pillType, result.regionId);
            }
        }

        emit HuntDropClaimed(msg.sender, result.regionId, quality, dropReward, equipTokenId);
    }

    /// @notice 查询上次打野结果
    function getLastHunt(address player) external view returns (HuntResult memory) {
        return lastHunt[player];
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

    // ══════════════════════════════════════════
    //              装备掉落铸造
    // ══════════════════════════════════════════

    /// @dev 铸造掉落装备 NFT
    function _mintEquipmentDrop(
        address to,
        IEquipment.Quality quality,
        uint256 seed
    ) internal returns (uint256) {
        IEquipment.EquipmentType eType = EquipmentLib.randomEquipmentType(seed >> 32);
        uint16 bonusBP = EquipmentLib.randomBonusBP(quality, seed);
        uint8 elemAff = EquipmentLib.randomAffinity(seed >> 64, Constants.ELEMENT_COUNT);
        uint8 origAff = EquipmentLib.randomAffinity(seed >> 96, Constants.ORIGIN_COUNT);
        uint8 factAff = EquipmentLib.randomAffinity(seed >> 160, Constants.FACTION_COUNT);

        return equipment.mint(to, eType, quality, bonusBP, elemAff, origAff, factAff);
    }

    // ══════════════════════════════════════════
    //              掉落表 (CDF-based)
    // ══════════════════════════════════════════

    /// @dev 根据难度决定掉落丹药类型
    function _getPillTypeByDifficulty(uint8 difficulty) internal pure returns (uint8) {
        if (difficulty >= 4) return 4; // 培元丹 (高难度区域产出实用丹)
        return 4;                      // 培元丹 (中难度也产培元丹)
    }

    function _resolveLowDiffDrop(uint256 roll) internal view returns (uint8) {
        if (roll < lowDiffDropCDF[0]) return 0; // NONE
        if (roll < lowDiffDropCDF[1]) return 1; // WHITE
        if (roll < lowDiffDropCDF[2]) return 2; // GREEN
        return 3;                                // BLUE
    }

    function _resolveMidDiffDrop(uint256 roll) internal view returns (uint8) {
        if (roll < midDiffDropCDF[0]) return 0; // NONE
        if (roll < midDiffDropCDF[1]) return 1; // WHITE
        if (roll < midDiffDropCDF[2]) return 2; // GREEN
        if (roll < midDiffDropCDF[3]) return 3; // BLUE
        return 4;                                // PURPLE
    }

    function _resolveHighDiffDrop(uint256 roll) internal view returns (uint8) {
        if (roll < highDiffDropCDF[0]) return 0; // NONE
        if (roll < highDiffDropCDF[1]) return 1; // WHITE
        if (roll < highDiffDropCDF[2]) return 2; // GREEN
        if (roll < highDiffDropCDF[3]) return 3; // BLUE
        if (roll < highDiffDropCDF[4]) return 4; // PURPLE
        return 5;                                 // VEIN
    }
}
