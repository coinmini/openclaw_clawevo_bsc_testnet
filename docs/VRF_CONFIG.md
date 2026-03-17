> 📖 返回 [总览](../GAME_DESIGN.md) | [技术路线](TECHNICAL_ROADMAP.md) | [BSC 部署](BSC_DEPLOY.md)

# Binance Oracle VRF 配置指南

本项目使用 [Binance Oracle VRF](https://oracle.binance.com/docs/vrf/overview/) 为渡劫突破提供可验证随机数（Layer 0）。VRF 用 BNB 付费（非 LINK），每次请求 0.0001 BNB。

---

## 合约地址

### BSC Testnet (Chain 97)

| 参数 | 值 |
|------|------|
| **VRF Coordinator** | `0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053` |
| **Key Hash** | `0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80` |
| **Space ID** | `vrf.boracle.bnb` |

### BSC Mainnet (Chain 56)

| 参数 | 值 |
|------|------|
| **VRF Coordinator** | `0x9632ADE542f12114f5E5AD4d6F8e47fB993955da` |
| **Key Hash** | `0xcd65a78499993598be303c914c3e37b0103ead6b1f279d1dbfa0ef080e7141a4` |
| **Space ID** | `vrf.boracle.bnb` |

### opBNB Mainnet (备用)

| 参数 | 值 |
|------|------|
| **VRF Coordinator** | `0x4E0C997c986539708aB8903a31447f7456dde212` |
| **Key Hash** | `0xcd65a78499993598be303c914c3e37b0103ead6b1f279d1dbfa0ef080e7141a4` |

### opBNB Testnet (备用)

| 参数 | 值 |
|------|------|
| **VRF Coordinator** | `0x2B30C31a17Fe8b5dd397EF66FaFa503760D4eaF0` |
| **Key Hash** | `0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80` |

---

## 费用

### Testnet vs Mainnet

| | BSC Testnet | BSC Mainnet |
|---|------------|-------------|
| VRF 服务费 | 0.0001 **t**BNB / 请求 | 0.0001 BNB / 请求 |
| 代币来源 | [水龙头](https://www.bnbchain.org/en/testnet-faucet)免费领（每次 0.3~1 tBNB） | 真实 BNB |
| **实际花费** | **$0**（tBNB 无价值） | **~$0.06 / 请求**（@ BNB=$600） |
| 订阅充值上限 | 20 tBNB | 20 BNB |

> Testnet 的 VRF 机制与主网完全一致（订阅 + deposit + 扣费），但用的是免费的 tBNB，**开发测试零成本**。

### 服务费（Mainnet）

**固定 0.0001 BNB / 请求**，不受请求随机数数量影响（最多 500 个/请求）。

| 每请求随机数量 | 服务费 | 单个随机数成本 |
|---------------|--------|--------------|
| 1 | 0.0001 BNB | 0.0001 BNB |
| 2 | 0.0001 BNB | 0.00005 BNB |
| 10 | 0.0001 BNB | 0.00001 BNB |
| 100 | 0.0001 BNB | 0.000001 BNB |
| 500 | 0.0001 BNB | 0.0000002 BNB |

> 本项目每次渡劫请求 1 个随机数，成本 0.0001 BNB（约 $0.06 @ BNB=$600）。

### Gas 费

| 费用项 | 承担方 |
|--------|--------|
| 请求交易 gas | 玩家（自付） |
| 链上验证 blockhash 上传 gas | Binance Oracle |
| 回调 fulfillment gas + 服务费 | 订阅账户余额 |

### 成本估算

| 场景 | 渡劫次数 | VRF 费用 | 充值建议 |
|------|---------|---------|---------|
| Testnet 测试 | ~100 | 0.01 BNB | 0.1 BNB |
| MVP 早期 | ~1,000 | 0.1 BNB | 0.5 BNB |
| 100 Agent 日活 | ~10,000/月 | 1 BNB/月 | 5 BNB |
| 1,000 Agent 日活 | ~100,000/月 | 10 BNB/月 | 20 BNB (上限) |

> 订阅账户余额上限 **20 BNB**，超过此值的 deposit 会 revert。

---

## 参数限制

| 参数 | 限制 | 本项目设置 | 说明 |
|------|------|-----------|------|
| `requestConfirmations` | 3 ~ 200 | **3** | 最小等待区块数，BSC 出块 3 秒 |
| `callbackGasLimit` | 自定义 | **200,000** | 回调函数 gas 上限 |
| `numWords` | 1 ~ 500 | **1** | 每请求随机数量 |
| 订阅余额上限 | **20 BNB** | — | 超限 deposit 会 revert |

**callbackGasLimit 参考：**
- 2 个随机数：100,000 gas 足够
- 本项目 1 个随机数 + 状态写入：200,000 gas（保守值）

---

## 配置流程

### 前置条件

- BSC Testnet 钱包有 tBNB（水龙头：https://www.bnbchain.org/en/testnet-faucet）
- `.env` 文件已配置 `DEPLOYER_PRIVATE_KEY`

### 方式一：使用脚本（推荐）

```bash
# Step 1: 创建订阅 + 充值 0.1 BNB（Testnet）
npx hardhat run scripts/setup-vrf.ts --network bscTestnet

# 输出示例：
# 订阅创建成功！subId: 42
# 充值成功！新余额: 0.1 BNB
# 将以上变量写入 .env 文件后即可部署 BinanceVRFConsumer。

# Step 2: 将 subId 写入 .env
echo "VRF_SUBSCRIPTION_ID=42" >> .env

# Step 3: 部署全部合约（含 BinanceVRFConsumer）
npx hardhat run scripts/deploy.ts --network bscTestnet

# Step 4: 将 Consumer 添加到订阅
VRF_SUBSCRIPTION_ID=42 VRF_CONSUMER=<BinanceVRFConsumer地址> \
  npx hardhat run scripts/setup-vrf.ts --network bscTestnet
```

### 方式二：使用 Binance Oracle Dashboard

1. 打开 https://oracle.binance.com/dashboard/vrf
2. 连接钱包，切换到 BSC Testnet
3. 点击 "Create Subscription" 创建订阅
4. 点击 "Fund Subscription" 充值 BNB
5. 点击 "Add Consumer" 输入 BinanceVRFConsumer 合约地址
6. 将订阅 ID 写入 `.env` 中的 `VRF_SUBSCRIPTION_ID`

### 方式三：使用 cast（Foundry CLI）

```bash
# 设置变量
COORDINATOR=0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053  # BSC Testnet
PRIVATE_KEY=<your_private_key>
RPC=https://bsc-testnet-dataseed.bnbchain.org

# Step 1: 创建订阅
cast send $COORDINATOR "createSubscription()" \
  --private-key $PRIVATE_KEY --rpc-url $RPC

# 从交易 receipt 的 SubscriptionCreated 事件中提取 subId
# 或查询 BSCScan 交易日志

# Step 2: 充值 0.1 BNB
SUB_ID=<上一步获取的ID>
cast send $COORDINATOR "deposit(uint64)" $SUB_ID \
  --value 0.1ether --private-key $PRIVATE_KEY --rpc-url $RPC

# Step 3: 添加 Consumer
CONSUMER=<BinanceVRFConsumer合约地址>
cast send $COORDINATOR "addConsumer(uint64,address)" $SUB_ID $CONSUMER \
  --private-key $PRIVATE_KEY --rpc-url $RPC

# 验证：查询订阅状态
cast call $COORDINATOR "getSubscription(uint64)" $SUB_ID --rpc-url $RPC
```

---

## .env 配置

```bash
# Binance Oracle VRF
VRF_COORDINATOR=0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053  # BSC Testnet
VRF_KEY_HASH=0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80
VRF_SUBSCRIPTION_ID=42             # 运行 setup-vrf.ts 后填入
VRF_CONSUMER=0x...                 # 部署 BinanceVRFConsumer 后填入
VRF_DEPOSIT_BNB=0.1                # 订阅充值额
```

**主网切换时改这两行：**

```bash
VRF_COORDINATOR=0x9632ADE542f12114f5E5AD4d6F8e47fB993955da  # BSC Mainnet
VRF_KEY_HASH=0xcd65a78499993598be303c914c3e37b0103ead6b1f279d1dbfa0ef080e7141a4
```

---

## 工作流程

```
                      渡劫场景
                         │
  Cultivation.sol ──► BinanceVRFConsumer.requestRandom(player)
                         │
                         ▼
                  VRF Coordinator
                  (Binance Oracle)
                         │
                    等待 3+ 区块
                         │
                         ▼
                  rawFulfillRandomWords(requestId, randomWords[])
                         │
                         ▼
  Cultivation.sol ◄── BinanceVRFConsumer.consumeResult(player)
                         │
                         ▼
                   渡劫成功/失败
```

**三步流程：**
1. **请求** — Cultivation 合约调用 `requestRandom(player)`，VRF Coordinator 记录请求
2. **回调** — Binance Oracle 节点生成随机数 + 证明，回调 `rawFulfillRandomWords`
3. **消费** — Cultivation 合约调用 `consumeResult(player)` 获取随机数，决定渡劫结果

---

## 本项目合约架构

```
┌─────────────────────────────────────────────┐
│  BinanceVRFConsumer.sol（我们的合约）         │
│                                             │
│  immutable:                                 │
│    coordinator  → VRF Coordinator 地址       │
│    keyHash      → Gas lane key hash          │
│    subscriptionId → uint64 订阅 ID           │
│    requestConfirmations → 3                  │
│    callbackGasLimit → 200,000                │
│                                             │
│  storage:                                   │
│    authorizedCallers → Cultivation 等合约     │
│    pendingRequests[player] → requestId       │
│    fulfilledResults[player] → randomWord     │
│                                             │
│  外部接口:                                   │
│    requestRandom(player) → onlyAuthorized    │
│    consumeResult(player) → onlyAuthorized    │
│    rawFulfillRandomWords() → onlyCoordinator │
└─────────────────────────────────────────────┘
         │                        ▲
         │ requestRandomWords()   │ rawFulfillRandomWords()
         ▼                        │
┌─────────────────────────────────────────────┐
│  Binance Oracle VRF Coordinator（链上合约）   │
│  BSC Testnet: 0xa2d2...5053                 │
│  BSC Mainnet: 0x9632...55da                 │
└─────────────────────────────────────────────┘
```

> **设计选择：** 没有继承 `VRFConsumerBase`，而是手动实现 `rawFulfillRandomWords` 回调。这样可以使用 `Ownable` + `authorizedCallers` 模式统一权限管理，与项目中 `RandomBlockDelay`、`Treasury` 等合约保持一致。

---

## 故障排查

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `deposit reverted` | 订阅余额将超过 20 BNB | 减少充值金额 |
| `OnlyCoordinator` | 非 Coordinator 地址调用 rawFulfillRandomWords | 检查 Coordinator 地址是否正确 |
| `AlreadyPending` | 玩家已有未完成的 VRF 请求 | 等待上一次请求回调完成 |
| `NoResult` | consumeResult 时无可用结果 | 等待 VRF 回调完成 |
| `NotAuthorized` | 调用者未被授权 | owner 调用 setAuthorizedCaller |
| 回调超时 | callbackGasLimit 不足 | 增大 callbackGasLimit |
| 请求未响应 | 订阅余额不足 / 未添加 Consumer | 检查 getSubscription 状态 |

### 诊断命令

```bash
RPC=https://bsc-testnet-dataseed.bnbchain.org
COORDINATOR=0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053
CONSUMER=<BinanceVRFConsumer地址>
SUB_ID=<订阅ID>

# 查询订阅状态（余额/请求数/owner/consumers）
cast call $COORDINATOR "getSubscription(uint64)" $SUB_ID --rpc-url $RPC

# 检查是否有未完成请求
cast call $COORDINATOR "pendingRequestExists(uint64)" $SUB_ID --rpc-url $RPC

# 查询 Consumer 合约状态
cast call $CONSUMER "subscriptionId()" --rpc-url $RPC
cast call $CONSUMER "hasPendingRequest(address)" <玩家地址> --rpc-url $RPC
cast call $CONSUMER "getResult(address)" <玩家地址> --rpc-url $RPC
```

---

## 参考链接

- [Binance Oracle VRF 文档](https://oracle.binance.com/docs/vrf/overview/)
- [VRF Preparation（合约地址）](https://oracle.binance.com/docs/vrf/preparation/)
- [VRF Request Workflow](https://oracle.binance.com/docs/vrf/request-workflow/)
- [VRF Fee](https://oracle.binance.com/docs/vrf/fee/)
- [VRF Dashboard](https://oracle.binance.com/dashboard/vrf)
- [GitHub: binance-cloud/binance-oracle](https://github.com/binance-cloud/binance-oracle)
- [VRFCoordinatorInterface.sol](https://github.com/binance-cloud/binance-oracle/blob/main/contracts/interfaces/VRFCoordinatorInterface.sol)
- [VRFConsumerBase.sol](https://github.com/binance-cloud/binance-oracle/blob/main/contracts/mock/VRFConsumerBase.sol)
