// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IBeast.sol";
import "./Register.sol";
import "./libraries/Constants.sol";
import "./libraries/RandomLib.sol";
/// @title Beast — ERC-721 灵兽 NFT（猎捕 + 捕获 + 装备）
/// @notice MVP: 1-2 星灵兽，block-delay 猎捕，直接链上感知力校验捕获
contract Beast is ERC721, AccessControl, IBeast {
    bytes32 public constant GAME_CONTRACT_ROLE = keccak256("GAME_CONTRACT_ROLE");

    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;

    uint256 private _nextTokenId;
    uint256 private _nonce;

    // ── 灵兽数据 ──
    mapping(uint256 => BeastInfo) private _beastData;

    // ── 装备槽: player → tokenId (0 = 无) ──
    mapping(address => uint256) private _equippedBeast;

    // ── 灵兽图鉴 ──
    // speciesPool[regionId][starIndex] → speciesId[]  (starIndex: 0=1星, 1=2星)
    mapping(uint8 => mapping(uint8 => uint8[])) private _speciesPool;
    string[18] public speciesNames;

    // ── 猎捕状态 ──
    struct BeastHuntIntent {
        uint8 regionId;
        uint256 blockNumber;
        bool pending;
    }
    mapping(address => BeastHuntIntent) public huntIntents;
    mapping(address => uint256) public lastBeastHuntTime;

    // ── 区域配置 ──
    struct BeastRegion {
        uint8 element;       // 0-4
        uint256 resistance;  // 捕获抵抗值
        uint256 huntFee;     // 猎捕费用 (LS)
    }
    uint8 public constant REGION_COUNT = 6;
    BeastRegion[6] public beastRegions;

    // ── 出现概率 CDF (/10000) ──
    // 70% 无, 22% 1星, 8% 2星
    // 累积: [7000, 9200, 10000]
    uint256[3] public appearanceCDF;

    // ── 星级系数 (×BP) ──
    uint256[3] public starCoefficients; // [0, 10000, 30000] (0星不存在，仅占位)

    // ── Events ──
    event BeastHuntStarted(address indexed player, uint8 regionId, uint256 blockNumber);
    event BeastHuntFinished(
        address indexed player,
        uint8 regionId,
        uint8 star,
        bool captured,
        uint256 tokenId
    );
    event BeastEquipped(address indexed player, uint256 tokenId);
    event BeastUnequipped(address indexed player, uint256 tokenId);
    event BeastMinted(
        address indexed to,
        uint256 indexed tokenId,
        uint8 star,
        uint8 element,
        uint16 powerRate,
        uint8 speciesId
    );
    event BeastRegionUpdated(uint8 regionId);
    event AppearanceCDFUpdated(uint256[3] newCDF);
    event StarCoefficientsUpdated(uint256[3] newCoefficients);
    event BeastHuntCooldownUpdated(uint256 oldValue, uint256 newValue);

    uint256 public beastHuntCooldown;

    constructor(
        address _lingshi,
        address _treasury,
        address _register
    ) ERC721("PikemonBeast", "PKBT") {
        require(_lingshi != address(0), "Beast: zero lingshi");
        require(_treasury != address(0), "Beast: zero treasury");
        require(_register != address(0), "Beast: zero register");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _nextTokenId = 1;
        beastHuntCooldown = Constants.BEAST_HUNT_COOLDOWN;

        // 6 个区域: element, resistance, huntFee
        beastRegions[0] = BeastRegion(1, 80, 5 ether);    // 碧翠原野, 木
        beastRegions[1] = BeastRegion(2, 120, 5 ether);   // 临海港口, 水
        beastRegions[2] = BeastRegion(3, 150, 8 ether);   // 火焰岛屿, 火
        beastRegions[3] = BeastRegion(2, 250, 8 ether);   // 冰封高峰, 水
        beastRegions[4] = BeastRegion(0, 400, 12 ether);  // 雷霆废墟, 金
        beastRegions[5] = BeastRegion(1, 500, 12 ether);  // 幽影密林, 木

        // 出现概率 CDF: 70% none, 22% 1-star, 8% 2-star
        appearanceCDF = [uint256(7000), 9200, 10000];

        // 星级系数: _=0, 1星=×1.0, 2星=×3.0
        starCoefficients = [uint256(0), Constants.STAR1_COEFFICIENT, Constants.STAR2_COEFFICIENT];

        // 初始化灵兽图鉴
        _initSpeciesPool();
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setBeastRegion(
        uint8 regionId,
        uint8 element,
        uint256 resistance,
        uint256 huntFee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(regionId < REGION_COUNT, "Beast: invalid region");
        require(element < Constants.ELEMENT_COUNT, "Beast: invalid element");
        beastRegions[regionId] = BeastRegion(element, resistance, huntFee);
        emit BeastRegionUpdated(regionId);
    }

    function setAppearanceCDF(uint256[3] calldata newCDF) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newCDF[2] == 10000, "Beast: CDF must end at 10000");
        for (uint8 i = 1; i < 3; i++) {
            require(newCDF[i] >= newCDF[i - 1], "Beast: CDF not monotonic");
        }
        appearanceCDF = newCDF;
        emit AppearanceCDFUpdated(newCDF);
    }

    function setStarCoefficients(uint256[3] calldata newCoefficients) external onlyRole(DEFAULT_ADMIN_ROLE) {
        starCoefficients = newCoefficients;
        emit StarCoefficientsUpdated(newCoefficients);
    }

    function setBeastHuntCooldown(uint256 newCooldown) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newCooldown <= 24 hours, "Beast: cooldown too large");
        uint256 old = beastHuntCooldown;
        beastHuntCooldown = newCooldown;
        emit BeastHuntCooldownUpdated(old, newCooldown);
    }

    // ── 猎捕流程 (block-delay 两步) ──

    /// @notice TX1: 开始灵兽猎捕（扣费，记录区块）
    function startBeastHunt(uint8 regionId) external {
        require(register.isRegistered(msg.sender), "Beast: not registered");
        require(regionId < REGION_COUNT, "Beast: invalid region");
        require(!huntIntents[msg.sender].pending, "Beast: hunt pending");
        require(
            block.timestamp >= lastBeastHuntTime[msg.sender] + beastHuntCooldown,
            "Beast: cooldown active"
        );

        BeastRegion memory region = beastRegions[regionId];

        // 扣猎捕费用
        require(
            lingshi.balanceOf(msg.sender) >= region.huntFee,
            "Beast: insufficient LS"
        );
        lingshi.transferFrom(msg.sender, address(this), region.huntFee);
        lingshi.approve(address(treasury), region.huntFee);
        treasury.collectFee(address(this), region.huntFee);

        huntIntents[msg.sender] = BeastHuntIntent({
            regionId: regionId,
            blockNumber: block.number,
            pending: true
        });

        emit BeastHuntStarted(msg.sender, regionId, block.number);
    }

    /// @notice TX2: 完成灵兽猎捕（block-delay 随机确定是否出现 + 星级 + 直接链上捕获判定）
    function finishBeastHunt() external {
        BeastHuntIntent storage intent = huntIntents[msg.sender];
        require(intent.pending, "Beast: no pending hunt");
        require(block.number > intent.blockNumber, "Beast: same block");

        uint256 rand = RandomLib.randomFromBlockhash(
            intent.blockNumber,
            msg.sender,
            _nonce
        );
        _nonce++;

        uint8 regionId = intent.regionId;
        BeastRegion memory region = beastRegions[regionId];

        // 确定是否出现灵兽 & 星级
        uint256 roll = rand % 10000;
        uint8 star = 0;
        if (roll >= appearanceCDF[0] && roll < appearanceCDF[1]) {
            star = 1;
        } else if (roll >= appearanceCDF[1]) {
            star = 2;
        }

        intent.pending = false;
        lastBeastHuntTime[msg.sender] = block.timestamp;

        if (star == 0) {
            // 未出现灵兽
            emit BeastHuntFinished(msg.sender, regionId, 0, false, 0);
            return;
        }

        // 灵兽出现！直接链上感知力校验
        Register.Cultivator memory c = register.getCultivator(msg.sender);
        uint256 captureThreshold = (region.resistance * starCoefficients[star]) / Constants.BP;

        if (c.perception < captureThreshold) {
            // 感知力不足，捕获失败
            emit BeastHuntFinished(msg.sender, regionId, star, false, 0);
            return;
        }

        // 捕获成功：mint 灵兽
        uint16 powerRate = _randomPowerRate(star, rand);
        powerRate = _applyElementAffinity(powerRate, region.element, c.element);
        uint8 speciesId = _pickSpecies(regionId, star, rand);

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _beastData[tokenId] = BeastInfo({
            star: star,
            element: region.element,
            powerRate: powerRate,
            level: 1,
            speciesId: speciesId
        });

        emit BeastMinted(msg.sender, tokenId, star, region.element, powerRate, speciesId);
        emit BeastHuntFinished(msg.sender, regionId, star, true, tokenId);
    }

    // ── Mint (游戏合约调用) ──

    /// @notice 直接铸造灵兽（仅游戏合约）
    function mint(
        address to,
        uint8 star,
        uint8 element,
        uint16 powerRate,
        uint8 speciesId
    ) external onlyRole(GAME_CONTRACT_ROLE) returns (uint256) {
        require(to != address(0), "Beast: mint to zero");
        require(star >= 1 && star <= Constants.MAX_BEAST_STAR_MVP, "Beast: invalid star");
        require(element < Constants.ELEMENT_COUNT, "Beast: invalid element");
        require(speciesId < Constants.BEAST_SPECIES_COUNT, "Beast: invalid species");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        _beastData[tokenId] = BeastInfo({
            star: star,
            element: element,
            powerRate: powerRate,
            level: 1,
            speciesId: speciesId
        });

        emit BeastMinted(to, tokenId, star, element, powerRate, speciesId);
        return tokenId;
    }

    // ── Equip / Unequip ──

    /// @notice 装备灵兽（每人只能装备 1 只）
    function equipBeast(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Beast: not owner");
        require(register.isRegistered(msg.sender), "Beast: not registered");

        // 卸下当前灵兽（如有）
        uint256 current = _equippedBeast[msg.sender];
        if (current != 0) {
            emit BeastUnequipped(msg.sender, current);
        }

        _equippedBeast[msg.sender] = tokenId;
        emit BeastEquipped(msg.sender, tokenId);
    }

    /// @notice 卸下灵兽
    function unequipBeast() external {
        uint256 tokenId = _equippedBeast[msg.sender];
        require(tokenId != 0, "Beast: no beast equipped");

        _equippedBeast[msg.sender] = 0;
        emit BeastUnequipped(msg.sender, tokenId);
    }

    // ── View 函数 ──

    function getBeastInfo(uint256 tokenId) external view override returns (BeastInfo memory) {
        return _beastData[tokenId];
    }

    function getEquippedBeast(address player) external view override returns (uint256) {
        return _equippedBeast[player];
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function getHuntIntent(address player) external view returns (BeastHuntIntent memory) {
        return huntIntents[player];
    }

    // ── 内部函数 ──

    /// @dev 根据星级生成随机 powerRate
    function _randomPowerRate(uint8 star, uint256 seed) internal pure returns (uint16) {
        uint16 minRate;
        uint16 maxRate;

        if (star == 1) {
            minRate = Constants.STAR1_POWER_MIN;
            maxRate = Constants.STAR1_POWER_MAX;
        } else {
            minRate = Constants.STAR2_POWER_MIN;
            maxRate = Constants.STAR2_POWER_MAX;
        }

        uint256 range = uint256(maxRate - minRate) + 1;
        return minRate + uint16((seed >> 128) % range);
    }

    /// @dev 应用元素亲和加成
    function _applyElementAffinity(uint16 powerRate, uint8 beastElement, uint8 ownerElement)
        internal
        pure
        returns (uint16)
    {
        if (beastElement == ownerElement) {
            return powerRate + Constants.SAME_ELEMENT_BONUS;
        }
        // 相生: (attacker + 2) % 5 == defender → 金→水→木→火→土→金
        if ((ownerElement + 2) % 5 == beastElement || (beastElement + 2) % 5 == ownerElement) {
            return powerRate + Constants.GENERATION_ELEMENT_BONUS;
        }
        return powerRate;
    }

    /// @notice 查询物种池
    function getSpeciesPool(uint8 regionId, uint8 starIndex) external view returns (uint8[] memory) {
        return _speciesPool[regionId][starIndex];
    }

    // ── 灵兽图鉴初始化 ──

    /// @dev 初始化 18 种灵兽物种池和名称
    function _initSpeciesPool() internal {
        // 碧翠原野(0): 1星 → [0,1], 2星 → [2]
        _speciesPool[0][0].push(0);
        _speciesPool[0][0].push(1);
        _speciesPool[0][1].push(2);
        // 临海港口(1): 1星 → [3,4], 2星 → [5]
        _speciesPool[1][0].push(3);
        _speciesPool[1][0].push(4);
        _speciesPool[1][1].push(5);
        // 火焰岛屿(2): 1星 → [6,7], 2星 → [8]
        _speciesPool[2][0].push(6);
        _speciesPool[2][0].push(7);
        _speciesPool[2][1].push(8);
        // 冰封高峰(3): 1星 → [9,10], 2星 → [11]
        _speciesPool[3][0].push(9);
        _speciesPool[3][0].push(10);
        _speciesPool[3][1].push(11);
        // 雷霆废墟(4): 1星 → [12,13], 2星 → [14]
        _speciesPool[4][0].push(12);
        _speciesPool[4][0].push(13);
        _speciesPool[4][1].push(14);
        // 幽影密林(5): 1星 → [15,16], 2星 → [17]
        _speciesPool[5][0].push(15);
        _speciesPool[5][0].push(16);
        _speciesPool[5][1].push(17);

        // 物种名称
        speciesNames[0]  = unicode"翠叶鼠";
        speciesNames[1]  = unicode"藤蔓蛇";
        speciesNames[2]  = unicode"碧角麋鹿";
        speciesNames[3]  = unicode"潮汐蟹";
        speciesNames[4]  = unicode"泡沫鱼";
        speciesNames[5]  = unicode"玄冰蟾";
        speciesNames[6]  = unicode"赤焰狐";
        speciesNames[7]  = unicode"熔岩蜥";
        speciesNames[8]  = unicode"炎翎鹰";
        speciesNames[9]  = unicode"霜鳞鱼";
        speciesNames[10] = unicode"冰晶蝶";
        speciesNames[11] = unicode"寒潭蛟";
        speciesNames[12] = unicode"铁甲鼠";
        speciesNames[13] = unicode"金翅鸦";
        speciesNames[14] = unicode"雷鬃狮";
        speciesNames[15] = unicode"暗苔蛙";
        speciesNames[16] = unicode"影叶蛾";
        speciesNames[17] = unicode"古藤猿";
    }

    /// @dev 从物种池中随机抽取物种
    function _pickSpecies(uint8 regionId, uint8 star, uint256 seed)
        internal
        view
        returns (uint8)
    {
        uint8 starIndex = star - 1; // 1星→0, 2星→1
        uint8[] storage pool = _speciesPool[regionId][starIndex];
        uint256 idx = (seed >> 64) % pool.length;
        return pool[idx];
    }

    // ── 接口兼容 ──

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
