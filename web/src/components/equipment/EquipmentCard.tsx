"use client";

import type { EquipmentItem } from "@/data/hooks/usePlayerEquipment";
import {
  QUALITY_NAMES,
  QUALITY_COLORS,
  EQUIPMENT_TYPE_NAMES,
  formatBonusBP,
} from "@/lib/equipment-constants";

const ELEMENT_SYMBOLS = ["金", "木", "水", "火", "土"] as const;
const ORIGIN_SYMBOLS = ["草莽", "游商", "世家", "散修"] as const;

interface EquipmentCardProps {
  readonly item: EquipmentItem;
  readonly selected?: boolean;
  readonly onClick?: () => void;
}

export function EquipmentCard({ item, selected, onClick }: EquipmentCardProps) {
  const q = item.quality;
  const borderColor = QUALITY_COLORS.border[q] ?? "#9CA3AF";
  const textClass = QUALITY_COLORS.text[q] ?? "text-gray-400";
  const bgClass = QUALITY_COLORS.bg[q] ?? "bg-gray-500/20";
  const glowClass = QUALITY_COLORS.glow[q] ?? "";

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left rounded-lg border p-2 transition-all ${bgClass} ${
        selected
          ? `ring-2 ring-offset-1 ring-offset-[#0B1015] shadow-lg ${glowClass}`
          : "hover:brightness-110"
      }`}
      style={{ borderColor }}
    >
      {/* Type + Quality */}
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${textClass}`}>
          {EQUIPMENT_TYPE_NAMES[item.equipmentType] ?? "?"}
        </span>
        <span className={`text-[10px] px-1 py-0.5 rounded ${textClass} bg-black/30`}>
          {QUALITY_NAMES[q] ?? "?"}
        </span>
      </div>

      {/* BonusBP */}
      <div className="text-sm font-mono text-amber-50">
        {formatBonusBP(item.bonusBP)}
      </div>

      {/* Enhance level badge */}
      {item.enhanceLevel > 0 && (
        <span className="absolute top-1 right-1 text-[10px] font-bold text-yellow-400 bg-yellow-900/40 border border-yellow-600/40 rounded px-1">
          +{item.enhanceLevel}
        </span>
      )}

      {/* Affinity icons */}
      {(item.elementAffinity > 0 || item.originAffinity > 0) && (
        <div className="flex gap-1 mt-0.5">
          {item.elementAffinity > 0 && (
            <span className="text-[9px] text-cyan-400/70" title="五行亲和">
              {ELEMENT_SYMBOLS[item.elementAffinity - 1] ?? "?"}
            </span>
          )}
          {item.originAffinity > 0 && (
            <span className="text-[9px] text-amber-400/70" title="出身亲和">
              {ORIGIN_SYMBOLS[item.originAffinity - 1] ?? "?"}
            </span>
          )}
        </div>
      )}

      {/* Equipped indicator */}
      {item.isEquipped && (
        <div className="mt-1 text-[10px] text-emerald-400/80">已装备</div>
      )}
    </button>
  );
}
