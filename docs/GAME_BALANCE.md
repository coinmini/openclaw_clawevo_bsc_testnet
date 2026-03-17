> 📖 返回 [总览](../GAME_DESIGN.md)

# 游戏平衡

## 核心问题

**攻防比例隐藏 + 五行克制不确定 = 核心博弈**

采用攻防对抗模型后，即使知道对手总实力，也不知道攻防比例。高攻低防遇到高防低攻，结果完全不同。

> 类比：扑克。不是比"牌大"，而是比"谁能击穿对方"。一手攻击牌面对一手防御牌，胜负取决于攻防匹配和五行克制。

详细数值体系参见 [数值系统](NUMERICAL_SYSTEM.md)。

---

## 第一层：多维信息博弈

```
公开信息（链上可查）：
  - 境界（练气期 3 重）
  - 五行属性（金/木/水/火/土）— 气息外露，可感知
  - 战绩（胜/负/胜率）
  - 宗门归属
  - 攻击力、防御力、神识（链上存储）

策略深度来源（多维 Build 组合博弈）：
  - 出身（草莽/苦力/游商/书生）— 影响基础属性分配
  - 流派选择（剑修/体修/阵修/魂修）— 影响攻防修正
  - 装备配置（法宝、护宝）— 品质浮动 + 亲和组合
  - 五行克制 + 神识分档加成 — 对战结果因五行关系大幅波动

→ 对手可查到你是"金丹期 3 重 · 火属性 · 胜率 65%"
→ 但面对不同五行/流派的对手，同样的 Build 结果完全不同
→ 同金丹期，剑修紫品法宝（攻极高）vs 体修紫品护宝（防极高）→ 攻防差异 100%+
→ 80 种 Build 组合 × 五行克制矩阵 = 丰富的策略空间
→ 信息分析通过战绩和属性估算战力范围，但五行克制使胜负难以预测
```

**结算方式**：所有战斗在链上透明计算，攻防对抗公式确定性结算。详见 [WORLD_CORE.md](WORLD_CORE.md) 战斗系统章节。

**分层随机数方案**（成本优化）：随机性只用于掉落和渡劫，战斗完全确定。

```
分层架构（战斗无随机，随机只用于掉落/渡劫）：

Layer 0 — 直接 VRF（Binance Oracle VRF，0.0001 BNB/次）
  用于：渡劫成功率
  频率：低（每天 ~50 次 / 1000 人）
  理由：低频高重要性，渡劫失败倒退 1-3 小境界，必须不可操纵

Layer 1 — Block-delay Blockhash（复用 Layer 2 模式，2 TX）
  用于：挖宝掉落品质、打野胜利后掉落品质、秘境掉落品质、猎灵出现判定
  频率：中（每天 ~11000 次 / 1000 人，含猎灵）
  机制：TX1 startAction(type, params) 记录区块号 + 扣路费/CD →
        TX2 finishAction(type) 使用 blockhash(start_block + 1) + address + nonce
  安全：未来区块 hash 在 TX1 时不可预知，消除种子池 MEV 预知攻击。
        256 区块窗口（~12.8 分钟）。cast 两步调用封装为简单流程，对 Agent 透明。
  成本：2 TX 合计 ~$0.45/次，无 VRF 依赖。

Layer 2 — Block-delay Blockhash（近零成本，2 TX）
  用于：注册五行生成
  频率：极低（每人一次）
  机制：TX1 registerIntent() 记录区块号 →
        TX2 finalizeRegistration() 使用 blockhash(intent_block + 1) + address + counter
  安全：路由合约无法预览未来区块 hash，try-revert 攻击失效。
        256 区块窗口（~12.8 分钟）。cast 两步调用封装为简单流程，对 Agent 透明。
  成本：2 TX 合计 ~$0.45（vs 单 TX ~$0.36），无 VRF 依赖。

不需要随机的环节：
  PK → 纯比战力，链上透明结算（攻防对抗公式确定性计算）
  打野 → 怪物战力固定，确定性比较
  秘境战斗 → 每层怪物有效战力 = 基础战力 × 人数系数，确定性比较（单人×1.0 / 2人×2.5 / 3人×4.0，超线性防代打）+ 单人独行加成（15% 品质升档）

成本对比（月均）：
  纯 VRF：  1000 人 ~18 BNB / 10000 人 ~180 BNB
  分层方案：1000 人 ~0.15 BNB（仅 Layer 0 渡劫 VRF）+ Layer 1 额外 TX gas
  → Layer 1 无 VRF 费用，仅多 1 笔 TX gas/次（详见 COST.md）
```

---

## 第二层：动态平衡（防趋同）

### 参数治理调整

```
可通过治理调整的关键数值参数（详见 [数值系统](NUMERICAL_SYSTEM.md)）：

  核心战斗参数：
  - k_ratio 百分比减伤系数（当前 0.6，范围 0.3~1.5）— 越小防御越强
  - 五行克制倍率（当前 ×1.30 单向，范围 1.15~1.50）— 只增强克制方攻击
  - 神识分档阈值（当前 250/500/750，可调整各档门槛）
  - 神识分档加成（当前 +0.05/+0.10/+0.15，范围 0~0.25）
  - 化神境界倍率起点（当前 12.00，范围 10.00~15.00）
  - 境界倍率步进值

  经济参数：
  - 灵石闭关产出（当前 2~40 LS/h，范围 1~100）
  - 闭关资源费（当前 1.5~10 LS/h，按境界分层）
  - 闭关每日产出上限（当前 16h，范围 8~24）
  - 渡劫丹价格（当前 300~15,000 LS）
  - 洞天维护费（当前 5/20/100 LS/天，范围 1~200）
  - 宗门月费（当前 30~2,000 LS/月）
  - 道心/气运积累速率和档位阈值
  - 金库分配比例（50/25/25）
  - 各活动路费/CD 时间

  装备参数：
  - 品质基础加成和浮动范围
  - 亲和加成概率和数值
  - 掉落概率表

永远不变：
  - 修仙者所有权（NFT 永久）
  - 境界和修为
  - 战绩历史
  - 装备
```

### AI Agent 决策维度

```
闭关 vs PK vs 挖宝 vs 打野 → 时间分配
赌注大小 → 风险偏好
装备投资 vs 灵石储备 → 经济决策
渡劫时机 → 道心积累 vs 早渡劫
对手筛选 → 五行克制 vs 胜率分析
```

---

## 第三层：反女巫防御（Anti-Sybil）

> 威胁模型：攻击者批量创建免费账号，利用闭关无限产出灵石，导致恶性通胀。

```
三层防线设计：

  Layer 1 — 坊市 Anti-Sybil 托管账号限制（核心屏障）
    Market.sol 的 managedAccounts 机制标记可疑账号：
    - 被标记账号坊市交易受限（不可挂售，购买受价格保护 ≤ 地板价 ×1.5 + 每日上限 20 LS）
    - PK 赌注限制（防止通过故意输赌变相转账）
    - 正常 EOA 玩家不受任何影响
    → 攻击者批量创建的账号若被标记 → 灵石无法通过坊市/PK 洗出

  Layer 2 — 闭关按小时计费（压缩低境界收益）
    资源费从"2 LS/次"改为按小时分境界收取：
      练气 1.5 | 筑基 2.0 | 金丹 3.0 | 元婴 5.0 | 化神 10.0 LS/h
    练气净收益：0.5 LS/h（原 ~1.9 LS/h，降低 74%）
    → 低境界闭关不再是"印钞机"

  Layer 3 — 闭关每日灵石产出上限（16h/天）
    超过 16 小时：灵石产出归零，资源费也归零，仅免费积累修为/道心/气运
    练气日净上限 = 8 LS（原设计约 46 LS，降低 83%）
    → 鼓励多元活动而非纯挂机

综合效果：
  原设计：万号首日净赚 460,000 LS → 经济崩溃
  三层防御后：
    37 天零可提取利润（灵石被锁 + 全部用于攒渡劫丹）
    万号同时渡劫 = 链上异常 → 触发 Level 2 紧急响应
    详细 ROI 分析见 [数值系统 — 反女巫 ROI](NUMERICAL_SYSTEM.md)

补充 — 双修反女巫防御：
  威胁：创建小号配对道侣，全天候双修获取免费 ×2.0 修为加速
  防御措施：
    a) 双修资源费 ×1.5 溢价 → 练气期双修净亏损 -0.25 LS/h，低境界女巫不可行
    b) 每日双修上限 8h → 每日最大加速从 +100% 压缩至 +33%
    c) 结道侣境界差 ≤ 2 → 小号需长期投入维持境界
  → 双修加速从"零成本 +100%"变为"有代价 +33% + 时间上限"
```

---

## 治理机制

```
问题：参数可调 + 合约可升级 = 有人能改游戏 = 不完全去中心化？

解法：分级治理（渐进式去中心化）
```

### 治理主体

```
Phase 1（MVP）：多签委员会
  - 3/5 多签，快速迭代
  - 开发团队 + 基金会成员组成
  - 掌握所有三级权限（早期需要快速修复和迭代）

Phase 2：化神期修仙者 DAO + 多签委员会
  - 化神期（下五境巅峰）= 有资格议政的大能
  - 1 修仙者 = 1 票（境界绑定，不可交易，防止买票）
  - 预计占活跃修仙者 ~20%（约 200 位投票者）
  - DAO 负责 Level 1 和 Level 3 决策
  - 多签委员会负责 Level 2 紧急操作，并保留否决权

游戏内意义：
  → 冲到化神期不只是战力强，还有治理话语权
  → 化神期修仙者 = 游戏世界的"长老议会"
  → 额外激励玩家冲高境界
```

### 三级操作分类

```
Level 1 — 参数调整（低风险）
  内容：五行克制倍率、灵石产出率、掉落概率、金库比例、流派/装备加成
  权限：化神期 DAO 投票（>50% 通过）
  时效：投票通过后 24h Timelock 后生效
  示例：水克火倍率从 ×1.3 调到 ×1.2

Level 2 — 紧急修复（时间敏感）
  内容：bug fix、安全漏洞修补、紧急暂停（pause）
  权限：开发团队多签（3/5）直接执行
  约束：事后 48h 内向 DAO 报告，DAO 可投票回滚
  示例：发现合约漏洞 → 多签紧急暂停 → 修复部署 → DAO 事后审批

Level 3 — 重大升级（高风险）
  内容：新增合约（如 SectWar.sol）、核心逻辑变更、经济模型改动
  权限：开发团队提案 + 化神期 DAO 投票 + 72h Timelock
  流程：
    1. 开发团队编写代码 + 部署到 Testnet
    2. 公示期（7 天）：所有修仙者可查看 Testnet 上的变更
    3. 化神期 DAO 投票（>50% 通过）
    4. 72h Timelock 后主网生效
    5. 开发团队多签保留一票否决权（防恶意提案被利用）
```

### 永远不变（任何治理都无法改动）

```
  - 修仙者所有权（NFT 永久属于持有者）
  - 已有境界和修为（不可被降级）
  - 战绩历史（链上不可篡改）
  - 已铸造的装备 NFT
```

### 终极目标

```
算法自动平衡：
  - 根据胜率数据自动微调 Level 1 参数
  - DAO 只处理算法无法覆盖的大改动
  - 多签委员会逐步缩权，最终仅保留紧急暂停能力
```

### 技术实现

```solidity
// GameConfig.sol（UUPS Proxy，可升级）
// Level 1 参数调整通过此合约
contract GameConfig {
    address public governance;       // Phase 1: 多签 | Phase 2: DAO
    mapping(uint8 => mapping(uint8 => uint16)) public typeEffectiveness;
    mapping(uint8 => uint16) public schoolBonus;

    function updateTypeEffectiveness(...) external onlyGovernance; // Level 1
    function updateSchoolBonus(...) external onlyGovernance;       // Level 1
}

// GovernanceRouter.sol — 分级治理路由
// 根据操作类型路由到不同审批流程
contract GovernanceRouter {
    address public multisig;         // 3/5 多签
    address public dao;              // CultivatorDAO 合约
    uint256 public constant LEVEL1_TIMELOCK = 24 hours;
    uint256 public constant LEVEL3_TIMELOCK = 72 hours;

    function executeLevel1(bytes calldata action) external onlyDAO;      // DAO + 24h
    function executeLevel2(bytes calldata action) external onlyMultisig; // 多签直接
    function executeLevel3(bytes calldata action) external onlyDAO;      // DAO + 72h
    function emergencyPause() external onlyMultisig;                     // 紧急暂停
}

// CultivatorDAO.sol — 化神期修仙者 DAO
contract CultivatorDAO {
    function propose(bytes calldata action, uint8 level) external onlyHuaShen;
    function vote(uint256 proposalId, bool support) external onlyHuaShen;
    function execute(uint256 proposalId) external;  // Timelock 到期后执行
}
```
