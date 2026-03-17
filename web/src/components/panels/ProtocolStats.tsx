"use client";

import { useProtocolStats } from "@/data/hooks/useProtocolStats";

export function ProtocolStats() {
  const { data: stats, isLoading } = useProtocolStats();

  if (isLoading) {
    return <div className="text-amber-100/60 text-sm animate-pulse">Loading stats...</div>;
  }

  if (!stats) {
    return <div className="text-amber-500/50 text-sm italic">No stats available</div>;
  }

  const items = [
    { label: "修仙者", value: stats.totalPlayers },
    { label: "对战", value: stats.totalMatches },
    { label: "约战单", value: stats.totalChallenges },
    { label: "坊市订单", value: stats.totalOrders },
    { label: "装备", value: stats.totalEquipmentMinted },
    { label: "灵兽", value: stats.totalBeastsMinted },
    { label: "宗门", value: stats.totalSectsCreated },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`bg-[#1A222C]/40 border border-[#6B5A3E]/30 rounded px-3 py-2 text-center shadow-inner${
            i === items.length - 1 && items.length % 2 !== 0 ? " col-span-2" : ""
          }`}
        >
          <div className="text-lg font-bold text-[#D4AF37] drop-shadow-md">{item.value}</div>
          <div className="text-xs text-amber-200/60">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
