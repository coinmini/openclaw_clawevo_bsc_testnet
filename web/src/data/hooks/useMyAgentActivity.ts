"use client";

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../graphql/client";
import { MY_AGENT_ACTIVITY_QUERY } from "../graphql/queries";
import { REGIONS, REALM_NAMES } from "@/lib/constants";
import { truncateAddress, formatLS } from "@/lib/formatting";

/* ---------- Raw GraphQL response types ---------- */

interface HuntItem {
  readonly id: string;
  readonly regionId: number;
  readonly won: boolean;
  readonly timestamp: string;
}

interface BattleItem {
  readonly id: string;
  readonly matchId: string;
  readonly winner: string;
  readonly payout: string;
  readonly settledAt: string;
}

interface TreasureItem {
  readonly id: string;
  readonly regionId: number;
  readonly quality: number;
  readonly reward: string;
  readonly timestamp: string;
}

interface CultivationItem {
  readonly id: string;
  readonly duration: string;
  readonly lsEarned: string;
  readonly expGained: string;
  readonly heartGained: string;
  readonly fortuneGained: string;
  readonly timestamp: string;
}

interface BreakthroughItem {
  readonly id: string;
  readonly fromRealm: number;
  readonly toRealm: number;
  readonly success: boolean;
  readonly timestamp: string;
}

interface BeastHuntItem {
  readonly id: string;
  readonly regionId: number;
  readonly star: number;
  readonly captured: boolean;
  readonly beastTokenId: string;
  readonly timestamp: string;
}

interface RawResponse {
  readonly huntEvents: readonly HuntItem[];
  readonly battleMatchesWon: readonly BattleItem[];
  readonly treasureEvents: readonly TreasureItem[];
  readonly cultivationSessions: readonly CultivationItem[];
  readonly breakthroughEvents: readonly BreakthroughItem[];
  readonly beastHuntEvents: readonly BeastHuntItem[];
}

/* ---------- Public types ---------- */

export interface AgentActivityEvent {
  readonly id: string;
  readonly type: "hunt" | "battle" | "treasure" | "cultivation" | "breakthrough" | "beastHunt";
  readonly description: string;
  readonly timestamp: number;
}

export interface ActivitySummary {
  readonly hunts: number;
  readonly huntsWon: number;
  readonly battles: number;
  readonly battlesWon: number;
  readonly treasures: number;
  readonly cultivations: number;
  readonly breakthroughs: number;
  readonly breakthroughsSuccess: number;
  readonly beastHunts: number;
  readonly beastsCaptured: number;
  readonly totalLsEarned: bigint;
}

export interface AgentActivityData {
  readonly events: readonly AgentActivityEvent[];
  readonly summary: ActivitySummary;
}

const QUALITY_NAMES = ["普通", "精良", "稀有", "史诗"] as const;
const SECONDS_IN_WEEK = 604_800;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function useMyAgentActivity(address: string | undefined) {
  return useQuery<AgentActivityData>({
    queryKey: ["myAgentActivity", address],
    enabled: !!address,
    queryFn: async () => {
      const since = Math.floor(Date.now() / 1000) - SECONDS_IN_WEEK;
      const raw = await graphqlRequest<RawResponse>(MY_AGENT_ACTIVITY_QUERY, {
        player: address!.toLowerCase(),
        since: String(since),
      });

      const events: AgentActivityEvent[] = [];
      let totalLsEarned = 0n;
      let huntsWon = 0;
      let battlesWon = 0;
      let breakthroughsSuccess = 0;
      // Hunts
      for (const h of raw.huntEvents) {
        const region = REGIONS[h.regionId]?.name ?? `区域${h.regionId}`;
        if (h.won) huntsWon++;
        events.push({
          id: h.id,
          type: "hunt",
          description: `在${region}打野 — ${h.won ? "胜利" : "失败"}`,
          timestamp: Number(h.timestamp),
        });
      }

      // Battles (won by this player)
      for (const b of raw.battleMatchesWon) {
        battlesWon++;
        totalLsEarned += BigInt(b.payout);
        events.push({
          id: b.id,
          type: "battle",
          description: `约战 #${b.matchId} — 胜 (+${formatLS(b.payout)} LS)`,
          timestamp: Number(b.settledAt),
        });
      }

      // Treasures
      for (const t of raw.treasureEvents) {
        const region = REGIONS[t.regionId]?.name ?? `区域${t.regionId}`;
        const quality = QUALITY_NAMES[t.quality] ?? "未知";
        totalLsEarned += BigInt(t.reward);
        events.push({
          id: t.id,
          type: "treasure",
          description: `在${region}挖宝 — ${quality}品质 (+${formatLS(t.reward)} LS)`,
          timestamp: Number(t.timestamp),
        });
      }

      // Cultivation
      for (const c of raw.cultivationSessions) {
        totalLsEarned += BigInt(c.lsEarned);
        events.push({
          id: c.id,
          type: "cultivation",
          description: `修炼 ${formatDuration(Number(c.duration))} — +${c.expGained} exp, +${formatLS(c.lsEarned)} LS`,
          timestamp: Number(c.timestamp),
        });
      }

      // Breakthroughs
      for (const b of raw.breakthroughEvents) {
        const from = REALM_NAMES[b.fromRealm] ?? `Lv${b.fromRealm}`;
        const to = REALM_NAMES[b.toRealm] ?? `Lv${b.toRealm}`;
        if (b.success) breakthroughsSuccess++;
        events.push({
          id: b.id,
          type: "breakthrough",
          description: `突破 ${from}→${to} — ${b.success ? "成功!" : "失败"}`,
          timestamp: Number(b.timestamp),
        });
      }

      // Beast hunts
      let beastsCaptured = 0;
      for (const bh of raw.beastHuntEvents) {
        const region = REGIONS[bh.regionId]?.name ?? `区域${bh.regionId}`;
        if (bh.captured) beastsCaptured++;
        events.push({
          id: bh.id,
          type: "beastHunt",
          description: `在${region}捕兽 — ${bh.star}星 ${bh.captured ? "捕获!" : "逃脱"}`,
          timestamp: Number(bh.timestamp),
        });
      }

      // Sort by timestamp descending
      events.sort((a, b) => b.timestamp - a.timestamp);

      const summary: ActivitySummary = {
        hunts: raw.huntEvents.length,
        huntsWon,
        battles: raw.battleMatchesWon.length,
        battlesWon,
        treasures: raw.treasureEvents.length,
        cultivations: raw.cultivationSessions.length,
        breakthroughs: raw.breakthroughEvents.length,
        breakthroughsSuccess,
        beastHunts: raw.beastHuntEvents.length,
        beastsCaptured,
        totalLsEarned,
      };

      return { events, summary };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
