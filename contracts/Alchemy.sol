// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/IPill.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IEquipment.sol";
import "./Register.sol";

/// @title Alchemy — 炼丹系统
/// @notice 消耗灵石 + 灵材 → 概率产出丹药
contract Alchemy {
    // ── 配方 ──
    struct Recipe {
        uint8 outputPillType;   // 产出丹药类型
        uint256 lsCost;         // 灵石成本
        uint256 materialCount;  // 灵材消耗
        uint256 successRateBP;  // 成功率 (BP, /10000)
        uint8 realmRequired;    // 最低境界要求
    }

    ILingShi public immutable lingshi;
    IPill public immutable pill;
    ITreasury public immutable treasury;
    IEquipment public immutable equipment;
    Register public immutable register;
    address public owner;

    Recipe[8] public recipes;
    uint256 private _nonce;

    // ── Configurable ──
    uint256 public failRefundBP;  // 失败灵石返还比例 (BP)

    // ── Events ──
    event BrewAttempted(
        address indexed player,
        uint8 recipeId,
        bool success,
        uint256 lsCost,
        uint256 materialCost
    );
    event RecipeUpdated(uint8 recipeId, uint256 lsCost, uint256 materialCount, uint256 successRateBP, uint8 realmRequired);
    event FailRefundBPUpdated(uint256 oldValue, uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Alchemy: not owner");
        _;
    }

    constructor(
        address _lingshi,
        address _pill,
        address _treasury,
        address _equipment,
        address _register
    ) {
        require(_lingshi != address(0), "Alchemy: zero lingshi");
        require(_pill != address(0), "Alchemy: zero pill");
        require(_treasury != address(0), "Alchemy: zero treasury");
        require(_equipment != address(0), "Alchemy: zero equipment");
        require(_register != address(0), "Alchemy: zero register");

        lingshi = ILingShi(_lingshi);
        pill = IPill(_pill);
        treasury = ITreasury(_treasury);
        equipment = IEquipment(_equipment);
        register = Register(_register);
        owner = msg.sender;

        failRefundBP = 3000; // 失败返还 30% 灵石

        // ── 初始配方 ──
        // 渡劫丹 (0-3)
        recipes[0] = Recipe({ outputPillType: 0, lsCost: 200 ether,   materialCount: 10,  successRateBP: 8000, realmRequired: 0 }); // 筑基丹
        recipes[1] = Recipe({ outputPillType: 1, lsCost: 1000 ether,  materialCount: 30,  successRateBP: 7000, realmRequired: 1 }); // 结丹丹
        recipes[2] = Recipe({ outputPillType: 2, lsCost: 4000 ether,  materialCount: 80,  successRateBP: 5500, realmRequired: 2 }); // 凝婴丹
        recipes[3] = Recipe({ outputPillType: 3, lsCost: 10000 ether, materialCount: 200, successRateBP: 4000, realmRequired: 3 }); // 化神丹

        // 辅助丹 (4-7)
        recipes[4] = Recipe({ outputPillType: 4, lsCost: 30 ether,  materialCount: 3,  successRateBP: 9000, realmRequired: 0 }); // 培元丹
        recipes[5] = Recipe({ outputPillType: 5, lsCost: 150 ether, materialCount: 10, successRateBP: 7500, realmRequired: 1 }); // 聚灵丹
        recipes[6] = Recipe({ outputPillType: 6, lsCost: 500 ether, materialCount: 25, successRateBP: 6000, realmRequired: 2 }); // 洗髓丹
        recipes[7] = Recipe({ outputPillType: 7, lsCost: 800 ether, materialCount: 40, successRateBP: 5000, realmRequired: 2 }); // 护心丹
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setRecipe(
        uint8 recipeId,
        uint256 lsCost,
        uint256 materialCount,
        uint256 successRateBP,
        uint8 realmRequired
    ) external onlyOwner {
        require(recipeId < 8, "Alchemy: invalid recipe");
        require(successRateBP <= 10000, "Alchemy: rate > 100%");
        require(realmRequired < 5, "Alchemy: invalid realm");

        recipes[recipeId].lsCost = lsCost;
        recipes[recipeId].materialCount = materialCount;
        recipes[recipeId].successRateBP = successRateBP;
        recipes[recipeId].realmRequired = realmRequired;

        emit RecipeUpdated(recipeId, lsCost, materialCount, successRateBP, realmRequired);
    }

    function setFailRefundBP(uint256 newValue) external onlyOwner {
        require(newValue <= 10000, "Alchemy: refund > 100%");
        uint256 old = failRefundBP;
        failRefundBP = newValue;
        emit FailRefundBPUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Alchemy: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ═══════════════════════════════════════════
    //              GAME FUNCTIONS
    // ═══════════════════════════════════════════

    /// @notice 炼丹
    /// @param recipeId 配方编号 (0-7)
    function brew(uint8 recipeId) external {
        require(recipeId < 8, "Alchemy: invalid recipe");
        require(register.isRegistered(msg.sender), "Alchemy: not registered");

        Recipe memory r = recipes[recipeId];

        // 境界检查
        Register.Cultivator memory c = register.getCultivator(msg.sender);
        require(c.realm >= r.realmRequired, "Alchemy: realm too low");

        // 扣灵石
        require(lingshi.balanceOf(msg.sender) >= r.lsCost, "Alchemy: insufficient LS");
        lingshi.transferFrom(msg.sender, address(this), r.lsCost);

        // 扣灵材
        require(
            equipment.getSpiritMaterials(msg.sender) >= r.materialCount,
            "Alchemy: insufficient materials"
        );
        equipment.consumeMaterials(msg.sender, r.materialCount);

        // 随机判定
        uint256 roll = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nonce))
        ) % 10000;
        _nonce++;

        bool success = roll < r.successRateBP;

        if (success) {
            // 灵石走 Treasury 分配
            lingshi.approve(address(treasury), r.lsCost);
            treasury.collectFee(address(this), r.lsCost);

            // 铸造丹药
            pill.mint(msg.sender, r.outputPillType, 1);
        } else {
            // 失败：返还部分灵石，其余走 Treasury
            uint256 refund = (r.lsCost * failRefundBP) / 10000;
            uint256 fee = r.lsCost - refund;

            if (refund > 0) {
                lingshi.transfer(msg.sender, refund);
            }
            if (fee > 0) {
                lingshi.approve(address(treasury), fee);
                treasury.collectFee(address(this), fee);
            }
        }

        emit BrewAttempted(msg.sender, recipeId, success, r.lsCost, r.materialCount);
    }

    /// @notice 查询配方信息
    function getRecipe(uint8 recipeId) external view returns (Recipe memory) {
        require(recipeId < 8, "Alchemy: invalid recipe");
        return recipes[recipeId];
    }
}
