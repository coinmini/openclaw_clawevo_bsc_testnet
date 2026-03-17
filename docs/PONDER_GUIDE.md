# Ponder 索引框架指南

> 基于 [ponder.sh](https://ponder.sh) 官方文档整理，适配本项目（BSC 全链修仙游戏）。

## 一、概述

Ponder 是开源的 EVM 区块链索引框架，用 **纯 TypeScript** 编写索引逻辑，底层用 PostgreSQL 存储，自动生成 GraphQL API。

### 核心优势

| 特性 | 说明 |
|------|------|
| **性能** | 冷启动比 The Graph 快 ~10x，缓存后快 ~15x，磁盘占用少 35x |
| **纯 TypeScript** | 可 import NPM 包、调 HTTP 接口、完整类型推断，告别 AssemblyScript |
| **热重载** | 改代码即时生效，无需重新部署 |
| **自动 Reorg 处理** | 内置事务日志，检测到 reorg 自动回滚重建 |
| **崩溃恢复** | 重启后从最近的 finalized block 恢复 |
| **自托管免费** | Docker + PostgreSQL，零额外成本 |

### 官方 Benchmark（vs The Graph Node）

| 指标 | Ponder | The Graph |
|------|--------|-----------|
| 冷启动同步 | 37s | 5m 28s |
| 缓存同步 | 5s | 1m 15s |
| 磁盘占用 | 31 MB | 1.1 GB |
| RPC 请求数 | 108k | 167k |

---

## 二、快速开始

### 2.1 创建项目

```bash
pnpm create ponder
```

安装过程中选择模板（Default 或 ERC-20 示例）。

### 2.2 启动服务器

开发模式下执行 ponder 的 dev 命令启动本地服务器。

Ponder 会：
1. 连接 PostgreSQL 数据库
2. 启动 HTTP 服务（默认端口 42069）
3. 开始从链上回填索引数据

### 2.3 查询数据

浏览器打开 `http://localhost:42069/graphql`，使用自动生成的 GraphQL API：

```graphql
query {
  accounts(orderBy: "balance", orderDirection: "desc", limit: 10) {
    items {
      address
      balance
    }
    totalCount
  }
}
```

还支持：
- 直连 PostgreSQL 查询
- SQL over HTTP
- 自定义 API 端点

---

## 三、项目结构

```
my-ponder-app/
├── ponder.config.ts       # 链 + 合约配置
├── ponder.schema.ts       # 数据库 Schema（TypeScript）
├── src/
│   ├── index.ts           # 索引逻辑（event handlers）
│   └── api/
│       └── index.ts       # 自定义 API 路由（Hono）
├── abis/
│   └── MyContract.ts      # ABI 文件（as const）
└── package.json
```

---

## 四、配置详解

### 4.1 链配置（chains）

在 `ponder.config.ts` 中配置链信息：

```typescript
import { createConfig } from "ponder";

export default createConfig({
  chains: {
    bsc: {
      id: 56,                        // chainId
      rpc: "https://bsc-rpc.com",   // RPC 端点
    },
    bscTestnet: {
      id: 97,
      rpc: "https://data-seed-prebsc-1-s1.binance.org:8545",
    },
  },
  // ...
});
```

**高级选项：**

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `pollingInterval` | 1000ms | 检查新区块频率 |
| `disableCache` | false | 开发链（Anvil）设 true |
| `ethGetLogsBlockRange` | 自动 | 手动限制 eth_getLogs 范围 |

**WebSocket 支持：**

```typescript
bsc: {
  id: 56,
  rpc: "https://bsc-rpc.com",
  ws: "wss://bsc-ws.com",        // 可选，降低延迟
}
```

**多端点负载均衡：**

```typescript
bsc: {
  id: 56,
  rpc: [
    "https://bsc-rpc-1.com",
    "https://bsc-rpc-2.com",     // 自动负载均衡 + 故障转移
  ],
}
```

**Viem Transport（高级）：**

```typescript
import { http, fallback, rateLimit } from "viem";

bsc: {
  id: 56,
  rpc: rateLimit(
    fallback([http("https://rpc-1.com"), http("https://rpc-2.com")]),
    { requestsPerSecond: 50 }
  ),
}
```

### 4.2 合约配置（contracts）

```typescript
export default createConfig({
  chains: { /* ... */ },
  contracts: {
    Battle: {
      abi: BattleAbi,                              // ABI（as const）
      chain: "bscTestnet",                         // 链名称
      address: "0x1234...abcd",                    // 合约地址
      startBlock: 93292939,                        // 部署区块（避免无效扫描）
    },
    Equipment: {
      abi: EquipmentAbi,
      chain: "bscTestnet",
      address: "0xabcd...1234",
      startBlock: 93292939,
    },
  },
});
```

**多地址（同 ABI 多合约）：**

```typescript
Equipment: {
  abi: EquipmentAbi,
  chain: "bscTestnet",
  address: ["0xaaa...", "0xbbb...", "0xccc..."],
  startBlock: 93292939,
}
```

**Factory 模式（动态发现子合约，示例）：**

```typescript
import { factory } from "ponder";

ChildContract: {
  abi: ChildContractAbi,
  chain: "bscTestnet",
  address: factory({
    address: "0xFactoryAddress...",
    event: parseAbiItem(
      "event ChildCreated(address indexed owner, address indexed child)"
    ),
    parameter: "child",
  }),
  startBlock: 93292939,
}
```

**多链部署（同合约不同链）：**

```typescript
LingShi: {
  abi: LingShiAbi,
  chain: {
    bsc: { address: "0x...", startBlock: 100000 },
    bscTestnet: { address: "0x...", startBlock: 93292939 },
  },
}
```

**高级选项：**

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `startBlock` | 0 | 起始区块，设为部署区块避免浪费 RPC |
| `endBlock` | undefined | 结束区块，开发时限定范围加速热重载 |
| `filter` | - | 按 indexed 参数过滤事件 |
| `includeCallTraces` | false | 索引函数调用（不仅事件） |
| `includeTransactionReceipts` | false | 在 handler 中访问 receipt 数据 |

**事件过滤示例：**

```typescript
Battle: {
  abi: BattleAbi,
  chain: "bscTestnet",
  address: "0x...",
  filter: {
    event: "MatchSettled",
    args: { playerA: "0xSpecificPlayer..." },  // 只索引特定玩家
  },
}
```

### 4.3 ABI 文件

ABI 必须以 TypeScript 文件保存，并使用 `as const`：

```typescript
// abis/Battle.ts
export const BattleAbi = [
  {
    type: "event",
    name: "ChallengeCreated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "wager", type: "uint256", indexed: false },
    ],
  },
  // ... 其他事件和函数
] as const;
```

> 可从 JSON ABI 转换：将 JSON 内容赋值给 `export const XxxAbi = [...] as const`。

---

## 五、Schema 设计

### 5.1 基本用法（onchainTable）

```typescript
// ponder.schema.ts
import { onchainTable, onchainEnum, index, primaryKey, relations } from "ponder";

export const player = onchainTable("player", (t) => ({
  address: t.hex().primaryKey(),         // 0x${string} 类型
  origin: t.integer().notNull(),
  element: t.integer().notNull(),
  attack: t.bigint().notNull(),          // 对应 uint256
  defense: t.bigint().notNull(),
  realm: t.integer().notNull(),
  registeredAt: t.bigint().notNull(),
  totalMatchesPlayed: t.integer().notNull(),
  totalMatchesWon: t.integer().notNull(),
}));
```

### 5.2 列类型

| Ponder 类型 | TypeScript | SQL 类型 | 用途 |
|-------------|-----------|----------|------|
| `t.text()` | string | TEXT | UTF-8 字符串 |
| `t.hex()` | `0x${string}` | TEXT | 地址、哈希 |
| `t.bigint()` | bigint | NUMERIC(78,0) | uint256/int256 |
| `t.integer()` | number | INTEGER | 4 字节整数 |
| `t.real()` | number | REAL | 浮点数 |
| `t.boolean()` | boolean | BOOLEAN | 布尔值 |
| `t.timestamp()` | Date | TIMESTAMP | 时间戳 |
| `t.json()` | any | JSON | JSON 对象 |

**列修饰符：**

```typescript
t.bigint().notNull()                    // 非空
t.text().primaryKey()                   // 主键
t.integer().array()                     // 数组类型
t.bigint().default(0n)                  // 默认值
```

### 5.3 枚举

```typescript
export const challengeStatus = onchainEnum("challenge_status", [
  "Open", "Settled", "Cancelled"
]);

export const challenge = onchainTable("challenge", (t) => ({
  id: t.text().primaryKey(),
  status: challengeStatus().notNull(),
  // ...
}));
```

### 5.4 复合主键与索引

```typescript
export const playerDailyStats = onchainTable(
  "player_daily_stats",
  (t) => ({
    playerAddress: t.hex().notNull(),
    dayId: t.integer().notNull(),
    matchesPlayed: t.integer().notNull(),
    wagerWon: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.playerAddress, table.dayId] }),
    playerIdx: index().on(table.playerAddress),
  })
);
```

### 5.5 关系（Relations）

```typescript
export const playerRelations = relations(player, ({ many }) => ({
  challenges: many(challenge),
  equipments: many(equipmentToken),
  beasts: many(beastToken),
}));

export const challengeRelations = relations(challenge, ({ one }) => ({
  creator: one(player, {
    fields: [challenge.creatorAddress],
    references: [player.address],
  }),
}));
```

### 5.6 视图（Views）

```typescript
import { onchainView } from "ponder";
import { sql, sum } from "drizzle-orm";

export const treasuryDailyView = onchainView("treasury_daily").as((qb) =>
  qb
    .select({
      day: sql`DATE_TRUNC('day', to_timestamp(${feeEvent.timestamp}))`.as("day"),
      totalCollected: sum(feeEvent.amount).as("total_collected"),
    })
    .from(feeEvent)
    .groupBy(sql`DATE_TRUNC('day', to_timestamp(${feeEvent.timestamp}))`)
);
```

---

## 六、索引逻辑（Indexing Functions）

### 6.1 基本结构

```typescript
// src/index.ts
import { ponder } from "ponder:registry";
import { player, challenge } from "ponder:schema";

ponder.on("Battle:ChallengeCreated", async ({ event, context }) => {
  // event.args     — 事件参数（类型安全）
  // event.log      — 原始日志（address, blockNumber, transactionHash...）
  // event.block    — 区块信息（timestamp, number...）
  // context.db     — 数据库操作
  // context.chain  — 当前链信息

  await context.db.insert(challenge).values({
    id: event.args.challengeId.toString(),
    creatorAddress: event.args.creator,
    wager: event.args.wager,
    status: "Open",
    createdAt: event.block.timestamp,
    createdBlock: BigInt(event.block.number),
  });
});
```

### 6.2 数据库操作

**Insert（插入）：**

```typescript
await context.db.insert(player).values({
  address: event.args.player,
  balance: 0n,
});

// 批量插入
await context.db.insert(player).values([
  { address: "0xaaa...", balance: 0n },
  { address: "0xbbb...", balance: 100n },
]);
```

**Find（查找）：**

```typescript
const row = await context.db.find(player, { address: "0xaaa..." });
// 返回 row 或 null
```

**Update（更新）：**

```typescript
// 直接赋值
await context.db
  .update(player, { address: event.args.player })
  .set({ realm: 2 });

// 基于当前值更新
await context.db
  .update(player, { address: event.args.player })
  .set((row) => ({
    totalMatchesPlayed: row.totalMatchesPlayed + 1,
    totalWagerWon: row.totalWagerWon + event.args.payout,
  }));
```

**Delete（删除）：**

```typescript
const deleted = await context.db.delete(player, { address: "0xaaa..." });
// 返回 boolean
```

**Upsert（插入或更新）：**

```typescript
// 最常用模式：不存在则插入，存在则更新
await context.db
  .insert(player)
  .values({
    address: event.args.player,
    origin: event.args.origin,
    totalMatchesPlayed: 0,
  })
  .onConflictDoUpdate((row) => ({
    totalMatchesPlayed: row.totalMatchesPlayed + 1,
  }));

// 跳过已存在记录
await context.db
  .insert(player)
  .values({ address: event.args.player, origin: 0 })
  .onConflictDoNothing();
```

> Store API 比原生 SQL 快 100-1000x（内存操作 + 批量 COPY 刷盘）。

### 6.3 执行顺序

按 EVM 执行顺序处理：`区块号 → 交易索引 → 日志索引`。

### 6.4 自动 Reorg 处理

Ponder 自动检测 reorg 并：
1. 清除非规范 RPC 缓存
2. 用事务日志回滚数据库到共同祖先区块
3. 从规范链重新获取和处理数据

无需手动处理。

---

## 七、GraphQL API

### 7.1 启用

```typescript
// src/api/index.ts
import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { graphql } from "ponder";

const app = new Hono();
app.use("/graphql", graphql({ db, schema }));
export default app;
```

### 7.2 自动生成规则

每个 `onchainTable` 自动生成：
- **单数查询**：`player(address: "0x...")` — 按主键查单条
- **复数查询**：`players(...)` — 分页查多条

### 7.3 过滤

```graphql
# 基础过滤
query {
  players(where: { realm: 3 }) {
    items { address realm }
  }
}

# 范围 + 组合
query {
  players(where: {
    AND: [
      { totalMatchesPlayed_gte: 10 }
      { element: 1 }
    ]
  }) {
    items { address totalMatchesWon }
  }
}
```

**可用操作符：**

| 类型 | 操作符 |
|------|--------|
| 通用 | `_not`, `_in`, `_not_in` |
| 数值 | `_gt`, `_lt`, `_gte`, `_lte` |
| 字符串 | `_contains`, `_starts_with`, `_ends_with`（及 `_not_` 版本） |
| 数组 | `_has`, `_not_has` |
| 逻辑 | `AND`, `OR` |

### 7.4 排序与分页

```graphql
# 游标分页（大数据集推荐）
query {
  challenges(orderBy: "createdAt", orderDirection: "desc", limit: 20) {
    items { id wager status }
    pageInfo {
      endCursor
      hasNextPage
    }
    totalCount
  }
}

# 下一页
query {
  challenges(
    orderBy: "createdAt"
    orderDirection: "desc"
    limit: 20
    after: "Mxhc3NDb3JlLTA="
  ) {
    items { id wager status }
    pageInfo { endCursor hasNextPage }
  }
}

# 偏移分页
query {
  challenges(orderBy: "createdAt", limit: 20, offset: 40) {
    items { id wager status }
  }
}
```

### 7.5 关系查询

```graphql
query {
  players {
    items {
      address
      realm
      challenges {
        items { id wager status }
      }
      equipments {
        items { tokenId quality enhanceLevel }
      }
    }
  }
}
```

---

## 八、部署

### 8.1 环境变量

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
DATABASE_SCHEMA=ponder-v1          # 每次部署用不同 schema 名
```

### 8.2 自托管（推荐）

**要求：**
- PostgreSQL 数据库（同私有网络，延迟 <50ms）
- Node.js 运行环境

**启动命令：**

```bash
# 生产模式
ponder start --schema=ponder-$(git rev-parse --short HEAD)

# 带 views 自动切换
ponder start --schema=deploy-123 --views-schema=my-project
```

**Docker 部署：**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN pnpm install
CMD ["pnpm", "start"]
```

### 8.3 健康检查

| 端点 | 说明 |
|------|------|
| `/health` | 启动即返回 200 |
| `/ready` | 回填完成后返回 200，回填中返回 503 |

### 8.4 水平扩展

```bash
# 索引进程（单实例）
ponder start --schema=deploy-123

# HTTP 服务（可多实例，放在负载均衡后面）
ponder serve --schema=deploy-123
```

### 8.5 Views 模式（零停机切换）

```bash
# 部署新版本
ponder start --schema=deploy-v2 --views-schema=my-game

# 查询层始终查 my-game schema 的 views
# 回填完成后 views 自动指向 deploy-v2
```

---

## 九、与 The Graph 的关键差异

| 维度 | The Graph | Ponder |
|------|-----------|--------|
| **语言** | AssemblyScript | TypeScript |
| **Schema** | GraphQL SDL | TypeScript（Drizzle） |
| **Manifest** | YAML（subgraph.yaml） | TypeScript（ponder.config.ts） |
| **DB 操作** | `entity.save()` 同步 | `context.db.insert()` 异步 |
| **ID 类型** | `Bytes!` / `String!` | `hex()` / `text()` |
| **Reorg** | 需手动处理 | 自动 |
| **开发体验** | 部署后才能测试 | 本地热重载 |
| **部署** | 去中心化网络 / 托管 | 自托管 |
| **GraphQL 语法** | `where: { field_gt: 10 }` | `where: { field_gte: 10 }` |
| **分页** | `first` + `skip` | `limit` + `after`/`offset` |
| **性能** | 基准 | ~10-15x 更快 |

---

## 十、本项目迁移注意事项

### 10.1 Schema 映射（The Graph → Ponder）

| The Graph | Ponder |
|-----------|--------|
| `Bytes!` (ID) | `t.hex().primaryKey()` 或 `t.text().primaryKey()` |
| `BigInt!` | `t.bigint().notNull()` |
| `Int!` | `t.integer().notNull()` |
| `String!` | `t.text().notNull()` |
| `Boolean!` | `t.boolean().notNull()` |
| `@entity(immutable: true)` | 普通表（无等价优化，但 Store API 本身很快） |
| `@derivedFrom(field: "x")` | `relations()` + `many()` |
| enum | `onchainEnum()` |

### 10.2 Handler 映射

```typescript
// The Graph (AssemblyScript)
export function handleChallengeCreated(event: ChallengeCreated): void {
  let id = bigIntToBytes(event.params.challengeId);
  let challenge = new Challenge(id);
  challenge.wager = event.params.wager;
  challenge.save();
}

// Ponder (TypeScript)
ponder.on("Battle:ChallengeCreated", async ({ event, context }) => {
  await context.db.insert(challenge).values({
    id: event.args.challengeId.toString(),
    wager: event.args.wager,
  });
});
```

### 10.3 当前合约清单（需在 ponder.config.ts 配置）

| 合约 | 事件数 | 说明 |
|------|--------|------|
| Register | 2 | 玩家注册 |
| Battle | 3 | PvP 约战 |
| Market | 4 | 坊市交易 |
| Cultivation | 3 | 闭关修炼 |
| Hunt | 2 | 打野历练 |
| Treasure | 2 | 挖宝探险 |
| Equipment | 7 | 装备系统 |
| Beast | 5 | 灵兽系统 |
| CaveHeaven | 5 | 洞天福地 |
| Tao | 4 | 道侣系统 |
| Sect | 12 | 宗门系统 |
| SecretRealm | 6 | 秘境探索 |
| Treasury | 1+ | 金库统计 |
| LingShi | - | ERC-20 灵石 |
