// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/ILingShi.sol";
import "./interfaces/IGameConfig.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IPill.sol";
import "./Register.sol";
import "./libraries/Constants.sol";

/// @title Cultivation — 闭关修炼 + 升重 + 渡劫突破
/// @notice 闭关积累经验 → 升重提升属性 → 9重渡劫突破境界
contract Cultivation {
    // ── 闭关状态 ──
    struct Session {
        uint256 startTime;
        bool active;
    }

    // ── 日产出追踪（UTC 0:00 重置）──
    struct DailyTracker {
        uint256 dayId;         // block.timestamp / 86400
        uint256 hoursUsed;     // 已用小时数（scaled ×1e18 for precision）
    }

    ILingShi public immutable lingshi;
    IGameConfig public immutable gameConfig;
    ITreasury public immutable treasury;
    IPill public immutable pill;
    Register public immutable register;
    address public owner;

    mapping(address => Session) public sessions;
    mapping(address => DailyTracker) public dailyTrackers;

    // ── 境界产出/消耗参数 (LS/hour, scaled ×1e18) ──
    uint256[5] public outputPerHour;  // 灵石产出
    uint256[5] public feePerHour;     // 资源消耗

    // ── 经验参数 ──
    uint256[5] public expPerHour;     // 经验产出 by realm

    // ── 渡劫参数 ──
    uint256[4] public breakthroughBaseRate; // 基础成功率 (BP)
    uint256[4] public tribulationPillCost;  // 渡劫丹药费用

    // ── 升重参数 ──
    uint256[5] public subRealmExpBase; // 每境界 1重→2重 的经验需求
    uint256[5] public subRealmExpStep; // 每重递增经验量
    uint256[5] public attributeStep;   // 每重四维属性步进

    // ── 突破属性跳跃基础值（新境界1重的四维基础） ──
    uint256[5] public realmBaseAttribute; // 每境界1重的基础属性值

    // ── Configurable parameters ──
    uint256 public maxDailyHours;
    uint256 public heartBaseRate;   // 道心 per hour
    uint256 public fortuneBaseRate; // 气运 per hour

    uint256 private _nonce; // 渡劫随机数种子

    // ── Events ──
    event CultivationStarted(address indexed player, uint256 startTime);
    event CultivationEnded(
        address indexed player,
        uint256 duration,
        uint256 effectiveSeconds,
        uint256 lsEarned,
        uint256 lsFee,
        uint256 expGained,
        uint256 heartGained,
        uint256 fortuneGained
    );
    event SubRealmAdvanced(
        address indexed player,
        uint8 realm,
        uint8 fromSubRealm,
        uint8 toSubRealm,
        uint256 expConsumed
    );
    event BreakthroughAttempted(
        address indexed player,
        uint8 fromRealm,
        uint8 toRealm,
        bool success
    );
    event MaxDailyHoursUpdated(uint256 oldValue, uint256 newValue);
    event HeartBaseRateUpdated(uint256 oldValue, uint256 newValue);
    event FortuneBaseRateUpdated(uint256 oldValue, uint256 newValue);
    event OutputPerHourUpdated(uint8 realm, uint256 newValue);
    event FeePerHourUpdated(uint8 realm, uint256 newValue);
    event ExpPerHourUpdated(uint8 realm, uint256 newValue);
    event BreakthroughBaseRateUpdated(uint8 index, uint256 newValue);
    event TribulationPillCostUpdated(uint8 index, uint256 newValue);
    event SubRealmExpBaseUpdated(uint8 realm, uint256 newValue);
    event SubRealmExpStepUpdated(uint8 realm, uint256 newValue);
    event AttributeStepUpdated(uint8 realm, uint256 newValue);
    event RealmBaseAttributeUpdated(uint8 realm, uint256 newValue);
    event ExpPillConsumed(address indexed player, uint8 pillType, uint256 expGained);
    event AttributesReset(address indexed player, uint256 addAtk, uint256 addDef, uint256 addPer, uint256 addWis);
    event ExpPillLowUpdated(uint256 oldValue, uint256 newValue);
    event ExpPillHighUpdated(uint256 oldValue, uint256 newValue);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Cultivation: not owner");
        _;
    }

    // ── 经验丹参数 ──
    uint256 public expPillLow;   // 培元丹经验值
    uint256 public expPillHigh;  // 聚灵丹经验值

    constructor(
        address _lingshi,
        address _gameConfig,
        address _treasury,
        address _pill,
        address _register
    ) {
        require(_lingshi != address(0), "Cultivation: zero lingshi");
        require(_gameConfig != address(0), "Cultivation: zero config");
        require(_treasury != address(0), "Cultivation: zero treasury");
        require(_pill != address(0), "Cultivation: zero pill");
        require(_register != address(0), "Cultivation: zero register");

        lingshi = ILingShi(_lingshi);
        gameConfig = IGameConfig(_gameConfig);
        treasury = ITreasury(_treasury);
        pill = IPill(_pill);
        register = Register(_register);
        owner = msg.sender;

        expPillLow = 50;   // 培元丹 +50 经验
        expPillHigh = 200; // 聚灵丹 +200 经验

        maxDailyHours = 16;
        heartBaseRate = 8;
        fortuneBaseRate = 4;

        // 灵石产出 (×1e18): 练气2, 筑基5, 金丹10, 元婴20, 化神40
        outputPerHour[0] = 2 ether;
        outputPerHour[1] = 5 ether;
        outputPerHour[2] = 10 ether;
        outputPerHour[3] = 20 ether;
        outputPerHour[4] = 40 ether;

        // 资源消耗: 练气1.5, 筑基2, 金丹3, 元婴5, 化神10
        feePerHour[0] = 1.5 ether;
        feePerHour[1] = 2 ether;
        feePerHour[2] = 3 ether;
        feePerHour[3] = 5 ether;
        feePerHour[4] = 10 ether;

        // 经验产出: 练气20, 筑基18, 金丹15, 元婴12, 化神10
        expPerHour[0] = 20;
        expPerHour[1] = 18;
        expPerHour[2] = 15;
        expPerHour[3] = 12;
        expPerHour[4] = 10;

        // 渡劫基础成功率 (BP): 90%, 80%, 60%, 50%
        breakthroughBaseRate[0] = 9000;
        breakthroughBaseRate[1] = 8000;
        breakthroughBaseRate[2] = 6000;
        breakthroughBaseRate[3] = 5000;

        // 渡劫丹药费用: 300, 1500, 6000, 15000
        tribulationPillCost[0] = 300 ether;
        tribulationPillCost[1] = 1500 ether;
        tribulationPillCost[2] = 6000 ether;
        tribulationPillCost[3] = 15000 ether;

        // 升重经验需求基础值: 练气100, 筑基400, 金丹1000, 元婴2500, 化神5000
        subRealmExpBase[0] = 100;
        subRealmExpBase[1] = 400;
        subRealmExpBase[2] = 1000;
        subRealmExpBase[3] = 2500;
        subRealmExpBase[4] = 5000;

        // 每重递增经验: 练气~14, 筑基~50, 金丹~125, 元婴~312, 化神~625
        subRealmExpStep[0] = 14;
        subRealmExpStep[1] = 50;
        subRealmExpStep[2] = 125;
        subRealmExpStep[3] = 312;
        subRealmExpStep[4] = 625;

        // 每重属性步进: 练气+5, 筑基+10, 金丹+25, 元婴+40, 化神+50
        attributeStep[0] = 5;
        attributeStep[1] = 10;
        attributeStep[2] = 25;
        attributeStep[3] = 40;
        attributeStep[4] = 50;

        // 每境界1重的基础属性值（用于突破跳跃）
        realmBaseAttribute[0] = 100;  // 练气1重
        realmBaseAttribute[1] = 160;  // 筑基1重
        realmBaseAttribute[2] = 280;  // 金丹1重
        realmBaseAttribute[3] = 550;  // 元婴1重
        realmBaseAttribute[4] = 950;  // 化神1重
    }

    // ═══════════════════════════════════════════
    //              ADMIN SETTERS
    // ═══════════════════════════════════════════

    function setMaxDailyHours(uint256 newValue) external onlyOwner {
        require(newValue > 0 && newValue <= 24, "Cultivation: invalid hours");
        uint256 old = maxDailyHours;
        maxDailyHours = newValue;
        emit MaxDailyHoursUpdated(old, newValue);
    }

    function setHeartBaseRate(uint256 newValue) external onlyOwner {
        require(newValue <= 100, "Cultivation: rate too high");
        uint256 old = heartBaseRate;
        heartBaseRate = newValue;
        emit HeartBaseRateUpdated(old, newValue);
    }

    function setFortuneBaseRate(uint256 newValue) external onlyOwner {
        require(newValue <= 100, "Cultivation: rate too high");
        uint256 old = fortuneBaseRate;
        fortuneBaseRate = newValue;
        emit FortuneBaseRateUpdated(old, newValue);
    }

    function setOutputPerHour(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        outputPerHour[realm] = newValue;
        emit OutputPerHourUpdated(realm, newValue);
    }

    function setFeePerHour(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        feePerHour[realm] = newValue;
        emit FeePerHourUpdated(realm, newValue);
    }

    function setExpPerHour(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        expPerHour[realm] = newValue;
        emit ExpPerHourUpdated(realm, newValue);
    }

    function setBreakthroughBaseRate(uint8 index, uint256 newValue) external onlyOwner {
        require(index < 4, "Cultivation: invalid index");
        require(newValue <= Constants.BP, "Cultivation: rate > 100%");
        breakthroughBaseRate[index] = newValue;
        emit BreakthroughBaseRateUpdated(index, newValue);
    }

    function setTribulationPillCost(uint8 index, uint256 newValue) external onlyOwner {
        require(index < 4, "Cultivation: invalid index");
        tribulationPillCost[index] = newValue;
        emit TribulationPillCostUpdated(index, newValue);
    }

    function setSubRealmExpBase(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        subRealmExpBase[realm] = newValue;
        emit SubRealmExpBaseUpdated(realm, newValue);
    }

    function setSubRealmExpStep(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        subRealmExpStep[realm] = newValue;
        emit SubRealmExpStepUpdated(realm, newValue);
    }

    function setAttributeStep(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        attributeStep[realm] = newValue;
        emit AttributeStepUpdated(realm, newValue);
    }

    function setRealmBaseAttribute(uint8 realm, uint256 newValue) external onlyOwner {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        realmBaseAttribute[realm] = newValue;
        emit RealmBaseAttributeUpdated(realm, newValue);
    }

    function setExpPillLow(uint256 newValue) external onlyOwner {
        uint256 old = expPillLow;
        expPillLow = newValue;
        emit ExpPillLowUpdated(old, newValue);
    }

    function setExpPillHigh(uint256 newValue) external onlyOwner {
        uint256 old = expPillHigh;
        expPillHigh = newValue;
        emit ExpPillHighUpdated(old, newValue);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Cultivation: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ═══════════════════════════════════════════
    //              GAME FUNCTIONS
    // ═══════════════════════════════════════════

    /// @notice 开始闭关
    function startCultivation() external {
        require(register.isRegistered(msg.sender), "Cultivation: not registered");
        require(!sessions[msg.sender].active, "Cultivation: already cultivating");

        sessions[msg.sender] = Session({
            startTime: block.timestamp,
            active: true
        });

        emit CultivationStarted(msg.sender, block.timestamp);
    }

    /// @notice 结束闭关，结算收益（支持多日连续闭关）
    function endCultivation() external {
        Session storage session = sessions[msg.sender];
        require(session.active, "Cultivation: not cultivating");

        uint256 duration = block.timestamp - session.startTime;
        require(duration > 0, "Cultivation: zero duration");

        Register.Cultivator memory c = register.getCultivator(msg.sender);
        uint8 realm = c.realm;

        // O(1) 多日结算：计算受每日上限限制的有效产出秒数
        uint256 effectiveSeconds = _computeMultiDayEffective(
            msg.sender, session.startTime, block.timestamp
        );

        // 灵石产出 & 消耗（基于 effectiveSeconds）
        uint256 lsEarned = (outputPerHour[realm] * effectiveSeconds) / 1 hours;
        uint256 lsFee = (feePerHour[realm] * effectiveSeconds) / 1 hours;

        // 经验（不受上限限制，duration 全计）
        uint256 expGained = (expPerHour[realm] * duration) / 1 hours;

        // 道心 & 气运（不受上限限制）
        uint256 heartGained = (heartBaseRate * duration) / 1 hours;
        uint256 fortuneGained = (fortuneBaseRate * duration) / 1 hours;

        session.active = false;

        // 净收益 = 产出 - 消耗
        if (lsEarned > lsFee) {
            uint256 netEarning = lsEarned - lsFee;
            lingshi.mint(msg.sender, netEarning);
        }

        // 资源消耗通过 Treasury 分配（如果有的话）
        if (lsFee > 0 && lingshi.balanceOf(msg.sender) >= lsFee) {
            lingshi.approve(address(treasury), lsFee);
        }

        // 累计经验存储到 Register
        if (expGained > 0) {
            register.addExperience(msg.sender, expGained);
        }

        emit CultivationEnded(
            msg.sender,
            duration,
            effectiveSeconds,
            lsEarned,
            lsFee,
            expGained,
            heartGained,
            fortuneGained
        );
    }

    /// @notice 升重（经验足够时手动调用，Agent 自由分配属性点）
    /// @dev 练气1重→2重需 100 经验，每重递增 14（2重→3重需 114，依此类推）
    /// @param addAtk 分配给灵力的点数
    /// @param addDef 分配给体魄的点数
    /// @param addPer 分配给神识的点数
    /// @param addWis 分配给悟性的点数
    function levelUp(uint256 addAtk, uint256 addDef, uint256 addPer, uint256 addWis) external {
        require(register.isRegistered(msg.sender), "Cultivation: not registered");
        require(!sessions[msg.sender].active, "Cultivation: in cultivation");

        Register.Cultivator memory c = register.getCultivator(msg.sender);
        uint8 realm = c.realm;
        uint8 subRealm = c.subRealm;

        require(subRealm < Constants.MAX_SUB_REALM - 1, "Cultivation: max sub-realm");

        // 验证属性点分配总和 = attributeStep[realm] × 4
        uint256 totalPoints = attributeStep[realm] * 4;
        require(
            addAtk + addDef + addPer + addWis == totalPoints,
            "Cultivation: invalid point allocation"
        );

        // 计算所需经验 = base + subRealm * step
        uint256 required = subRealmExpBase[realm] + uint256(subRealm) * subRealmExpStep[realm];
        uint256 currentExp = register.experience(msg.sender);
        require(currentExp >= required, "Cultivation: insufficient experience");

        // 消耗经验
        register.consumeExperience(msg.sender, required);

        // 升重
        uint8 newSubRealm = subRealm + 1;
        register.updateSubRealm(msg.sender, newSubRealm);

        // 自由分配属性点
        register.updateAttributes(
            msg.sender,
            c.attack + addAtk,
            c.defense + addDef,
            c.perception + addPer,
            c.wisdom + addWis
        );

        emit SubRealmAdvanced(msg.sender, realm, subRealm, newSubRealm, required);
    }

    /// @notice 渡劫突破（9重→下一境界1重）
    /// @dev 消耗对应渡劫丹（筑基丹/结丹丹/凝婴丹/化神丹），可选护心丹保护
    /// @param useProtectionPill 是否使用护心丹（失败时保护不掉重）
    function breakthrough(bool useProtectionPill) external {
        require(register.isRegistered(msg.sender), "Cultivation: not registered");
        require(!sessions[msg.sender].active, "Cultivation: in cultivation");

        Register.Cultivator memory c = register.getCultivator(msg.sender);
        uint8 realm = c.realm;
        uint8 subRealm = c.subRealm;

        require(realm < Constants.REALM_COUNT - 1, "Cultivation: max realm");
        require(subRealm == Constants.MAX_SUB_REALM - 1, "Cultivation: not 9th sub-realm");

        // 消耗渡劫丹（realm=0 消耗筑基丹, realm=1 消耗结丹丹...）
        require(pill.balanceOfPill(msg.sender, realm) >= 1, "Cultivation: no breakthrough pill");
        pill.burn(msg.sender, realm, 1);

        // 随机判定成功/失败
        uint256 roll = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nonce))
        ) % Constants.BP;
        _nonce++;

        bool success = roll < breakthroughBaseRate[realm];
        uint8 newRealm = realm + 1;

        if (success) {
            // 升境界 + 重置到1重
            register.updateRealm(msg.sender, newRealm);
            register.updateSubRealm(msg.sender, 0);

            // 属性跳跃：按比例缩放到新境界基础值
            _applyBreakthroughAttributes(msg.sender, c, realm, newRealm);
        } else if (useProtectionPill) {
            // 护心丹保护：失败但不掉重
            require(pill.balanceOfPill(msg.sender, 7) >= 1, "Cultivation: no protection pill");
            pill.burn(msg.sender, 7, 1);
        }

        emit BreakthroughAttempted(msg.sender, realm, newRealm, success);
    }

    /// @notice 使用经验丹（培元丹/聚灵丹）
    /// @param pillType 4=培元丹(+50 exp), 5=聚灵丹(+200 exp)
    function consumeExpPill(uint8 pillType) external {
        require(register.isRegistered(msg.sender), "Cultivation: not registered");
        require(pillType == 4 || pillType == 5, "Cultivation: invalid exp pill");

        pill.burn(msg.sender, pillType, 1);

        uint256 expGain = pillType == 4 ? expPillLow : expPillHigh;
        register.addExperience(msg.sender, expGain);

        emit ExpPillConsumed(msg.sender, pillType, expGain);
    }

    /// @notice 使用洗髓丹（重置当前重数的属性点分配）
    /// @dev 将四维属性重置为境界基础值 + 重数 × 步进（均匀分配），然后按新分配重新分配
    function useXisuiDan(uint256 addAtk, uint256 addDef, uint256 addPer, uint256 addWis) external {
        require(register.isRegistered(msg.sender), "Cultivation: not registered");
        require(!sessions[msg.sender].active, "Cultivation: in cultivation");

        // 消耗洗髓丹
        require(pill.balanceOfPill(msg.sender, 6) >= 1, "Cultivation: no xisui pill");
        pill.burn(msg.sender, 6, 1);

        Register.Cultivator memory c = register.getCultivator(msg.sender);
        uint8 realm = c.realm;
        uint8 subRealm = c.subRealm;

        // 计算累计可分配总点数 = subRealm × (attributeStep[realm] × 4)
        uint256 totalPoints = uint256(subRealm) * attributeStep[realm] * 4;
        require(
            addAtk + addDef + addPer + addWis == totalPoints,
            "Cultivation: invalid point allocation"
        );

        // 重置到境界基础值 + 新分配
        uint256 base = realmBaseAttribute[realm];
        register.updateAttributes(
            msg.sender,
            base + addAtk,
            base + addDef,
            base + addPer,
            base + addWis
        );

        emit AttributesReset(msg.sender, addAtk, addDef, addPer, addWis);
    }

    /// @notice 查询升重所需经验
    function getSubRealmExpRequired(uint8 realm, uint8 subRealm) external view returns (uint256) {
        require(realm < Constants.REALM_COUNT, "Cultivation: invalid realm");
        require(subRealm < Constants.MAX_SUB_REALM - 1, "Cultivation: max sub-realm");
        return subRealmExpBase[realm] + uint256(subRealm) * subRealmExpStep[realm];
    }

    /// @notice 查询闭关状态
    function getSession(address player) external view returns (Session memory) {
        return sessions[player];
    }

    /// @notice 计算如果现在结束闭关的预估收益（支持多日连续闭关）
    function estimateRewards(address player)
        external
        view
        returns (uint256 lsNet, uint256 exp, uint256 heart, uint256 fortune)
    {
        Session memory session = sessions[player];
        if (!session.active) return (0, 0, 0, 0);

        uint256 duration = block.timestamp - session.startTime;

        Register.Cultivator memory c = register.getCultivator(player);
        uint8 realm = c.realm;

        uint256 effectiveSeconds = _estimateMultiDayEffective(
            player, session.startTime, block.timestamp
        );

        uint256 lsEarned = (outputPerHour[realm] * effectiveSeconds) / 1 hours;
        uint256 lsFee = (feePerHour[realm] * effectiveSeconds) / 1 hours;
        lsNet = lsEarned > lsFee ? lsEarned - lsFee : 0;
        exp = (expPerHour[realm] * duration) / 1 hours;
        heart = (heartBaseRate * duration) / 1 hours;
        fortune = (fortuneBaseRate * duration) / 1 hours;
    }

    // ── 内部函数 ──

    /// @dev 突破后属性缩放：保留出身加成比例，跳跃到新境界基础值
    function _applyBreakthroughAttributes(
        address player,
        Register.Cultivator memory c,
        uint8 oldRealm,
        uint8 newRealm
    ) internal {
        uint256 newBase = realmBaseAttribute[newRealm];
        uint256 oldMax = realmBaseAttribute[oldRealm]
            + uint256(Constants.MAX_SUB_REALM - 1) * attributeStep[oldRealm];

        register.updateAttributes(
            player,
            (c.attack * newBase) / oldMax,
            (c.defense * newBase) / oldMax,
            (c.perception * newBase) / oldMax,
            (c.wisdom * newBase) / oldMax
        );
    }

    /// @dev O(1) 多日结算：计算跨越多个 UTC 天的有效产出秒数，并更新 tracker
    function _computeMultiDayEffective(
        address player,
        uint256 startTime,
        uint256 endTime
    ) internal returns (uint256 effectiveSeconds) {
        uint256 dailyCap = maxDailyHours * 1 hours;
        uint256 startDay = startTime / 86400;
        uint256 endDay = endTime / 86400;

        DailyTracker storage tracker = dailyTrackers[player];

        // 首日已用量（来自同一天的前序 session）
        uint256 priorUsed = (tracker.dayId == startDay) ? tracker.hoursUsed : 0;
        uint256 firstDayCap = priorUsed >= dailyCap ? 0 : dailyCap - priorUsed;

        if (startDay == endDay) {
            // 同一天内的 session
            uint256 duration = endTime - startTime;
            effectiveSeconds = duration < firstDayCap ? duration : firstDayCap;

            // 更新 tracker
            if (tracker.dayId != endDay) {
                tracker.dayId = endDay;
                tracker.hoursUsed = effectiveSeconds;
            } else {
                tracker.hoursUsed += effectiveSeconds;
            }
        } else {
            // 跨天 session
            // 首日：从 startTime 到午夜
            uint256 firstDayDuration = (startDay + 1) * 86400 - startTime;
            effectiveSeconds = firstDayDuration < firstDayCap
                ? firstDayDuration
                : firstDayCap;

            // 中间完整天：每天贡献 dailyCap
            uint256 fullMiddleDays = endDay - startDay - 1;
            effectiveSeconds += fullMiddleDays * dailyCap;

            // 末日：从午夜到 endTime
            uint256 lastDayDuration = endTime - endDay * 86400;
            uint256 lastDayEffective = lastDayDuration < dailyCap
                ? lastDayDuration
                : dailyCap;
            effectiveSeconds += lastDayEffective;

            // 更新 tracker 为末日消耗
            tracker.dayId = endDay;
            tracker.hoursUsed = lastDayEffective;
        }
    }

    /// @dev O(1) 多日估算（view 函数，不修改状态）
    function _estimateMultiDayEffective(
        address player,
        uint256 startTime,
        uint256 endTime
    ) internal view returns (uint256 effectiveSeconds) {
        uint256 dailyCap = maxDailyHours * 1 hours;
        uint256 startDay = startTime / 86400;
        uint256 endDay = endTime / 86400;

        DailyTracker memory tracker = dailyTrackers[player];

        uint256 priorUsed = (tracker.dayId == startDay) ? tracker.hoursUsed : 0;
        uint256 firstDayCap = priorUsed >= dailyCap ? 0 : dailyCap - priorUsed;

        if (startDay == endDay) {
            uint256 duration = endTime - startTime;
            effectiveSeconds = duration < firstDayCap ? duration : firstDayCap;
        } else {
            uint256 firstDayDuration = (startDay + 1) * 86400 - startTime;
            effectiveSeconds = firstDayDuration < firstDayCap
                ? firstDayDuration
                : firstDayCap;

            uint256 fullMiddleDays = endDay - startDay - 1;
            effectiveSeconds += fullMiddleDays * dailyCap;

            uint256 lastDayDuration = endTime - endDay * 86400;
            effectiveSeconds += lastDayDuration < dailyCap
                ? lastDayDuration
                : dailyCap;
        }
    }
}
