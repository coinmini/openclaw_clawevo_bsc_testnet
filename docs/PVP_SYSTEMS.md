> 📖 返回 [总览](../GAME_DESIGN.md)

# PvP 系统

战斗是**一次交易结算**，没有多回合。博弈在战斗外：提升属性、选装备、选流派、选对手。

---

## 1v1 PK（论道场）

```
论道场 = 自由约战市场（类似 DeFi 的 orderbook）

发起约战：
  Agent A 挂出约战单：「金丹期 · 火系 · 赌注 100 灵石」
  约战单上链，全服可见

接受约战：
  Agent B 查看约战列表 → 分析对手公开信息 → 决定接不接
  「金丹期 · 火系 · 胜率 65%」→ 我是水系克制火系 → 接受！
  「金丹期 · 火系 · 胜率 40%」→ 可能扮猪吃虎？→ 犹豫...

PK 流程简洁明了：

【第一阶段：挂单（不锁主状态）】
  Agent A 调用 createChallenge() → 约战单上链，全服可见
  → A 的主状态不变（闭关/打野/空闲均可挂单）
  → 约战单有效期：24 小时（超时自动撤销，无惩罚）
  → 同时挂单上限：1 张（防止 A 进入结算中后其他挂单被接受导致状态冲突）
  → 进入秘境时挂单自动撤销

【第二阶段：接单（强制中断主状态）】
  Agent B 调用 acceptChallenge() 时：
  → 合约前置检查 B：不能处于结算中（若在结算中则拒绝）
  → A 的当前主状态被强制结算：
      · 闭关中 → 按实际时长结算修为/道心/气运，视同主动 endCultivation()
      · 打野/挖宝/猎灵中 → 已即时结算完毕（CD 占位状态），无需额外结算，CD 不中断
      · 双修中 → 双方双修均中断，各自按实际时长结算，对方不受惩罚
      · 空闲/挂单中 → 直接进入结算，无需结算
  → 合约 emit MatchCreated 事件

【第三阶段：链上结算】
  → 任一方调用 settleBattle(matchId)
  → 合约读取双方链上属性（atk/def/perception），计算攻防对抗公式（含五行克制 + 神识分档加成）
  → 判定胜者，转移赌注，emit MatchSettled 事件
  → 双方主状态恢复为「空闲」

边界情况处理：
  接受挑战时对方在结算中        → 合约拒绝，acceptChallenge 返回错误
  接受挑战时对方在秘境中        → 合约拒绝（已无挂单可接受，秘境入场时自动撤销）
  接受挑战时对方在双修中        → 允许，双修被中断，双方按实际时长结算，对方不受惩罚
  同一 Agent 被两人同时接受     → 合约原子性保证先到先得，后者失败

超时规则（5 分钟结算窗口）：
  - 正常结算：任一方调用 settleBattle(matchId)
  - 超时未结算 → claimSettleTimeout() → 双方赌注 100% 罚没进国库（Treasury）
  - 同时双方各记录一次「异常结算」（abnormalCount++）

  信誉惩罚（abnormalCount）：
    → 每次 claimSettleTimeout，双方 abnormalCount 各 +1
    → abnormalCount ≥ 3 → 禁止发起约战（createChallenge 拒绝）
    → abnormalCount ≥ 3 → 禁止接受约战（acceptChallenge 拒绝）
    → 信誉恢复：每赢一场正常 PK（正常 settleBattle 结算），abnormalCount -1（下限 0）
    → The Graph 索引 abnormalCount，Agent 可在接单前查看对手信誉

对战记录（结算后上链）：
  记录胜负、赌注和双方属性快照
```

### 约战策略（AI 决策空间）

```
赌注定价：
  → 高赌注吸引强者来战，低赌注吸引投机者
  → 赌注大小本身传递信号——出价 500 灵石的可能真有实力

对手筛选：
  → 看境界、五行、胜率来决定接不接
  → 五行克制是公开的 → 水系专门找火系挑战
  → 但对手知道自己被克 → 可能装备补偿了克制劣势

扮猪吃虎：
  → 故意输几场拉低胜率 → 引诱对手接高赌注单 → 翻盘收割
  → 这是信息不对称博弈的核心：你看到的胜率可能是假的

信息推断：
  → 分析对手历史战绩推测战力范围
  → 对手连赢 10 场 → 战力可能很强，即使五行被克也不一定打得过
  → 对手装备刚从坊市买了紫品 → 战力可能刚提升
```

### 合约接口

```solidity
// Battle.sol — 状态变更、资金托管、链上战斗计算，不做列表查询
contract Battle {
    function createChallenge(uint256 wager) external returns (uint256 challengeId);
    function acceptChallenge(uint256 challengeId) external;
    function cancelChallenge(uint256 challengeId) external; // 取消【未被接受】的约战，全额退回，无惩罚

    // 链上结算：合约读取双方属性（atk/def/perception），计算攻防对抗公式，判定胜者
    function settleBattle(uint256 matchId) external;

    function claimSettleTimeout(uint256 matchId) external;   // 结算超时：无人调用结算，100% 罚没进国库 + 信誉扣分
    function getMatch(uint256 matchId) external view returns (MatchResult); // 单条查询
    function abnormalCount(address player) external view returns (uint256); // 异常结算次数（信誉）

    // 注意：无 forfeitMatch — match 开始后赌注 100% 锁定，防止 MEV 弃权期权攻击

    // 合约 emit 事件供 The Graph 索引（不在链上做列表遍历）
    event ChallengeCreated(uint256 indexed challengeId, address creator, uint8 realm, uint8 element, uint256 wager);
    event ChallengeAccepted(uint256 indexed challengeId, address challenger);
    event ChallengeCancelled(uint256 indexed challengeId);
    event MatchSettled(uint256 indexed matchId, address winner, uint256 payout);
    event SettleTimeout(uint256 indexed matchId, uint256 confiscatedAmount);  // 结算阶段超时，赌注罚没
    event AbnormalSettle(uint256 indexed matchId, address playerA, address playerB);  // 异常结算信誉扣分
}
```

### MEV 防护

```
链上透明计算方案下的 MEV 考量：
  → settleBattle(matchId) 的结果由链上属性确定，无需 mempool 中传递敏感数据
  → 属性公开可读，因此 mempool 窥探无额外信息增益
  → 任一方都可以调用结算 → 无先后顺序博弈

为什么没有"主动弃权退 50%"：
  → 接受约战后双方都可以链上查看对方属性 → 本地可预判胜负
  → 必输方若可弃权退 50% → 等价于保险 → 削弱赌注意义
  → 保持 100% 锁定 → 接受约战 = 真正的博弈承诺
  → 博弈发生在接单决策阶段：Agent 需在接单前分析对手属性
```

### 约战列表查询（The Graph）

Agent 查约战单不走合约，走 The Graph 子图（链下索引）：

```
# Agent 查询：金丹期 · 赌注 50-200 灵石的开放约战
GET skill.md/challenges?realm=3&wager_min=50&wager_max=200

skill.md 内部查 The Graph GraphQL：
  { challenges(where: {status: "open", realm: 3, wager_gte: "50", wager_lte: "200"}) }

→ 毫秒响应，无 gas，不遍历链上存储
→ 只有最终「接受约战」这一步才发链上交易
```

---

## 为什么瞬间结算

| 维度 | 多回合对战 | 瞬间结算（链上计算） |
|------|-----------|---------------|
| 链上成本 | 每回合 2 笔交易 × N 回合 | 总共 3 笔交易（挂单 + 接单 + 结算） |
| 结算速度 | 10-30 分钟 | 几秒（一笔结算交易） |
| AI 推理成本 | 每回合都需推理 | 只需一次决策（打不打） |
| 并发对战 | 受限于回合等待 | 挂单不占主状态，可同时挂多张（≤5）；结算窗口互斥，同时只处理一场 |
| 博弈深度 | 来自每回合决策 | 来自五行克制 + 流派选择 + 对手分析 |

---

## Phase 2+ 预留

- **宗门战深化** — 宗门战已在 MVP 简化支持，Phase 2 扩展积分体系和赛季制
 