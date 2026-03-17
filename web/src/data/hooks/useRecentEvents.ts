"use client";

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../graphql/client";
import {
  RECENT_HUNTS_QUERY,
  RECENT_BATTLES_QUERY,
  RECENT_TREASURES_QUERY,
  RECENT_BEAST_HUNTS_QUERY,
  RECENT_REALM_CHALLENGES_QUERY,
} from "../graphql/queries";
import type { RecentEvent } from "@/stores/useGameStore";
import { truncateAddress } from "@/lib/formatting";
import { REGIONS } from "@/lib/constants";

interface HuntItem {
  id: string;
  player: { id: string };
  regionId: number;
  won: boolean;
  timestamp: string;
}

interface BattleItem {
  id: string;
  matchId: string;
  winner: string;
  payout: string;
  settledAt: string;
}

interface TreasureItem {
  id: string;
  player: { id: string };
  regionId: number;
  quality: number;
  reward: string;
  timestamp: string;
}

interface BeastHuntItem {
  id: string;
  player: { id: string };
  regionId: number;
  star: number;
  captured: boolean;
  beastTokenId: string;
  timestamp: string;
}

interface RealmChallengeItem {
  id: string;
  player: string;
  realmId: number;
  layer: number;
  won: boolean;
  timestamp: string;
}

const QUALITY_NAMES = ["普通", "精良", "稀有", "史诗"];
const REALM_NAMES_MAP = ["龙脉秘境", "冰魄秘境", "天机秘境"];

export function useRecentEvents() {
  return useQuery<readonly RecentEvent[]>({
    queryKey: ["recentEvents"],
    queryFn: async () => {
      const [huntsData, battlesData, treasuresData, beastHuntsData, realmData] = await Promise.all([
        graphqlRequest<{ huntEvents: HuntItem[] }>(RECENT_HUNTS_QUERY),
        graphqlRequest<{ battleMatches: BattleItem[] }>(
          RECENT_BATTLES_QUERY
        ),
        graphqlRequest<{ treasureEvents: TreasureItem[] }>(
          RECENT_TREASURES_QUERY
        ),
        graphqlRequest<{ beastHuntEvents: BeastHuntItem[] }>(
          RECENT_BEAST_HUNTS_QUERY
        ),
        graphqlRequest<{ layerChallengeEvents: RealmChallengeItem[] }>(
          RECENT_REALM_CHALLENGES_QUERY
        ),
      ]);

      const events: RecentEvent[] = [];

      for (const h of huntsData.huntEvents) {
        const region = REGIONS[h.regionId]?.name ?? `区域${h.regionId}`;
        events.push({
          id: h.id,
          type: "hunt",
          playerAddress: h.player.id,
          regionId: h.regionId,
          description: `${truncateAddress(h.player.id)} 在${region}打野 — ${
            h.won ? "胜利" : "失败"
          }`,
          timestamp: Number(h.timestamp),
        });
      }

      for (const b of battlesData.battleMatches) {
        events.push({
          id: b.id,
          type: "battle",
          playerAddress: b.winner,
          winner: b.winner,
          description: `约战 #${b.matchId} — 胜者: ${truncateAddress(b.winner)}`,
          timestamp: Number(b.settledAt),
        });
      }

      for (const t of treasuresData.treasureEvents) {
        const region = REGIONS[t.regionId]?.name ?? `区域${t.regionId}`;
        const quality = QUALITY_NAMES[t.quality] ?? "未知";
        events.push({
          id: t.id,
          type: "treasure",
          playerAddress: t.player.id,
          regionId: t.regionId,
          description: `${truncateAddress(
            t.player.id
          )} 在${region}挖宝 — ${quality}品质`,
          timestamp: Number(t.timestamp),
        });
      }

      for (const bh of beastHuntsData.beastHuntEvents) {
        const region = REGIONS[bh.regionId]?.name ?? `区域${bh.regionId}`;
        events.push({
          id: bh.id,
          type: "beastHunt",
          playerAddress: bh.player.id,
          regionId: bh.regionId,
          description: `${truncateAddress(bh.player.id)} 在${region}捕兽 — ${bh.star}星 ${
            bh.captured ? "捕获成功" : "未能捕获"
          }`,
          timestamp: Number(bh.timestamp),
        });
      }

      for (const rc of realmData.layerChallengeEvents) {
        const realmName = REALM_NAMES_MAP[rc.realmId] ?? `秘境${rc.realmId}`;
        events.push({
          id: rc.id,
          type: "realm",
          playerAddress: rc.player,
          description: `${truncateAddress(rc.player)} 在${realmName}第${rc.layer + 1}层 — ${
            rc.won ? "通关" : "失败"
          }`,
          timestamp: Number(rc.timestamp),
        });
      }

      // Sort by timestamp descending
      return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });
}
