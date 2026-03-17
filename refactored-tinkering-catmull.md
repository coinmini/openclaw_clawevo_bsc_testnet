# 纯链上游戏方案分析：AI Agent 可交互的全链游戏

## Context

目标：设计一款完全部署在区块链上的游戏，无需前后端，AI agent（如 OpenClaw）可以纯粹通过智能合约 ABI 交互参与游戏。链选择范围：Base 或 BSC。

核心诉求：
- **完全透明** — 所有游戏逻辑和状态都在链上，可验证
- **无需前端** — AI agent 通过合约调用即可完整参与
- **低成本** — 游戏交互频繁，gas 必须足够低

---

## 一、可行性结论：**完全可行，但需要合理设计**

纯链上游戏（Fully On-Chain Game）已有成熟先例：
- **Dark Forest** — 首个全链上不完全信息策略游戏（以太坊 + zkSNARK）
- **Sky Strife** — 全链上 RTS 游戏（Redstone/MUD）
- **OPCraft** — 全链上 Minecraft 风格游戏（Optimism/MUD）
- **Primodium** — 全链上基地建设 MMO

成熟框架：
- **MUD**（Lattice/0xPARC）— EVM 链上最流行的全链游戏框架，支持 Base/BSC
- **Dojo**（Starknet）— 基于 Cairo 的可证明游戏引擎

---

## 二、链选择对比

| 维度 | Base (L2) | BSC (L1) |
|------|-----------|----------|
| Gas 费用 | 极低（L2 执行费 + L1 数据费） | 低（< $0.03/tx，1-3 Gwei） |
| 出块时间 | ~2s | 0.45s（2026 Fermi 升级后） |
| 开发工具 | MUD 原生支持，生态丰富 | MUD 兼容，工具略少 |
| AI Agent 生态 | OpenClaw 生态在 Base 上活跃 | 用户基数大，亚洲市场强 |
| 适合场景 | 强调开发者体验和 Coinbase 生态 | 强调低延迟和低成本 |

**建议**：
- 如果目标用户是 OpenClaw 等 Base 生态 AI agent → **选 Base**
- 如果追求最低延迟和最低成本 → **选 BSC**（Fermi 后 0.45s 出块接近实时）

---

## 三、适合全链上的游戏类型

### 推荐（与区块链特性天然匹配）
1. **回合制策略** — 棋类、战棋、4X 策略
2. **卡牌游戏** — TCG、Poker（需 commit-reveal）
3. **资源管理 / Idle 游戏** — 挖矿、基地建设
4. **竞拍 / 博弈游戏** — 拍卖、囚徒困境、机制设计游戏
5. **Puzzle 游戏** — 2048、数独、谜题

### 不推荐（受限于出块时间和 gas）
- MOBA、FPS、格斗 — 需要亚秒级响应
- 实时 RTS — 状态更新太频繁
- 平台跳跃 — 需要连续物理计算

---

## 四、AI Agent 交互架构

### 核心设计原则

```
AI Agent (OpenClaw等)
    │
    ├── 读取游戏状态：view 函数（免 gas）
    │   ├── getGameState(gameId)
    │   ├── getPlayerInfo(address)
    │   └── getAvailableActions(gameId, player)
    │
    └── 执行游戏动作：write 函数（需 gas）
        ├── joinGame(gameId)
        ├── performAction(gameId, actionType, params)
        └── claimReward(gameId)
```

### 关键设计要点

1. **ABI 即 API** — 合约的 ABI 就是 AI agent 的完整 API 文档
2. **丰富的 view 函数** — AI agent 需要能查询完整游戏状态来做决策
3. **结构化事件** — 通过 Event 让 agent 追踪游戏进度
4. **动作枚举** — 用 enum 定义所有合法动作，agent 不需要理解复杂语义
5. **NatSpec 注释** — 详细的函数注释帮助 AI 理解每个函数的用途

### AI Agent 交互工具链

- **viem / ethers.js** — 合约交互
- **Coinbase AI Agent Wallets**（2026.02 发布）— AI agent 专用钱包
- **ERC-8004**（制定中）— AI agent 身份发现和信任标准

---

## 五、推荐游戏方案：链上回合制策略游戏

### 示例：全链上"资源争夺"策略游戏

**游戏规则**：
- 玩家（人类或 AI agent）加入游戏
- 每回合选择一个动作（采集资源 / 建造 / 攻击 / 防御 / 交易）
- 资源和战斗结果由链上确定性逻辑计算
- 最终达成胜利条件的玩家获胜

**合约架构**（ECS 模式）：

```
contracts/
├── GameWorld.sol          # 主合约，游戏入口
├── components/
│   ├── PositionComponent.sol   # 位置数据
│   ├── ResourceComponent.sol   # 资源数据
│   ├── HealthComponent.sol     # 生命值数据
│   └── OwnerComponent.sol      # 所有权数据
├── systems/
│   ├── MoveSystem.sol          # 移动逻辑
│   ├── GatherSystem.sol        # 采集逻辑
│   ├── CombatSystem.sol        # 战斗逻辑
│   ├── BuildSystem.sol         # 建造逻辑
│   └── TradeSystem.sol         # 交易逻辑
└── libraries/
    ├── GameTypes.sol           # 类型定义和枚举
    └── RandomLib.sol           # 链上随机数（VRF 或 commit-reveal）
```

### 或者：使用 MUD 框架

MUD 已经提供了完整的 ECS 基础设施：
- 自动化索引器（AI agent 可以高效查询状态）
- 账户抽象支持（降低 agent 使用门槛）
- 在 Base/BSC 上已验证可用

---

## 六、技术挑战与解决方案

| 挑战 | 解决方案 |
|------|----------|
| 随机数不可预测 | Chainlink VRF 或 commit-reveal 方案 |
| 隐藏信息（如手牌） | commit-reveal 或 zkSNARK |
| Gas 成本高 | storage packing、calldata 优化、批量操作 |
| 防 MEV/抢跑 | commit-reveal、私有 mempool |
| 游戏自动推进 | Chainlink Automation / Gelato |
| 复杂计算 | 拆分到多个交易、链下计算 + 链上验证 |

---

## 七、Gas 优化策略

1. **Storage Packing** — 多个变量打包到一个 32 字节 slot
2. **Calldata > Memory** — external 函数参数用 calldata
3. **常量和不可变量** — 存在字节码中，不占 storage
4. **批量操作** — 一次交易处理多个动作
5. **最小化状态变更** — 只在必要时写 storage

---

## 八、实施路径建议

### Phase 1: 原型验证
1. 选定链（Base 或 BSC）
2. 用 MUD 框架搭建最小化全链游戏原型
3. 实现基础游戏循环（加入 → 行动 → 结算）
4. 验证 AI agent 可以纯通过 ABI 交互

### Phase 2: 游戏完善
1. 丰富游戏机制
2. 添加 view 函数满足 AI 决策需求
3. Gas 优化
4. 部署到测试网

### Phase 3: AI Agent 集成测试
1. 编写 AI agent 交互脚本
2. 测试多个 agent 同时博弈
3. 压力测试和 gas 分析
4. 部署到主网

---

## 九、验证方式

1. 部署合约到 Base/BSC 测试网
2. 用脚本模拟 AI agent 调用合约完成完整游戏流程
3. 验证所有游戏状态可通过 view 函数查询
4. 测量每个操作的 gas 消耗
5. 验证事件日志完整记录游戏历程
