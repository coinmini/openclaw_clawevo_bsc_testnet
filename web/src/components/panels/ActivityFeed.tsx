"use client";

import { useRecentEvents } from "@/data/hooks/useRecentEvents";
import { useGameStore } from "@/stores/useGameStore";
import { EventBus } from "@/game/EventBus";
import { timeAgo } from "@/lib/formatting";

const TYPE_COLORS: Record<string, string> = {
  hunt: "text-green-400",
  battle: "text-red-400",
  treasure: "text-yellow-400",
  realm: "text-purple-400",
};

const TYPE_LABELS: Record<string, string> = {
  hunt: "打野",
  battle: "对战",
  treasure: "挖宝",
  realm: "秘境",
};

export function ActivityFeed() {
  const { data: events, isLoading } = useRecentEvents();
  const selectedAddress = useGameStore((s) => s.selectedAgentAddress);

  if (isLoading) {
    return <div className="text-amber-100/60 text-sm animate-pulse">Loading events...</div>;
  }

  if (!events || events.length === 0) {
    return <div className="text-amber-500/50 text-sm italic">No recent events</div>;
  }

  const isRelated = (event: (typeof events)[number]): boolean => {
    if (!selectedAddress) return false;
    const addr = selectedAddress.toLowerCase();
    return (
      event.playerAddress.toLowerCase() === addr ||
      event.playerBAddress?.toLowerCase() === addr
    );
  };

  return (
    <div className="space-y-1 max-h-80 overflow-y-auto">
      {events.map((event) => {
        const highlighted = isRelated(event);
        return (
          <div
            key={event.id}
            onClick={() => EventBus.emit("focus-agent", event.playerAddress)}
            className={`flex items-start gap-2 py-1.5 border-b border-xianxia-gold/30 text-sm cursor-pointer transition-colors ${highlighted ? "bg-amber-900/40" : "hover:bg-xianxia-slate"
              }`}
          >
            <span
              className={`shrink-0 text-xs font-mono px-1.5 py-0.5 rounded ${TYPE_COLORS[event.type] ?? "text-xianxia-jade"} bg-black/40 border border-xianxia-gold/30`}
            >
              {TYPE_LABELS[event.type] ?? event.type}
            </span>
            <span
              className={`flex-1 ${highlighted ? "text-xianxia-gold font-semibold drop-shadow-sm animate-glow-amber block p-1 -m-1 rounded" : "text-amber-100/90"}`}
            >
              {event.description}
            </span>
            <span className="text-amber-500/40 text-xs shrink-0">
              {timeAgo(event.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
