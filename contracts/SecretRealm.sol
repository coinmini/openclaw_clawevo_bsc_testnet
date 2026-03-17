// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IGameConfig.sol";
import "./interfaces/IEquipment.sol";
import "./interfaces/IBeast.sol";
import "./interfaces/IPill.sol";
import "./interfaces/ISecretRealm.sol";
import "./Register.sol";
import "./libraries/Constants.sol";
import "./libraries/RandomLib.sol";
import "./libraries/EquipmentLib.sol";

/// @title SecretRealm — 秘境副本系统
/// @notice 3 个秘境 × 3 层，支持单人/组队（最多3人），链上战斗结算 + Block-delay 掉落
contract SecretRealm is ISecretRealm {
    struct RealmLayer {
        uint256 monsterAtk;
        uint256 monsterDef;
        uint256 reward;
    }

    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;
    IGameConfig public immutable gameConfig;
    IEquipment public immutable equipment;
    IBeast public immutable beast;
    IPill public immutable pill;
    address public owner;

    // ── 五行相克 ──
    mapping(uint8 => uint8) public restrains;

    // ── 秘境配置 [realmId][layer] ──
    mapping(uint8 => mapping(uint8 => RealmLayer)) public realmLayers;

    // ── 玩家进度 ──
    mapping(address => PlayerProgress) private _progress;

    // ── 组队 ──
    mapping(uint256 => Party) private _parties;
    uint256 public nextPartyId;

    // ── 组队成员 → partyId 映射 ──
    mapping(address => uint256) public playerPartyId;

    // 秘境元素属性
    uint8[9] public realmElements;

    uint256 private _nonce;

    // ── Configurable fee ──
    uint256 public secretRealmFee;

    // ── 秘境丹药掉落: realmId → pillType ──
    uint8[9] public realmPillRewards;  // 通关第3层掉落的丹药类型

    // ── Events ──
    event SoloEntered(address indexed player, uint8 realmId);
    event LayerChallenged(address indexed player, uint8 realmId, uint8 layer, bool won);
    event LayerDropClaimed(address indexed player, uint8 realmId, uint8 layer, uint256 reward);
    event PartyCreated(uint256 indexed partyId, address indexed leader, uint8 realmId);
    event PartyJoined(uint256 indexed partyId, address indexed member);
    event PartyEntered(uint256 indexed partyId, uint8 realmId);
    event RealmLayerUpdated(uint8 realmId, uint8 layer);
    event SecretRealmFeeUpdated(uint256 oldValue, uint256 newValue);
    event RealmElementUpdated(uint8 realmId, uint8 newElement);
    event RealmPillRewardUpdated(uint8 realmId, uint8 pillType);
    event PillDropped(address indexed player, uint8 pillType, uint8 realmId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "SecretRealm: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _treasury,
        address _register,
        address _gameConfig,
        address _equipment,
        address _beast,
        address _pill
    ) {
        require(_lingshi != address(0), "SecretRealm: zero lingshi");
        require(_treasury != address(0), "SecretRealm: zero treasury");
        require(_register != address(0), "SecretRealm: zero register");
        require(_gameConfig != address(0), "SecretRealm: zero config");
        require(_equipment != address(0), "SecretRealm: zero equipment");
        require(_beast != address(0), "SecretRealm: zero beast");
        require(_pill != address(0), "SecretRealm: zero pill");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);
        gameConfig = IGameConfig(_gameConfig);
        equipment = IEquipment(_equipment);
        beast = IBeast(_beast);
        pill = IPill(_pill);
        owner = msg.sender;
        nextPartyId = 1;
        secretRealmFee = Constants.SECRET_REALM_FEE;

        // 五行相克: 金→木→土→水→火→金
        restrains[0] = 1;
        restrains[1] = 4;
        restrains[4] = 2;
        restrains[2] = 3;
        restrains[3] = 0;

        // 9大秘境元素: 青云山=木, 冰霜峰=水, 桃花源=木, 剑冢=金, 天枢殿=土, 雷鸣原=金, 流沙域=土, 炎魔山=火, 幽冥涡=水
        realmElements[0] = 1; // 木
        realmElements[1] = 2; // 水
        realmElements[2] = 1; // 木
        realmElements[3] = 0; // 金
        realmElements[4] = 4; // 土
        realmElements[5] = 0; // 金
        realmElements[6] = 4; // 土
        realmElements[7] = 3; // 火
        realmElements[8] = 2; // 水

        // 0: 青云秘境 (易)
        realmLayers[0][0] = RealmLayer(300, 200, 40 ether);
        realmLayers[0][1] = RealmLayer(800, 600, 120 ether);
        realmLayers[0][2] = RealmLayer(2000, 1500, 400 ether);

        // 1: 冰魄秘境
        realmLayers[1][0] = RealmLayer(400, 400, 50 ether);
        realmLayers[1][1] = RealmLayer(1000, 1000, 150 ether);
        realmLayers[1][2] = RealmLayer(2500, 2500, 500 ether);

        // 2: 桃源秘境 (易)
        realmLayers[2][0] = RealmLayer(250, 250, 40 ether);
        realmLayers[2][1] = RealmLayer(700, 700, 120 ether);
        realmLayers[2][2] = RealmLayer(1800, 1800, 400 ether);

        // 3: 剑冢秘境
        realmLayers[3][0] = RealmLayer(500, 300, 50 ether);
        realmLayers[3][1] = RealmLayer(1200, 800, 150 ether);
        realmLayers[3][2] = RealmLayer(3000, 2000, 500 ether);

        // 4: 天枢秘境
        realmLayers[4][0] = RealmLayer(400, 500, 60 ether);
        realmLayers[4][1] = RealmLayer(1000, 1200, 180 ether);
        realmLayers[4][2] = RealmLayer(2500, 3000, 600 ether);

        // 5: 雷霆秘境
        realmLayers[5][0] = RealmLayer(600, 400, 60 ether);
        realmLayers[5][1] = RealmLayer(1500, 1000, 180 ether);
        realmLayers[5][2] = RealmLayer(3500, 2500, 600 ether);

        // 6: 流沙秘境
        realmLayers[6][0] = RealmLayer(350, 450, 50 ether);
        realmLayers[6][1] = RealmLayer(900, 1100, 150 ether);
        realmLayers[6][2] = RealmLayer(2200, 2800, 500 ether);

        // 7: 炎魔秘境 (难)
        realmLayers[7][0] = RealmLayer(700, 350, 70 ether);
        realmLayers[7][1] = RealmLayer(1800, 900, 200 ether);
        realmLayers[7][2] = RealmLayer(4000, 2000, 700 ether);

        // 8: 幽冥秘境 (难)
        realmLayers[8][0] = RealmLayer(600, 600, 70 ether);
        realmLayers[8][1] = RealmLayer(1500, 1500, 200 ether);
        realmLayers[8][2] = RealmLayer(3500, 3500, 700 ether);

        // 丹药奖励: 培元丹(4), 聚灵丹(5), 洗髓丹(6), 护心丹(7)
        realmPillRewards[0] = 4; // 培元丹
        realmPillRewards[1] = 5; // 聚灵丹
        realmPillRewards[2] = 4; // 培元丹
        realmPillRewards[3] = 5; // 聚灵丹
        realmPillRewards[4] = 7; // 护心丹
        realmPillRewards[5] = 5; // 聚灵丹
        realmPillRewards[6] = 4; // 培元丹
        realmPillRewards[7] = 6; // 洗髓丹
        realmPillRewards[8] = 7; // 护心丹
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setRealmLayer(
        uint8 realmId,
        uint8 layer,
        uint256 monsterAtk,
        uint256 monsterDef,
        uint256 reward
    ) external onlyOwner {
        require(realmId < Constants.SECRET_REALM_COUNT, "SecretRealm: invalid realm");
        require(layer < Constants.SECRET_REALM_LAYERS, "SecretRealm: invalid layer");
        realmLayers[realmId][layer] = RealmLayer(monsterAtk, monsterDef, reward);
        emit RealmLayerUpdated(realmId, layer);
    }

    function setSecretRealmFee(uint256 newFee) external onlyOwner {
        uint256 old = secretRealmFee;
        secretRealmFee = newFee;
        emit SecretRealmFeeUpdated(old, newFee);
    }

    function setRealmElement(uint8 realmId, uint8 newElement) external onlyOwner {
        require(realmId < Constants.SECRET_REALM_COUNT, "SecretRealm: invalid realm");
        require(newElement < Constants.ELEMENT_COUNT, "SecretRealm: invalid element");
        realmElements[realmId] = newElement;
        emit RealmElementUpdated(realmId, newElement);
    }

    function setRealmPillReward(uint8 realmId, uint8 pillType) external onlyOwner {
        require(realmId < Constants.SECRET_REALM_COUNT, "SecretRealm: invalid realm");
        require(pillType < 8, "SecretRealm: invalid pill type");
        realmPillRewards[realmId] = pillType;
        emit RealmPillRewardUpdated(realmId, pillType);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SecretRealm: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── 单人进入 ──

    /// @notice 单人进入秘境，支付门票费
    function enterSolo(uint8 realmId) external {
        require(register.isRegistered(msg.sender), "SecretRealm: not registered");
        require(realmId < Constants.SECRET_REALM_COUNT, "SecretRealm: invalid realm");
        require(!_progress[msg.sender].active, "SecretRealm: already active");
        require(playerPartyId[msg.sender] == 0, "SecretRealm: in party");

        // 收取门票
        require(
            lingshi.balanceOf(msg.sender) >= secretRealmFee,
            "SecretRealm: insufficient LS"
        );
        lingshi.transferFrom(msg.sender, address(this), secretRealmFee);
        lingshi.approve(address(treasury), secretRealmFee);
        treasury.collectFee(address(this), secretRealmFee);

        _progress[msg.sender] = PlayerProgress({
            realmId: realmId,
            currentLayer: 0,
            blockNumber: block.number,
            dropClaimed: true,
            active: true,
            isSolo: true
        });

        emit SoloEntered(msg.sender, realmId);
    }

    // ── 挑战当前层（链上战斗结算） ──

    /// @notice 挑战当前层怪物（链上计算）
    function challengeLayer() external {
        PlayerProgress storage p = _progress[msg.sender];
        require(p.active, "SecretRealm: not active");
        require(p.dropClaimed, "SecretRealm: claim drop first");
        require(p.currentLayer < Constants.SECRET_REALM_LAYERS, "SecretRealm: all layers cleared");

        uint8 realmId = p.realmId;
        uint8 layerIdx = p.currentLayer;
        RealmLayer memory rl = realmLayers[realmId][layerIdx];

        // 构建成员列表
        uint256 memberCount;
        address[] memory members;
        if (p.isSolo) {
            members = new address[](1);
            members[0] = msg.sender;
            memberCount = 1;
        } else {
            uint256 partyId = playerPartyId[msg.sender];
            Party storage party = _parties[partyId];
            require(party.leader == msg.sender, "SecretRealm: only leader challenges");
            memberCount = party.memberCount;
            members = new address[](memberCount);
            for (uint256 i = 0; i < memberCount; i++) {
                members[i] = party.members[i];
            }
        }

        // 计算组队总属性
        uint256 totalAtk;
        uint256 totalDef;
        for (uint256 i = 0; i < memberCount; i++) {
            (uint256 effAtk, uint256 effDef) = _getEffectiveCombatStats(members[i]);
            totalAtk += effAtk;
            totalDef += effDef;
        }

        // 组队系数
        uint256 partyScaleBP = _getPartyScale(uint8(memberCount));
        totalAtk = totalAtk * partyScaleBP / Constants.BP;
        totalDef = totalDef * partyScaleBP / Constants.BP;

        // 元素相克（以队长/调用者元素为准）
        Register.Cultivator memory cLeader = register.getCultivator(msg.sender);
        uint8 monsterElement = realmElements[realmId];
        uint256 playerElemMod = _getElementModifier(cLeader.element, monsterElement, cLeader.perception, cLeader.faction);
        uint256 monsterElemMod = _getElementModifier(monsterElement, cLeader.element, 0, 0);

        // 战斗结算
        uint8 result = _calculateBattle(
            totalAtk, totalDef, playerElemMod,
            rl.monsterAtk, rl.monsterDef, monsterElemMod,
            gameConfig.kRatioBP()
        );
        bool won = (result == 1);

        if (won) {
            p.blockNumber = block.number;
            p.dropClaimed = false;
            lingshi.mint(msg.sender, rl.reward);
        } else {
            p.active = false;
            _cleanupParty(msg.sender);
        }

        emit LayerChallenged(msg.sender, realmId, layerIdx, won);
    }

    // ── 领取层掉落 + 推进 ──

    /// @notice 领取当前层掉落并推进到下一层
    function claimLayerDrop() external {
        PlayerProgress storage p = _progress[msg.sender];
        require(p.active, "SecretRealm: not active");
        require(!p.dropClaimed, "SecretRealm: already claimed");
        require(block.number > p.blockNumber, "SecretRealm: same block");

        uint256 rand = RandomLib.randomFromBlockhash(p.blockNumber, msg.sender, _nonce);
        _nonce++;

        // 独行加成: 15% 概率额外奖励
        uint256 bonusReward = 0;
        if (p.isSolo) {
            uint256 roll = rand % Constants.BP;
            if (roll < Constants.SOLO_UPGRADE_CHANCE_BP) {
                RealmLayer memory layer = realmLayers[p.realmId][p.currentLayer];
                bonusReward = layer.reward / 2; // 50% 额外灵石
            }
        }

        if (bonusReward > 0) {
            lingshi.mint(msg.sender, bonusReward);
        }

        p.dropClaimed = true;
        p.currentLayer++;

        // 全部通关则掉落丹药 + 结束
        if (p.currentLayer >= Constants.SECRET_REALM_LAYERS) {
            uint8 pillType = realmPillRewards[p.realmId];
            pill.mint(msg.sender, pillType, 1);
            emit PillDropped(msg.sender, pillType, p.realmId);

            p.active = false;
            _cleanupParty(msg.sender);
        }

        emit LayerDropClaimed(msg.sender, p.realmId, p.currentLayer - 1, bonusReward);
    }

    // ── 组队 ──

    /// @notice 创建队伍
    function createParty(uint8 realmId) external returns (uint256) {
        require(register.isRegistered(msg.sender), "SecretRealm: not registered");
        require(realmId < Constants.SECRET_REALM_COUNT, "SecretRealm: invalid realm");
        require(!_progress[msg.sender].active, "SecretRealm: already active");
        require(playerPartyId[msg.sender] == 0, "SecretRealm: already in party");

        uint256 partyId = nextPartyId++;
        Party storage party = _parties[partyId];
        party.leader = msg.sender;
        party.members[0] = msg.sender;
        party.memberCount = 1;
        party.realmId = realmId;
        party.createdAt = block.timestamp;

        playerPartyId[msg.sender] = partyId;

        emit PartyCreated(partyId, msg.sender, realmId);
        return partyId;
    }

    /// @notice 加入队伍
    function joinParty(uint256 partyId) external {
        require(register.isRegistered(msg.sender), "SecretRealm: not registered");
        require(!_progress[msg.sender].active, "SecretRealm: already active");
        require(playerPartyId[msg.sender] == 0, "SecretRealm: already in party");

        Party storage party = _parties[partyId];
        require(party.leader != address(0), "SecretRealm: party not found");
        require(!party.entered, "SecretRealm: party already entered");
        require(party.memberCount < 3, "SecretRealm: party full");

        party.members[party.memberCount] = msg.sender;
        party.memberCount++;
        playerPartyId[msg.sender] = partyId;

        emit PartyJoined(partyId, msg.sender);
    }

    /// @notice 队伍进入秘境（队长调用，所有成员支付门票）
    function enterAsParty(uint256 partyId) external {
        Party storage party = _parties[partyId];
        require(party.leader == msg.sender, "SecretRealm: not leader");
        require(!party.entered, "SecretRealm: already entered");
        require(party.memberCount >= 2, "SecretRealm: need 2+ members");

        // 所有成员支付门票
        for (uint8 i = 0; i < party.memberCount; i++) {
            address member = party.members[i];
            require(
                lingshi.balanceOf(member) >= secretRealmFee,
                "SecretRealm: member insufficient LS"
            );
            lingshi.transferFrom(member, address(this), secretRealmFee);
        }

        // 一次性 approve + collectFee
        uint256 totalFee = secretRealmFee * party.memberCount;
        lingshi.approve(address(treasury), totalFee);
        treasury.collectFee(address(this), totalFee);

        party.entered = true;

        // 设置队长为活跃（队长负责挑战）
        _progress[msg.sender] = PlayerProgress({
            realmId: party.realmId,
            currentLayer: 0,
            blockNumber: block.number,
            dropClaimed: true,
            active: true,
            isSolo: false
        });

        emit PartyEntered(partyId, party.realmId);
    }

    // ── View 函数 ──

    function getProgress(address player) external view override returns (PlayerProgress memory) {
        return _progress[player];
    }

    function getParty(uint256 partyId) external view override returns (Party memory) {
        return _parties[partyId];
    }

    function getRealmLayer(uint8 realmId, uint8 layer) external view returns (RealmLayer memory) {
        return realmLayers[realmId][layer];
    }

    // ══════════════════════════════════════════
    //              内部函数
    // ══════════════════════════════════════════

    /// @dev 五行相克修正系数
    function _getElementModifier(
        uint8 elemA,
        uint8 elemB,
        uint256 perception,
        uint8 faction
    ) internal view returns (uint256) {
        if (restrains[elemA] == elemB) {
            uint256 mod = 13000;
            if (perception >= 750) mod += 1500;
            else if (perception >= 500) mod += 1000;
            else if (perception >= 250) mod += 500;
            if (faction == 2) mod += 1000; // 阵修
            return mod;
        }
        if (
            (elemA == 0 && elemB == 2) || (elemA == 2 && elemB == 1) ||
            (elemA == 1 && elemB == 3) || (elemA == 3 && elemB == 4) ||
            (elemA == 4 && elemB == 0)
        ) {
            return 10800;
        }
        return 10000;
    }

    /// @dev CrossMultiplyCombat 战斗公式
    function _calculateBattle(
        uint256 atkA,
        uint256 defA,
        uint256 elemModA,
        uint256 atkB,
        uint256 defB,
        uint256 elemModB,
        uint256 kRatioBP
    ) internal pure returns (uint8) {
        uint256 sumAtk = atkA + atkB;
        uint256 commonTerm = sumAtk * kRatioBP;
        uint256 bracketA = defB * 20000 + commonTerm;
        uint256 bracketB = defA * 20000 + commonTerm;
        uint256 lhs = atkA * elemModA * bracketA;
        uint256 rhs = atkB * elemModB * bracketB;
        if (lhs > rhs) return 1;
        if (lhs < rhs) return 2;
        return 0;
    }

    /// @dev 获取玩家有效战斗属性（含装备+灵兽加成）
    function _getEffectiveCombatStats(address player) internal view returns (uint256 effAtk, uint256 effDef) {
        Register.Cultivator memory c = register.getCultivator(player);
        (uint256 bonusAtkBP, uint256 bonusDefBP) = _getEquipmentBonusBP(player, c.element, c.origin);
        effAtk = c.attack + c.attack * bonusAtkBP / 10000;
        effDef = c.defense + c.defense * bonusDefBP / 10000;
    }

    /// @dev 获取玩家装备+灵兽攻防加成 (basis points)
    function _getEquipmentBonusBP(address player, uint8 playerElement, uint8 playerOrigin)
        internal
        view
        returns (uint256 bonusAtkBP, uint256 bonusDefBP)
    {
        // 武器 → bonusAtkBP
        uint256 weaponId = equipment.getEquipped(player, IEquipment.EquipmentType.WEAPON);
        if (weaponId != 0) {
            IEquipment.EquipmentData memory w = equipment.getEquipmentData(weaponId);
            bonusAtkBP = uint256(EquipmentLib.getEffectiveBonusBP(w, playerElement, playerOrigin));
        }

        // 防具 → bonusDefBP
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

    /// @dev 获取组队人数系数
    function _getPartyScale(uint8 memberCount) internal pure returns (uint256) {
        if (memberCount == 1) return Constants.PARTY_SCALE_1;
        if (memberCount == 2) return Constants.PARTY_SCALE_2;
        return Constants.PARTY_SCALE_3;
    }

    /// @dev 清理组队状态
    function _cleanupParty(address player) internal {
        uint256 partyId = playerPartyId[player];
        if (partyId != 0) {
            Party storage party = _parties[partyId];
            for (uint8 i = 0; i < party.memberCount; i++) {
                playerPartyId[party.members[i]] = 0;
            }
        }
    }
}
