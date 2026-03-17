/** Element / 五行 names. Index = element enum value from contract. */
export const ELEMENT_NAMES = ["金", "木", "水", "火", "土"] as const;

/** Realm / 境界 names. Index = realm level. */
export const REALM_NAMES = [
  "练气", // 0
  "筑基", // 1
  "金丹", // 2
  "元婴", // 3
  "化神", // 4
] as const;

/** Map region names and positions on the world map (approximate %). */
export const REGIONS: readonly {
  readonly id: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}[] = [
  { id: 0, name: "青云山", x: 0.18, y: 0.22 }, // 左上浮空仙岛
  { id: 1, name: "冰霜峰", x: 0.50, y: 0.15 }, // 上中冰晶雪山
  { id: 2, name: "桃花源", x: 0.78, y: 0.20 }, // 右上桃花林
  { id: 3, name: "剑冢",   x: 0.15, y: 0.50 }, // 左中古石阵遗迹
  { id: 4, name: "天枢殿", x: 0.48, y: 0.45 }, // 正中金顶宫殿
  { id: 5, name: "雷鸣原", x: 0.82, y: 0.50 }, // 右中雷暴海域
  { id: 6, name: "流沙域", x: 0.22, y: 0.75 }, // 左下沙漠旋涡
  { id: 7, name: "炎魔山", x: 0.50, y: 0.78 }, // 下中火山熔岩
  { id: 8, name: "幽冥涡", x: 0.80, y: 0.75 }, // 右下海上风暴漩涡
] as const;

/** Origin / 出身 names. Index = origin enum value. */
export const ORIGIN_NAMES = ["草莽", "苦力", "游商", "书生"] as const;

/** Faction / 流派 names. Index = faction enum value. */
export const FACTION_NAMES = ["剑修", "体修", "阵修", "魂修"] as const;

/** Six attribute names / 六维属性. */
export const ATTRIBUTE_NAMES = [
  "灵力",
  "体质",
  "神识",
  "悟性",
  "道心",
  "气运",
] as const;

/** Player activity status labels. */
export const STATUS_LABELS = [
  "闭关中",
  "修炼中",
  "历练中",
  "挂机中",
  "对战中",
] as const;

/** Sect level display names. Index = level (0 unused). */
export const SECT_LEVEL_NAMES = ["", "Lv.1", "Lv.2", "Lv.3", "Lv.4"] as const;

/** Sect rank names. Index = rank enum value. */
export const SECT_RANK_NAMES = ["外门", "内门", "长老", "掌门"] as const;

/** Pill names / 丹药名称. Index = pill type (0-7). */
export const PILL_NAMES = [
  "筑基丹", "结丹丹", "凝婴丹", "化神丹",
  "培元丹", "聚灵丹", "洗髓丹", "护心丹",
] as const;

/** Pill descriptions / 丹药用途. */
export const PILL_DESCRIPTIONS = [
  "练气→筑基", "筑基→金丹", "金丹→元婴", "元婴→化神",
  "+50 修为", "+200 修为", "重置属性", "渡劫保护",
] as const;

/** Pill color classes for UI display. */
export const PILL_COLORS = [
  "text-cyan-400", "text-blue-400", "text-purple-400", "text-red-400",
  "text-green-400", "text-emerald-400", "text-amber-400", "text-pink-400",
] as const;

/** Sect member capacity by level. Index = level (0 unused). */
export const SECT_MEMBER_CAPS = [0, 44, 80, 150, 300] as const;

/** Element value → Spine character ID mapping. */
export const ELEMENT_TO_CHARACTER: Record<number, string> = {
  0: "act_1003", // 金
  1: "act_1001", // 木
  2: "act_1050", // 水
  3: "act_1002", // 火
  4: "act_1004", // 土
};
