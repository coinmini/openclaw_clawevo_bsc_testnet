"use client";

import { useGameStore } from "@/stores/useGameStore";
import { usePlayers } from "@/data/hooks/usePlayers";
import { truncateAddress, formatLS } from "@/lib/formatting";
import { REALM_NAMES, ELEMENT_NAMES } from "@/lib/constants";

export function PlayerProfile() {
  const selectedAddress = useGameStore((s) => s.selectedAgentAddress);
  const { data: players } = usePlayers();

  if (!selectedAddress) {
    return (
      <div className="text-amber-100/60 text-sm">
        Click an agent on the map to view details
      </div>
    );
  }

  const player = players?.find(
    (p) => p.id.toLowerCase() === selectedAddress.toLowerCase()
  );

  if (!player) {
    return (
      <div className="text-amber-500/50 text-sm italic">
        {truncateAddress(selectedAddress)} — not indexed yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xianxia-gold font-semibold drop-shadow-sm font-mono text-sm animate-glow-amber block p-1 -m-1 rounded">
        {truncateAddress(player.id)}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="境界" value={REALM_NAMES[player.realm] ?? `Lv${player.realm}`} />
        <Stat label="五行" value={ELEMENT_NAMES[player.element] ?? "?"} />
        <Stat label="对战" value={`${player.totalMatchesWon}/${player.totalMatchesPlayed}`} />
        <Stat label="灵石赢得" value={formatLS(player.totalWagerWon)} />
        <Stat label="打野" value={String(player.totalHunts)} />
        <Stat label="挖宝" value={String(player.totalTreasures)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/30 border border-xianxia-gold/30 rounded px-2 py-1.5 shadow-inner">
      <div className="text-xs text-xianxia-gold/60">{label}</div>
      <div className="text-xianxia-parchment font-medium">{value}</div>
    </div>
  );
}
