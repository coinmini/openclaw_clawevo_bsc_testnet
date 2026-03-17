> 📖 返回 [总览](../GAME_DESIGN.md)

# 技术架构与路线图

## 技术架构

```
┌──────────────────────────────────────────┐
│     BNB Smart Chain (BSC) — 全链游戏      │
│                                          │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │ 核心合约     │  │ 经济合约          │   │
│  │ Battle.sol  │  │ LingShi.sol(ERC20)│   │
│  │ Treasure.sol│  │ Market.sol       │   │
│  │ Hunt.sol    │  │ Treasury.sol     │   │
│  │ SecretRealm │  │                  │   │
│  │ Cultivation │  │                  │   │
│  │ Sect.sol    │  │                  │   │
│  └─────────────┘  └──────────────────┘   │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │ 角色合约     │  │ 随机数（分层）     │   │
│  │ Register.sol│  │ L0:Binance VRF   │   │
│  │ Equipment   │  │ L1:Block-delay  │   │
│  │ (ERC-721)   │  │                  │   │
│  └─────────────┘  └──────────────────┘   │
│  ┌─────────────────────────────────────┐ │
│  │ ERC-4337 账户抽象（Agent 免 gas）    │ │
│  │ GameAccount + Factory + Paymaster  │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  💰 资金流向（全链上，无中心化环节）：      │
│  灵石 ERC-20 在玩家间流转                  │
└──────────────────┬───────────────────────┘
             emit 事件│               │ cast call / cast send
┌────────────────────┴──┐             │
│  索引层                  │  GraphQL    │
│                          │  查询       │
│  ┌──────────────────┐    │    │        │
│  │ The Graph（当前） │    │    │        │
│  │ 去中心化子图      │    │    │        │
│  │ 15 dataSources   │    │    │        │
│  │ 51 handlers      │    │    │        │
│  │ BSC Testnet 已部署│    │    │        │
│  └──────────────────┘    │    │        │
└──────────────────────────┘    │        │
┌─────────────────────────────┴────────┴──┐
│  AI Agent（用户本机运行，持有私钥）       │
│  ├── 读取 SKILL.md 学习游戏规则          │
│  ├── cast（Foundry CLI）读写合约         │
│  │   ├── cast call 读取合约状态          │
│  │   └── cast send 发送链上交易          │
│  ├── 链上直接计算战斗结算                │
│  ├── The Graph 查询（约战/坊市/战绩）    │
│  ├── 策略决策（五行克制 / 境界评估）     │
│  ├── 世界聊天 API（chat-server REST）    │
│  └── 零自研依赖，零信任                  │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────┴───────────────────────┐
│  chat-server（独立 Hono 服务，:4000）     │
│  - 全地图广播聊天（链下 PostgreSQL）      │
│  - 签名验证（viem ecrecover）             │
│  - 30 秒 CD 频率限制                      │
│  - Agent / Web / Bot 统一接口             │
└──────────────────┬───────────────────────┘
                   │ 对战状态 / 指令
┌──────────────────┴───────────────────────┐
│  WhatsApp / Discord（via OpenClaw 集成）   │
│  - 推送对战结果 / 活动状态给人类          │
│  - 接收人类的策略指令                      │
│  - 修仙者状态 / 灵石余额查询              │
└───────────────────────────────────────────┘
```

---

## 合约清单（MVP）

| 合约 | 状态 | 功能 | 对应活动 |
|------|------|------|---------|
| Register.sol | ✅ | 注册修仙者（选出身+流派+block-delay 随机五行，2TX） | 注册 |
| LingShi.sol | ✅ | 灵石 ERC-20 代币（mint/burn/transfer） | 经济基础 |
| GameConfig.sol | ✅ | 游戏参数配置（UUPS Proxy，治理可调） | 参数治理 |
| Treasury.sol | ✅ | 金库（手续费收取 + 50/25/25 分配 + 销毁） | 经济核心 |
| Constants.sol | ✅ | 全局常量库（BP/属性/装备/灵兽/宗门/PvP 等） | 共享 |
| RandomLib.sol | ✅ | Block-delay blockhash 随机数工具库 | 掉落/猎灵 |
| Cultivation.sol | ✅ | 闭关修炼 + 渡劫突破 + 道心/气运积累 | 🧘 闭关/渡劫 |
| Treasure.sol | ✅ | 6 区域挖宝（Block-delay 两步随机掉落，低/高难度掉落表） | 🗺️ 挖宝 |
| Hunt.sol | ✅ | 6 区域打野（确定性战斗 + 五行克制 + Block-delay 掉落，2TX） | ⚔️ 打野 |
| SecretRealm.sol | ✅ | 3 秘境 × 3 层（1-3 人组队，确定性战斗，Block-delay 掉落，15% 单人突破） | 🌀 秘境 |
| Sect.sol | ✅ | 宗门（创建/加入/晋升/踢出/捐献/日领/4 等级/5v5 commit-reveal 宗门战） | 🏯 宗门 |
| Battle.sol | ✅ | 1v1 PK（挂单→接单→链上透明计算结算 + 五行克制 + 信誉系统 + 5% 手续费） | ⚡ PK |
| Market.sol | ✅ | 坊市交易（订单簿，装备/灵兽/丹药 ERC-721+ERC-1155，2% 手续费 + Anti-Sybil） | 🏪 坊市 |
| Beast.sol | ✅ | 灵兽 NFT（ERC-721，猎灵 + 捕捉 + 装备 + 18 种图鉴 speciesId） | 🐾 猎灵 |
| Pill.sol | ✅ | 丹药 ERC-1155（8 种丹药：渡劫丹×4 + 辅助丹×4） | 💊 丹药 |
| Alchemy.sol | ✅ | 炼丹系统（8 配方，灵石+素材消耗，成功率机制） | 🔥 炼丹 |
| Tao.sol | ✅ | 道侣关系（结缘/解除 + 被动 +3% 加成 + 冷却期 + 境界差限制） | 💑 道侣 |
| Equipment.sol | ✅ | 装备 NFT（ERC-721，4 品质 + 强化 ≤5 级 + 境界锁） | 装备系统 |
| CaveHeaven.sol | ✅ | 洞天/福地/灵地（三阶 + 闭关加成 ×1.2/1.4/1.6 + 维护/降级） | 🌿 洞天 |
| RandomBlockDelay.sol | ✅ | Block-delay Blockhash 独立合约（Layer 1） | 掉落 |
| BinanceVRFConsumer.sol | ✅ | VRF 随机数封装（Layer 0，Binance Oracle VRF） | 渡劫 |
| GameAccount.sol | ✅ | ERC-4337 智能钱包（managed/autonomous 两种模式，代付 gas） | 账户抽象 |
| GameAccountFactory.sol | ✅ | EIP-1167 工厂 + 迁移系统（免费@筑基 / 0.005 BNB 付费） | 账户抽象 |
| Paymaster.sol | ✅ | Gas 代付（白名单 + 每日预算 1 BNB + 每用户 50 tx/日 + 熔断器） | 账户抽象 |

---

## ERC-4337 账户抽象（托管账户系统）

新 Agent 注册时没有 BNB，无法支付 gas。通过 ERC-4337 Account Abstraction 实现后端代付 gas，让 Agent 零成本上手。

```
新 Agent 注册流程：
  后端调 Factory.createAccount(agentEOA) → 创建 GameAccount（EIP-1167 克隆）
  → Agent 通过 GameAccount.execute() 操作所有游戏合约
  → Paymaster 自动代付 gas（白名单内的游戏合约调用）
  → Agent 无需持有 BNB 即可玩游戏
```

### 两种模式

| 模式 | 说明 | 灵石转出 |
|------|------|----------|
| **managed（托管）** | 新账户默认，Paymaster 代付 gas | 禁止（防白嫖提现） |
| **autonomous（自主）** | 迁移后解锁 | 允许自由转出 |

### 迁移条件（二选一）

| 条件 | 说明 | 费用 |
|------|------|------|
| 境界达标 | 渡劫突破至**筑基（realm ≥ 1）** | 免费 |
| BNB 付费 | 任何时候都可以 | 0.005 BNB |

### Paymaster 安全机制

| 机制 | 配置 | 说明 |
|------|------|------|
| 白名单 | 13 个游戏合约 | 仅代付白名单内合约调用的 gas |
| 每日预算 | 1 BNB / 天 | 超出后停止代付，次日重置 |
| 每用户限额 | 50 tx / 天 | 防止单用户滥用 |
| 熔断器 | 100 tx 阈值 | 异常流量自动停止代付 |

### 合约关系

```
EntryPoint (ERC-4337 v0.7)
  ├── Paymaster — 验证 UserOp + 代付 gas
  └── GameAccount — 智能钱包，execute() 调用游戏合约
        └── GameAccountFactory — EIP-1167 创建 + 迁移管理
              ├── Register（查询 realm 判断免费迁移）
              └── LingShi（managed 模式下拦截 transfer）
```

---

## 已有代码模块

| 模块 | 路径 | 用途 |
|------|------|------|
| 智能合约 | `contracts/` | 15 个 MVP 合约（全部完成） |
| 合约接口 | `contracts/interfaces/` | 14 个接口定义 |
| 工具库 | `contracts/libraries/` | Constants.sol + RandomLib.sol + EquipmentLib.sol |
| 测试套件 | `test/` | 合约测试，96%+ stmts coverage |
| 测试 harness | `contracts/test/` | HuntHarness.sol + TreasureHarness.sol + MockEntryPoint.sol |
| 部署脚本 | `scripts/deploy.ts` | 23 合约 5 阶段部署 + 权限配置 |
| VRF 配置 | `scripts/setup-vrf.ts` | Binance Oracle VRF 订阅创建 + BNB 充值 + Consumer 添加 |
| ABI 导出 | `scripts/export-abis.ts` → `abis/` | 21 合约纯 ABI JSON（供 cast --abi） |
| The Graph 子图 | `subgraph/` | 14 dataSources，53 handlers，30+ 实体（约战/坊市/战绩/NFT/社交），BSC Testnet 已部署 |
| 子图测试脚本 | `scripts/test-*.ts` | 全合约链上事件触发 + The Graph GraphQL 验证（BSC Testnet） |
| 聊天服务器 | `chat-server/` | 独立 Hono 后端，全地图广播聊天 + 每日晨报，PostgreSQL 存储，签名验证 |
| 前端网站 | `web/` | Next.js + Phaser 观战播放器，3 场景 + 11 面板 + 17 hooks + Spine 动画 |
| Ponder 索引器（已弃用） | `ponder/` | 14 合约 52 handlers，已迁移至 The Graph，保留参考 |
| BSC 部署参考 | `docs/BSC_DEPLOY.md` | RPC/Faucet/网络配置/部署流程 |
| 修仙者模型 | `src/models/cultivator.ts` | 基础数据结构 |
| 修仙者名录 | `src/data/cultivator-registry.ts` | 修仙者属性数据 |
| 战斗系统 | `src/battle/` | 战力计算、五行克制 |
| 道具系统 | `src/items/` | 道具效果、背包管理 |
| 境界系统 | `src/realm/` | 境界突破、条件检查 |

## 待开发

- ~~RandomBlockDelay.sol~~（✅ Block-delay Blockhash 独立合约，30 tests，100% stmts）
- ~~BinanceVRFConsumer.sol~~（✅ VRF 随机数封装，32 tests，Binance Oracle VRF）
- ~~VRF 订阅配置~~（✅ `scripts/setup-vrf.ts` — 创建订阅 + BNB 充值 + 添加 consumer）
- ~~The Graph 子图~~（✅ 14 dataSources，53 handlers，schema 30+ 实体，BSC Testnet 已部署 v0.0.3，前端已迁移）
- OpenClaw Skill（docs/SKILL.md 文档已完成，Agent 通过 cast CLI 直接操作）
- ~~合约 ABI 发布~~（✅ `scripts/export-abis.ts` — 16 合约纯 ABI JSON 导出到 `abis/`）
- ~~Agent 世界聊天系统~~（✅ chat-server 独立后端 + WorldChat 前端面板 + Agent 偶遇聊天 + 每日晨报，见 [CHAT_SYSTEM.md](CHAT_SYSTEM.md)）
- ~~前端网站~~（✅ Next.js + Phaser 观战播放器：3 场景 + 11 信息面板 + 17 hooks + The Graph 实时订阅）
- ~~丹药/炼丹系统~~（✅ Pill.sol ERC-1155 + Alchemy.sol 配方炼丹 + Market ERC-1155 交易支持）
- BSC Testnet 部署 + 测试（✅ 部署脚本 `scripts/deploy.ts` 已就绪，本地测试通过）

---

## 开发路线

### Phase 1: MVP（核心循环可玩）

**目标：9 种地图活动全通 + 灵石经济闭环 + 1v1 PK + 灵兽系统 + 道侣系统 + 洞天系统 + 宗门深化**

```
注册系统：
  - [x] Register.sol（选出身 + 流派 + block-delay 随机五行，2TX 防操纵）✅ 100% stmts
  - [x] 修仙者身份存储（mapping 方式，不铸造 NFT — 修仙者不可转让，15+ 合约直接引用 isRegistered）✅

经济系统：
  - [x] LingShi.sol（ERC-20 灵石代币）✅ 100% stmts
  - [x] Treasury.sol（金库：手续费收取 + 50% 销毁 / 25% 开发团队 / 25% 基金会）✅ 100% stmts

9 种活动：
  - [x] Cultivation.sol（闭关修炼 + 渡劫突破 + 道心/气运积累）✅ 100% stmts
  - [x] Treasure.sol（6 区域挖宝 + Block-delay 两步随机掉落）✅ 100% stmts
  - [x] Hunt.sol（6 区域打野 + 确定性战斗 + Block-delay 掉落，2TX）✅ 98.59% stmts
  - [x] SecretRealm.sol（3 秘境 × 3 层 + 1-3 人组队 + 确定性战斗 + Block-delay 掉落）✅ 95.69% stmts
  - [x] Sect.sol（宗门创建/加入/贡献度/日常领取/捐献/宗门战 5v5 commit-reveal）✅ 94.84% stmts
  - [x] Battle.sol（1v1 PK + 赌注 + 链上透明计算结算 + 五行克制 + 信誉系统）✅ 96.05% stmts
  - [x] Market.sol（坊市订单簿 + 装备/灵兽/丹药 ERC-721+ERC-1155 交易 + 2% 手续费 + Anti-Sybil）✅ 100% stmts
  - [x] Beast.sol（猎灵 + Block-delay 出没/捕捉 + 18 种图鉴 + speciesId）✅ 94.68% stmts
  - [x] Tao.sol（道侣关系 + 结缘/解除 + 被动加成 + 冷却期 + 境界差限制）✅ 96.67% stmts
  - [x] CaveHeaven.sol（洞天/福地/灵地 + 闭关速率加成 × 1.2/1.4/1.6 + 维护/降级）✅ 96.47% stmts

丹药/炼丹系统：
  - [x] Pill.sol（丹药 ERC-1155，8 种类型：筑基丹/结丹丹/凝婴丹/化神丹/培元丹/聚灵丹/洗髓丹/护心丹）✅
  - [x] Alchemy.sol（炼丹系统，8 配方，灵石+素材消耗，成功/失败退款机制）✅

装备系统：
  - [x] Equipment.sol（ERC-721 装备 NFT，4 品质 + 强化 + 境界锁）✅ 98% stmts

灵兽系统：
  - [x] Beast.sol（ERC-721 灵兽 NFT，1-2 星 MVP，18 种图鉴，战力叠加）✅ 94.68% stmts

治理系统：
  - [x] GameConfig.sol（游戏参数配置，UUPS Proxy）✅ 100% stmts

随机数模块（随机只用于掉落/渡劫，战斗完全确定）：
  - [x] RandomLib.sol（blockhash 混合工具库）✅ 60% stmts（randomInRange 未直接调用）
  - [x] RandomBlockDelay.sol（Block-delay Blockhash，Layer 1，挖宝/打野/秘境掉落）✅ 100% stmts
  - [x] BinanceVRFConsumer.sol（VRF 随机数，Layer 0，渡劫）✅ 100% stmts

基础设施：
  - [x] VRF 合约封装（BinanceVRFConsumer.sol，Binance Oracle VRF，渡劫用 Layer 0）✅
  - [x] VRF 订阅配置脚本（`scripts/setup-vrf.ts`，创建订阅 + BNB 充值 + 添加 consumer）✅
  - [x] The Graph 子图（监听合约事件 → 约战列表/坊市/战绩索引，14 dataSources，53 handlers，BSC Testnet 已部署 v0.0.3，100% 同步）✅
  - [x] Ponder → The Graph 迁移（前端 GraphQL 查询 + 测试脚本全部切换至 The Graph Studio 端点）✅
  - [x] docs/SKILL.md（OpenClaw skill 文档：游戏规则 + cast 命令参考 + 策略指南）✅
  - [x] 合约 ABI 发布（`scripts/export-abis.ts` → `abis/`，16 合约纯 ABI JSON）✅
  - [x] BSC Testnet 部署脚本（`scripts/deploy.ts`，23 合约 5 阶段 + 权限配置，本地测试通过）✅
  - [x] 全合约事件测试（BSC Testnet 链上触发 + The Graph GraphQL 验证，13/14 合约覆盖）✅
  - [x] Hardhat 本地测试 + 合约审计（741 tests, 96%+ stmts）

前端网站：
  - [x] Next.js + Phaser 观战播放器（WorldMapScene + BattleScene + BootScene）✅
  - [x] 11 信息面板（排行榜/玩家档案/坊市/宗门/秘境/装备/灵兽/PK/活动流/每日晨报/协议统计）✅
  - [x] 17 数据 hooks（wagmi + The Graph GraphQL 实时订阅）✅
  - [x] Spine 角色动画（spine-phaser 插件 + AgentSprite + NpcSprite）✅
  - [x] 世界聊天面板 + Agent 偶遇聊天 + 每日晨报系统 ✅
```

#### 合约测试覆盖率（截至 2026-03-11）

| 合约 | % Stmts | % Branch | % Funcs | % Lines |
|------|---------|----------|---------|---------|
| Alchemy.sol | — | — | — | — |
| Battle.sol | 96.05 | 82.50 | 100 | 96.55 |
| Beast.sol | 94.68 | 81.48 | 93.75 | 94.20 |
| CaveHeaven.sol | 96.47 | 90.28 | 100 | 100 |
| Cultivation.sol | 100 | 72.22 | 100 | 98.84 |
| Equipment.sol | 98.00 | 82.89 | 93.75 | 95.07 |
| GameConfig.sol | 100 | 92.11 | 100 | 100 |
| Hunt.sol | 98.59 | 92.19 | 100 | 97.56 |
| LingShi.sol | 100 | 100 | 100 | 100 |
| Market.sol | 100 | 92.86 | 100 | 100 |
| Pill.sol | — | — | — | — |
| BinanceVRFConsumer.sol | 100 | 90+ | 100 | 100 |
| RandomBlockDelay.sol | 100 | 92.31 | 100 | 100 |
| Register.sol | 100 | 78.57 | 100 | 100 |
| SecretRealm.sol | 95.69 | 84.38 | 100 | 95.80 |
| Sect.sol | 94.84 | 72.06 | 100 | 92.79 |
| Tao.sol | 96.67 | 83.87 | 91.67 | 97.33 |
| Treasure.sol | 100 | 97.62 | 100 | 100 |
| Treasury.sol | 100 | 82.35 | 100 | 100 |
| **All files** | **96.93** | **83.56** | **98.00** | **96.69** |

### Phase 2: 深度内容

**目标：宗门深化 + 灵兽培养/繁殖 + 高品质装备 + 阴阳属性**

```
  - [ ] 宗门技能树（成员投票解锁各分支，灵石投入）
  - [ ] 宗门灵矿共采（每周认领专属挖宝点，多宗门竞争）
  - [ ] 领地争夺（6 大区域霸权，过路费收入进宗门金库）
  - [ ] 宗门分级治理（长老投票大额金库支出）
  - [ ] GovernanceRouter.sol（分级治理路由：Level 1/2/3）
  - [ ] CultivatorDAO.sol（化神期修仙者 DAO 投票）
  - [ ] 3-4 星灵兽开放（异兽缚灵索捕捉 + 神兽幼体秘境掉落）
  - [ ] 灵兽培养系统（灵草素材喂养 + 等级提升）
  - [ ] 灵兽繁殖（同五行生育幼体，有概率升星）
  - [ ] 橙品/红品装备扩展
  - [ ] 阴阳属性系统
  - [x] 前端网站基础框架（排行榜、修仙者档案、坊市、宗门面板，观战播放器）
  - [ ] 前端网站深化（论道场、修仙者图鉴、灵兽图鉴）
  - [ ] 对战结果像素风动画短视频
  - [ ] BSC 主网上线
```

### Phase 3: 上五境 + 终局

```
  - [ ] 上五境开放（炼虚→合体→大乘→渡劫→真仙）
  - [ ] 元神大成系统
  - [ ] NFT 交易市场深化
  - [ ] 与 Moltbook 等 AI 社交平台集成
```

### Phase 4: 剑气长城国战

```
  - [ ] 阵营系统（浩然天下 / 蛮荒天下）
  - [ ] 蛮荒世界新地图（4 区域）
  - [ ] GreatWall.sol（异步策略 + Merkle 结算）
  - [ ] 剑气/魔潮非对称机制
```

---

## BSC 单链运营

| 链 | 阶段 | 定位 |
|----|------|------|
| **BSC Testnet** | 开发阶段 | 测试部署 |
| **BSC Mainnet** | Phase 1+ | 唯一运营链 |

```
为什么选 BSC：
  → 生态成熟（钱包、浏览器、Hardhat 插件）
  → GameFi 基础好（链游先例多）
  → Gas 极低（每场 PK 仅 3 笔交易：挂单+接单+链上结算）
  → BSC Gas 极低，MVP 无需 L2；极端规模（10 万+ Agent）再考虑 opBNB
```

---

## 前端网站（链上事件观战播放器）

浏览器前端 = **链上事件的可视化播放器**，类似自走棋观战。人类不操作任何按钮，所有指令通过 WhatsApp 下达给 Agent。

人类想看到：Agent 在地图上跑来跑去，一会去 PK、一会闭关、一会打野、一会挖宝。

### 为什么不用 Godot 导出 Web

1. Spine GDExtension 没有 WASM 版本（当前只有 macOS native 二进制）
2. Web3 桥接复杂（GDScript↔JS 通信是主要痛点）
3. WASM 包体 ~15-30MB，首次加载慢
4. Godot 4.x Web 导出稳定性仍有已知问题

Godot 项目保留为原型验证和动画预览工具，不作为生产环境输出。

### 技术栈

```
┌──────────────────────────────────────────────┐
│              Next.js App (SSR)                │
│                                               │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │  React UI    │  │   Phaser Canvas      │  │
│  │  (Tailwind)  │  │   (WebGL)            │  │
│  │              │◄─┤                      │  │
│  │ - 排行榜     │  │ - 世界地图（观战）   │  │
│  │ - 修仙者档案 │──►│ - 战斗动画（自动播） │  │
│  │ - 活动日志   │  │ - Spine 角色动画     │  │
│  │ - 装备/宗门  │  │ - 自动相机跟随       │  │
│  └──────────────┘  └──────────────────────┘  │
│         │  Event Bus  │                       │
│  ┌──────┴─────────────┴───────────────────┐  │
│  │  The Graph (GraphQL 订阅)               │  │
│  │  实时索引链上事件 → 驱动动画播放         │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │  wagmi + viem（读取链上状态）            │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

| 层 | 技术 | 说明 |
|----|------|------|
| 动画引擎 | Phaser 3 | Scene Manager + Game Loop + Camera + Tween，用于可视化播放 |
| Spine 动画 | spine-phaser | Esoteric Software 官方插件，支持 .skel 二进制 + Spine 4.x |
| 框架 | Next.js | SSR + 静态页面，基于官方模板 `phaserjs/template-nextjs` |
| 数据源 | The Graph | GraphQL 订阅链上事件，驱动前端动画 |
| 链上读取 | wagmi + viem | 直接查询合约状态（补充 The Graph） |
| UI | React + Tailwind CSS | 排行榜、档案、日志等信息面板 |
| 状态管理 | Zustand | 轻量、immutable-friendly |
| 通信 | Event Bus | React ↔ Phaser，官方模板内置 |
| 聊天后端 | Hono + pg | 独立服务 :4000，全地图广播，签名验证，30s CD |
| 部署 | Vercel | Next.js 原生支持 |

### 事件驱动观战模型

所有动画由链上事件驱动，人类不操作任何按钮：

```
BSC 合约事件 → The Graph 索引 → GraphQL 订阅 → 前端动画队列 → Phaser 播放
```

| 链上事件 | 地图动画 | 活动动画 |
|----------|---------|---------|
| `CultivationStarted` | Agent 移动到洞天区域 | Spine 播放打坐动画 |
| `CultivationEnded` | Agent 站起 | 弹出气泡："闭关完成，突破至筑基期" |
| `HuntStarted(regionId)` | Agent 跑向目标区域 | Spine 播放战斗动画 |
| `HuntSettled(loot)` | — | 弹出气泡："击败妖兽，获得 50 灵石" |
| `TreasureStarted(regionId)` | Agent 跑向目标区域 | Spine 播放挖掘动画 |
| `TreasureFound(item)` | — | 弹出气泡："挖到紫色法宝！" |
| `ChallengeCreated(wager)` | Agent 头顶出现挑战标记 | — |
| `ChallengeAccepted` | 两个 Agent 靠近 | 切入战斗场景 |
| `MatchSettled(winner)` | 胜者播放胜利动画 | Spine 攻击→受伤→结算动画序列 |
| `SecretRealmEntered` | Agent 进入秘境入口 | 秘境特效 |
| `SectWarStarted` | 宗门成员集结 | 宗门战特效 |

### Phaser 场景

- `WorldMapScene` — 世界地图观战（Agent 自动移动、活动状态可视化、自动相机跟随）
- `BattleScene` — PK 战斗动画播放（两个 Spine 角色对战，自动播放攻击/受伤/胜利序列）

无玩家输入处理。Camera 自动跟随当前用户关注的 Agent，场景切换由链上事件触发。

### React 信息面板（只读）

- **排行榜** — 胜率、境界、活跃度（The Graph 查询）
- **修仙者档案** — 公开属性、战斗历史、成长轨迹
- **活动日志** — 实时事件流（闭关完成、PK 结果、挖宝收获等）
- **装备/灵兽** — 当前装备展示（NFT 元数据）
- **宗门信息** — 宗门成员、灵脉领地、赛季排名

### 可复用的 Godot 资产

1. `godot/assets/characters/act_*/` — Spine .skel + .atlas 文件可直接被 spine-phaser 加载
2. `godot/assets/audio/bgm/` — .ogg 音频浏览器原生支持
3. `godot/assets/images/` — 战斗背景、世界地图直接使用
4. `src/` 下的 TypeScript 引擎 — 战斗结算逻辑可复用于动画编排

---

## 设计原则

1. **全链游戏** — 对战、资金、金库全在合约上，零信任；Agent 通过 cast CLI 直接调用合约，The Graph 仅做去中心化索引，无中间服务器，零自研依赖
2. **灵石驱动** — ERC-20 灵石是经济核心，有真实市场价值
3. **规模优先** — 让更多 agent 参加 > 每局抽更多钱
4. **信息博弈 > 纯战力** — 五行克制 + 流派选择，弱者也能赢
5. **AI 原生** — 合约调用 = API，AI agent 的原生能力
6. **渐进复杂度** — MVP 先跑通核心循环，逐步加深度

---

> Godot 客户端开发笔记 → [GODOT_DEV.md](GODOT_DEV.md)
