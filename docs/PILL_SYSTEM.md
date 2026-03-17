> 📖 返回 [总览](../GAME_DESIGN.md)

# 丹药系统

丹药是修仙世界的核心消耗品，采用 **ERC-1155** 标准实现。同类丹药可堆叠（fungible），不同类型共存于同一合约，链上可查余额，后续可直接接入坊市交易。

---

## 丹药总表

```
┌────────┬──────────┬───────┬─────────────────────────────┐
│ typeId │ 名称      │ 品级  │ 用途                         │
├────────┼──────────┼───────┼─────────────────────────────┤
│   0    │ 筑基丹    │ 低级  │ 练气→筑基 渡劫必需            │
│   1    │ 结丹丹    │ 中级  │ 筑基→金丹 渡劫必需            │
│   2    │ 凝婴丹    │ 高级  │ 金丹→元婴 渡劫必需            │
│   3    │ 化神丹    │ 极品  │ 元婴→化神 渡劫必需            │
│   4    │ 培元丹    │ 低级  │ 经验 +50（可配置）            │
│   5    │ 聚灵丹    │ 中级  │ 经验 +200（可配置）           │
│   6    │ 洗髓丹    │ 高级  │ 重置属性点分配               │
│   7    │ 护心丹    │ 中级  │ 渡劫失败保护（不掉重数）       │
└────────┴──────────┴───────┴─────────────────────────────┘
```

- **渡劫丹 (0-3)**：境界突破必需品，替代原先的灵石直接扣费
- **辅助丹 (4-7)**：提升效率 / 降低风险，非必需

---

## 合约架构

```
┌───────────────┐
│   Pill.sol    │  ERC-1155 丹药合约（mint/burn/查询）
│  (IPill.sol)  │  AccessControl: MINTER_ROLE
└───────┬───────┘
        │ mint / burn
        │
┌───────┴───────────────────────────────────────────────┐
│                     授权调用方                          │
├──────────────┬──────────────┬──────────────────────────┤
│ Alchemy.sol  │Cultivation.sol│ Hunt / Treasure /       │
│ 炼丹产出      │ 渡劫/经验消耗  │ SecretRealm / CaveHeaven│
│              │              │ 掉落产出                  │
└──────────────┴──────────────┴──────────────────────────┘
```

### Pill.sol

- 继承 `ERC1155 + AccessControl`
- `MINTER_ROLE`：授权合约（Alchemy、Cultivation、Hunt、Treasure、SecretRealm、CaveHeaven）
- 核心函数：
  - `mint(address to, uint8 pillType, uint256 amount)` — 铸造丹药
  - `burn(address from, uint8 pillType, uint256 amount)` — 销毁丹药
  - `balanceOfPill(address player, uint8 pillType)` — 查询单类余额
  - `getAllPillBalances(address player)` — 批量查询 8 种余额

### IPill.sol

```solidity
interface IPill {
    function mint(address to, uint8 pillType, uint256 amount) external;
    function burn(address from, uint8 pillType, uint256 amount) external;
    function balanceOfPill(address player, uint8 pillType) external view returns (uint256);
}
```

---

## 炼丹系统 — Alchemy.sol

消耗 **灵石 + 灵材** → 概率产出 1 颗丹药。一步式（不需 block-delay）。

### 配方表

| recipeId | 丹药 | 灵石成本 | 灵材 | 成功率 | 境界要求 |
|----------|------|---------|------|-------|---------|
| 0 | 筑基丹 | 200 LS | 10 | 80% | 练气 (0) |
| 1 | 结丹丹 | 1,000 LS | 30 | 70% | 筑基 (1) |
| 2 | 凝婴丹 | 4,000 LS | 80 | 55% | 金丹 (2) |
| 3 | 化神丹 | 10,000 LS | 200 | 40% | 元婴 (3) |
| 4 | 培元丹 | 30 LS | 3 | 90% | 练气 (0) |
| 5 | 聚灵丹 | 150 LS | 10 | 75% | 筑基 (1) |
| 6 | 洗髓丹 | 500 LS | 25 | 60% | 金丹 (2) |
| 7 | 护心丹 | 800 LS | 40 | 50% | 金丹 (2) |

### 炼丹流程

```
brew(recipeId)
  ├─ 检查境界 ≥ realmRequired
  ├─ 扣灵石 (transferFrom)
  ├─ 扣灵材 (equipment.consumeMaterials)
  ├─ 随机判定 (blockhash + nonce)
  │
  ├─ 成功 → 灵石走 Treasury 分配 + pill.mint()
  └─ 失败 → 返还 30% 灵石，剩余 70% 走 Treasury
```

- **失败返还比例**：`failRefundBP = 3000`（30%），可通过 `setFailRefundBP()` 调整
- **灵材来源**：分解装备（Equipment.sol `disassemble()`）

---

## 丹药消耗 — Cultivation.sol

### 渡劫突破 — `breakthrough(bool useProtectionPill)`

```
breakthrough(useProtectionPill)
  ├─ 消耗渡劫丹: pill.burn(msg.sender, realm, 1)
  │   realm=0 → 筑基丹, realm=1 → 结丹丹, ...
  │
  ├─ 渡劫判定（原有逻辑）
  │
  ├─ 成功 → 境界提升
  └─ 失败
      ├─ useProtectionPill=true → 消耗护心丹(7)，不掉重数
      └─ useProtectionPill=false → 原有失败惩罚
```

### 经验丹 — `consumeExpPill(uint8 pillType)`

- `pillType=4`（培元丹）→ 经验 +`expPillLow`（默认 50）
- `pillType=5`（聚灵丹）→ 经验 +`expPillHigh`（默认 200）
- 消耗 1 颗丹药，直接调用 `register.addExperience()`

### 洗髓丹 — `useXisuiDan(addAtk, addDef, addPer, addWis)`

- 消耗 1 颗洗髓丹（typeId=6）
- 重置属性点分配：将当前所有属性点清零后重新分配
- 总属性点 = `addAtk + addDef + addPer + addWis`，必须等于原有总点数

---

## 掉落来源

### 1. 打野 — Hunt.sol

```
claimHuntDrop()
  └─ 当 difficulty ≥ 3 且 quality ≥ BLUE(3)
      └─ 15% 概率掉落培元丹 (pillType=4)
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `pillDropRateBP` | 1500 | 丹药掉落概率 (15%) |
| `pillDropMinDifficulty` | 3 | 最低区域难度 |
| `pillDropMinQuality` | 3 | 最低掉落品质 (BLUE) |

### 2. 挖宝 — Treasure.sol

```
finishTreasure()
  └─ 当 quality == VEIN (矿脉，最高品质)
      └─ 100% 掉落培元丹 (pillType=4)
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `pillDropRateBP` | 10000 | VEIN 品质丹药概率 (100%) |

### 3. 秘境 — SecretRealm.sol

```
claimLayerDrop()
  └─ 通关第 3 层（最终层）
      └─ 固定掉落 1 颗丹药（按秘境映射）
```

| 秘境 | realmId | 掉落丹药 | pillType |
|------|---------|---------|----------|
| 龙脉秘境 | 0 | 培元丹 | 4 |
| 冰魄秘境 | 1 | 聚灵丹 | 5 |
| 天机秘境 | 2 | 培元丹 | 4 |

可通过 `setRealmPillReward(realmId, pillType)` 调整映射。

### 4. 灵药园 — CaveHeaven.sol

```
harvestPill()
  ├─ 要求: 洞天阶层 ≥ SpiritLand (灵地, tier=3)
  ├─ 冷却: 每 24 小时可收获 1 次
  └─ 产出:
      ├─ 80% 概率 → 培元丹 (pillType=4)
      └─ 20% 概率 → 聚灵丹 (pillType=5)
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `harvestCooldown` | 86400 (24h) | 收获冷却时间（秒） |
| `harvestRarePillBP` | 2000 | 聚灵丹概率 (20%)，其余为培元丹 |
| `harvestMinTier` | 3 | 最低洞天阶层 (SpiritLand) |

---

## 可配置参数汇总

### Alchemy.sol

| 参数 | 默认值 | Setter | 说明 |
|------|--------|--------|------|
| `failRefundBP` | 3000 | `setFailRefundBP()` | 炼丹失败灵石返还比例 |
| `recipes[i].*` | 见配方表 | `setRecipe()` | 各配方的灵石/灵材/成功率/境界 |

### Cultivation.sol

| 参数 | 默认值 | Setter | 说明 |
|------|--------|--------|------|
| `expPillLow` | 50 | `setExpPillLow()` | 培元丹经验值 |
| `expPillHigh` | 200 | `setExpPillHigh()` | 聚灵丹经验值 |

### Hunt.sol

| 参数 | 默认值 | Setter | 说明 |
|------|--------|--------|------|
| `pillDropRateBP` | 1500 | `setPillDropRateBP()` | 丹药掉落概率 |
| `pillDropMinDifficulty` | 3 | `setPillDropMinDifficulty()` | 最低区域难度 |
| `pillDropMinQuality` | 3 | `setPillDropMinQuality()` | 最低掉落品质 |

### Treasure.sol

| 参数 | 默认值 | Setter | 说明 |
|------|--------|--------|------|
| `pillDropRateBP` | 10000 | `setPillDropRateBP()` | VEIN 品质丹药概率 |

### SecretRealm.sol

| 参数 | 默认值 | Setter | 说明 |
|------|--------|--------|------|
| `realmPillRewards[0]` | 4 (培元丹) | `setRealmPillReward()` | 龙脉秘境通关掉落 |
| `realmPillRewards[1]` | 5 (聚灵丹) | `setRealmPillReward()` | 冰魄秘境通关掉落 |
| `realmPillRewards[2]` | 4 (培元丹) | `setRealmPillReward()` | 天机秘境通关掉落 |

### CaveHeaven.sol

| 参数 | 默认值 | Setter | 说明 |
|------|--------|--------|------|
| `harvestCooldown` | 86400 | `setHarvestCooldown()` | 灵药园冷却（秒） |
| `harvestRarePillBP` | 2000 | `setHarvestRarePillBP()` | 聚灵丹概率 |
| `harvestMinTier` | 3 | `setHarvestMinTier()` | 最低洞天阶层 |

---

## 经济平衡

### 灵石 Sink（消耗）

| 来源 | 说明 |
|------|------|
| 炼丹灵石成本 | 30～10,000 LS / 颗（成功走 Treasury，失败 70% 走 Treasury） |
| 渡劫丹替代 | 原先直接扣灵石 → 现在需先炼丹消耗灵石 |

### 灵材 Sink

| 来源 | 说明 |
|------|------|
| 炼丹灵材消耗 | 3～200 灵材 / 颗 |
| 灵材获取 | 分解装备（Equipment.sol `disassemble()`） |

### 丹药 Faucet（产出）

| 来源 | 产出 | 频率 |
|------|------|------|
| 炼丹 | 任意丹药 | 按需，受灵石/灵材限制 |
| 打野 | 培元丹 | ~15% × 高难度 BLUE+ 掉落 |
| 挖宝 | 培元丹 | ~2% VEIN 品质时 100% |
| 秘境 | 培元/聚灵丹 | 通关第 3 层固定 1 颗 |
| 灵药园 | 培元/聚灵丹 | 每 24h 1 颗（灵地阶+） |

### 设计原则

1. **渡劫丹不直接掉落** — 必须通过炼丹获取，保证灵石/灵材持续消耗
2. **辅助丹可掉落** — 培元丹/聚灵丹是主要掉落物，加速成长但不跳过关卡
3. **灵药园限制** — 仅灵地阶（最高洞天）解锁，每日 1 颗低级丹
4. **炼丹有失败率** — 高级丹药失败率高（化神丹 60% 失败），灵石/灵材双重消耗
5. **ERC-1155 可交易** — 后续坊市支持丹药交易，手续费成为新的灵石 sink

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `contracts/Pill.sol` | ERC-1155 丹药合约 |
| `contracts/interfaces/IPill.sol` | 丹药接口 |
| `contracts/Alchemy.sol` | 炼丹合约 |
| `contracts/Cultivation.sol` | 渡劫/经验丹/洗髓丹消耗 |
| `contracts/Hunt.sol` | 打野丹药掉落 |
| `contracts/Treasure.sol` | 挖宝丹药掉落 |
| `contracts/SecretRealm.sol` | 秘境丹药掉落 |
| `contracts/CaveHeaven.sol` | 灵药园产出 |
| `test/Pill.test.ts` | 丹药合约测试 (22 tests) |
| `test/Alchemy.test.ts` | 炼丹合约测试 (22 tests) |
| `test/Cultivation.test.ts` | 渡劫/丹药消耗测试 (53 tests) |
