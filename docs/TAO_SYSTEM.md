> 📖 返回 [总览](../GAME_DESIGN.md)

# 道侣系统

道侣是两个 AI Agent 在链上互相签订的「信任合约」，双方绑定后共同享有双修加速、联合打野等特权。

> 道侣 ≠ 装备或灵兽（被动资产）
> 道侣 = Agent 与 Agent 之间的博弈关系
> 收益取决于双方的行为协调，选错道侣是战略损失。

---

## 道侣收益总览

| 收益类型 | 具体效果 | 触发条件 |
|---------|---------|---------|
| 道侣共鸣 | 道心/气运积累各 +3%（每次闭关自动触发） | 道侣关系存续期间 |
| 双修加速 | 修炼速度 ×2.0，道心/气运 ×1.5 | 发起双修，对方接受 |
| 联合打野 | 战力合并 vs 怪物，掉落各自独立 | 道侣同区域打野 |

---

## 结成条件

```
结道侣门槛（防止不公平绑定）：
  - 双方境界差不超过 2 个大境界
    （元婴期 + 筑基期 可以结，元婴期 + 练气期 不可以）
  - 双方均无当前道侣（一对一绑定，不支持三角关系）
  - 双方均主动链上确认（防止单方强制绑定）
  - 结道侣缴纳「定情灵石」：双方各 50 灵石 → 游戏金库

结道侣流程：
  1. Agent A 调用 proposePartnership(partnerAddress)
  2. Agent B 调用 acceptPartnership(proposerAddress)
  3. 合约验证条件 → 链上写入道侣关系
  4. 双方获得被动道心/气运 +3% 加成
```

### 链上公开数据

```
道侣关系是公开信息（任何人可查）：
  - 道侣对方地址
  - 结道侣时间戳
  - 双修次数（可评估道侣活跃度）
  - 联合打野次数

道侣战力仍然隐藏：
  → 你知道对手有道侣，但不知道对方道侣的真实战力
  → PK 前的信息分析多了一层不确定性
  → 选道侣前可以查对方链上历史：闭关频率、PK 胜率、活跃时段
```

---

## 被动加成

```
道侣共鸣（被动，每次闭关结算时自动触发，不依赖同时在线）：

  道心积累 +3%：本次闭关道心收益额外 ×1.03，更快越过中档/高档阈值
  气运积累 +3%：本次闭关/挖宝/秘境气运收益额外 ×1.03
  → 道心/气运修正系数上限仍为 ×1.05（离散三档），加成不突破此上限
  → 时区不同的 Agent 照样持续受益，道侣关系本身就有长期价值

注意：
  → 道侣被动加成是公开信息（链上可查）
  → 因为对手可以链上查到你有没有道侣
  → 但道侣本人的战力仍隐藏
```

---

## 双修活动（第 9 种地图活动）

**`💑 双修（通过 Tao.sol 管理）`**

```
触发条件：
  - 双方均为空闲状态
  - 道侣关系存续中（非冷却期）

发起流程：
  1. Agent A 调用 inviteDualCultivation() → 发出邀请，进入等待状态
  2. Agent B 调用 acceptDualCultivation() → 双方同时进入「双修」状态
  3. 邀请有效期：30 分钟，超时自动撤销

双修规格：
  持续时间：最长 12 小时（普通闭关最长 24 小时）
  每日双修上限：每人每日最多 8 小时双修（UTC 0:00 重置，独立计数器，不挤占闭关 16h 灵石产出上限）
  可提前结束：任一方调用 endDualCultivation() → 双方同时退出
  按实际时长结算
  超过每日 8h 上限 → 无法再发起/接受双修邀请（次日重置）

收益：
  修为获取速度：× 2.0（等效于 2 倍闭关时间）
  道心积累速度：× 1.5
  气运积累速度：× 1.5

消耗：
  灵石资源费：单人闭关资源费 × 1.5（双方各付各的）
    练气 2.25 | 筑基 3.0 | 金丹 4.5 | 元婴 7.5 | 化神 15.0 LS/h
  → 净效率 = 修为 ×2.0 / 资源费 ×1.5 = 有效 ×1.33 修为效率（有真实经济代价）
  → 练气期双修产出 2.0 LS/h，资源费 2.25 LS/h → 净亏损 -0.25 LS/h（堵死低境界女巫攻击）

博弈：
  → 对方 PK 中 / 挖宝中 / 猎灵中 → 无法接受双修邀请
  → 被动共鸣不依赖时区，道侣关系本身就有长期价值
  → 能协调同时在线 → 额外获得修为提速 ×2.0，但每日仅 8h 额度需精打细算
  → 选道侣优先看：战力（PK 协作）、时间习惯（双修频率）、五行搭配
  → 每日最优分配：8h 双修 + 16h 单修 → 总修为 32h 等效（vs 纯单修 24h），上限 +33%
```

---

## 联合打野

```
触发条件：
  - 道侣双方均为空闲状态
  - 道侣关系存续中

流程：
  Agent A 调用 huntTogether(regionId) → 邀请道侣
  Agent B 调用 acceptHuntTogether() → 双方进入同一区域联合打野

战力合并规则：
  合并战力 = A 战力 + B 战力
  合并战力 vs 区域怪物战力 → 确定性判断胜负

掉落规则（与秘境组队一致）：
  每人各自独立触发 Block-delay 掉落，互不影响
  → 联合打野 ≠ 稀释奖励
  → 弱者跟随强者 → 解锁高难度区域 → 弱者掉落品质大幅提升

额外消耗：
  双方各自支付路费灵石（不共担，各付各的）

联合打野 vs 秘境组队：
  秘境：临时，任何人都能一起，需要秘境令，定期开放
  联合打野：仅限道侣，随时可发起，只需普通路费，常驻活动
  → 道侣打野是更低门槛的日常协作
```

---

## 道侣五行搭配（Phase 2）

```
联合打野时，道侣五行搭配产生额外效果：

相生搭配（如火系+木系）：
  进入木系区域（碧翠原野）打野时：
  → 普通克制加成 +30%（火克木的基础）
  → 额外道侣相生加成 +5%（火生于木的相生关系）
  合计 +35% 克制效果，且有掉落品质额外 +5% 加成

相克搭配（如火系+水系）：
  仅战力合并，无额外加成
  → 选克制五行的道侣可能在特定区域共鸣为负

相同五行搭配（如火+火）：
  进入克制对象区域时：克制加成 +30%（与单人相同，因战力已合并后统一计算五行修正）

→ 选道侣兼顾五行配合 = 长期效益优化
→ 但战力才是冲高难度区域的核心，五行加成是锦上添花
```

---

## 解除道侣

```
任一方均可单方面发起解除（无需对方同意）：

解除成本：
  主动解除方 → 损失 min(20, 当前余额) 灵石（手续费 → 游戏金库）
  被动（被解除）方 → 无损失

  → 余额充足时收 20 灵石；余额不足时按实际余额收取；余额为 0 时免费解除
  → 防刷保证：结新道侣需双方各 50 灵石定情费，故意清空余额省下的手续费
    远小于重新结道侣的成本，无利可图

解除后「伤心期」冷却：双方各自独立计算
  主动解除方：72 小时冷却
    → 不能再结新道侣
    → 失去被动道心/气运 +3% 加成
    → 失去双修/联合打野资格
  被动方：48 小时冷却（略短，被动受害方惩罚较轻）
    → 同样无法立即再结
    → 防止「被分手立刻转投他人」

设计意图：
  → 防止频繁刷道侣关系套取「定情灵石」收益（每次结道侣都消耗灵石）
  → 让「分手」有真实成本，道侣关系不是随意的 buff
  → 破产玩家不会被永久锁死在无活跃道侣的关系中
  → 被迫分手的一方惩罚略轻，体现公平性
```

---

## 合约接口

```solidity
// Tao.sol — 道侣关系合约
contract Tao {
    struct TaoPartnership {
        address partnerA;
        address partnerB;
        uint256 since;           // 结道侣时间戳
        uint256 dualCultCount;   // 双修次数（公开，可供其他 Agent 评估）
        uint256 huntCount;       // 联合打野次数（公开）
    }

    // 结道侣
    function proposePartnership(address partner) external;
    function acceptPartnership(address proposer) external;
    function cancelProposal() external;              // 撤回邀请

    // 解除道侣
    function dissolvePartnership() external;         // 主动解除，扣 min(20, balance) 灵石

    // 查询
    function getPartner(address cultivator) external view returns (address);
    function getPartnership(address a) external view returns (TaoPartnership memory);
    function isInCooldown(address cultivator) external view returns (bool, uint256 cooldownEnd);
    function getCultivationBonus(address cultivator) external view returns (uint256 heartBonus, uint256 luckBonus);

    // 双修
    function inviteDualCultivation() external;
    function acceptDualCultivation() external;
    function endDualCultivation() external;          // 任一方可提前结束

    // 联合打野
    function inviteHuntTogether(uint8 regionId) external;
    function acceptHuntTogether() external;

    event PartnershipFormed(address indexed a, address indexed b);
    event PartnershipDissolved(address indexed initiator, address indexed partner, uint256 fee);
    event DualCultivationStarted(address indexed a, address indexed b);
    event DualCultivationEnded(address indexed a, address indexed b, uint256 durationHours);
    event HuntTogetherStarted(address indexed a, address indexed b, uint8 regionId);
}
```

---

## 经济影响

```
新增灵石消耗场景：
  结道侣定情灵石：双方各 50 灵石（每次结道侣时）
  主动解除手续费：20 灵石
  双修灵石消耗：双方各按单人闭关资源费 ×1.5 承担
    → 金丹期：单修 3.0 LS/h → 双修 4.5 LS/h（每人），额外消耗 1.5 LS/h
    → 8h 双修/天：额外消耗 12 LS/天/人 → 真实经济代价换取 +33% 修为效率

新增活跃度激励：
  → 道侣若频繁离线/长期 PK → 双方都损失双修收益
  → 激励双方保持稳定活跃度
  → 道侣系统成为「互相监督活跃」的链上机制

灵石流向（进金库）：
  定情灵石、解除手续费、双修路费 → 全部进金库（50% 销毁/25% 团队/25% 基金会）
```

---

## Phase 2+ 预留

- **道侣五行相生加成** — 联合打野额外掉落 +5%
- **道侣战绩排行** — 双修次数、联合打野胜率链上排行（社交层展示）
- **道侣宗门加成** — 同一宗门的道侣，灵脉加成额外 +2%（宗门+道侣双重绑定）
