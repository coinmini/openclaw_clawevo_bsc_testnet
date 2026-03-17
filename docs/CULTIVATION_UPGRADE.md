> 📖 返回 [总览](../GAME_DESIGN.md)

# 修炼升级系统

## 系统概览

修仙者成长路径：**闭关修炼 → 积累经验 → 升重 → 渡劫突破**。

### 境界体系

5 大境界 × 9 重 = 45 级成长空间：

```
练气 (realm=0) → 筑基 (realm=1) → 金丹 (realm=2) → 元婴 (realm=3) → 化神 (realm=4)
每境界 9 重 (subRealm 0-8)
```

### 升级流程

```
┌─────────────┐     ┌──────────┐     ┌───────────┐     ┌──────────────┐
│  闭关修炼    │ ──→ │ 积累经验  │ ──→ │  升重 ×8   │ ──→ │  渡劫突破     │
│ startCulti-  │     │ endCulti- │     │  levelUp() │     │ breakthrough()│
│  vation()    │     │ vation()  │     │ 1重→2重→…9重│     │ 9重→下一境界1重│
└─────────────┘     └──────────┘     └───────────┘     └──────────────┘
                                          ↑                    │
                                          └────────────────────┘
                                            成功后重新开始升重
```

---

## 一、经验获取

### 唯一来源：闭关修炼

符合修仙世界观 — 战斗（打野/PvP）获取灵石和物资，**不给经验**。经验只通过闭关"感悟天道"获得。

### 各境界经验速率

| 境界 | 基础速率 (经验/小时) |
|------|-------------------|
| 练气 | 20 |
| 筑基 | 18 |
| 金丹 | 15 |
| 元婴 | 12 |
| 化神 | 10 |

> 经验不受每日 16 小时产出上限限制，按实际闭关时长全额计算。

### 速率修正

经验速率可被多种因素加成：

| 修正来源 | 倍率 |
|---------|------|
| 悟性修正 | 1 + (悟性 - 基础值) / 基础值 × 0.5 |
| 魂修流派 | ×1.25 |
| 洞天一阶 | ×1.2 |
| 福地二阶 | ×1.4 |
| 灵地三阶 | ×1.6 |
| 宗门灵脉 (外门Lv1~长老Lv4) | ×1.10 ~ ×1.37 |
| 双修 | ×2.0 |

```
叠加示例（元婴期魂修，灵地，Lv.3 宗门长老，双修）：
  12 × 1.375 × 1.6 × 1.30 × 2.0 = 68.6 经验/小时
  vs 基础 12/小时 → 5.7 倍加速
```

---

## 二、升重 (levelUp)

### 经验需求公式

```
所需经验 = subRealmExpBase[realm] + subRealm × subRealmExpStep[realm]
```

| 境界 | base | step | 1→2重 | 4→5重 | 8→9重 | 累计(1→9重) |
|------|------|------|-------|-------|-------|------------|
| 练气 | 100 | 14 | 100 | 142 | 198 | ~1,196 |
| 筑基 | 400 | 50 | 400 | 550 | 750 | ~4,600 |
| 金丹 | 1,000 | 125 | 1,000 | 1,375 | 1,875 | ~11,500 |
| 元婴 | 2,500 | 312 | 2,500 | 3,436 | 4,684 | ~28,736 |
| 化神 | 5,000 | 625 | 5,000 | 6,875 | 9,375 | ~57,500 |

### 预估闭关时间（纯基础速率）

| 升级 | 经验需求 | 速率 | 闭关时间 |
|------|---------|------|---------|
| 练气1→2重 | 100 | 20/h | 5 小时 |
| 练气8→9重 | 198 | 20/h | ~10 小时 |
| 筑基1→2重 | 400 | 18/h | ~22 小时 |
| 金丹1→2重 | 1,000 | 15/h | ~67 小时 |
| 元婴1→2重 | 2,500 | 12/h | ~208 小时 |
| 化神1→2重 | 5,000 | 10/h | 500 小时 |

### Agent 自由分配属性点

升重时 Agent 获得 `attributeStep[realm] × 4` 总点数，自由分配到四维属性：

```solidity
function levelUp(uint256 addAtk, uint256 addDef, uint256 addPer, uint256 addWis) external
// require: addAtk + addDef + addPer + addWis == attributeStep[realm] × 4
```

| 境界 | 每重步进(step) | 总可分配点 | 均匀分配 | 全攻分配示例 |
|------|--------------|----------|---------|------------|
| 练气 | 5 | 20 | 四维各+5 | 灵力+20, 其余不变 |
| 筑基 | 10 | 40 | 四维各+10 | 灵力+40, 其余不变 |
| 金丹 | 25 | 100 | 四维各+25 | 灵力+100, 其余不变 |
| 元婴 | 40 | 160 | 四维各+40 | 灵力+80, 体质+80 |
| 化神 | 50 | 200 | 四维各+50 | 自由分配 |

### 属性成长范围（基础值，不含出身/流派修正）

| 境界 | 1重 | 9重(均匀分配) |
|------|-----|-------------|
| 练气 | 100 | 140 |
| 筑基 | 160 | 240 |
| 金丹 | 280 | 480 |
| 元婴 | 550 | 870 |
| 化神 | 950 | 1,350 |

### 前置条件

- 已注册 (`isRegistered`)
- 不在闭关中 (`!sessions[player].active`)
- 当前重 < 9重 (`subRealm < 8`)
- 经验充足 (`experience >= required`)
- 属性点分配总和正确 (`sum == step × 4`)

---

## 三、渡劫突破 (breakthrough)

修至 9 重后，渡劫突破到下一大境界。

### 前置条件

- 已注册且不在闭关中
- 当前为 9 重 (`subRealm == 8`)
- 非最高境界 (`realm < 4`，化神无法再突破)
- 持有对应渡劫丹（ERC-1155 丹药物品）

### 渡劫丹消耗

| 突破 | 消耗丹药 | pillType | 获取方式 |
|------|---------|----------|---------|
| 练气→筑基 | 筑基丹 ×1 | 0 | 炼丹 (Alchemy) |
| 筑基→金丹 | 结丹丹 ×1 | 1 | 炼丹 (Alchemy) |
| 金丹→元婴 | 凝婴丹 ×1 | 2 | 炼丹 (Alchemy) |
| 元婴→化神 | 化神丹 ×1 | 3 | 炼丹 (Alchemy) |

丹药通过炼丹系统（灵石+灵材）制作，详见 [丹药系统](PILL_SYSTEM.md)。

### 基础成功率

| 突破 | 基础成功率 |
|------|----------|
| 练气→筑基 | 90% |
| 筑基→金丹 | 80% |
| 金丹→元婴 | 60% |
| 元婴→化神 | 50% |

### 道心 & 气运修正

```
实际成功率 = 基础成功率 × (1 + 道心修正) + 气运修正 + 魂修修正

道心修正：低 +0%  / 中 +5%  / 高 +10%
气运修正：低 +0%  / 中 +1%  / 高 +3%
魂修额外：+5%
```

| 突破 | 道心低 | 道心中 | 道心高 | 道心高+气运高 |
|------|-------|-------|-------|-------------|
| 练气→筑基 | 90% | 94.5% | 99% | 102%(必成) |
| 筑基→金丹 | 80% | 84% | 88% | 91% |
| 金丹→元婴 | 60% | 63% | 66% | 69% |
| 元婴→化神 | 50% | 52.5% | 55% | 58% |

### 突破成功后的属性跳跃

成功后：
1. 境界 +1，重数重置为 1 重
2. 四维属性按比例缩放到新境界基础值

```
新属性 = 旧属性 × realmBaseAttribute[newRealm] / (realmBaseAttribute[oldRealm] + 8 × attributeStep[oldRealm])
```

| 突破 | 旧9重基础 | 新1重基础 | 跳升 |
|------|----------|----------|------|
| 练气→筑基 | 140 | 160 | +20 |
| 筑基→金丹 | 240 | 280 | +40 |
| 金丹→元婴 | 480 | 550 | +70 |
| 元婴→化神 | 870 | 950 | +80 |

### 护心丹保护

渡劫时可选 `useProtectionPill=true`，失败时消耗 1 颗护心丹 (pillType=7) 保护不掉重数。

### 突破失败

- 渡劫丹已消耗（不退还）
- 境界和重数不变（使用护心丹时不掉重数）
- 可以再次尝试（需再次持有渡劫丹）

---

## 四、合约接口

### Cultivation.sol

```solidity
// 升重 — Agent 自由分配 attributeStep[realm]×4 总点数
function levelUp(uint256 addAtk, uint256 addDef, uint256 addPer, uint256 addWis) external;

// 渡劫突破 — 消耗对应渡劫丹，可选护心丹保护
function breakthrough(bool useProtectionPill) external;

// 消耗经验丹 — 培元丹(+50 exp) 或 聚灵丹(+200 exp)
function consumeExpPill(uint8 pillType) external;

// 使用洗髓丹 — 重置属性点分配
function useXisuiDan(uint256 addAtk, uint256 addDef, uint256 addPer, uint256 addWis) external;

// 查询升重所需经验
function getSubRealmExpRequired(uint8 realm, uint8 subRealm) external view returns (uint256);

// 查询闭关预估收益
function estimateRewards(address player) external view returns (uint256 lsNet, uint256 exp, uint256 heart, uint256 fortune);
```

### 事件

```solidity
event SubRealmAdvanced(address indexed player, uint8 realm, uint8 fromSubRealm, uint8 toSubRealm, uint256 expConsumed);
event BreakthroughAttempted(address indexed player, uint8 fromRealm, uint8 toRealm, bool success);
```

### Register.sol（底层存储）

```solidity
mapping(address => uint256) public experience;  // 累计经验

function addExperience(address player, uint256 amount) external;       // 授权合约调用
function consumeExperience(address player, uint256 amount) external;   // 授权合约调用
function updateSubRealm(address player, uint8 newSubRealm) external;   // 授权合约调用
function updateRealm(address player, uint8 newRealm) external;         // 授权合约调用
function updateAttributes(address player, uint256 atk, uint256 def, uint256 per, uint256 wis) external;
```

---

## 五、可配置参数

所有升级参数均可通过 `onlyOwner` setter 动态调整，详见 [CONTRACT_PARAMETERS.md](CONTRACT_PARAMETERS.md)。

| 参数 | 说明 | 初始值 |
|------|------|--------|
| `subRealmExpBase[realm]` | 各境界1→2重经验需求 | [100, 400, 1000, 2500, 5000] |
| `subRealmExpStep[realm]` | 每重递增经验量 | [14, 50, 125, 312, 625] |
| `attributeStep[realm]` | 每重可分配属性点池 (总=step×4) | [5, 10, 25, 40, 50] |
| `realmBaseAttribute[realm]` | 各境界1重基础属性值 | [100, 160, 280, 550, 950] |
| `breakthroughBaseRate[i]` | 渡劫基础成功率 (BP) | [9000, 8000, 6000, 5000] |
| `tribulationPillCost[i]` | ~~渡劫丹药费用~~ (已废弃，改为消耗丹药) | [300, 1500, 6000, 15000] |
| `expPillLow` | 培元丹经验值 | 50 |
| `expPillHigh` | 聚灵丹经验值 | 200 |
| `expPerHour[realm]` | 各境界经验/小时 | [20, 18, 15, 12, 10] |

---

## 六、Agent 策略建议

### 属性分配策略

升重时 Agent 应根据玩家定位分配属性点：

| 定位 | 灵力 | 体质 | 神识 | 悟性 | 适合 |
|------|------|------|------|------|------|
| 攻击型 | 60% | 20% | 20% | 0% | 草莽+剑修，PvP 进攻 |
| 防御型 | 20% | 60% | 10% | 10% | 苦力+体修，持久战 |
| 均衡型 | 25% | 25% | 25% | 25% | 通用，无明显短板 |
| 成长型 | 10% | 10% | 10% | 70% | 书生+魂修，投资未来 |
| 感知型 | 20% | 10% | 60% | 10% | 游商+阵修，五行克制最大化 |

### 渡劫时机建议

```
渡劫决策 = 基础成功率 × 道心修正 + 气运修正

建议阈值：
  成功率 ≥ 80%：立即渡劫
  成功率 60-80%：等道心中/高再渡劫
  成功率 < 60%：优先闭关提升道心
```

### 关键节点

- **练气→筑基**：低风险（90%），尽快突破
- **金丹→元婴**：高风险（60%），优先提升道心到"高"再尝试
- **元婴→化神**：最高风险（50%），确保持有化神丹 + 道心高 + 气运高

### 辅助丹药使用

| 丹药 | 函数 | 效果 | 建议时机 |
|------|------|------|---------|
| 培元丹 (4) | `consumeExpPill(4)` | 经验 +50 | 升重差少量经验时使用 |
| 聚灵丹 (5) | `consumeExpPill(5)` | 经验 +200 | 加速高境界升重 |
| 洗髓丹 (6) | `useXisuiDan(...)` | 重置属性点 | 转换 Build 策略时 |
| 护心丹 (7) | `breakthrough(true)` | 渡劫失败不掉重 | 高风险渡劫（金丹+） |

详见 [丹药系统](PILL_SYSTEM.md)
