// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IEquipment.sol";
import "./Register.sol";
import "./libraries/Constants.sol";
import "./libraries/RandomLib.sol";

/// @title Equipment — ERC-721 装备 NFT（法宝 + 护宝）
/// @notice MVP: mint / equip / unequip / enhance(+1~+5) / upgrade(block-delay) / decompose
contract Equipment is ERC721, AccessControl, IEquipment {
    bytes32 public constant GAME_CONTRACT_ROLE = keccak256("GAME_CONTRACT_ROLE");

    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    Register public immutable register;

    uint256 private _nextTokenId;
    uint256 private _nonce;

    // ── 装备数据 ──
    mapping(uint256 => EquipmentData) private _equipmentData;

    // ── 装备槽: player → equipType → tokenId (0 = 无) ──
    mapping(address => mapping(EquipmentType => uint256)) private _equipped;

    // ── 灵材余额 ──
    mapping(address => uint256) private _spiritMaterials;

    // ── 强化费用 (LS) ──
    uint256[5] public enhanceCosts;

    // ── 升品配置 ──
    uint8[3] public upgradeMaterialCount;     // 每级需要的材料数: [3, 3, 3]
    uint256[3] public upgradeLSCost;          // 灵石费用: [50, 200, 800]
    uint256[3] public upgradeSuccessRate;     // 成功率 (BP): [7000, 5500, 4000]
    uint256[3] public upgradeFailReturn;      // 失败返还灵材: [1, 4, 9]

    // ── 分解回收 ──
    uint256[4] public decomposeMaterials;     // 灵材: [2, 6, 15, 40]
    uint256[4] public decomposeLSRefund;      // LS: [1, 3, 10, 30]

    // ── 境界锁定 ──
    uint8[4] public qualityRealmReq;          // [0, 0, 1, 2] (WHITE/GREEN 无限制)

    // ── 升品意图 (block-delay) ──
    struct UpgradeIntent {
        Quality targetQuality;
        EquipmentType targetType;
        uint256 blockNumber;
        bool pending;
    }
    mapping(address => UpgradeIntent) public upgradeIntents;

    // ── Events ──
    event EquipmentMinted(
        address indexed to,
        uint256 indexed tokenId,
        EquipmentType eType,
        Quality quality,
        uint16 bonusBP,
        uint8 elementAffinity,
        uint8 originAffinity,
        uint8 factionAffinity
    );
    event EquipmentEquipped(address indexed player, EquipmentType slot, uint256 tokenId);
    event EquipmentUnequipped(address indexed player, EquipmentType slot, uint256 tokenId);
    event EquipmentEnhanced(uint256 indexed tokenId, uint8 newLevel, uint256 cost);
    event UpgradeStarted(address indexed player, Quality targetQuality, uint256 blockNumber);
    event UpgradeFinished(
        address indexed player,
        uint256 newTokenId,
        Quality quality,
        bool success
    );
    event EquipmentDecomposed(
        uint256 indexed tokenId,
        uint256 spiritMaterials,
        uint256 lsRefund
    );
    event EnhanceCostsUpdated(uint256[5] newCosts);
    event UpgradeMaterialCountUpdated(uint8[3] newCounts);
    event UpgradeLSCostUpdated(uint256[3] newCosts);
    event UpgradeSuccessRateUpdated(uint256[3] newRates);
    event UpgradeFailReturnUpdated(uint256[3] newReturns);
    event DecomposeMaterialsUpdated(uint256[4] newMaterials);
    event DecomposeLSRefundUpdated(uint256[4] newRefunds);
    event QualityRealmReqUpdated(uint8[4] newReqs);
    event MaterialsChanged(address indexed player, uint256 newBalance, int256 delta);

    constructor(
        address _lingshi,
        address _treasury,
        address _register
    ) ERC721("PikemonEquipment", "PKEQ") {
        require(_lingshi != address(0), "Equipment: zero lingshi");
        require(_treasury != address(0), "Equipment: zero treasury");
        require(_register != address(0), "Equipment: zero register");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        register = Register(_register);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // tokenId 从 1 开始（0 表示无装备）
        _nextTokenId = 1;

        // 强化费用: +1=20, +2=50, +3=100, +4=150, +5=300
        enhanceCosts[0] = 20 ether;
        enhanceCosts[1] = 50 ether;
        enhanceCosts[2] = 100 ether;
        enhanceCosts[3] = 150 ether;
        enhanceCosts[4] = 300 ether;

        // 升品配置: W→G, G→B, B→P
        upgradeMaterialCount = [3, 3, 3];
        upgradeLSCost = [uint256(50 ether), 200 ether, 800 ether];
        upgradeSuccessRate = [uint256(7000), 5500, 4000];
        upgradeFailReturn = [uint256(1), 4, 9];

        // 分解回收: WHITE, GREEN, BLUE, PURPLE
        decomposeMaterials = [uint256(2), 6, 15, 40];
        decomposeLSRefund = [uint256(1 ether), 3 ether, 10 ether, 30 ether];

        // 境界锁定: WHITE=0, GREEN=0, BLUE=1(筑基), PURPLE=2(金丹)
        qualityRealmReq = [0, 0, 1, 2];
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setEnhanceCosts(uint256[5] calldata newCosts) external onlyRole(DEFAULT_ADMIN_ROLE) {
        enhanceCosts = newCosts;
        emit EnhanceCostsUpdated(newCosts);
    }

    function setUpgradeMaterialCount(uint8[3] calldata newCounts) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint8 i = 0; i < 3; i++) {
            require(newCounts[i] > 0, "Equipment: zero material count");
        }
        upgradeMaterialCount = newCounts;
        emit UpgradeMaterialCountUpdated(newCounts);
    }

    function setUpgradeLSCost(uint256[3] calldata newCosts) external onlyRole(DEFAULT_ADMIN_ROLE) {
        upgradeLSCost = newCosts;
        emit UpgradeLSCostUpdated(newCosts);
    }

    function setUpgradeSuccessRate(uint256[3] calldata newRates) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint8 i = 0; i < 3; i++) {
            require(newRates[i] <= Constants.BP, "Equipment: rate > 100%");
        }
        upgradeSuccessRate = newRates;
        emit UpgradeSuccessRateUpdated(newRates);
    }

    function setUpgradeFailReturn(uint256[3] calldata newReturns) external onlyRole(DEFAULT_ADMIN_ROLE) {
        upgradeFailReturn = newReturns;
        emit UpgradeFailReturnUpdated(newReturns);
    }

    function setDecomposeMaterials(uint256[4] calldata newMaterials) external onlyRole(DEFAULT_ADMIN_ROLE) {
        decomposeMaterials = newMaterials;
        emit DecomposeMaterialsUpdated(newMaterials);
    }

    function setDecomposeLSRefund(uint256[4] calldata newRefunds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        decomposeLSRefund = newRefunds;
        emit DecomposeLSRefundUpdated(newRefunds);
    }

    function setQualityRealmReq(uint8[4] calldata newReqs) external onlyRole(DEFAULT_ADMIN_ROLE) {
        qualityRealmReq = newReqs;
        emit QualityRealmReqUpdated(newReqs);
    }

    // ── Mint ──

    /// @notice 铸造装备（仅游戏合约可调用）
    function mint(
        address to,
        EquipmentType eType,
        Quality quality,
        uint16 bonusBP,
        uint8 elemAff,
        uint8 origAff,
        uint8 factAff
    ) external onlyRole(GAME_CONTRACT_ROLE) returns (uint256) {
        require(to != address(0), "Equipment: mint to zero");
        _validateBonusBP(quality, bonusBP);

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        _equipmentData[tokenId] = EquipmentData({
            eType: eType,
            quality: quality,
            bonusBP: bonusBP,
            enhanceLevel: 0,
            elementAffinity: elemAff,
            originAffinity: origAff,
            factionAffinity: factAff
        });

        emit EquipmentMinted(to, tokenId, eType, quality, bonusBP, elemAff, origAff, factAff);
        return tokenId;
    }

    // ── Equip / Unequip ──

    /// @notice 装备到对应槽位
    function equip(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Equipment: not owner");
        require(register.isRegistered(msg.sender), "Equipment: not registered");

        EquipmentData memory data = _equipmentData[tokenId];
        Register.Cultivator memory c = register.getCultivator(msg.sender);

        // 境界检查
        require(
            c.realm >= qualityRealmReq[uint8(data.quality)],
            "Equipment: realm too low"
        );

        EquipmentType slot = data.eType;

        // 卸下当前装备（如果有）
        uint256 currentEquipped = _equipped[msg.sender][slot];
        if (currentEquipped != 0) {
            emit EquipmentUnequipped(msg.sender, slot, currentEquipped);
        }

        _equipped[msg.sender][slot] = tokenId;
        emit EquipmentEquipped(msg.sender, slot, tokenId);
    }

    /// @notice 卸下指定槽位装备
    function unequip(EquipmentType slot) external {
        uint256 tokenId = _equipped[msg.sender][slot];
        require(tokenId != 0, "Equipment: slot empty");

        _equipped[msg.sender][slot] = 0;
        emit EquipmentUnequipped(msg.sender, slot, tokenId);
    }

    // ── Enhance (强化) ──

    /// @notice 强化装备 (+1~+5, MVP 100% 成功)
    function enhance(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Equipment: not owner");

        EquipmentData storage data = _equipmentData[tokenId];
        require(
            data.enhanceLevel < Constants.MAX_ENHANCE_LEVEL,
            "Equipment: max enhance"
        );

        uint256 cost = enhanceCosts[data.enhanceLevel];

        // 扣 LS
        lingshi.transferFrom(msg.sender, address(this), cost);
        lingshi.approve(address(treasury), cost);
        treasury.collectFee(address(this), cost);

        data.enhanceLevel += 1;
        emit EquipmentEnhanced(tokenId, data.enhanceLevel, cost);
    }

    // ── Upgrade (升品, block-delay 两步) ──

    /// @notice TX1: 提交升品意图，烧毁材料装备 + 扣 LS
    function startUpgrade(uint256[] calldata materialIds) external {
        require(register.isRegistered(msg.sender), "Equipment: not registered");
        require(!upgradeIntents[msg.sender].pending, "Equipment: upgrade pending");

        // 验证材料数量和品质
        require(materialIds.length >= 3, "Equipment: need 3 materials");

        EquipmentData memory firstMat = _equipmentData[materialIds[0]];
        uint8 qualityIdx = uint8(firstMat.quality);
        require(qualityIdx < 3, "Equipment: max quality for upgrade");

        uint8 required = upgradeMaterialCount[qualityIdx];
        require(materialIds.length == required, "Equipment: wrong material count");

        EquipmentType targetType = firstMat.eType;

        // 验证所有材料品质相同、类型相同、属于 caller、未装备
        for (uint256 i = 0; i < materialIds.length; i++) {
            uint256 matId = materialIds[i];
            require(ownerOf(matId) == msg.sender, "Equipment: not owner of material");
            require(!_isEquipped(msg.sender, matId), "Equipment: material equipped");

            EquipmentData memory matData = _equipmentData[matId];
            require(matData.quality == firstMat.quality, "Equipment: quality mismatch");
            require(matData.eType == targetType, "Equipment: type mismatch");
        }

        // 扣 LS
        uint256 lsCost = upgradeLSCost[qualityIdx];
        lingshi.transferFrom(msg.sender, address(this), lsCost);
        lingshi.approve(address(treasury), lsCost);
        treasury.collectFee(address(this), lsCost);

        // 烧毁材料 NFT
        for (uint256 i = 0; i < materialIds.length; i++) {
            _burn(materialIds[i]);
            delete _equipmentData[materialIds[i]];
        }

        upgradeIntents[msg.sender] = UpgradeIntent({
            targetQuality: Quality(qualityIdx + 1),
            targetType: targetType,
            blockNumber: block.number,
            pending: true
        });

        emit UpgradeStarted(
            msg.sender,
            Quality(qualityIdx + 1),
            block.number
        );
    }

    /// @notice TX2: 完成升品（block-delay 随机）
    function finishUpgrade() external {
        UpgradeIntent storage intent = upgradeIntents[msg.sender];
        require(intent.pending, "Equipment: no pending upgrade");
        require(block.number > intent.blockNumber, "Equipment: same block");

        uint256 rand = RandomLib.randomFromBlockhash(
            intent.blockNumber,
            msg.sender,
            _nonce
        );
        _nonce++;

        uint8 qualityIdx = uint8(intent.targetQuality) - 1; // 原品质 index
        uint256 roll = rand % Constants.BP;
        bool success = roll < upgradeSuccessRate[qualityIdx];

        uint256 newTokenId = 0;
        if (success) {
            // 成功：mint 新装备
            uint16 bonusBP = _randomBonusBP(intent.targetQuality, rand);
            newTokenId = _nextTokenId++;
            _safeMint(msg.sender, newTokenId);
            _equipmentData[newTokenId] = EquipmentData({
                eType: intent.targetType,
                quality: intent.targetQuality,
                bonusBP: bonusBP,
                enhanceLevel: 0,
                elementAffinity: 0,
                originAffinity: 0,
                factionAffinity: 0
            });

            emit EquipmentMinted(
                msg.sender,
                newTokenId,
                intent.targetType,
                intent.targetQuality,
                bonusBP,
                0,
                0,
                0
            );
        } else {
            // 失败：返还灵材
            uint256 matReturn = upgradeFailReturn[qualityIdx];
            _spiritMaterials[msg.sender] += matReturn;
            emit MaterialsChanged(msg.sender, _spiritMaterials[msg.sender], int256(matReturn));
        }

        intent.pending = false;
        emit UpgradeFinished(msg.sender, newTokenId, intent.targetQuality, success);
    }

    // ── Decompose (分解) ──

    /// @notice 分解装备，返还灵材 + LS
    function decompose(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Equipment: not owner");
        require(!_isEquipped(msg.sender, tokenId), "Equipment: unequip first");

        EquipmentData memory data = _equipmentData[tokenId];
        uint8 qualityIdx = uint8(data.quality);

        uint256 matReturn = decomposeMaterials[qualityIdx];
        uint256 lsReturn = decomposeLSRefund[qualityIdx];

        // 强化加成: +N → +N×2 额外灵材
        matReturn += uint256(data.enhanceLevel) * 2;

        // 亲和加成: 每个亲和 +1 灵材
        if (data.elementAffinity != 0) matReturn += 1;
        if (data.originAffinity != 0) matReturn += 1;
        if (data.factionAffinity != 0) matReturn += 1;

        // 烧毁 NFT
        _burn(tokenId);
        delete _equipmentData[tokenId];

        // 返还灵材
        _spiritMaterials[msg.sender] += matReturn;
        emit MaterialsChanged(msg.sender, _spiritMaterials[msg.sender], int256(matReturn));

        // 返还 LS（通过 mint）
        if (lsReturn > 0) {
            lingshi.mint(msg.sender, lsReturn);
        }

        emit EquipmentDecomposed(tokenId, matReturn, lsReturn);
    }

    // ── View 函数 ──

    /// @notice 查询装备数据
    function getEquipmentData(uint256 tokenId) external view override returns (EquipmentData memory) {
        return _equipmentData[tokenId];
    }

    /// @notice 查询装备槽
    function getEquipped(address player, EquipmentType slot) external view override returns (uint256) {
        return _equipped[player][slot];
    }

    /// @notice 查询灵材余额
    function getSpiritMaterials(address player) external view override returns (uint256) {
        return _spiritMaterials[player];
    }

    /// @notice 消耗灵材（授权合约调用，如 Alchemy）
    function consumeMaterials(address player, uint256 amount) external override onlyRole(GAME_CONTRACT_ROLE) {
        require(_spiritMaterials[player] >= amount, "Equipment: insufficient materials");
        _spiritMaterials[player] -= amount;
        emit MaterialsChanged(player, _spiritMaterials[player], -int256(amount));
    }

    /// @notice 增加灵材（授权合约调用，如打野掉落）
    function addMaterials(address player, uint256 amount) external override onlyRole(GAME_CONTRACT_ROLE) {
        _spiritMaterials[player] += amount;
        emit MaterialsChanged(player, _spiritMaterials[player], int256(amount));
    }

    /// @notice 查询下一个 tokenId
    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    // ── 内部函数 ──

    /// @dev 检查 tokenId 是否已装备
    function _isEquipped(address player, uint256 tokenId) internal view returns (bool) {
        return _equipped[player][EquipmentType.WEAPON] == tokenId ||
               _equipped[player][EquipmentType.ARMOR] == tokenId;
    }

    /// @dev 根据品质生成随机 bonusBP
    function _randomBonusBP(Quality quality, uint256 seed) internal pure returns (uint16) {
        uint16 minBP;
        uint16 maxBP;

        if (quality == Quality.WHITE) {
            minBP = Constants.WHITE_BONUS_MIN;
            maxBP = Constants.WHITE_BONUS_MAX;
        } else if (quality == Quality.GREEN) {
            minBP = Constants.GREEN_BONUS_MIN;
            maxBP = Constants.GREEN_BONUS_MAX;
        } else if (quality == Quality.BLUE) {
            minBP = Constants.BLUE_BONUS_MIN;
            maxBP = Constants.BLUE_BONUS_MAX;
        } else {
            minBP = Constants.PURPLE_BONUS_MIN;
            maxBP = Constants.PURPLE_BONUS_MAX;
        }

        uint256 range = uint256(maxBP - minBP) + 1;
        return minBP + uint16((seed >> 128) % range);
    }

    /// @dev 验证 bonusBP 在品质范围内
    function _validateBonusBP(Quality quality, uint16 bonusBP) internal pure {
        uint16 minBP;
        uint16 maxBP;

        if (quality == Quality.WHITE) {
            minBP = Constants.WHITE_BONUS_MIN;
            maxBP = Constants.WHITE_BONUS_MAX;
        } else if (quality == Quality.GREEN) {
            minBP = Constants.GREEN_BONUS_MIN;
            maxBP = Constants.GREEN_BONUS_MAX;
        } else if (quality == Quality.BLUE) {
            minBP = Constants.BLUE_BONUS_MIN;
            maxBP = Constants.BLUE_BONUS_MAX;
        } else {
            minBP = Constants.PURPLE_BONUS_MIN;
            maxBP = Constants.PURPLE_BONUS_MAX;
        }

        require(bonusBP >= minBP && bonusBP <= maxBP, "Equipment: bonusBP out of range");
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
