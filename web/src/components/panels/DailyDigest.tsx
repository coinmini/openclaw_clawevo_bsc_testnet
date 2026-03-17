"use client";

import { useState } from "react";
import { useDailyDigest, useRefreshDigest } from "@/data/hooks/useDailyDigest";
import { truncateAddress } from "@/lib/formatting";

export function DailyDigest() {
  const { data: digest, isLoading } = useDailyDigest();
  const refreshDigest = useRefreshDigest();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshDigest();
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return <div className="text-amber-100/60 text-sm animate-pulse">加载晨报...</div>;
  }

  if (!digest) {
    return (
      <div className="space-y-2">
        <div className="text-amber-500/50 text-sm italic">暂无晨报数据</div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs text-[#D4AF37] hover:text-amber-300 transition-colors disabled:opacity-50"
        >
          {refreshing ? "生成中..." : "立即生成"}
        </button>
      </div>
    );
  }

  const { stats } = digest;

  return (
    <div className="space-y-2">
      {/* Header with date and refresh */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-amber-500/60">{digest.digestDate}</span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs text-[#D4AF37] hover:text-amber-300 transition-colors disabled:opacity-50"
        >
          {refreshing ? "..." : "刷新"}
        </button>
      </div>

      {/* Active agents */}
      <div className="text-sm text-amber-100">
        活跃修仙者: <span className="text-[#D4AF37] font-semibold">{stats.activeAgents}</span> 人
      </div>

      {/* Activity grid */}
      <div className="grid grid-cols-3 gap-1 text-xs">
        <DigestStat label="打野" value={stats.totalHunts} color="text-green-400" />
        <DigestStat label="对战" value={stats.totalBattles} color="text-red-400" />
        <DigestStat label="挖宝" value={stats.totalTreasures} color="text-yellow-400" />
        <DigestStat label="修炼" value={stats.totalCultivations} color="text-emerald-400" />
        <DigestStat label="突破" value={stats.totalBreakthroughs} color="text-purple-400" />
        <DigestStat label="捕兽" value={stats.totalBeastHunts ?? 0} color="text-cyan-400" />
      </div>

      {/* Top players */}
      {(stats.topHunter || stats.topFighter) && (
        <div className="space-y-0.5 text-xs border-t border-[#6B5A3E]/20 pt-1.5">
          {stats.topHunter && (
            <div className="flex justify-between">
              <span className="text-green-400/80">打野之王</span>
              <span className="text-amber-100">
                {truncateAddress(stats.topHunter.address)} ({stats.topHunter.count})
              </span>
            </div>
          )}
          {stats.topFighter && (
            <div className="flex justify-between">
              <span className="text-red-400/80">对战之王</span>
              <span className="text-amber-100">
                {truncateAddress(stats.topFighter.address)} ({stats.topFighter.count})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Breakthroughs */}
      {stats.breakthroughDetails.length > 0 && (
        <div className="space-y-0.5 text-xs border-t border-[#6B5A3E]/20 pt-1.5">
          <div className="text-purple-400/80 font-medium">突破事件</div>
          {stats.breakthroughDetails.map((b, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={b.success ? "text-green-400" : "text-red-400"}>
                {b.success ? "✓" : "✗"}
              </span>
              <span className="text-amber-100/80">
                {truncateAddress(b.player)}: {b.from} → {b.to}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DigestStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-black/30 border border-[#6B5A3E]/20 rounded px-1.5 py-1 text-center">
      <div className="text-amber-500/50 text-[10px]">{label}</div>
      <div className={`${color} font-semibold`}>{value}</div>
    </div>
  );
}
