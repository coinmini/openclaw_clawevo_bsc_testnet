"""
数值系统验证脚本
================
验证 Pikemon 修仙对战游戏的攻防对抗 + 境界分层数值体系。

三大验证模块：
1. 战力分布 — 80 种 Build 组合的攻防分布图
2. 对战矩阵 — 20 种典型 Build 的两两胜率热力图
3. 经济模拟 — 1000 Agent 跑 30 天的灵石流通模拟
"""

from dataclasses import dataclass
from enum import Enum
from itertools import product
from typing import NamedTuple

import matplotlib
import matplotlib.pyplot as plt
import numpy as np

matplotlib.rcParams["font.sans-serif"] = ["Arial Unicode MS", "SimHei", "Heiti TC"]
matplotlib.rcParams["axes.unicode_minus"] = False


# =============================================================================
# 常量定义（与 NUMERICAL_SYSTEM.md 完全对齐）
# =============================================================================

class Origin(Enum):
    CAOMANG = "草莽"
    YOUSHANG = "游商"
    KULI = "苦力"
    SHUSHENG = "书生"


class School(Enum):
    JIAN = "剑修"
    TI = "体修"
    ZHEN = "阵修"
    HUN = "魂修"


class Element(Enum):
    JIN = "金"
    MU = "木"
    SHUI = "水"
    HUO = "火"
    TU = "土"


# 五行克制: key 克 value
ELEMENT_RESTRAINT = {
    Element.JIN: Element.MU,
    Element.MU: Element.TU,
    Element.TU: Element.SHUI,
    Element.SHUI: Element.HUO,
    Element.HUO: Element.JIN,
}

# 五行相生: key 生 value
ELEMENT_SYNERGY = {
    Element.JIN: Element.SHUI,
    Element.SHUI: Element.MU,
    Element.MU: Element.HUO,
    Element.HUO: Element.TU,
    Element.TU: Element.JIN,
}

K_RATIO = 0.6  # 防御系数：K = 双方攻击力均值 × K_RATIO，治理可调 0.3~1.5

# 出身修正 (体质, 灵力, 神识, 悟性)
ORIGIN_MODIFIERS = {
    Origin.CAOMANG: (1.10, 1.25, 1.00, 1.00),
    Origin.YOUSHANG: (1.00, 1.00, 1.25, 1.00),
    Origin.KULI: (1.25, 1.00, 1.00, 1.00),
    Origin.SHUSHENG: (1.00, 1.00, 1.00, 1.25),
}

# 流派修正 (攻击修正, 防御修正)
SCHOOL_MODIFIERS = {
    School.JIAN: (1.20, 0.90),
    School.TI: (0.90, 1.20),
    School.ZHEN: (0.90, 1.00),
    School.HUN: (0.95, 0.85),
}

# 阵修五行克制上限 +0.1
ZHEN_RESTRAINT_BONUS = 0.10

# 境界基础属性和倍率
REALM_NAMES = ["练气", "筑基", "金丹", "元婴", "化神"]
REALM_BASE = {
    "练气": {"base": 100, "step": 5},
    "筑基": {"base": 160, "step": 10},
    "金丹": {"base": 280, "step": 25},
    "元婴": {"base": 550, "step": 40},
    "化神": {"base": 950, "step": 50},
}
REALM_MULTIPLIER = {
    "练气": {"base": 1.00, "step": 0.05},
    "筑基": {"base": 1.80, "step": 0.10},
    "金丹": {"base": 3.00, "step": 0.20},
    "元婴": {"base": 5.50, "step": 0.40},
    "化神": {"base": 12.00, "step": 0.50},  # 起点从10拉到12，拉开与元婴差距
}

# 灵石经济参数（V2: 降低闭关产出，控制通胀）
LS_CULTIVATION_RATE = {"练气": 2, "筑基": 5, "金丹": 10, "元婴": 20, "化神": 40}
LS_TREASURE_EXPECTED = 10  # per attempt, 1h CD（原15，降低）
LS_HUNT_LOW = 20
LS_HUNT_MID = 40
LS_HUNT_HIGH = 80

LS_CULTIVATION_COST_PER_HOUR = {"练气": 1.5, "筑基": 2, "金丹": 3, "元婴": 5, "化神": 10}
LS_CULTIVATION_DAILY_CAP_HOURS = 16  # 每日灵石产出上限小时数
LS_TREASURE_COST_AVG = 5
LS_HUNT_COST_AVG = 15

# 洞天维护费（日费，新增消耗水槽）
LS_DONGTIAN_DAILY = {"洞天": 5, "福地": 20, "灵地": 50}

LS_TRIBULATION_PILL = {"练气": 300, "筑基": 1500, "金丹": 6000, "元婴": 15000}

BURN_RATE = 0.50  # 50% of all fees burned


# =============================================================================
# 数据结构
# =============================================================================

class CombatStats(NamedTuple):
    attack: float
    defense: float
    perception: float  # 神识


@dataclass(frozen=True)
class Build:
    origin: Origin
    school: School
    element: Element
    realm: str = "金丹"
    realm_level: int = 5
    weapon_bonus: float = 0.15  # 蓝品法宝
    armor_bonus: float = 0.15   # 蓝品护宝


# =============================================================================
# 核心计算
# =============================================================================

def get_base_attribute(realm: str, level: int) -> float:
    """获取境界+小境界的基础属性值。"""
    cfg = REALM_BASE[realm]
    return cfg["base"] + cfg["step"] * (level - 1)


def get_realm_multiplier(realm: str, level: int) -> float:
    """获取境界倍率。"""
    cfg = REALM_MULTIPLIER[realm]
    return cfg["base"] + cfg["step"] * (level - 1)


def compute_combat_stats(build: Build) -> CombatStats:
    """计算 Build 的攻击力、防御力、感知力。"""
    base = get_base_attribute(build.realm, build.realm_level)
    multiplier = get_realm_multiplier(build.realm, build.realm_level)

    # 出身修正
    tizhi_mod, lingli_mod, shenshi_mod, _wuxing_mod = ORIGIN_MODIFIERS[build.origin]

    # 元婴全属性 +10%
    realm_attr_bonus = 1.10 if build.realm == "元婴" else 1.00

    lingli = base * lingli_mod * realm_attr_bonus
    tizhi = base * tizhi_mod * realm_attr_bonus
    shenshi = base * shenshi_mod * realm_attr_bonus

    # 流派修正
    atk_mod, def_mod = SCHOOL_MODIFIERS[build.school]

    # 装备修正
    weapon_mod = 1 + build.weapon_bonus
    armor_mod = 1 + build.armor_bonus

    attack = lingli * weapon_mod * atk_mod * multiplier
    defense = tizhi * armor_mod * def_mod * multiplier
    perception = shenshi  # 未乘境界倍率，直接用原值影响克制倍率

    return CombatStats(attack=attack, defense=defense, perception=perception)


def get_element_modifier_for_attack(
    my_element: Element,
    opponent_element: Element,
    my_perception: float,
    opponent_perception: float,
    my_is_zhen: bool = False,
) -> float:
    """返回"我攻击对手"时我的五行倍率。

    V2 规则（单向修正 + 分档制）：
    - 我克制对手 → ×1.30 + 神识分档加成（只增强克制方攻击）
    - 对手克制我 → ×1.00（被克方攻击不再被削弱）
    - 相生 → ×1.08（我生对手）或 ×1.00
    - 无关系 → ×1.00

    分档制（ZK 友好，替代旧连续公式 min(0.15, 神识/5000)）：
    神识 < 250 → +0.00 | ≥250 → +0.05 | ≥500 → +0.10 | ≥750 → +0.15
    """
    if ELEMENT_RESTRAINT.get(my_element) == opponent_element:
        # 我克制对手 → 只增强我的攻击（分档制）
        if my_perception >= 750:
            bonus = 0.15
        elif my_perception >= 500:
            bonus = 0.10
        elif my_perception >= 250:
            bonus = 0.05
        else:
            bonus = 0.00
        if my_is_zhen:
            bonus = min(0.25, bonus + ZHEN_RESTRAINT_BONUS)
        return 1.30 + bonus

    # 被克制时不再削弱攻击
    # if ELEMENT_RESTRAINT.get(opponent_element) == my_element:
    #     return 0.80  # 旧方案，已移除

    if ELEMENT_SYNERGY.get(my_element) == opponent_element:
        return 1.08

    if ELEMENT_SYNERGY.get(opponent_element) == my_element:
        return 1.00

    return 1.00


def battle(build_a: Build, build_b: Build) -> str:
    """模拟两个 Build 的对战，返回 'A', 'B', 或 'draw'。"""
    stats_a = compute_combat_stats(build_a)
    stats_b = compute_combat_stats(build_b)

    # A 攻击 B 时的五行倍率
    a_atk_mod = get_element_modifier_for_attack(
        build_a.element, build_b.element,
        stats_a.perception, stats_b.perception,
        my_is_zhen=(build_a.school == School.ZHEN),
    )

    # B 攻击 A 时的五行倍率
    b_atk_mod = get_element_modifier_for_attack(
        build_b.element, build_a.element,
        stats_b.perception, stats_a.perception,
        my_is_zhen=(build_b.school == School.ZHEN),
    )

    # 百分比减伤公式：K = 双方攻击力均值 × K_RATIO
    k = (stats_a.attack + stats_b.attack) / 2 * K_RATIO
    score_a = stats_a.attack * a_atk_mod * k / (stats_b.defense + k)
    score_b = stats_b.attack * b_atk_mod * k / (stats_a.defense + k)

    if score_a > score_b:
        return "A"
    if score_b > score_a:
        return "B"
    return "draw"


# =============================================================================
# 模块一：战力分布（80 种 Build 组合）
# =============================================================================

def analyze_combat_distribution():
    """生成 80 种 Build (4出身×4流派×5五行) 的攻防分布。"""
    print("=" * 60)
    print("模块一：战力分布分析（金丹5重，蓝品双槽）")
    print("=" * 60)

    builds = []
    attacks = []
    defenses = []
    labels = []

    for origin, school, element in product(Origin, School, Element):
        b = Build(origin=origin, school=school, element=element)
        stats = compute_combat_stats(b)
        builds.append(b)
        attacks.append(stats.attack)
        defenses.append(stats.defense)
        labels.append(f"{origin.value[0]}{school.value[0]}{element.value}")

    attacks_arr = np.array(attacks)
    defenses_arr = np.array(defenses)

    print(f"\n攻击力范围: {attacks_arr.min():.0f} ~ {attacks_arr.max():.0f}")
    print(f"防御力范围: {defenses_arr.min():.0f} ~ {defenses_arr.max():.0f}")
    print(f"攻击力标准差: {attacks_arr.std():.0f}")
    print(f"防御力标准差: {defenses_arr.std():.0f}")
    print(f"攻防比范围: {(attacks_arr / defenses_arr).min():.2f} ~ "
          f"{(attacks_arr / defenses_arr).max():.2f}")

    # 按流派着色
    school_colors = {
        School.JIAN: "#e74c3c",   # 红 - 剑修
        School.TI: "#3498db",     # 蓝 - 体修
        School.ZHEN: "#2ecc71",   # 绿 - 阵修
        School.HUN: "#9b59b6",    # 紫 - 魂修
    }

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7))

    # 散点图：攻击 vs 防御
    for school in School:
        mask = [b.school == school for b in builds]
        ax1.scatter(
            attacks_arr[mask], defenses_arr[mask],
            c=school_colors[school], label=school.value,
            alpha=0.7, s=60, edgecolors="white", linewidth=0.5,
        )

    ax1.set_xlabel("攻击力", fontsize=12)
    ax1.set_ylabel("防御力", fontsize=12)
    ax1.set_title("80 种 Build 的攻防分布（金丹5重·蓝品双槽）", fontsize=14)
    ax1.legend(fontsize=11)
    ax1.set_aspect("equal")
    ax1.grid(True, alpha=0.3)

    # 攻防比直方图
    ratios = attacks_arr / defenses_arr
    for school in School:
        mask = [b.school == school for b in builds]
        ax2.hist(
            ratios[mask], bins=8, alpha=0.6,
            color=school_colors[school], label=school.value,
        )

    ax2.set_xlabel("攻防比 (攻击/防御)", fontsize=12)
    ax2.set_ylabel("Build 数量", fontsize=12)
    ax2.set_title("攻防比分布（>1 偏攻，<1 偏防）", fontsize=14)
    ax2.legend(fontsize=11)
    ax2.axvline(x=1.0, color="black", linestyle="--", alpha=0.5)
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig("scripts/output_combat_distribution.png", dpi=150)
    plt.close()
    print("\n图表已保存: scripts/output_combat_distribution.png")

    # 输出极端 Build 分析
    print("\n--- 极端 Build 分析 ---")
    max_atk_idx = int(attacks_arr.argmax())
    max_def_idx = int(defenses_arr.argmax())
    min_atk_idx = int(attacks_arr.argmin())
    min_def_idx = int(defenses_arr.argmin())

    for label, idx in [
        ("最高攻击", max_atk_idx),
        ("最高防御", max_def_idx),
        ("最低攻击", min_atk_idx),
        ("最低防御", min_def_idx),
    ]:
        b = builds[idx]
        print(f"  {label}: {b.origin.value}×{b.school.value}×{b.element.value} "
              f"— 攻:{attacks_arr[idx]:.0f} 防:{defenses_arr[idx]:.0f} "
              f"比:{attacks_arr[idx] / defenses_arr[idx]:.2f}")


# =============================================================================
# 模块二：对战矩阵（20 种典型 Build 两两对战）
# =============================================================================

def analyze_battle_matrix():
    """生成 20 种典型 Build (4流派×5五行) 的对战胜率热力图。

    使用蒙特卡洛方法：每对 Build 用不同出身组合对战 16 次（4×4），
    取平均胜率作为矩阵值，这样五行区分度能显现出来。
    """
    print("\n" + "=" * 60)
    print("模块二：对战矩阵（金丹5重·蓝品双槽·20 种流派×五行组合）")
    print("=" * 60)

    # 20 种典型组合 = 4 流派 × 5 五行
    combos = list(product(School, Element))
    combo_labels = [f"{s.value[0]}{e.value}" for s, e in combos]
    n = len(combos)

    # win_matrix[i][j] = combo i 对 combo j 的平均胜率（遍历所有出身组合）
    win_matrix = np.zeros((n, n))
    origins = list(Origin)

    for i in range(n):
        for j in range(n):
            if i == j:
                win_matrix[i][j] = 0.5
                continue
            si, ei = combos[i]
            sj, ej = combos[j]
            wins_i = 0
            total = 0
            for oi in origins:
                for oj in origins:
                    ba = Build(origin=oi, school=si, element=ei)
                    bb = Build(origin=oj, school=sj, element=ej)
                    result = battle(ba, bb)
                    total += 1
                    if result == "A":
                        wins_i += 1
                    elif result == "draw":
                        wins_i += 0.5
            win_matrix[i][j] = wins_i / total

    # 计算每个组合的总胜率
    win_rates = []
    for i in range(n):
        rates = [win_matrix[i][j] for j in range(n) if i != j]
        win_rates.append(np.mean(rates))

    print("\n--- Build 胜率排名（高→低）---")
    sorted_indices = sorted(range(n), key=lambda i: win_rates[i], reverse=True)
    for rank, idx in enumerate(sorted_indices, 1):
        s, e = combos[idx]
        print(f"  #{rank:2d} {s.value}·{e.value} "
              f"平均胜率 {win_rates[idx]:.1%}")

    # 热力图
    fig, ax = plt.subplots(figsize=(14, 12))
    im = ax.imshow(win_matrix, cmap="RdYlGn", vmin=0, vmax=1, aspect="auto")

    ax.set_xticks(range(n))
    ax.set_xticklabels(combo_labels, rotation=45, ha="right", fontsize=9)
    ax.set_yticks(range(n))
    ax.set_yticklabels(combo_labels, fontsize=9)

    ax.set_xlabel("守方 Build（流派·五行）", fontsize=12)
    ax.set_ylabel("攻方 Build（流派·五行）", fontsize=12)
    ax.set_title("20 种 Build 对战矩阵（遍历 4×4 出身组合取平均）", fontsize=14)

    # 添加网格分隔流派
    for pos in [5, 10, 15]:
        ax.axhline(y=pos - 0.5, color="black", linewidth=1.5)
        ax.axvline(x=pos - 0.5, color="black", linewidth=1.5)

    plt.colorbar(im, ax=ax, label="攻方胜率", shrink=0.8)
    plt.tight_layout()
    plt.savefig("scripts/output_battle_matrix.png", dpi=150)
    plt.close()
    print("\n图表已保存: scripts/output_battle_matrix.png")

    # 分析五行克制的实际影响
    print("\n--- 五行克制影响分析 ---")
    restraint_advantages = []
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            si, ei = combos[i]
            sj, ej = combos[j]
            if ELEMENT_RESTRAINT.get(ei) == ej:
                restraint_advantages.append(win_matrix[i][j])

    if restraint_advantages:
        arr = np.array(restraint_advantages)
        print(f"  克制方平均胜率: {arr.mean():.1%} "
              f"(范围 {arr.min():.1%} ~ {arr.max():.1%})")
        print(f"  克制场景中攻方胜率 > 50% 的比例: "
              f"{(arr > 0.5).sum()}/{len(arr)}")

    # 被克制方的平均胜率
    counter_disadvantages = []
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            si, ei = combos[i]
            sj, ej = combos[j]
            if ELEMENT_RESTRAINT.get(ej) == ei:
                counter_disadvantages.append(win_matrix[i][j])

    if counter_disadvantages:
        arr = np.array(counter_disadvantages)
        print(f"  被克方平均胜率: {arr.mean():.1%}")

    # 五行克制翻盘统计：弱流派靠五行克制翻赢强流派
    print("\n--- 五行克制翻盘统计 ---")
    flip_count = 0
    flip_total = 0
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            si, ei = combos[i]
            sj, ej = combos[j]
            # i 克制 j 且 i 的流派通常弱于 j
            if ELEMENT_RESTRAINT.get(ei) == ej:
                # 测试无克制时 i 的胜率
                # 找到 i 流派 vs j 流派在无关五行下的胜率
                neutral_rates = []
                for ni in range(n):
                    for nj in range(n):
                        sni, eni = combos[ni]
                        snj, enj = combos[nj]
                        if sni == si and snj == sj and eni == enj:
                            neutral_rates.append(win_matrix[ni][nj])
                if neutral_rates:
                    neutral_avg = np.mean(neutral_rates)
                    if neutral_avg < 0.5 and win_matrix[i][j] > 0.5:
                        flip_count += 1
                    flip_total += 1

    print(f"  弱流派靠五行克制翻盘: {flip_count}/{flip_total}")
    if flip_total > 0:
        print(f"  翻盘率: {flip_count / flip_total:.1%}")

    # 分析流派内部胜率平衡
    print("\n--- 流派平均胜率 ---")
    for school in School:
        school_rates = [
            win_rates[i] for i in range(n)
            if combos[i][0] == school
        ]
        avg = np.mean(school_rates)
        print(f"  {school.value}: 平均胜率 {avg:.1%} "
              f"(范围 {min(school_rates):.1%} ~ {max(school_rates):.1%})")

    # 分析五行平均胜率
    print("\n--- 五行平均胜率（跨流派）---")
    for element in Element:
        elem_rates = [
            win_rates[i] for i in range(n)
            if combos[i][1] == element
        ]
        avg = np.mean(elem_rates)
        print(f"  {element.value}: 平均胜率 {avg:.1%}")


# =============================================================================
# 模块三：经济模拟（1000 Agent · 30 天）
# =============================================================================

def simulate_economy():
    """模拟 1000 位修仙者 30 天的灵石流通。"""
    print("\n" + "=" * 60)
    print("模块三：经济模拟（1000 Agent · 30 天）")
    print("=" * 60)

    rng = np.random.default_rng(42)

    # 修仙者境界分布
    realm_distribution = {
        "练气": 50,
        "筑基": 150,
        "金丹": 300,
        "元婴": 300,
        "化神": 200,
    }
    total_agents = sum(realm_distribution.values())

    # 为每个 Agent 分配境界
    agent_realms = []
    for realm, count in realm_distribution.items():
        agent_realms.extend([realm] * count)

    # 模拟参数
    days = 30
    hours_per_day = 24
    cultivation_hours = 12   # 每天闭关 12 小时
    treasure_per_day = 2     # 每天挖宝 2 次
    hunt_per_day = 1         # 每天打野 1 次
    dungeon_per_week = 2     # 每周秘境 2 次

    # 追踪
    daily_production = np.zeros(days)
    daily_consumption = np.zeros(days)
    daily_burned = np.zeros(days)
    cumulative_supply = np.zeros(days)
    current_supply = 0.0

    # 每人初始灵石（按境界）
    initial_ls = {
        "练气": 200, "筑基": 1000, "金丹": 5000,
        "元婴": 15000, "化神": 40000,
    }
    agent_balances = np.array(
        [float(initial_ls[r]) for r in agent_realms]
    )
    current_supply = agent_balances.sum()

    for day in range(days):
        day_prod = 0.0
        day_cons = 0.0

        for i, realm in enumerate(agent_realms):
            # === 产出 ===

            # 闭关（V3: 灵石产出受每日上限约束，超过 16h 只积累修为不产灵石）
            ls_hours = min(cultivation_hours, LS_CULTIVATION_DAILY_CAP_HOURS)
            ls_cultivate = LS_CULTIVATION_RATE[realm] * ls_hours
            day_prod += ls_cultivate
            agent_balances[i] += ls_cultivate

            # 闭关费用（V3: 按小时分境界收费，受每日上限约束）
            effective_hours = min(cultivation_hours, LS_CULTIVATION_DAILY_CAP_HOURS)
            cost = LS_CULTIVATION_COST_PER_HOUR[realm] * effective_hours
            day_cons += cost
            agent_balances[i] -= cost

            # 挖宝（V2 掉落表：期望 ~10 LS/次）
            for _ in range(treasure_per_day):
                roll = rng.random()
                if roll < 0.45:
                    treasure_ls = 0
                elif roll < 0.75:
                    treasure_ls = 5
                elif roll < 0.90:
                    treasure_ls = 15
                elif roll < 0.98:
                    treasure_ls = 50
                else:
                    treasure_ls = 150
                day_prod += treasure_ls
                agent_balances[i] += treasure_ls

                # 路费
                road_cost = rng.integers(3, 9)
                day_cons += road_cost
                agent_balances[i] -= road_cost

            # 打野（简化：根据境界选难度）
            hunt_reward = {
                "练气": 0,  # 练气太弱，打不了
                "筑基": LS_HUNT_LOW,
                "金丹": LS_HUNT_MID,
                "元婴": LS_HUNT_HIGH,
                "化神": LS_HUNT_HIGH,
            }
            reward = hunt_reward[realm]
            if reward > 0:
                # 假设 80% 胜率
                if rng.random() < 0.80:
                    day_prod += reward
                    agent_balances[i] += reward

                road = rng.integers(10, 26)
                day_cons += road
                agent_balances[i] -= road

            # 秘境（每周 2 次 → 每天 2/7 概率触发）
            if rng.random() < dungeon_per_week / 7:
                dungeon_reward = {"练气": 0, "筑基": 50, "金丹": 150,
                                  "元婴": 500, "化神": 500}
                d_reward = dungeon_reward[realm]
                if d_reward > 0:
                    day_prod += d_reward
                    agent_balances[i] += d_reward

                    # 秘境令费用
                    day_cons += 100
                    agent_balances[i] -= 100

            # 洞天维护费（V2 新增消耗）
            dongtian_cost = {
                "练气": 0, "筑基": 0, "金丹": 5,
                "元婴": 20, "化神": 100,
            }
            dt_cost = dongtian_cost[realm]
            day_cons += dt_cost
            agent_balances[i] -= dt_cost

            # PK（零和，只有手续费消耗）
            if rng.random() < 0.3:  # 每天 30% 概率 PK
                stake = max(10, int(agent_balances[i] * 0.02))  # 赌 2% 余额
                fee = stake * 0.05
                day_cons += fee
                agent_balances[i] -= fee

        # 渡劫丹消耗（分摊到每天）
        for realm in ["练气", "筑基", "金丹", "元婴"]:
            count = realm_distribution[realm]
            monthly_pill_rate = 0.3  # 30% 的人本月会买渡劫丹
            daily_rate = monthly_pill_rate / days
            buyers = int(count * daily_rate)
            pill_cost = LS_TRIBULATION_PILL[realm] * buyers
            day_cons += pill_cost

        # 宗门月费（分摊到每天）
        sect_monthly = {"练气": 0, "筑基": 30, "金丹": 100, "元婴": 300, "化神": 2000}
        for realm_name, monthly_fee in sect_monthly.items():
            count = realm_distribution[realm_name]
            daily_sect = monthly_fee * count / days
            day_cons += daily_sect

        # 销毁
        burned = day_cons * BURN_RATE
        day_burned = burned

        daily_production[day] = day_prod
        daily_consumption[day] = day_cons
        daily_burned[day] = day_burned
        current_supply += day_prod - day_cons
        cumulative_supply[day] = current_supply

    # 输出统计
    total_produced = daily_production.sum()
    total_consumed = daily_consumption.sum()
    total_burned = daily_burned.sum()
    net_supply = total_produced - total_consumed

    print(f"\n--- 30 天经济概览 ---")
    print(f"  初始总灵石: {sum(initial_ls[r] * realm_distribution[r] for r in realm_distribution):,.0f} LS")
    print(f"  总产出: {total_produced:,.0f} LS")
    print(f"  总消耗: {total_consumed:,.0f} LS（含手续费、路费、渡劫丹等）")
    print(f"  总销毁: {total_burned:,.0f} LS")
    print(f"  净增加: {net_supply:,.0f} LS")
    print(f"  月通胀率: {net_supply / sum(initial_ls[r] * realm_distribution[r] for r in realm_distribution) * 100:.1f}%")

    print(f"\n--- 日均数据 ---")
    print(f"  日均产出: {daily_production.mean():,.0f} LS")
    print(f"  日均消耗: {daily_consumption.mean():,.0f} LS")
    print(f"  日均销毁: {daily_burned.mean():,.0f} LS")
    print(f"  日均净增: {(daily_production - daily_consumption).mean():,.0f} LS")

    # 按境界分析人均收入
    print(f"\n--- 按境界月均收入 ---")
    for realm in REALM_NAMES:
        count = realm_distribution[realm]
        if count == 0:
            continue
        realm_indices = [i for i, r in enumerate(agent_realms) if r == realm]
        avg_balance_change = np.mean(
            agent_balances[realm_indices]
        ) - initial_ls[realm]
        print(f"  {realm}({count}人): 人均月净收入 {avg_balance_change:,.0f} LS, "
              f"人均余额 {np.mean(agent_balances[realm_indices]):,.0f} LS")

    # 绘图
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))

    # 日产出/消耗
    ax = axes[0][0]
    x = range(1, days + 1)
    ax.plot(x, daily_production, label="日产出", color="#2ecc71", linewidth=2)
    ax.plot(x, daily_consumption, label="日消耗", color="#e74c3c", linewidth=2)
    ax.fill_between(
        x, daily_production, daily_consumption,
        alpha=0.2,
        color="#2ecc71" if daily_production.mean() > daily_consumption.mean() else "#e74c3c",
    )
    ax.set_xlabel("天数")
    ax.set_ylabel("灵石 (LS)")
    ax.set_title("日产出 vs 日消耗")
    ax.legend()
    ax.grid(True, alpha=0.3)

    # 累积供应量
    ax = axes[0][1]
    ax.plot(x, cumulative_supply, color="#3498db", linewidth=2)
    ax.set_xlabel("天数")
    ax.set_ylabel("累积灵石供应量 (LS)")
    ax.set_title("灵石总供应量变化")
    ax.grid(True, alpha=0.3)

    # 日销毁量
    ax = axes[1][0]
    ax.bar(x, daily_burned, color="#e67e22", alpha=0.7)
    ax.set_xlabel("天数")
    ax.set_ylabel("销毁灵石 (LS)")
    ax.set_title("日销毁量")
    ax.grid(True, alpha=0.3)

    # 余额分布 (箱线图按境界)
    ax = axes[1][1]
    balance_by_realm = []
    realm_labels = []
    for realm in REALM_NAMES:
        indices = [i for i, r in enumerate(agent_realms) if r == realm]
        if indices:
            balance_by_realm.append(agent_balances[indices])
            realm_labels.append(realm)

    bp = ax.boxplot(balance_by_realm, tick_labels=realm_labels, patch_artist=True)
    colors = ["#3498db", "#2ecc71", "#f1c40f", "#e67e22", "#e74c3c"]
    for patch, color in zip(bp["boxes"], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    ax.set_xlabel("境界")
    ax.set_ylabel("灵石余额 (LS)")
    ax.set_title("30 天后各境界灵石余额分布")
    ax.grid(True, alpha=0.3)

    plt.suptitle("Pikemon 经济模拟（1000 Agent · 30 天）", fontsize=16, y=1.01)
    plt.tight_layout()
    plt.savefig("scripts/output_economy_simulation.png", dpi=150)
    plt.close()
    print("\n图表已保存: scripts/output_economy_simulation.png")


# =============================================================================
# 附加模块：跨境界翻盘概率分析
# =============================================================================

def analyze_cross_realm_flips():
    """分析相邻境界间的翻盘概率。"""
    print("\n" + "=" * 60)
    print("附加分析：跨境界翻盘概率")
    print("=" * 60)

    matchups = [
        ("金丹9重 vs 元婴1重", "金丹", 9, "元婴", 1),
        ("金丹7重 vs 元婴1重", "金丹", 7, "元婴", 1),
        ("筑基9重 vs 金丹1重", "筑基", 9, "金丹", 1),
        ("元婴9重 vs 化神1重", "元婴", 9, "化神", 1),
    ]

    equip_scenarios = [
        ("双蓝品", 0.15, 0.15, 0.15, 0.15),
        ("紫品 vs 绿品", 0.22, 0.22, 0.10, 0.10),
        ("紫品 vs 白品", 0.22, 0.22, 0.05, 0.05),
    ]

    for desc, realm_a, level_a, realm_b, level_b in matchups:
        print(f"\n--- {desc} ---")
        for eq_desc, wpn_a, arm_a, wpn_b, arm_b in equip_scenarios:
            wins_a = 0
            total = 0
            flip_count = 0

            for origin_a, school_a, elem_a in product(Origin, School, Element):
                for origin_b, school_b, elem_b in product(Origin, School, Element):
                    ba = Build(origin_a, school_a, elem_a, realm_a, level_a, wpn_a, arm_a)
                    bb = Build(origin_b, school_b, elem_b, realm_b, level_b, wpn_b, arm_b)
                    result = battle(ba, bb)
                    total += 1
                    if result == "A":
                        wins_a += 1
                        flip_count += 1  # 低境界方赢 = 翻盘

            flip_rate = flip_count / total if total > 0 else 0
            print(f"  {eq_desc}: 低境界方翻盘率 = {flip_rate:.1%} "
                  f"({flip_count}/{total})")


# =============================================================================
# 入口
# =============================================================================

def main():
    print("Pikemon 数值系统验证 (V3)")
    print("=" * 60)
    print(f"战斗公式: 百分比减伤 DEF/(DEF+K)，K = 攻击力均值 × {K_RATIO}")
    print(f"五行克制: 单向 ×1.30（被克方攻击不削弱）")
    print(f"神识克制加成上限: +0.15（阵修额外 +0.10）")
    print(f"化神境界倍率: 12.00~16.00")
    print(f"闭关产出: 2/5/10/20/40 LS/h（资源费 1.5/2/3/5/10，日上限 {LS_CULTIVATION_DAILY_CAP_HOURS}h）")
    print()

    analyze_combat_distribution()
    analyze_battle_matrix()
    simulate_economy()
    analyze_cross_realm_flips()

    print("\n" + "=" * 60)
    print("验证完成！请查看 scripts/output_*.png 图表文件。")
    print("=" * 60)


if __name__ == "__main__":
    main()
