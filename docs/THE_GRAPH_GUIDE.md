# The Graph 子图开发指南

> 基于 [The Graph 官方文档](https://thegraph.com/docs/en/subgraphs/quick-start/) 整理，适用于 BSC (BNB Smart Chain) 子图开发。

## 目录

- [网络支持](#网络支持)
- [环境准备](#环境准备)
- [初始化子图](#初始化子图)
- [核心文件结构](#核心文件结构)
- [Manifest 配置 (subgraph.yaml)](#manifest-配置-subgraphyaml)
- [GraphQL Schema (schema.graphql)](#graphql-schema-schemagraphql)
- [AssemblyScript Mappings](#assemblyscript-mappings)
- [AssemblyScript API 参考](#assemblyscript-api-参考)
- [部署流程](#部署流程)
- [BSC 注意事项](#bsc-注意事项)
- [自托管部署（Self-Hosted Graph Node）](#自托管部署self-hosted-graph-node)
- [双部署架构（推荐）](#双部署架构推荐)

---

## 网络支持

| 项目 | 值 |
|------|-----|
| 网络名称 | `bsc` (BNB Smart Chain Mainnet) |
| Chain ID | 56 |
| 原生代币 | BNB |
| Studio 支持 | 完整支持（含 Substreams + Firehose） |
| 去中心化网络 | 支持（含 Indexer 奖励） |

BSC 在 The Graph Network 上有完整的子图支持，可通过 Subgraph Studio 部署。

---

## 环境准备

### 前置条件

- Node.js + 包管理器 (npm / yarn / pnpm)
- 加密钱包（用于 Studio 认证）
- 已部署的智能合约地址 + ABI

### 安装 CLI

```bash
# npm
npm install -g @graphprotocol/graph-cli@latest

# yarn
yarn global add @graphprotocol/graph-cli

# 验证安装
graph --version
```

---

## 初始化子图

```bash
graph init <SUBGRAPH_SLUG>
```

交互式向导会要求：

1. **Protocol** — 选择 `ethereum`（BSC 兼容 EVM）
2. **Subgraph slug** — 子图标识名
3. **Network** — 选择 `bsc`
4. **Contract address** — 合约地址
5. **ABI** — 自动拉取或手动提供 JSON
6. **Start block** — 合约部署区块号（建议设置，避免从创世块索引）
7. **Contract name** — 合约名称
8. **Index events** — 是否自动生成事件索引

初始化后目录结构：

```
my-subgraph/
├── abis/
│   └── MyContract.json
├── generated/          # graph codegen 生成
├── src/
│   └── mapping.ts      # AssemblyScript 映射
├── schema.graphql      # GraphQL Schema
├── subgraph.yaml       # Manifest 配置
├── package.json
└── tsconfig.json
```

---

## 核心文件结构

| 文件 | 用途 |
|------|------|
| `subgraph.yaml` | Manifest — 指定索引哪些合约、事件、区块 |
| `schema.graphql` | Schema — 定义 GraphQL 实体（可查询的数据结构） |
| `src/mapping.ts` | Mappings — 将链上事件转换为实体的 AssemblyScript 代码 |

---

## Manifest 配置 (subgraph.yaml)

### 基础结构

```yaml
specVersion: 1.3.0
description: 修仙游戏链上事件索引
repository: https://github.com/your-repo
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto                    # 自动修剪历史数据

dataSources:
  - kind: ethereum/contract
    name: Register
    network: bsc                 # BSC 网络
    source:
      address: '0x...'          # 合约地址
      abi: Register
      startBlock: 12345678       # 合约部署区块
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Cultivator
      abis:
        - name: Register
          file: ./abis/Register.json
      eventHandlers:
        - event: CultivatorRegistered(indexed address,uint8,uint8)
          handler: handleCultivatorRegistered
      file: ./src/register.ts
```

### 关键字段说明

| 字段 | 说明 |
|------|------|
| `specVersion` | Manifest 版本，最新 `1.3.0` |
| `network` | 网络标识，BSC 用 `bsc` |
| `source.address` | 合约地址（可省略以索引所有匹配合约） |
| `source.startBlock` | 起始区块（强烈建议设置） |
| `source.endBlock` | 结束区块（可选，`specVersion >= 0.0.9`） |
| `indexerHints.prune` | `auto`（推荐）/ `never` / 具体区块数 |

### Event Handlers

```yaml
eventHandlers:
  - event: Transfer(indexed address,indexed address,uint256)
    handler: handleTransfer
  - event: Approval(address,address,uint256)
    handler: handleApproval
    receipt: true                # 可访问交易回执 (specVersion >= 0.0.5)
```

通过 `topic1` 过滤特定地址的事件：

```yaml
eventHandlers:
  - event: Transfer(indexed address,indexed address,uint256)
    handler: handleTransfer
    topic1: ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']
```

### Block Handlers

```yaml
blockHandlers:
  # 每个区块执行
  - handler: handleBlock

  # 每 N 个区块执行（specVersion >= 0.0.8）
  - handler: handleBlockPolling
    filter:
      kind: polling
      every: 10

  # 仅在所有其他 handler 之前执行一次（specVersion >= 0.0.8）
  - handler: handleOnce
    filter:
      kind: once
```

### Data Source Templates（动态合约）

用于工厂模式，动态创建的合约需要用模板索引：

```yaml
dataSources:
  - kind: ethereum/contract
    name: Factory
    source:
      address: '0x...'
      abi: Factory
    mapping:
      eventHandlers:
        - event: NewExchange(address,address)
          handler: handleNewExchange

templates:
  - name: Exchange
    kind: ethereum/contract
    network: bsc
    source:
      abi: Exchange
    mapping:
      entities:
        - Exchange
      abis:
        - name: Exchange
          file: ./abis/Exchange.json
      eventHandlers:
        - event: TokenPurchase(address,uint256,uint256)
          handler: handleTokenPurchase
      file: ./src/exchange.ts
```

在 mapping 中实例化模板：

```typescript
import { Exchange } from '../generated/templates'

export function handleNewExchange(event: NewExchange): void {
  Exchange.create(event.params.exchange)
}

// 带上下文
let context = new DataSourceContext()
context.setString('tradingPair', event.params.tradingPair)
Exchange.createWithContext(event.params.exchange, context)
```

### Handler 执行顺序

同一区块内：
1. 事件和调用按交易索引排序
2. 同一交易内：先事件后调用（按 manifest 定义顺序）
3. Block handlers 在事件/调用 handlers 之后执行

---

## GraphQL Schema (schema.graphql)

### 实体定义

```graphql
type Cultivator @entity {
  id: Bytes!                              # 推荐用 Bytes!（更快）
  owner: Bytes!                           # 地址
  origin: Int!                            # 出身
  element: Int!                           # 五行
  realm: Int!                             # 境界
  registeredAt: BigInt!                   # 注册时间
  registeredBlock: BigInt!                # 注册区块
  transactions: [Transaction!]! @derivedFrom(field: "cultivator")
}

type Transaction @entity(immutable: true) {  # 不可变实体，性能更好
  id: Bytes!
  cultivator: Cultivator!
  type: TransactionType!
  amount: BigInt!
  timestamp: BigInt!
  blockNumber: BigInt!
}
```

### 支持的标量类型

| 类型 | 说明 |
|------|------|
| `Bytes` | 十六进制字符串，用于哈希/地址 |
| `String` | 文本值 |
| `Boolean` | 布尔值 |
| `Int` | 32 位有符号整数 |
| `Int8` | 64 位有符号整数 |
| `BigInt` | 大整数（Ethereum uint256 等） |
| `BigDecimal` | 高精度小数 |
| `Timestamp` | 64 位微秒时间戳（用于时序数据） |

### ID 类型选择

- `Bytes!` — **推荐**，性能更好
- `String!` — 备选

常见 ID 构造方式：

```typescript
// 交易哈希作为 ID
let id = event.transaction.hash

// 交易哈希 + 日志索引（同一交易多个事件时）
let id = event.transaction.hash.concatI32(event.logIndex.toI32())

// 整数 ID
let id = Bytes.fromI32(dayID)
```

### 实体关系

**一对一：**

```graphql
type Transaction @entity(immutable: true) {
  id: Bytes!
  receipt: TransactionReceipt
}

type TransactionReceipt @entity(immutable: true) {
  id: Bytes!
  transaction: Transaction!
}
```

**一对多（反向查找 `@derivedFrom`）：**

```graphql
type Token @entity {
  id: Bytes!
  balances: [TokenBalance!]! @derivedFrom(field: "token")  # 虚拟字段
}

type TokenBalance @entity {
  id: Bytes!
  token: Token!              # 外键存在"多"的一侧
  amount: BigInt!
}
```

> `@derivedFrom` 不在数据库中存储数组，查询时动态计算。性能显著优于存储数组。

**多对多（中间表）：**

```graphql
type UserOrganization @entity {
  id: Bytes!
  user: User!
  organization: Organization!
}
```

### 枚举

```graphql
enum TransactionType {
  Hunt
  Treasure
  Trade
  Cultivation
}
```

### 全文搜索

```graphql
type _Schema_
  @fulltext(
    name: "cultivatorSearch"
    language: en
    algorithm: rank
    include: [{ entity: "Cultivator", fields: [{ name: "name" }] }]
  )
```

需要在 manifest 中启用 `features: ['fullTextSearch']`。

---

## AssemblyScript Mappings

### 基本结构

```typescript
import { BigInt, Bytes } from '@graphprotocol/graph-ts'
import { CultivatorRegistered } from '../generated/Register/Register'
import { Cultivator } from '../generated/schema'

export function handleCultivatorRegistered(event: CultivatorRegistered): void {
  // 用事件参数中的地址作为 ID
  let id = event.params.account

  // 创建新实体
  let cultivator = new Cultivator(id)
  cultivator.owner = event.params.account
  cultivator.origin = event.params.origin
  cultivator.element = event.params.element
  cultivator.realm = 0
  cultivator.registeredAt = event.block.timestamp
  cultivator.registeredBlock = event.block.number

  // 保存到 Store
  cultivator.save()
}
```

### 实体 CRUD 操作

```typescript
// 创建
let entity = new Transfer(event.transaction.hash)
entity.save()

// 读取（可能为 null）
let entity = Transfer.load(id)
if (entity == null) {
  entity = new Transfer(id)
}

// 同区块内查找（更高效）
let entity = Transfer.loadInBlock(id)

// 加载关联实体
let holder = Holder.load('test-id')
let tokens = holder.tokens.load()

// 删除
import { store } from '@graphprotocol/graph-ts'
store.remove('Transfer', id.toHexString())
```

### 数组字段更新

```typescript
// 必须先复制数组，修改后重新赋值
let numbers = entity.numbers
numbers.push(BigInt.fromI32(1))
entity.numbers = numbers
entity.save()
```

### 合约调用（读取链上状态）

```typescript
import { ERC20 } from '../generated/ERC20/ERC20'

export function handleTransfer(event: TransferEvent): void {
  let contract = ERC20.bind(event.address)
  let symbol = contract.symbol()

  // 安全调用（处理 revert）
  let result = contract.try_balanceOf(event.params.from)
  if (result.reverted) {
    log.info('balanceOf reverted', [])
  } else {
    let balance = result.value
  }
}
```

### 代码生成

每次修改 schema 或 ABI 后都需要重新生成类型：

```bash
graph codegen
```

---

## AssemblyScript API 参考

### BigInt

```typescript
import { BigInt } from '@graphprotocol/graph-ts'

// 构造
BigInt.fromI32(42)
BigInt.fromString('1000000000000000000')
BigInt.fromUnsignedBytes(bytes)
BigInt.fromSignedBytes(bytes)

// 转换
bigInt.toHex()           // → "0x..."
bigInt.toString()        // → "123"
bigInt.toI32()           // → i32
bigInt.toBigDecimal()    // → BigDecimal

// 运算
bigInt.plus(y)           // 加
bigInt.minus(y)          // 减
bigInt.times(y)          // 乘
bigInt.div(y)            // 除
bigInt.mod(y)            // 取模
bigInt.pow(exp)          // 幂
bigInt.abs()             // 绝对值
bigInt.neg()             // 取反
bigInt.isZero()          // 是否为零

// 比较
bigInt.equals(y)
bigInt.lt(y) / bigInt.le(y) / bigInt.gt(y) / bigInt.ge(y)

// 位运算
bitOr(x, y) / bitAnd(x, y) / leftShift(x, bits) / rightShift(x, bits)
```

### BigDecimal

```typescript
import { BigDecimal } from '@graphprotocol/graph-ts'

BigDecimal.fromString('10.99')
new BigDecimal(BigInt.fromI32(100))

bigDecimal.plus(y) / .minus(y) / .times(y) / .div(y)
bigDecimal.equals(y) / .lt(y) / .gt(y)
bigDecimal.neg()
bigDecimal.toString()
```

### Bytes / ByteArray / Address

```typescript
import { Bytes, Address } from '@graphprotocol/graph-ts'

// 构造
Bytes.fromHexString('0xdead')
Bytes.fromI32(42)
Address.fromString('0x...')
Address.fromBytes(bytes)

// 转换
bytes.toHexString()
bytes.toString()
bytes.toBase58()

// 操作
bytes.concat(other)         // 拼接
bytes.concatI32(num)        // 拼接整数
bytes.equals(other)         // 比较
```

### Ethereum 类型

```typescript
// Event 属性
event.address              // Address — 合约地址
event.logIndex             // BigInt
event.block.number         // BigInt — 区块号
event.block.timestamp      // BigInt — 时间戳
event.block.hash           // Bytes
event.transaction.hash     // Bytes — 交易哈希
event.transaction.from     // Address
event.transaction.to       // Address | null
event.transaction.value    // BigInt
event.transaction.gasPrice // BigInt
event.receipt              // TransactionReceipt | null（需 receipt: true）
event.parameters           // Array<EventParam>
```

### 日志

```typescript
import { log } from '@graphprotocol/graph-ts'

log.debug('Debug: {}', [value.toString()])
log.info('Info: {}', [value.toString()])
log.warning('Warning: {}', [value.toString()])
log.error('Error: {}', [value.toString()])
log.critical('Critical: {}', [value.toString()])  // 终止 handler
```

### 加密

```typescript
import { crypto, ByteArray } from '@graphprotocol/graph-ts'

let hash = crypto.keccak256(ByteArray.fromHexString('0x...'))
```

### JSON

```typescript
import { json, JSONValueKind } from '@graphprotocol/graph-ts'

let value = json.fromBytes(data)
let result = json.try_fromBytes(data)   // 安全解析

// 类型检查
value.kind == JSONValueKind.BOOL
value.kind == JSONValueKind.STRING
value.kind == JSONValueKind.ARRAY

// 转换
value.toBool()
value.toString()
value.toBigInt()
value.toArray()
value.toObject()      // → TypedMap<string, JSONValue>
```

### ABI 编解码

```typescript
import { ethereum } from '@graphprotocol/graph-ts'

// 编码
let tupleArray: Array<ethereum.Value> = [
  ethereum.Value.fromAddress(Address.fromString('0x...')),
  ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(62)),
]
let encoded = ethereum.encode(ethereum.Value.fromTuple(tupleArray as ethereum.Tuple))!

// 解码
let decoded = ethereum.decode('(address,uint256)', encoded)
```

### 类型转换速查

| 源 → 目标 | 方法 |
|-----------|------|
| Address → String | `.toHexString()` |
| BigInt → String | `.toString()` 或 `.toHexString()` |
| BigInt → BigDecimal | `.toBigDecimal()` |
| BigInt → i32 | `.toI32()` |
| Bytes → String (hex) | `.toHexString()` |
| Bytes → BigInt (unsigned) | `BigInt.fromUnsignedBytes(b)` |
| Bytes → BigInt (signed) | `BigInt.fromSignedBytes(b)` |
| String → Address | `Address.fromString(s)` |
| String → BigInt | `BigInt.fromString(s)` |
| String → Bytes | `Bytes.fromHexString(s)` |
| i32 → BigInt | `BigInt.fromI32(n)` |

### DataSource 元数据

```typescript
import { dataSource } from '@graphprotocol/graph-ts'

dataSource.address()   // Address — 当前数据源合约地址
dataSource.network()   // string — 网络名称
dataSource.context()   // DataSourceContext — 上下文数据
```

---

## 部署流程

### 1. 构建

```bash
# 生成类型
graph codegen

# 编译
graph build
```

### 2. 部署到 Subgraph Studio

```bash
# 认证（从 Studio 获取 deploy key）
graph auth <DEPLOY_KEY>

# 部署
graph deploy <SUBGRAPH_SLUG>
# 输入版本号，如 0.0.1
```

### 3. 发布到去中心化网络

在 Studio 中测试通过后，点击 **Publish** 发布到 The Graph Network。

发布后获得 Query URL，每月免费 100,000 次查询。

### 4. CLI 直接发布（替代方案）

```bash
graph codegen && graph build
graph publish
```

### Studio 限制

- 每个账户最多 3 个未发布的子图
- 开发查询 URL 每日限额 3,000 次
- 新版本部署后旧版本自动归档

---

## BSC 注意事项

### 不支持 Call Handlers

BSC **不支持** Parity tracing API，因此：

- **不能使用** `callHandlers`（函数调用处理器）
- **不能使用** `blockHandlers` 的 `call` filter

解决方案：**全部使用 Event Handlers**。确保合约中所有需要索引的操作都会触发事件。

### 推荐配置

```yaml
specVersion: 1.3.0
dataSources:
  - kind: ethereum/contract
    network: bsc               # BSC 网络标识
    source:
      startBlock: 12345678     # 必须设置，BSC 区块量巨大
    mapping:
      apiVersion: 0.0.9
      # 只使用 eventHandlers，不用 callHandlers
      eventHandlers:
        - event: ...
          handler: ...
```

### 性能建议

1. **设置 `startBlock`** — BSC 区块量极大，不设会导致同步极慢
2. **使用 `@entity(immutable: true)`** — 事件日志等不变数据标记为不可变
3. **使用 `Bytes!` 作为 ID** — 比 `String!` 查询更快
4. **使用 `@derivedFrom`** — 避免在实体中存储数组
5. **设置 `indexerHints.prune: auto`** — 自动修剪不需要的历史数据

---

## 自托管部署（Self-Hosted Graph Node）

当 The Graph Studio 不可用（如 Chapel 节点宕机）或需要完全控制索引基础设施时，可以自行部署 Graph Node。

**开源仓库：** https://github.com/graphprotocol/graph-node

### 架构组件

| 组件 | 用途 | 默认端口 |
|------|------|----------|
| **Graph Node** | 索引器核心，监听链事件、存储实体 | 8000/8001/8020/8030 |
| **PostgreSQL** | 存储索引数据 | 5432 |
| **IPFS** | 存储子图 manifest 和编译产物 | 5001 |
| **EVM RPC 节点** | 提供链数据（可用公共 RPC） | — |

Graph Node 暴露的端口：

| 端口 | 用途 |
|------|------|
| `8000` | GraphQL HTTP 查询端点 |
| `8001` | GraphQL WebSocket 订阅端点 |
| `8020` | JSON-RPC 部署端点（`graph deploy` 使用） |
| `8030` | 索引状态端点 |

### Docker Compose 快速部署

#### 1. 获取 docker-compose 配置

```bash
git clone https://github.com/graphprotocol/graph-node
cd graph-node/docker
```

#### 2. 修改 docker-compose.yml

关键配置项：

```yaml
version: '3'
services:
  graph-node:
    image: graphprotocol/graph-node
    ports:
      - '8000:8000'   # GraphQL 查询
      - '8001:8001'   # GraphQL WebSocket
      - '8020:8020'   # 部署端点
      - '8030:8030'   # 索引状态
    depends_on:
      - ipfs
      - postgres
    environment:
      postgres_host: postgres
      postgres_user: graph-node
      postgres_pass: let-me-in
      postgres_db: graph-node
      ipfs: 'ipfs:5001'
      # BSC Testnet (Chapel)
      ethereum: 'chapel:https://bsc-testnet-dataseed.bnbchain.org'
      GRAPH_LOG: info
      # 可选：提高性能
      ETHEREUM_POLLING_INTERVAL: 3000

  ipfs:
    image: ipfs/kubo:v0.27.0
    ports:
      - '5001:5001'
    volumes:
      - ./data/ipfs:/data/ipfs

  postgres:
    image: postgres:16
    ports:
      - '5432:5432'
    command:
      [
        'postgres',
        '-cshared_preload_libraries=pg_stat_statements',
        '-cmax_connections=200',
      ]
    environment:
      POSTGRES_USER: graph-node
      POSTGRES_PASSWORD: let-me-in
      POSTGRES_DB: graph-node
      PGDATA: '/var/lib/postgresql/data'
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
```

#### 3. 网络配置

`ethereum` 环境变量格式：`<network_name>:<rpc_url>`

| 网络 | 配置值 |
|------|--------|
| BSC Testnet | `chapel:https://bsc-testnet-dataseed.bnbchain.org` |
| BSC Mainnet | `bsc:https://bsc-dataseed.bnbchain.org` |
| 多网络 | `chapel:https://...,bsc:https://...`（逗号分隔） |

> `network_name` 必须与 `subgraph.yaml` 中的 `network` 字段一致。

#### 4. 启动服务

```bash
docker-compose up -d

# 查看日志
docker-compose logs -f graph-node

# 检查服务状态
curl http://localhost:8030/graphql -d '{"query":"{ indexingStatuses { subgraph synced health } }"}'
```

### 部署子图到自托管节点

```bash
cd /path/to/subgraph

# 1. 创建子图（仅首次）
graph create huasheng --node http://localhost:8020

# 2. 编译
graph codegen && graph build

# 3. 部署
graph deploy huasheng \
  --node http://localhost:8020 \
  --ipfs http://localhost:5001 \
  -l v0.1.0
```

### 查询与监控

```bash
# GraphQL 查询
curl http://localhost:8000/subgraphs/name/huasheng \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ players(first: 5) { id realm } }"}'

# 索引状态
curl http://localhost:8030/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ indexingStatuses { subgraph synced health chains { network latestBlock { number } chainHeadBlock { number } } fatalError { message } } }"}'
```

### 自托管 vs Studio 对比

| 维度 | Studio | 自托管 |
|------|--------|--------|
| 运维 | 零运维 | 需维护服务器、数据库、IPFS |
| 可用性 | 依赖 Studio 后端（可能宕机） | 完全自控 |
| 费用 | 免费额度 100K 查询/月，超出付费 | 仅服务器成本 |
| 性能 | 共享资源 | 独占资源，可调优 |
| 网络限制 | 仅支持 Studio 已上线的网络 | 任意 EVM 链 |
| 适用场景 | 生产环境、去中心化网络发布 | 开发测试、私有链、Studio 不可用时 |

### 生产环境建议

1. **RPC 节点** — 公共 RPC 有限速，生产环境建议用付费 RPC（如 QuickNode、Chainstack）或自建节点
2. **PostgreSQL** — 生产环境建议独立部署，配置足够的内存和 SSD 存储
3. **备份** — 定期备份 PostgreSQL 数据和 IPFS 数据
4. **监控** — 通过 `8030` 端口监控索引进度，设置告警
5. **磁盘空间** — BSC 索引数据增长快，预留充足磁盘（建议 100GB+）

---

## 双部署架构（推荐）

生产环境最佳实践：**The Graph 去中心化网络作为主力，自托管 Graph Node 作为托底**。

### 架构概览

```
                    ┌─────────────────────────┐
                    │     AI Agent / 前端       │
                    │   (GraphQL Client)       │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │     查询路由层             │
                    │  primary → fallback      │
                    └───┬─────────────────┬───┘
                        │                 │
           ┌────────────▼──┐    ┌────────▼──────────┐
           │ The Graph     │    │ Self-Hosted        │
           │ 去中心化网络    │    │ Graph Node         │
           │ (主力)         │    │ (托底)              │
           │               │    │                    │
           │ • 高可用       │    │ • 完全自控          │
           │ • 多 Indexer   │    │ • 无查询限额        │
           │ • 经济激励     │    │ • 零延迟 fallback   │
           └───────────────┘    └────────────────────┘
                        │                 │
                        └────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     BSC (Chapel/主网)     │
                    └──────────────────────────┘
```

### 为什么需要双部署

| 场景 | 仅 Studio/去中心化 | 仅自托管 | 双部署 |
|------|-------------------|---------|--------|
| Studio 宕机 | 服务中断 | 不受影响 | 自动切备 |
| 自托管服务器故障 | 不受影响 | 服务中断 | 自动切主 |
| 查询量激增 | 超额付费 | 受限于硬件 | 分流 |
| 新版本灰度发布 | 不支持 | 单端点 | 先在自托管验证，再推去中心化 |

### 端点配置

```json
{
  "chapel": {
    "primary": "https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>",
    "fallback": "http://<VPS_IP>:8000/subgraphs/name/huasheng",
    "status": "http://<VPS_IP>:8030/graphql"
  },
  "bsc": {
    "primary": "https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>",
    "fallback": "http://<VPS_IP>:8000/subgraphs/name/huasheng-mainnet",
    "status": "http://<VPS_IP>:8030/graphql"
  }
}
```

### 查询路由策略

客户端实现 fallback 逻辑（伪代码）：

```typescript
async function querySubgraph(query: string): Promise<any> {
  const endpoints = config[network]

  // 1. 尝试主力端点（去中心化网络）
  try {
    const res = await fetch(endpoints.primary, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),  // 5s 超时
    })
    if (res.ok) return await res.json()
  } catch (e) {
    console.warn('Primary endpoint failed, falling back...')
  }

  // 2. 回退到自托管节点
  const res = await fetch(endpoints.fallback, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return await res.json()
}
```

### 部署工作流

新版本子图的发布流程：

```
1. graph codegen && graph build     # 本地编译
2. 部署到自托管节点                   # 先验证
   graph deploy huasheng \
     --node http://<VPS_IP>:8020 \
     --ipfs http://<VPS_IP>:5001 \
     -l v0.2.0
3. 验证自托管节点索引正常              # curl 8030 检查
4. 部署到 Studio                     # 再推生产
   graph auth <DEPLOY_KEY>
   graph deploy <SLUG> -l v0.2.0
5. Studio 测试通过 → Publish         # 发布到去中心化网络
6. 更新 endpoints.json               # 切换主力 URL
```

### NPM Scripts（多环境）

```json
{
  "scripts": {
    "codegen": "graph codegen",
    "build": "graph codegen && graph build",
    "create:local": "graph create huasheng --node http://localhost:8020",
    "deploy:local": "graph deploy huasheng --node http://localhost:8020 --ipfs http://localhost:5001",
    "deploy:remote": "graph deploy huasheng --node http://<VPS_IP>:8020 --ipfs http://<VPS_IP>:5001",
    "deploy:studio": "graph deploy huasheng-bsc-testnet",
    "status:remote": "curl -s http://<VPS_IP>:8030/graphql -d '{\"query\":\"{indexingStatuses{subgraph synced health}}\"}'"
  }
}
```

### 监控要点

| 检查项 | 自托管端点 | 去中心化网络 |
|--------|-----------|-------------|
| 索引健康 | `GET :8030/graphql` → `health: "healthy"` | Studio Dashboard |
| 同步进度 | `latestBlock` vs `chainHeadBlock` 差距 | Studio 进度条 |
| 查询可用 | `GET :8000/subgraphs/name/huasheng` | Gateway URL 响应 |
| 数据一致 | 对比两端 `protocolStats` 实体 | — |
