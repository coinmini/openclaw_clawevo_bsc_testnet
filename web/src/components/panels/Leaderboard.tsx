"use client";

import { usePlayers } from "@/data/hooks/usePlayers";
import { useGameStore } from "@/stores/useGameStore";
import { EventBus } from "@/game/EventBus";
import { truncateAddress } from "@/lib/formatting";
import { REALM_NAMES, ELEMENT_NAMES } from "@/lib/constants";

export function Leaderboard() {
  const { data: players, isLoading } = usePlayers();
  const selectedAddress = useGameStore((s) => s.selectedAgentAddress);

  if (isLoading) {
    return <div className="text-amber-100/60 text-sm animate-pulse">Loading players...</div>;
  }

  if (!players || players.length === 0) {
    return <div className="text-amber-500/50 text-sm italic">No players registered</div>;
  }

  const handleClick = (address: string) => {
    EventBus.emit("focus-agent", address);
  };

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {players.map((player, index) => {
        const isSelected =
          selectedAddress?.toLowerCase() === player.id.toLowerCase();
        return (
          <div
            key={player.id}
            onClick={() => handleClick(player.id)}
            className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm transition-colors ${isSelected
                ? "bg-amber-900/40 ring-1 ring-xianxia-gold shadow-[0_0_10px_rgba(212,175,55,0.4)] animate-glow-amber"
                : "hover:bg-xianxia-slate"
              }`}
          >
            <span className="text-amber-500/50 w-5 text-right font-mono">
              {index + 1}
            </span>
            <span
              className={`font-mono flex-1 ${isSelected ? "text-xianxia-gold drop-shadow-sm font-semibold" : "text-xianxia-parchment"}`}
            >
              {truncateAddress(player.id)}
            </span>
            <span className="text-xianxia-gold text-xs">
              {REALM_NAMES[player.realm] ?? `Lv${player.realm}`}
            </span>
            <span className="text-xianxia-jade text-xs">
              {ELEMENT_NAMES[player.element] ?? "?"}
            </span>
            <span className="text-amber-300/90 text-xs font-mono">
              W{player.totalMatchesWon}
            </span>
          </div>
        );
      })}
    </div>
  );
}
