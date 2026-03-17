/** 装备系统前端常量 */

export const QUALITY_NAMES = ["凡品", "精品", "良品", "珍品"] as const;

export const QUALITY_COLORS = {
  border: ["#9CA3AF", "#22C55E", "#3B82F6", "#A855F7"],
  text: ["text-gray-400", "text-green-400", "text-blue-400", "text-purple-400"],
  bg: ["bg-gray-500/20", "bg-green-500/20", "bg-blue-500/20", "bg-purple-500/20"],
  glow: [
    "shadow-gray-500/20",
    "shadow-green-500/30",
    "shadow-blue-500/30",
    "shadow-purple-500/40",
  ],
} as const;

export const EQUIPMENT_TYPE_NAMES = ["法宝", "护宝"] as const;

/** Enhancement LS costs per level (+1 to +5) */
export const ENHANCE_COSTS = [20, 50, 100, 150, 300] as const;

/** Upgrade LS costs: W→G, G→B, B→P */
export const UPGRADE_COSTS = [50, 200, 800] as const;

/** Upgrade success rates (%) */
export const UPGRADE_RATES = [70, 55, 40] as const;

/** Decompose LS refund by quality */
export const DECOMPOSE_LS = [1, 3, 10, 30] as const;

/** Decompose base spirit materials by quality */
export const DECOMPOSE_MATERIALS = [2, 6, 15, 40] as const;

/** Max enhancement level (MVP) */
export const MAX_ENHANCE_LEVEL = 5;

/** Format bonusBP as percentage string (e.g., 500 → "+5.00%") */
export function formatBonusBP(bp: number): string {
  return `+${(bp / 100).toFixed(2)}%`;
}
