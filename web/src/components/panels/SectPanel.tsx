"use client";

import { useSects } from "@/data/hooks/useSects";
import { truncateAddress, formatLS } from "@/lib/formatting";
import { SECT_LEVEL_NAMES, SECT_MEMBER_CAPS } from "@/lib/constants";

const LEVEL_COLORS: Record<number, string> = {
  1: "text-gray-400 border-gray-500/40",
  2: "text-emerald-400 border-emerald-500/40",
  3: "text-blue-400 border-blue-500/40",
  4: "text-amber-400 border-amber-500/40",
};

export function SectPanel() {
  const { data: sects, isLoading } = useSects();

  if (isLoading) {
    return (
      <div className="text-amber-100/60 text-sm animate-pulse">
        加载宗门数据...
      </div>
    );
  }

  if (!sects || sects.length === 0) {
    return (
      <div className="text-amber-500/50 text-sm italic">
        暂无宗门
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto">
      {sects.map((sect) => {
        const levelColor = LEVEL_COLORS[sect.level] ?? LEVEL_COLORS[1];
        const memberCap = SECT_MEMBER_CAPS[sect.level] ?? 44;

        return (
          <div
            key={sect.sectId.toString()}
            className="bg-[#1A222C]/60 border border-amber-900/30 rounded-lg px-3 py-2.5 hover:border-amber-700/50 transition-colors"
          >
            {/* Row 1: Name + Level */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-amber-50 font-medium text-sm">
                {sect.name}
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${levelColor}`}
              >
                {SECT_LEVEL_NAMES[sect.level] ?? "Lv.1"}
              </span>
            </div>

            {/* Row 2: Stats grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-amber-500/60">掌门</span>
                <span className="text-amber-100/80 font-mono">
                  {truncateAddress(sect.master)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-500/60">人数</span>
                <span className="text-amber-100/80">
                  {sect.memberCount}
                  <span className="text-amber-500/40">/{memberCap}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-500/60">金库</span>
                <span className="text-emerald-400/80 font-mono">
                  {formatLS(sect.treasury)} LS
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-500/60">积分</span>
                <span className="text-amber-100/80 font-mono">
                  {sect.totalPoints.toString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
