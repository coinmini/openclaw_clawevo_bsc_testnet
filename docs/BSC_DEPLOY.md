> 📖 返回 [总览](../GAME_DESIGN.md) | [技术路线](TECHNICAL_ROADMAP.md)

# BSC 部署参考

整理自 [BNB Chain 官方文档](https://docs.bnbchain.org/bnb-smart-chain/developers/quick-guide/)。

---

## 网络配置

### BSC Mainnet

| 参数 | 值 |
|------|------|
| **Network Name** | BSC Mainnet |
| **Chain ID** | 56 (0x38) |
| **Symbol** | BNB |
| **Block Explorer** | https://bscscan.com/ |

**RPC Endpoints（官方公开节点）：**
- `https://bsc-dataseed.bnbchain.org`
- `https://bsc-dataseed.nariox.org`
- `https://bsc-dataseed.defibit.io`
- `https://bsc-dataseed.ninicoin.io`
- `https://bsc.nodereal.io`
- `https://bsc-dataseed-public.bnbchain.org`
- `https://bnb.rpc.subquery.network/public`

### BSC Testnet

| 参数 | 值 |
|------|------|
| **Network Name** | BSC Testnet |
| **Chain ID** | 97 (0x61) |
| **Symbol** | tBNB |
| **Block Explorer** | https://testnet.bscscan.com/ |

**RPC Endpoints（官方公开节点）：**
- `https://bsc-testnet-dataseed.bnbchain.org`
- `https://bsc-testnet.bnbchain.org`
- `https://bsc-prebsc-dataseed.bnbchain.org`
- `https://data-seed-prebsc-1-s1.bnbchain.org:8545`（MetaMask 推荐）

### 速率限制

官方公开节点的速率限制为 **10K 请求 / 5 分钟**。

如果需要更高频率，可使用第三方 RPC 提供商：NodeReal、Ankr、Chainstack、GetBlock、QuickNode、Alchemy、dRPC 等。

> **注意：** 官方 Mainnet 端点禁用了 `eth_getLogs`，需要频繁拉取日志的场景请使用第三方或 WebSocket。

---

## 测试币水龙头（Faucet）

### 官方水龙头

**地址：** https://www.bnbchain.org/en/testnet-faucet

**使用方法：**
1. 输入钱包地址
2. 选择代币类型（tBNB、BUSD、USDT 等）
3. 提交领取

**限制：** 钱包余额超过 1 tBNB 时无法继续领取。

### 第三方水龙头

- https://faucet.quicknode.com/binance-smart-chain/bnb-testnet
- https://faucet.chainstack.com/bnb-testnet-faucet
- https://thirdweb.com/opbnb-testnet

> Discord 水龙头已于 2025 年 9 月停用。

---

## MetaMask 配置

**添加步骤：** Settings → Networks → Add Network → 手动输入

**Testnet：**
```
Network Name: BSC Testnet
RPC URL:      https://data-seed-prebsc-1-s1.bnbchain.org:8545
Chain ID:     97
Symbol:       tBNB
Explorer:     https://testnet.bscscan.com/
```

**Mainnet：**
```
Network Name: BSC Mainnet
RPC URL:      https://bsc-dataseed.bnbchain.org
Chain ID:     56
Symbol:       BNB
Explorer:     https://bscscan.com/
```

---

## 开发工具

### 区块浏览器

- [BSCScan](https://bscscan.com/) — 主流浏览器，支持合约验证
- [NodeReal BSC Scan](https://bsctrace.com/) — 替代浏览器

### SDK

- [ethers.js](https://docs.ethers.io) — 本项目 Hardhat 使用
- [web3.js](https://web3js.readthedocs.io) — 替代选择

### 开发框架

- [Hardhat](https://hardhat.org) — 本项目使用
- [Foundry](https://book.getfoundry.sh/) — cast CLI 用于 Agent 交互
- [Remix](https://remix.ethereum.org) — 在线 IDE

### 索引服务

- [The Graph](https://thegraph.com/) — 本项目使用（去中心化索引）
- [Covalent](https://www.covalenthq.com) — 替代索引

### 预言机

- [Binance Oracle](https://oracle.binance.com/docs/) — VRF 用于渡劫随机数 → 详见 [VRF_CONFIG.md](VRF_CONFIG.md)

---

## Hardhat 配置参考

当前项目 `hardhat.config.ts` 需要添加 BSC Testnet 网络：

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",  // 注意：需确认 BSC Testnet 是否支持 Cancun
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet-dataseed.bnbchain.org",
      chainId: 97,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || "",
    },
  },
};

export default config;
```

### 所需环境变量（.env）

```bash
# BSC 部署
DEPLOYER_PRIVATE_KEY=0x...         # 部署者钱包私钥
BSC_TESTNET_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org
BSC_MAINNET_RPC_URL=https://bsc-dataseed.bnbchain.org
BSCSCAN_API_KEY=...                # BSCScan API Key（合约验证用）

# 金库地址
DEV_WALLET=0x...                   # Treasury 开发团队钱包
FOUNDATION_WALLET=0x...            # Treasury 基金会钱包

# Binance Oracle VRF（详见 VRF_CONFIG.md）
VRF_COORDINATOR=0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053
VRF_KEY_HASH=0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80
VRF_SUBSCRIPTION_ID=               # 运行 setup-vrf.ts 后填入
```

### 所需依赖

```bash
npm install --save-dev dotenv
```

---

## 合约部署顺序

本项目 17 个合约的部署分 5 个阶段，按依赖关系排列：

### Phase 1 — 无依赖

```
1.  GameConfig           — UUPS Proxy（deployProxy + initialize）
2.  RandomBlockDelay     — Block-delay 随机数（Layer 1）
3.  BinanceVRFConsumer   — Binance Oracle VRF（Layer 0）→ 需先配置 VRF 订阅
```

> BinanceVRFConsumer 部署前需要先运行 `scripts/setup-vrf.ts` 创建 VRF 订阅，详见 [VRF_CONFIG.md](VRF_CONFIG.md)。

### Phase 2 — 依赖 GameConfig

```
4. LingShi(admin)
```

### Phase 3 — 依赖 LingShi + GameConfig

```
5.  Treasury(lingshi, gameConfig, devWallet, foundationWallet, owner)
6.  Register(lingshi, gameConfig)
```

### Phase 4 — 依赖 LingShi + Treasury + Register

```
7.  Cultivation(lingshi, gameConfig, treasury, register)
8.  Hunt(lingshi, gameConfig, treasury, register)
9.  Treasure(lingshi, treasury, register)
10. CaveHeaven(lingshi, treasury, register)
11. Equipment(lingshi, treasury, register)
12. Beast(lingshi, treasury, register)
13. Sect(lingshi, treasury, register)
14. Tao(lingshi, treasury, register)
15. Market(lingshi, treasury)
```

### Phase 5 — 依赖 Equipment + Beast + CaveHeaven

```
16. Battle(lingshi, treasury, register, gameConfig, equipment, beast, caveHeaven)
17. SecretRealm(lingshi, treasury, register, gameConfig, equipment, beast)
```

---

## 部署后权限配置

部署完成后，必须执行以下管理调用来连接合约间的权限：

### LingShi — 角色授权

```
lingshi.grantRole(MINTER_ROLE, register)
lingshi.grantRole(MINTER_ROLE, cultivation)
lingshi.grantRole(MINTER_ROLE, hunt)
lingshi.grantRole(MINTER_ROLE, treasure)
lingshi.grantRole(MINTER_ROLE, equipment)       // decompose 退款
lingshi.grantRole(MINTER_ROLE, sect)            // 每日奖励
lingshi.grantRole(MINTER_ROLE, secretRealm)
lingshi.grantRole(BURNER_ROLE, treasury)        // 销毁灵石
```

### Treasury — 授权调用者

```
treasury.setAuthorizedCaller(cultivation, true)
treasury.setAuthorizedCaller(hunt, true)
treasury.setAuthorizedCaller(treasure, true)
treasury.setAuthorizedCaller(equipment, true)
treasury.setAuthorizedCaller(beast, true)
treasury.setAuthorizedCaller(battle, true)
treasury.setAuthorizedCaller(caveHeaven, true)
treasury.setAuthorizedCaller(tao, true)
treasury.setAuthorizedCaller(sect, true)
treasury.setAuthorizedCaller(market, true)
treasury.setAuthorizedCaller(secretRealm, true)
```

### Register — 授权更新者

```
register.setAuthorizedUpdater(cultivation, true)   // 渡劫突破时更新境界
```

### CaveHeaven — 授权调用者

```
caveHeaven.setAuthorizedCaller(cultivation, true)  // 闭关记录修炼时长
```

### Market — 白名单 NFT

```
market.setAllowedToken(equipment, true)
market.setAllowedToken(beast, true)
```

### RandomBlockDelay — 授权调用者

```
randomBlockDelay.setAuthorizedCaller(hunt, true)       // 打野掉落
randomBlockDelay.setAuthorizedCaller(treasure, true)   // 挖宝掉落
randomBlockDelay.setAuthorizedCaller(secretRealm, true) // 秘境掉落
// 注意：现有合约各自内联了 block-delay 逻辑，RandomBlockDelay 供未来新合约使用
```

### BinanceVRFConsumer — 授权调用者

```
binanceVRFConsumer.setAuthorizedCaller(cultivation, true) // 渡劫用 VRF 随机数
```

---

## 合约验证（BSCScan）

```bash
npx hardhat verify --network bscTestnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>

# 示例：验证 LingShi
npx hardhat verify --network bscTestnet 0x... "0xDeployerAddress"

# UUPS Proxy 验证（GameConfig）
npx hardhat verify --network bscTestnet <IMPLEMENTATION_ADDRESS>
```

---

## 注意事项

### EVM 版本兼容性

当前项目使用 `evmVersion: "cancun"`（Solidity 0.8.24）。BSC 已于 2024 年 6 月完成 Haber 硬分叉，支持 Cancun EVM 特性（包括 EIP-4844 相关操作码）。

如果部署遇到问题，可降级为 `"shanghai"` 或 `"paris"`：
```typescript
settings: {
  evmVersion: "shanghai",  // 回退选项
}
```

### Gas 估算

BSC 的 Gas 价格通常为 3-5 Gwei。部署 20 个合约的预估 Gas 成本：

| 阶段 | 合约数 | 预估 Gas |
|------|--------|---------|
| Phase 1（含 Proxy + VRF） | 3 | ~4M gas |
| Phase 2 | 1 | ~2M gas |
| Phase 3 | 2 | ~5M gas |
| Phase 4 | 9 | ~25M gas |
| Phase 5 | 2 | ~8M gas |
| 权限配置 | ~25 TX | ~2.5M gas |
| **合计** | | **~46.5M gas ≈ 0.23 BNB** |

> 另需 VRF 订阅充值约 0.1 BNB（Testnet），详见 [VRF_CONFIG.md](VRF_CONFIG.md)。

### 参考链接

- [BNB Chain 官方文档](https://docs.bnbchain.org/bnb-smart-chain/developers/quick-guide/)
- [BSCScan API](https://docs.bscscan.com/)
- [BSC Testnet 水龙头](https://www.bnbchain.org/en/testnet-faucet)
- [Hardhat 部署文档](https://hardhat.org/tutorial/deploying-to-a-live-network)
- [OpenZeppelin UUPS Proxy](https://docs.openzeppelin.com/contracts/5.x/api/proxy)
- [Binance Oracle VRF](https://oracle.binance.com/docs/vrf/overview/) — VRF 配置详见 [VRF_CONFIG.md](VRF_CONFIG.md)
