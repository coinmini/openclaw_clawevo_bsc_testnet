// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Constants — 全局共享常量
library Constants {
    // ── 精度 ──
    uint256 internal constant BP = 10_000; // basis points，1% = 100

    // ── 枚举数量 ──
    uint8 internal constant ORIGIN_COUNT = 4;   // 草莽/游商/苦力/书生
    uint8 internal constant FACTION_COUNT = 4;  // 剑修/体修/阵修/魂修
    uint8 internal constant ELEMENT_COUNT = 5;  // 金/木/水/火/土
    uint8 internal constant REALM_COUNT = 5;    // 练气/筑基/金丹/元婴/化神
    uint8 internal constant MAX_SUB_REALM = 9;  // 每境界 9 重

    // ── 出身加成 (BP) ──
    // 草莽: attack +15%, defense +5%
    // 游商: perception +15%
    // 苦力: defense +15%
    // 书生: wisdom +15%
    uint256 internal constant ORIGIN_BONUS_PRIMARY_BP = 11_500; // ×1.15
    uint256 internal constant ORIGIN_BONUS_SECONDARY_BP = 10_500; // ×1.05

    // ── 战斗公式默认值 ──
    uint256 internal constant DEFAULT_K_RATIO_BP = 6_000; // 0.6

    // ── 五行克制默认值 ──
    uint256 internal constant DEFAULT_RESTRAINT_BP = 13_000;  // ×1.30
    uint256 internal constant DEFAULT_GENERATION_BP = 10_800; // ×1.08

    // ── 金库分配默认值 ──
    uint256 internal constant DEFAULT_BURN_RATIO_BP = 5_000;       // 50%
    uint256 internal constant DEFAULT_DEV_RATIO_BP = 2_500;        // 25%
    uint256 internal constant DEFAULT_FOUNDATION_RATIO_BP = 2_500; // 25%

    // ── 注册默认值 ──
    uint256 internal constant DEFAULT_INITIAL_LINGSHI = 20 ether; // 20 LS

    // ── Block-delay ──
    uint256 internal constant DEFAULT_BLOCK_DELAY_WINDOW = 256;

    // ── 练气1重 基础属性 ──
    uint256 internal constant BASE_ATTRIBUTE_QI_1 = 100;

    // ── 装备系统 ──
    uint8 internal constant EQUIPMENT_TYPE_COUNT = 2;  // WEAPON, ARMOR (MVP)
    uint8 internal constant QUALITY_COUNT = 4;         // WHITE, GREEN, BLUE, PURPLE (MVP)
    uint8 internal constant MAX_ENHANCE_LEVEL = 5;     // MVP 最高强化等级

    // 品质加成范围 (BP): [min, max]
    uint16 internal constant WHITE_BONUS_MIN = 400;
    uint16 internal constant WHITE_BONUS_MAX = 600;
    uint16 internal constant GREEN_BONUS_MIN = 800;
    uint16 internal constant GREEN_BONUS_MAX = 1200;
    uint16 internal constant BLUE_BONUS_MIN = 1300;
    uint16 internal constant BLUE_BONUS_MAX = 1700;
    uint16 internal constant PURPLE_BONUS_MIN = 1900;
    uint16 internal constant PURPLE_BONUS_MAX = 2500;

    // 境界锁定: BLUE≥筑基(1), PURPLE≥金丹(2)
    uint8 internal constant REALM_REQ_BLUE = 1;
    uint8 internal constant REALM_REQ_PURPLE = 2;

    // ── 灵兽系统 ──
    uint8 internal constant BEAST_SPECIES_COUNT = 18;  // MVP 18 种灵兽
    uint8 internal constant MAX_BEAST_STAR_MVP = 2;    // MVP 最高2星
    uint256 internal constant BEAST_HUNT_COOLDOWN = 1 hours;

    // 灵兽加成范围 (powerRate, 0.01% 单位)
    uint16 internal constant STAR1_POWER_MIN = 300;
    uint16 internal constant STAR1_POWER_MAX = 700;
    uint16 internal constant STAR2_POWER_MIN = 1000;
    uint16 internal constant STAR2_POWER_MAX = 1400;

    // 元素亲和加成 (powerRate 单位)
    uint16 internal constant SAME_ELEMENT_BONUS = 100;       // +1%
    uint16 internal constant GENERATION_ELEMENT_BONUS = 50;  // +0.5%

    // 捕获星级系数 (×BP)
    uint256 internal constant STAR1_COEFFICIENT = 10_000;    // ×1.0
    uint256 internal constant STAR2_COEFFICIENT = 30_000;    // ×3.0

    // ── 洞天系统 ──
    uint256 internal constant CAVE_GRACE_DAYS = 3;
    uint256 internal constant CAVE_DOWNGRADE_DAYS = 7;
    uint256 internal constant SPIRIT_LAND_HOURS_REQ = 4000 hours;
    uint256 internal constant MIN_CAVE_SESSION = 4 hours;

    // ── 坊市系统 ──
    uint256 internal constant MARKET_FEE_BP = 200; // 2%

    // ── 道侣系统 ──
    uint256 internal constant TAO_BETROTHAL_FEE = 50 ether;
    uint256 internal constant TAO_DISSOLUTION_FEE = 20 ether;
    uint256 internal constant TAO_INITIATOR_COOLDOWN = 72 hours;
    uint256 internal constant TAO_RECIPIENT_COOLDOWN = 48 hours;
    uint8 internal constant TAO_MAX_REALM_DIFF = 2;
    uint256 internal constant TAO_PASSIVE_BONUS_BP = 300; // +3%

    // ── PvP 系统 ──
    uint256 internal constant CHALLENGE_DURATION = 24 hours;
    uint8 internal constant MAX_ACTIVE_CHALLENGES = 5;
    uint256 internal constant BATTLE_FEE_BP = 500; // 5%
    uint256 internal constant MIN_BATTLE_WAGER = 1 ether;
    uint256 internal constant EXCHANGE_TIMEOUT = 5 minutes;
    uint256 internal constant SETTLE_TIMEOUT = 5 minutes;
    uint256 internal constant ABNORMAL_THRESHOLD = 3;
    uint256 internal constant DOUBLE_TIMEOUT_FEE_BP = 500; // 5%

    // ── 道侣联合打野 ──
    uint256 internal constant DUAL_HUNT_SCALE_BP = 25_000; // ×2.5

    // ── 秘境系统 ──
    uint256 internal constant SECRET_REALM_FEE = 100 ether;
    uint256 internal constant SOLO_UPGRADE_CHANCE_BP = 1500; // 15%
    uint256 internal constant PARTY_SCALE_1 = 10_000; // ×1.0
    uint256 internal constant PARTY_SCALE_2 = 25_000; // ×2.5
    uint256 internal constant PARTY_SCALE_3 = 40_000; // ×4.0
    uint8 internal constant SECRET_REALM_COUNT = 9;
    uint8 internal constant SECRET_REALM_LAYERS = 3;

    // ── 宗门系统 ──
    uint256 internal constant SECT_CREATION_FEE = 1000 ether;
    uint8 internal constant SECT_CREATION_REALM_REQ = 4; // 化神
    uint256 internal constant SECT_MIN_WAGER = 100 ether;
    uint256 internal constant SECT_REJECT_PENALTY_BP = 2000; // 20%
    uint256 internal constant SECT_CHALLENGE_WINDOW = 24 hours;
    uint256 internal constant SECT_PREP_PERIOD = 12 hours;
    uint256 internal constant SECT_COMMIT_PERIOD = 6 hours;
    uint256 internal constant SECT_WAR_FEE_BP = 500; // 5%
    uint8 internal constant SECT_MAX_LEVEL = 4;
    uint256 internal constant SECT_DONATION_CONTRIB_RATIO = 10; // 每10LS=1贡献
    uint256 internal constant SECT_DAILY_DONATION_CONTRIB_CAP = 100;
}
