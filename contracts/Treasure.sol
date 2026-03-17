// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IEquipment.sol";
import "./interfaces/IPill.sol";
import "./Register.sol";
import "./libraries/Constants.sol";
import "./libraries/RandomLib.sol";
import "./libraries/EquipmentLib.sol";

/// @title Treasure — 区域挖宝（Block-delay 随机掉落）
/// @notice TX1: startTreasure → TX2: finishTreasure
contract Treasure {
    // ── 区域数据 ──
    struct Region {
        uint8 difficulty;  // 1-4
        uint8 element;     // 0-4: 金/木/水/火/土
        uint256 roadFee;   // 路费
    }

    // ── 挖宝状态 ──
    struct TreasureIntent {
        uint8 regionId;
        uint256 blockNumber;
        bool pending;
    }

    // ── 掉落结果 ──
    enum DropQuality { NONE, WHITE, GREEN, BLUE, PURPLE, VEIN }

    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;
    IEquipment public immutable equipment;
    IPill public immutable pill;
    address public owner;

    uint8 public constant REGION_COUNT = 6;
    uint256 public cooldown;

    // 区域配置
    Region[6] public regions;

    // 玩家状态
    mapping(address => TreasureIntent) public intents;
    mapping(address => uint256) public lastTreasureTime;

    uint256 private _nonce;

    // ── 掉落概率 (累积, /10000) ──
    uint256[5] public lowDiffDropCDF;
    uint256[6] public highDiffDropCDF;

    // 掉落奖励值 (LS)
    uint256[6] public dropRewards;

    // ── 丹药掉落参数 ──
    uint256 public pillDropRateBP;  // VEIN 品质丹药掉落概率 (BP)

    // ── Events ──
    event TreasureStarted(address indexed player, uint8 regionId, uint256 blockNumber);
    event TreasureFinished(
        address indexed player,
        uint8 regionId,
        DropQuality quality,
        uint256 reward,
        uint256 equipmentTokenId
    );
    event CooldownUpdated(uint256 oldValue, uint256 newValue);
    event RegionRoadFeeUpdated(uint8 regionId, uint256 oldFee, uint256 newFee);
    event LowDiffDropCDFUpdated(uint256[5] newCDF);
    event HighDiffDropCDFUpdated(uint256[6] newCDF);
    event DropRewardsUpdated(uint256[6] newRewards);
    event PillDropRateBPUpdated(uint256 oldValue, uint256 newValue);
    event PillDropped(address indexed player, uint8 pillType, uint8 regionId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Treasure: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _treasury,
        address _register,
        address _equipment,
        address _pill
    ) {
        require(_lingshi != address(0), "Treasure: zero lingshi");
        require(_treasury != address(0), "Treasure: zero treasury");
        require(_register != address(0), "Treasure: zero register");
        require(_equipment != address(0), "Treasure: zero equipment");
        require(_pill != address(0), "Treasure: zero pill");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);
        equipment = IEquipment(_equipment);
        pill = IPill(_pill);
        owner = msg.sender;

        cooldown = 5 minutes;

        // 6 个区域: difficulty, element, roadFee
        regions[0] = Region(1, 1, 3 ether);   // 碧翠原野, 木, 3 LS
        regions[1] = Region(2, 2, 3 ether);   // 临海港口, 水, 3 LS
        regions[2] = Region(2, 3, 5 ether);   // 火焰岛屿, 火, 5 LS
        regions[3] = Region(3, 2, 5 ether);   // 冰封高峰, 水, 5 LS
        regions[4] = Region(4, 0, 8 ether);   // 雷霆废墟, 金, 8 LS
        regions[5] = Region(4, 1, 8 ether);   // 幽影密林, 木, 8 LS

        // 低难度掉落 CDF (累积概率 /10000)
        lowDiffDropCDF = [uint256(3000), 7000, 8800, 9800, 10000];

        // 高难度掉落 CDF (6 档, 含 PURPLE)
        highDiffDropCDF = [uint256(2000), 5000, 7200, 8700, 9000, 10000];

        // 掉落奖励值: NONE=0, WHITE=5, GREEN=15, BLUE=50, PURPLE=100, VEIN=150
        dropRewards[0] = 0;          // NONE
        dropRewards[1] = 5 ether;    // WHITE
        dropRewards[2] = 15 ether;   // GREEN
        dropRewards[3] = 50 ether;   // BLUE
        dropRewards[4] = 100 ether;  // PURPLE
        dropRewards[5] = 150 ether;  // VEIN

        // VEIN 品质 100% 掉落培元丹
        pillDropRateBP = 10000;
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setCooldown(uint256 newCooldown) external onlyOwner {
        require(newCooldown <= 24 hours, "Treasure: cooldown too large");
        uint256 old = cooldown;
        cooldown = newCooldown;
        emit CooldownUpdated(old, newCooldown);
    }

    function setRegionRoadFee(uint8 regionId, uint256 newFee) external onlyOwner {
        require(regionId < REGION_COUNT, "Treasure: invalid region");
        uint256 oldFee = regions[regionId].roadFee;
        regions[regionId].roadFee = newFee;
        emit RegionRoadFeeUpdated(regionId, oldFee, newFee);
    }

    function setLowDiffDropCDF(uint256[5] calldata newCDF) external onlyOwner {
        require(newCDF[4] == 10000, "Treasure: CDF must end at 10000");
        for (uint8 i = 1; i < 5; i++) {
            require(newCDF[i] >= newCDF[i - 1], "Treasure: CDF not monotonic");
        }
        lowDiffDropCDF = newCDF;
        emit LowDiffDropCDFUpdated(newCDF);
    }

    function setHighDiffDropCDF(uint256[6] calldata newCDF) external onlyOwner {
        require(newCDF[5] == 10000, "Treasure: CDF must end at 10000");
        for (uint8 i = 1; i < 6; i++) {
            require(newCDF[i] >= newCDF[i - 1], "Treasure: CDF not monotonic");
        }
        highDiffDropCDF = newCDF;
        emit HighDiffDropCDFUpdated(newCDF);
    }

    function setDropRewards(uint256[6] calldata newRewards) external onlyOwner {
        dropRewards = newRewards;
        emit DropRewardsUpdated(newRewards);
    }

    function setPillDropRateBP(uint256 newValue) external onlyOwner {
        require(newValue <= Constants.BP, "Treasure: rate > 100%");
        uint256 old = pillDropRateBP;
        pillDropRateBP = newValue;
        emit PillDropRateBPUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Treasure: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ═══════════════════════════════════════════
    //              GAME FUNCTIONS
    // ═══════════════════════════════════════════

    /// @notice 第一步：开始挖宝（扣路费，记录区块）
    function startTreasure(uint8 regionId) external {
        require(register.isRegistered(msg.sender), "Treasure: not registered");
        require(regionId < REGION_COUNT, "Treasure: invalid region");
        require(!intents[msg.sender].pending, "Treasure: already pending");
        require(
            block.timestamp >= lastTreasureTime[msg.sender] + cooldown,
            "Treasure: cooldown active"
        );

        Region memory region = regions[regionId];

        // 扣路费
        require(
            lingshi.balanceOf(msg.sender) >= region.roadFee,
            "Treasure: insufficient LS for road fee"
        );
        lingshi.transferFrom(msg.sender, address(this), region.roadFee);

        // 路费送入 Treasury 分配
        lingshi.approve(address(treasury), region.roadFee);
        treasury.collectFee(address(this), region.roadFee);

        intents[msg.sender] = TreasureIntent({
            regionId: regionId,
            blockNumber: block.number,
            pending: true
        });

        emit TreasureStarted(msg.sender, regionId, block.number);
    }

    /// @notice 第二步：完成挖宝（block-delay 随机掉落）
    function finishTreasure() external {
        TreasureIntent storage intent = intents[msg.sender];
        require(intent.pending, "Treasure: no pending intent");
        require(block.number > intent.blockNumber, "Treasure: same block");

        uint256 rand = RandomLib.randomFromBlockhash(
            intent.blockNumber,
            msg.sender,
            _nonce
        );
        _nonce++;

        uint8 regionId = intent.regionId;
        Region memory region = regions[regionId];

        // 确定掉落品质
        DropQuality quality;
        uint256 roll = rand % 10000;

        if (region.difficulty >= 4) {
            quality = _resolveHighDiffDrop(roll);
        } else {
            quality = _resolveLowDiffDrop(roll);
        }

        // 发放奖励
        uint256 reward = dropRewards[uint256(quality)];
        if (reward > 0) {
            lingshi.mint(msg.sender, reward);
        }

        // 铸造装备 NFT（GREEN-PURPLE 掉装备，NONE/WHITE/VEIN 不掉）
        uint256 equipTokenId = 0;
        if (quality >= DropQuality.GREEN && quality <= DropQuality.PURPLE) {
            equipTokenId = _mintEquipmentDrop(
                msg.sender,
                IEquipment.Quality(uint8(quality) - 1),
                rand
            );
        }

        // VEIN 品质丹药掉落
        if (quality == DropQuality.VEIN) {
            uint256 pillRoll = (rand >> 128) % Constants.BP;
            if (pillRoll < pillDropRateBP) {
                pill.mint(msg.sender, 4, 1); // 培元丹
                emit PillDropped(msg.sender, 4, regionId);
            }
        }

        intent.pending = false;
        lastTreasureTime[msg.sender] = block.timestamp;

        emit TreasureFinished(msg.sender, regionId, quality, reward, equipTokenId);
    }

    /// @notice 查询挖宝状态
    function getIntent(address player) external view returns (TreasureIntent memory) {
        return intents[player];
    }

    // ── 内部函数 ──

    function _resolveLowDiffDrop(uint256 roll) internal view returns (DropQuality) {
        if (roll < lowDiffDropCDF[0]) return DropQuality.NONE;
        if (roll < lowDiffDropCDF[1]) return DropQuality.WHITE;
        if (roll < lowDiffDropCDF[2]) return DropQuality.GREEN;
        if (roll < lowDiffDropCDF[3]) return DropQuality.BLUE;
        return DropQuality.VEIN;
    }

    function _resolveHighDiffDrop(uint256 roll) internal view returns (DropQuality) {
        if (roll < highDiffDropCDF[0]) return DropQuality.NONE;
        if (roll < highDiffDropCDF[1]) return DropQuality.WHITE;
        if (roll < highDiffDropCDF[2]) return DropQuality.GREEN;
        if (roll < highDiffDropCDF[3]) return DropQuality.BLUE;
        if (roll < highDiffDropCDF[4]) return DropQuality.PURPLE;
        return DropQuality.VEIN;
    }

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
}
