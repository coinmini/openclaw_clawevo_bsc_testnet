// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IPill.sol";
import "./interfaces/ICaveHeaven.sol";
import "./Register.sol";
import "./libraries/Constants.sol";

/// @title CaveHeaven — 洞天系统（修炼加速 + 道心/气运加成）
/// @notice 三阶: None → CaveHeaven(×1.2) → BlessedLand(×1.4) → SpiritLand(×1.6)
contract CaveHeaven is ICaveHeaven {
    ILingShi public immutable lingshi;
    ITreasury public immutable treasury;
    IPill public immutable pill;
    Register public immutable register;
    address public owner;

    // ── 洞天数据 ──
    mapping(address => CaveInfo) private _caves;

    // ── 授权合约（可调用 addCultivationHours）──
    mapping(address => bool) public authorizedCallers;

    // ── 灵药园（灵地阶解锁）──
    mapping(address => uint256) public lastHarvestTime;
    uint256 public harvestCooldown;     // 收获间隔（秒）
    uint256 public harvestRarePillBP;   // 收获聚灵丹概率 (BP), 其余为培元丹
    uint8 public harvestMinTier;        // 最低阶层要求 (default: 3 = SpiritLand)

    // ── 阶层参数 ──
    uint256[4] public tierCosts;          // [0, 500e18, 2000e18, 8000e18]
    uint256[4] public tierMultipliers;    // [100, 120, 140, 160]
    uint256[4] public maintenanceFees;    // [0, 5e18, 20e18, 100e18]
    uint256[4] public daoXinBonuses;      // [0, 0, 100, 200]
    uint8[4] public tierRealmReqs;        // [0, 2, 3, 4]

    // ── Events ──
    event CaveOpened(address indexed player, uint256 cost);
    event CaveUpgraded(address indexed player, Tier newTier, uint256 cost);
    event MaintenancePaid(address indexed player, uint256 days_, uint256 totalCost);
    event CaveDowngraded(address indexed player, Tier newTier);
    event CallerAuthorized(address indexed caller, bool authorized);
    event PillHarvested(address indexed player, uint8 pillType);
    event HarvestCooldownUpdated(uint256 oldValue, uint256 newValue);
    event HarvestRarePillBPUpdated(uint256 oldValue, uint256 newValue);
    event HarvestMinTierUpdated(uint8 oldValue, uint8 newValue);

    modifier onlyOwner() {
        require(msg.sender == owner, "CaveHeaven: not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "CaveHeaven: unauthorized");
        _;
    }

    constructor(
        address _lingshi,
        address _treasury,
        address _register,
        address _pill
    ) {
        require(_lingshi != address(0), "CaveHeaven: zero lingshi");
        require(_treasury != address(0), "CaveHeaven: zero treasury");
        require(_register != address(0), "CaveHeaven: zero register");
        require(_pill != address(0), "CaveHeaven: zero pill");

        lingshi = ILingShi(_lingshi);
        treasury = ITreasury(_treasury);
        pill = IPill(_pill);
        register = Register(_register);
        owner = msg.sender;

        // 阶层费用: None=0, CaveHeaven=500, BlessedLand=2000, SpiritLand=8000
        tierCosts = [uint256(0), 500 ether, 2000 ether, 8000 ether];

        // 修炼倍率: ×1.0, ×1.2, ×1.4, ×1.6
        tierMultipliers = [uint256(100), 120, 140, 160];

        // 每日维护费: 0, 5, 20, 100
        maintenanceFees = [uint256(0), 5 ether, 20 ether, 100 ether];

        // 道心加成: 0, 0, +1%, +2% (单位 0.01%)
        daoXinBonuses = [uint256(0), 0, 100, 200];

        // 境界要求: None=0, CaveHeaven=金丹(2), BlessedLand=元婴(3), SpiritLand=化神(4)
        tierRealmReqs = [0, 2, 3, 4];

        // 灵药园: 24h 冷却, 20% 聚灵丹 / 80% 培元丹, 灵地(SpiritLand)解锁
        harvestCooldown = 24 hours;
        harvestRarePillBP = 2000;
        harvestMinTier = 3;
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    event TierCostsUpdated(uint256[4] newCosts);
    event TierMultipliersUpdated(uint256[4] newMultipliers);
    event MaintenanceFeesUpdated(uint256[4] newFees);
    event DaoXinBonusesUpdated(uint256[4] newBonuses);
    event TierRealmReqsUpdated(uint8[4] newReqs);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function setTierCosts(uint256[4] calldata newCosts) external onlyOwner {
        tierCosts = newCosts;
        emit TierCostsUpdated(newCosts);
    }

    function setTierMultipliers(uint256[4] calldata newMultipliers) external onlyOwner {
        for (uint8 i = 0; i < 4; i++) {
            require(newMultipliers[i] >= 100, "CaveHeaven: multiplier < 1x");
        }
        tierMultipliers = newMultipliers;
        emit TierMultipliersUpdated(newMultipliers);
    }

    function setMaintenanceFees(uint256[4] calldata newFees) external onlyOwner {
        maintenanceFees = newFees;
        emit MaintenanceFeesUpdated(newFees);
    }

    function setDaoXinBonuses(uint256[4] calldata newBonuses) external onlyOwner {
        daoXinBonuses = newBonuses;
        emit DaoXinBonusesUpdated(newBonuses);
    }

    function setTierRealmReqs(uint8[4] calldata newReqs) external onlyOwner {
        tierRealmReqs = newReqs;
        emit TierRealmReqsUpdated(newReqs);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CaveHeaven: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setHarvestCooldown(uint256 newValue) external onlyOwner {
        require(newValue > 0 && newValue <= 7 days, "CaveHeaven: invalid cooldown");
        uint256 old = harvestCooldown;
        harvestCooldown = newValue;
        emit HarvestCooldownUpdated(old, newValue);
    }

    function setHarvestRarePillBP(uint256 newValue) external onlyOwner {
        require(newValue <= Constants.BP, "CaveHeaven: rate > 100%");
        uint256 old = harvestRarePillBP;
        harvestRarePillBP = newValue;
        emit HarvestRarePillBPUpdated(old, newValue);
    }

    function setHarvestMinTier(uint8 newValue) external onlyOwner {
        require(newValue <= 3, "CaveHeaven: invalid tier");
        uint8 old = harvestMinTier;
        harvestMinTier = newValue;
        emit HarvestMinTierUpdated(old, newValue);
    }

    // ── 开启洞天 ──

    /// @notice 开启洞天（需金丹+）
    function open() external {
        require(register.isRegistered(msg.sender), "CaveHeaven: not registered");
        require(_caves[msg.sender].tier == Tier.None, "CaveHeaven: already opened");

        Register.Cultivator memory c = register.getCultivator(msg.sender);
        require(c.realm >= tierRealmReqs[1], "CaveHeaven: realm too low");

        uint256 cost = tierCosts[1];
        _collectPayment(msg.sender, cost);

        _caves[msg.sender] = CaveInfo({
            tier: Tier.CaveHeaven,
            openedAt: block.timestamp,
            upgradedAt: block.timestamp,
            cultivationHours: 0,
            lastMaintenanceDay: block.timestamp / 86400
        });

        emit CaveOpened(msg.sender, cost);
    }

    // ── 升级洞天 ──

    /// @notice 升级到下一阶
    function upgrade() external {
        CaveInfo storage cave = _caves[msg.sender];
        require(cave.tier != Tier.None, "CaveHeaven: not opened");
        require(uint8(cave.tier) < 3, "CaveHeaven: max tier");

        uint8 nextTierIdx = uint8(cave.tier) + 1;
        Register.Cultivator memory c = register.getCultivator(msg.sender);
        require(c.realm >= tierRealmReqs[nextTierIdx], "CaveHeaven: realm too low");

        // SpiritLand 额外要求: 4000 小时修炼时间
        if (nextTierIdx == 3) {
            require(
                cave.cultivationHours >= Constants.SPIRIT_LAND_HOURS_REQ,
                "CaveHeaven: insufficient hours"
            );
        }

        uint256 cost = tierCosts[nextTierIdx];
        _collectPayment(msg.sender, cost);

        cave.tier = Tier(nextTierIdx);
        cave.upgradedAt = block.timestamp;

        emit CaveUpgraded(msg.sender, Tier(nextTierIdx), cost);
    }

    // ── 缴纳维护费 ──

    /// @notice 缴纳维护费（可预缴多天）
    function payMaintenance(uint256 days_) external {
        require(days_ > 0, "CaveHeaven: zero days");
        CaveInfo storage cave = _caves[msg.sender];
        require(cave.tier != Tier.None, "CaveHeaven: not opened");

        uint256 dailyFee = maintenanceFees[uint8(cave.tier)];
        uint256 totalCost = dailyFee * days_;

        _collectPayment(msg.sender, totalCost);

        cave.lastMaintenanceDay += days_;

        emit MaintenancePaid(msg.sender, days_, totalCost);
    }

    // ── 降级检查 ──

    /// @notice 检查并执行降级（任何人可调用）
    function checkAndDowngrade(address player) external {
        CaveInfo storage cave = _caves[player];
        if (cave.tier == Tier.None) return;

        uint256 currentDay = block.timestamp / 86400;
        if (currentDay <= cave.lastMaintenanceDay) return;

        uint256 overdueDays = currentDay - cave.lastMaintenanceDay;

        if (overdueDays > Constants.CAVE_DOWNGRADE_DAYS) {
            // 自动降级
            uint8 currentTierIdx = uint8(cave.tier);
            if (currentTierIdx > 1) {
                cave.tier = Tier(currentTierIdx - 1);
            } else {
                cave.tier = Tier.None;
            }
            // 重置维护日到当前
            cave.lastMaintenanceDay = currentDay;

            emit CaveDowngraded(player, cave.tier);
        }
    }

    // ── 灵药园收获 ──

    /// @notice 收获丹药（灵地阶+ 每 24h 可收获 1 颗）
    function harvestPill() external {
        CaveInfo memory cave = _caves[msg.sender];
        require(uint8(cave.tier) >= harvestMinTier, "CaveHeaven: tier too low");
        require(
            block.timestamp >= lastHarvestTime[msg.sender] + harvestCooldown,
            "CaveHeaven: harvest cooldown"
        );

        lastHarvestTime[msg.sender] = block.timestamp;

        // 20% 聚灵丹 (pillType=5), 80% 培元丹 (pillType=4)
        uint256 roll = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, block.timestamp))
        ) % Constants.BP;

        uint8 pillType = roll < harvestRarePillBP ? 5 : 4;
        pill.mint(msg.sender, pillType, 1);

        emit PillHarvested(msg.sender, pillType);
    }

    // ── 修炼时间累计 ──

    /// @notice 增加修炼时间（仅授权合约调用）
    function addCultivationHours(address player, uint256 seconds_) external override onlyAuthorized {
        CaveInfo storage cave = _caves[player];
        if (cave.tier == Tier.None) return;

        // 最小 4 小时才计入
        if (seconds_ < Constants.MIN_CAVE_SESSION) return;

        cave.cultivationHours += seconds_;
    }

    // ── View 函数 ──

    /// @notice 查询洞天信息
    function getCaveInfo(address player) external view override returns (CaveInfo memory) {
        return _caves[player];
    }

    /// @notice 获取修炼倍率（考虑逾期减半）
    function getCultivationMultiplier(address player) external view override returns (uint256) {
        CaveInfo memory cave = _caves[player];
        if (cave.tier == Tier.None) return 100;

        uint256 multiplier = tierMultipliers[uint8(cave.tier)];

        // 检查逾期
        uint256 currentDay = block.timestamp / 86400;
        if (currentDay > cave.lastMaintenanceDay) {
            uint256 overdueDays = currentDay - cave.lastMaintenanceDay;
            if (overdueDays > Constants.CAVE_DOWNGRADE_DAYS) {
                // 已过降级线，返回降级后的倍率
                uint8 degradedTier = uint8(cave.tier) > 1 ? uint8(cave.tier) - 1 : 0;
                return tierMultipliers[degradedTier];
            } else if (overdueDays > Constants.CAVE_GRACE_DAYS) {
                // 4-7 天：减半（倍率 - 基础100，减半后再加回）
                // e.g. ×1.4 → bonus=40 → half=20 → ×1.2
                uint256 bonus = multiplier - 100;
                return 100 + bonus / 2;
            }
        }

        return multiplier;
    }

    /// @notice 获取道心加成
    function getDaoXinBonus(address player) external view override returns (uint256) {
        CaveInfo memory cave = _caves[player];
        if (cave.tier == Tier.None) return 0;

        // 逾期超过宽限期则无加成
        uint256 currentDay = block.timestamp / 86400;
        if (currentDay > cave.lastMaintenanceDay) {
            uint256 overdueDays = currentDay - cave.lastMaintenanceDay;
            if (overdueDays > Constants.CAVE_GRACE_DAYS) return 0;
        }

        return daoXinBonuses[uint8(cave.tier)];
    }

    /// @notice 获取逾期天数
    function getOverdueDays(address player) external view returns (uint256) {
        CaveInfo memory cave = _caves[player];
        if (cave.tier == Tier.None) return 0;

        uint256 currentDay = block.timestamp / 86400;
        if (currentDay <= cave.lastMaintenanceDay) return 0;
        return currentDay - cave.lastMaintenanceDay;
    }

    // ── Admin ──

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "CaveHeaven: zero address");
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    // ── 内部函数 ──

    /// @dev 收取费用并通过 Treasury 分配
    function _collectPayment(address payer, uint256 amount) internal {
        if (amount == 0) return;
        lingshi.transferFrom(payer, address(this), amount);
        lingshi.approve(address(treasury), amount);
        treasury.collectFee(address(this), amount);
    }
}
