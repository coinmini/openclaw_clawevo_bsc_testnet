# 合约可配置参数总览

所有合约参数均可通过 onlyOwner（或 DEFAULT_ADMIN_ROLE）setter 函数动态调整，无需重新部署。

---

## 1. Treasure.sol — 区域挖宝

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `cooldown` | 挖宝冷却时间 | `setCooldown(uint256)` | 5 minutes | ≤ 24 hours |
| `regions[i].roadFee` | 区域路费 | `setRegionRoadFee(uint8 regionId, uint256 newFee)` | 3/3/5/5/8/8 ether | regionId < 6 |
| `lowDiffDropCDF` | 低难度掉落概率 CDF | `setLowDiffDropCDF(uint256[5])` | [3000, 7000, 8800, 9800, 10000] | 末位=10000, 单调递增 |
| `highDiffDropCDF` | 高难度掉落概率 CDF | `setHighDiffDropCDF(uint256[6])` | [2000, 5000, 7200, 8700, 9000, 10000] | 末位=10000, 单调递增 |
| `dropRewards` | 掉落奖励值 (LS) | `setDropRewards(uint256[6])` | [0, 10, 30, 100, 200, 300] ether | 无 |
| `pillDropRateBP` | VEIN 品质丹药掉落概率 | `setPillDropRateBP(uint256)` | 10000 (100%) | ≤ 10000 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 2. Hunt.sol — 区域打野

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `cooldown` | 打野冷却时间 | `setCooldown(uint256)` | 5 minutes | ≤ 24 hours |
| `monsterRegions[i]` | 怪物区域配置 | `setMonsterRegion(uint8 regionId, uint8 difficulty, uint8 element, uint256 monsterAtk, uint256 monsterDef, uint256 reward, uint256 roadFee)` | 见构造函数 | regionId < 6, difficulty 1-4, element < 5 |
| `lowDiffDropCDF` | 低难度掉落 CDF | `setLowDiffDropCDF(uint256[4])` | [3000, 6500, 9000, 10000] | 末位=10000, 单调递增 |
| `midDiffDropCDF` | 中难度掉落 CDF | `setMidDiffDropCDF(uint256[5])` | [2000, 5000, 7500, 9000, 10000] | 末位=10000, 单调递增 |
| `highDiffDropCDF` | 高难度掉落 CDF | `setHighDiffDropCDF(uint256[6])` | [1000, 3500, 6500, 8500, 9500, 10000] | 末位=10000, 单调递增 |
| `dropRewards` | 掉落奖励值 (LS) | `setDropRewards(uint256[6])` | [0, 10, 30, 100, 200, 300] ether | 无 |
| `pillDropRateBP` | 丹药掉落概率 (BP) | `setPillDropRateBP(uint256)` | 1500 (15%) | ≤ 10000 |
| `pillDropMinDifficulty` | 丹药掉落最低区域难度 | `setPillDropMinDifficulty(uint8)` | 2 | 1-4 |
| `pillDropMinQuality` | 丹药掉落最低品质 | `setPillDropMinQuality(uint8)` | 2 (GREEN) | 0-5 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 3. Cultivation.sol — 闭关修炼

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `maxDailyHours` | 每日修炼上限(小时) | `setMaxDailyHours(uint256)` | 16 | 1-24 |
| `heartBaseRate` | 道心/小时增长 | `setHeartBaseRate(uint256)` | 8 | ≤ 100 |
| `fortuneBaseRate` | 气运/小时增长 | `setFortuneBaseRate(uint256)` | 4 | ≤ 100 |
| `outputPerHour[realm]` | 各境界灵石产出/小时 | `setOutputPerHour(uint8 realm, uint256)` | [20, 50, 100, 200, 400] ether | realm < 5 |
| `feePerHour[realm]` | 各境界消耗/小时 | `setFeePerHour(uint8 realm, uint256)` | [5, 15, 30, 60, 120] ether | realm < 5 |
| `expPerHour[realm]` | 各境界经验/小时 | `setExpPerHour(uint8 realm, uint256)` | [500, 300, 200, 120, 80] | realm < 5 |
| `breakthroughBaseRate[i]` | 渡劫基础成功率 (BP) | `setBreakthroughBaseRate(uint8 index, uint256)` | [9000, 8000, 6000, 5000] | index < 4, ≤ 10000 |
| `tribulationPillCost[i]` | 渡劫丹药费用 | `setTribulationPillCost(uint8 index, uint256)` | [300, 1500, 6000, 15000] ether | index < 4 |
| `subRealmExpBase[realm]` | 各境界1重→2重经验需求 | `setSubRealmExpBase(uint8 realm, uint256)` | [15, 50, 120, 300, 600] | realm < 5 |
| `subRealmExpStep[realm]` | 每重递增经验量 | `setSubRealmExpStep(uint8 realm, uint256)` | [2, 8, 20, 50, 100] | realm < 5 |
| `attributeStep[realm]` | 每重可分配属性点池 (总点=step×4, Agent自由分配四维) | `setAttributeStep(uint8 realm, uint256)` | [5, 10, 25, 40, 50] | realm < 5 |
| `realmBaseAttribute[realm]` | 各境界1重基础属性值 | `setRealmBaseAttribute(uint8 realm, uint256)` | [100, 160, 280, 550, 950] | realm < 5 |
| `expPillLow` | 培元丹经验值 | `setExpPillLow(uint256)` | 50 | 无 |
| `expPillHigh` | 聚灵丹经验值 | `setExpPillHigh(uint256)` | 200 | 无 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 4. Equipment.sol — 装备系统

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `enhanceCosts` | 强化费用 (+1~+5) | `setEnhanceCosts(uint256[5])` | [20, 50, 100, 150, 300] ether | 无 |
| `upgradeMaterialCount` | 升品材料数 | `setUpgradeMaterialCount(uint8[3])` | [3, 3, 3] | 每项 > 0 |
| `upgradeLSCost` | 升品灵石费用 | `setUpgradeLSCost(uint256[3])` | [50, 200, 800] ether | 无 |
| `upgradeSuccessRate` | 升品成功率 (BP) | `setUpgradeSuccessRate(uint256[3])` | [7000, 5500, 4000] | 每项 ≤ 10000 |
| `upgradeFailReturn` | 升品失败返还灵材 | `setUpgradeFailReturn(uint256[3])` | [1, 4, 9] | 无 |
| `decomposeMaterials` | 分解灵材回收 | `setDecomposeMaterials(uint256[4])` | [2, 6, 15, 40] | 无 |
| `decomposeLSRefund` | 分解灵石回收 | `setDecomposeLSRefund(uint256[4])` | [1, 3, 10, 30] ether | 无 |
| `qualityRealmReq` | 品质境界限制 | `setQualityRealmReq(uint8[4])` | [0, 0, 1, 2] | 无 |

权限: `onlyRole(DEFAULT_ADMIN_ROLE)`

---

## 5. Beast.sol — 灵兽系统

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `beastRegions[i]` | 灵兽区域配置 | `setBeastRegion(uint8 regionId, uint8 element, uint256 resistance, uint256 huntFee)` | 见构造函数 | regionId < 6, element < 5 |
| `appearanceCDF` | 出现概率 CDF | `setAppearanceCDF(uint256[3])` | [7000, 9200, 10000] | 末位=10000, 单调递增 |
| `starCoefficients` | 星级系数 (×BP) | `setStarCoefficients(uint256[3])` | [0, 10000, 30000] | 无 |
| `beastHuntCooldown` | 猎捕冷却时间 | `setBeastHuntCooldown(uint256)` | 1 hour | ≤ 24 hours |

权限: `onlyRole(DEFAULT_ADMIN_ROLE)`

---

## 6. SecretRealm.sol — 秘境副本

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `realmLayers[realmId][layer]` | 秘境层怪物配置 | `setRealmLayer(uint8 realmId, uint8 layer, uint256 monsterAtk, uint256 monsterDef, uint256 reward)` | 见构造函数（9大秘境） | realmId < 9, layer < 3 |
| `secretRealmFee` | 秘境门票费 | `setSecretRealmFee(uint256)` | 30 ether | 无 |
| `realmElements[i]` | 秘境元素属性 | `setRealmElement(uint8 realmId, uint8 newElement)` | [1,2,1,0,4,0,4,3,2] (木/水/木/金/土/金/土/火/水) | realmId < 9, element < 5 |
| `realmPillRewards[i]` | 通关第3层丹药掉落 | `setRealmPillReward(uint8 realmId, uint8 pillType)` | [4,5,4,5,7,5,4,6,7] (培元/聚灵/培元/聚灵/护心/聚灵/培元/洗髓/护心) | realmId < 9, pillType < 8 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 7. CaveHeaven.sol — 洞天系统

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `tierCosts` | 各阶开启/升级费用 | `setTierCosts(uint256[4])` | [0, 500, 2000, 8000] ether | 无 |
| `tierMultipliers` | 修炼倍率 (×100) | `setTierMultipliers(uint256[4])` | [100, 120, 140, 160] | 每项 ≥ 100 |
| `maintenanceFees` | 每日维护费 | `setMaintenanceFees(uint256[4])` | [0, 5, 20, 100] ether | 无 |
| `daoXinBonuses` | 道心加成 (0.01%) | `setDaoXinBonuses(uint256[4])` | [0, 0, 100, 200] | 无 |
| `tierRealmReqs` | 阶层境界要求 | `setTierRealmReqs(uint8[4])` | [0, 2, 3, 4] | 无 |
| `harvestCooldown` | 灵药园收获冷却（秒） | `setHarvestCooldown(uint256)` | 86400 (24h) | > 0, ≤ 7 days |
| `harvestRarePillBP` | 聚灵丹概率（其余培元丹） | `setHarvestRarePillBP(uint256)` | 2000 (20%) | ≤ 10000 |
| `harvestMinTier` | 灵药园最低洞天阶层 | `setHarvestMinTier(uint8)` | 3 (SpiritLand) | ≤ 3 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 8. Sect.sol — 宗门系统

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `memberCaps` | 各等级成员上限 | `setMemberCaps(uint256[4])` | [44, 80, 150, 300] | 每项 > 0 |
| `dailyPools` | 各等级每日灵石池 | `setDailyPools(uint256[4])` | [200, 500, 1500, 5000] ether | 无 |
| `spiritBonus[level]` | 灵脉加成 [外/内/长老] (BP) | `setSpiritBonus(uint8 level, uint256[3])` | Lv1:[1000,1200,1500] Lv2:[1500,1800,2200] Lv3:[2000,2400,3000] Lv4:[2500,3000,3700] | level < 4 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 9. Tao.sol — 道侣系统

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `betrothalFee` | 定情灵石费 | `setBetrothalFee(uint256)` | 50 ether | 无 |
| `dissolutionFee` | 解除关系费 | `setDissolutionFee(uint256)` | 20 ether | 无 |
| `initiatorCooldown` | 发起方冷却 | `setInitiatorCooldown(uint256)` | 72 hours | ≤ 30 days |
| `recipientCooldown` | 被动方冷却 | `setRecipientCooldown(uint256)` | 48 hours | ≤ 30 days |
| `maxRealmDiff` | 最大境界差 | `setMaxRealmDiff(uint8)` | 2 | ≤ 5 (REALM_COUNT) |
| `passiveBonusBP` | 被动加成 (BP) | `setPassiveBonusBP(uint256)` | 300 (+3%) | ≤ 10000 |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 10. Battle.sol — PvP 对战（链上透明计算）

流程：挂单 → 接单 → settleBattle(matchId) 链上直接计算。

### 可配置参数

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `challengeDuration` | 约战单有效时限 | `setChallengeDuration(uint256)` | 24 hours | 1 hour ~ 7 days |
| `maxActiveChallenges` | 玩家最大挂单数 | `setMaxActiveChallenges(uint256)` | 5 | 1-100 |
| `battleFeeBP` | 战斗手续费率 (BP) | `setBattleFeeBP(uint256)` | 500 (5%) | ≤ 1000 (10%) |
| `minBattleWager` | 最低赌注 | `setMinBattleWager(uint256)` | 1 ether | 无 |
| `settleTimeout` | 结算超时 | `setSettleTimeout(uint256)` | 5 minutes | 1 min ~ 1 hour |

### 信誉系统

| 参数 | 说明 | 来源 |
|------|------|------|
| `abnormalCount[player]` | 异常行为计数 | 结算超时 +1，正常胜利 -1（下限 0） |
| `ABNORMAL_THRESHOLD` | 禁赛阈值 | Constants.sol = 3（不可配置） |

### 对战流程函数

| 函数 | 说明 |
|------|------|
| `createChallenge(uint256 wager)` | 创建约战单，冻结赌注。需 abnormalCount < 3 |
| `cancelChallenge(uint256 challengeId)` | 撤销约战单，退还赌注 |
| `acceptChallenge(uint256 challengeId)` | 接受约战，创建 Match |
| `settleBattle(uint256 matchId)` | 合约读取双方链上属性，计算胜负，分配赌注 |

### 超时处理函数

| 函数 | 触发条件 | 结果 |
|------|----------|------|
| `claimSettleTimeout(uint256 matchId)` | 结算超时，无人调用结算 | 100% 罚没 + 双方 abnormalCount++ |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 11. Market.sol — 坊市交易

支持 ERC-721（装备/灵兽）和 ERC-1155（丹药）两种代币标准。合约实现 `IERC1155Receiver` 接口用于代币托管。

### 可配置参数

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `managedDailyLimit` | 托管账户每日购买上限 | `setManagedDailyLimit(uint256)` | 20 ether | 无 |
| `managedPriceCapBP` | 托管账户价格保护倍数 (BP) | `setManagedPriceCapBP(uint256)` | 15000 (150%) | ≥ 10000 (100%) |
| `marketFeeBP` | 交易手续费率 (BP) | `setMarketFeeBP(uint256)` | 200 (2%) | ≤ 1000 (10%) |

### 管理函数

| 函数 | 说明 |
|------|------|
| `setAllowedToken(address, bool)` | 白名单管理，控制可交易的代币合约（ERC-721 / ERC-1155） |
| `setFloorPrice(address, uint256)` | 设置合约地板价，用于托管账户价格保护（Anti-Sybil） |
| `setManagedAccount(address, bool)` | 标记/取消托管账户（受 Anti-Sybil 限制的 AI Agent 账户） |

### 交易函数

| 函数 | 说明 |
|------|------|
| `createOrder(address, uint256, uint256)` | 创建 ERC-721 卖单，NFT 托管到合约 |
| `createOrder1155(address, uint256, uint256, uint256)` | 创建 ERC-1155 卖单（含数量），代币托管到合约 |
| `cancelOrder(uint256)` | 卖家撤单，代币退回（自动区分 ERC-721/1155） |
| `fillOrder(uint256)` | 买家接单，支付灵石 + 手续费（自动区分 ERC-721/1155） |

### Anti-Sybil 机制

- **地板价保护**: 托管账户购买价格 ≤ `floorPrice × managedPriceCapBP / 10000`
- **每日限额**: 托管账户当天累计花费 ≤ `managedDailyLimit`
- **挂单限制**: 托管账户不能创建卖单

权限: `onlyOwner` + `transferOwnership(address)`

---

## 12. Register.sol — 修仙者注册

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| — | 无可配置参数 | — | — | — |

权限管理: `transferOwnership(address)` + `setAuthorizedUpdater(address, bool)`

授权合约可调用的函数:
- `addExperience(address, uint256)` — 累加修为经验
- `consumeExperience(address, uint256)` — 扣减经验（升重消耗）
- `updateRealm(address, uint8)` — 更新境界
- `updateSubRealm(address, uint8)` — 更新重数
- `updateAttributes(address, uint256, uint256, uint256, uint256)` — 更新四维属性

---

## 13. Alchemy.sol — 炼丹系统

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `failRefundBP` | 炼丹失败灵石返还比例 | `setFailRefundBP(uint256)` | 3000 (30%) | ≤ 10000 |
| `recipes[i].lsCost` | 配方灵石成本 | `setRecipe(uint8, ...)` | [50, 200, 800, 2000, 10, 40, 150, 300] ether | 无 |
| `recipes[i].materialCount` | 配方灵材消耗 | `setRecipe(uint8, ...)` | [2, 5, 10, 20, 1, 2, 5, 8] | 无 |
| `recipes[i].successRateBP` | 配方成功率 (BP) | `setRecipe(uint8, ...)` | [8000, 7000, 5500, 4000, 9000, 7500, 6000, 5000] | ≤ 10000 |
| `recipes[i].realmRequired` | 配方境界要求 | `setRecipe(uint8, ...)` | [0, 1, 2, 3, 0, 1, 2, 2] | < 5 |

权限: `onlyOwner` + `transferOwnership(address)`

详见 [丹药系统](PILL_SYSTEM.md)

---

## 14. Pill.sol — 丹药合约

无可配置参数。权限管理通过 `AccessControl`:

- `DEFAULT_ADMIN_ROLE`: 管理 MINTER_ROLE 授权
- `MINTER_ROLE`: 授权合约（Alchemy、Cultivation、Hunt、Treasure、SecretRealm、CaveHeaven）可调用 mint/burn

---

## 15. Paymaster.sol — Gas 代付

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `dailyBudget` | 每日 gas 预算 | `setDailyBudget(uint256)` | 1 ether | > 0 |
| `maxTxPerUser` | 每用户每日交易上限 | `setMaxTxPerUser(uint256)` | 50 | > 0 |
| `circuitBreakerThreshold` | 熔断器触发阈值 | `setCircuitBreakerThreshold(uint256)` | 100 | > 0 |
| `whitelistedTargets[addr]` | 白名单合约 | `setWhitelistedTarget(address, bool)` | 所有游戏合约 | - |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 16. GameAccountFactory.sol — 账户工厂

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `migrationFee` | BNB 付费迁移金额 | `setMigrationFee(uint256)` | 0.005 ether | - |
| `freeRealmThreshold` | 免费迁移最低境界 | `setFreeRealmThreshold(uint8)` | 1 (筑基) | - |

权限: `onlyOwner` + `transferOwnership(address)`

---

## 17. GameAccount.sol — ERC-4337 智能钱包

| 参数 | 说明 | Setter | 初始值 | 范围检查 |
|------|------|--------|--------|----------|
| `managed` | 托管模式（true=禁止灵石转出） | `setManaged(bool)` | true | 仅 Factory 可调 |

两种模式：
- **managed（托管）**: 新 Agent 默认，禁止灵石转出，Paymaster 代付 gas
- **autonomous（自主）**: 达到筑基或付费迁移后解锁，可自由转出灵石

---

## BP 单位说明

- **BP** = Basis Points = 万分比
- 10000 BP = 100%
- 例: 500 BP = 5%, 13000 BP = 130% (×1.30)

## CDF 格式说明

- CDF = 累积分布函数，/10000
- 数组必须**单调递增**且**末位为 10000**
- 例: `[3000, 7000, 10000]` = 30% 第一项, 40% 第二项, 30% 第三项
