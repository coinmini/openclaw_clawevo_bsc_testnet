"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

const CHAT_API = process.env.NEXT_PUBLIC_CHAT_API ?? "http://localhost:4000";

export interface DigestData {
  readonly id: number;
  readonly digestDate: string;
  readonly summary: string;
  readonly stats: {
    readonly totalHunts: number;
    readonly totalBattles: number;
    readonly totalTreasures: number;
    readonly totalCultivations: number;
    readonly totalBreakthroughs: number;
    readonly totalBeastHunts: number;
    readonly totalBeastsCaptured: number;
    readonly activeAgents: number;
    readonly topHunter: { readonly address: string; readonly count: number } | null;
    readonly topFighter: { readonly address: string; readonly count: number } | null;
    readonly breakthroughDetails: readonly {
      readonly player: string;
      readonly from: string;
      readonly to: string;
      readonly success: boolean;
    }[];
  };
  readonly createdAt: string;
}

export function useDailyDigest() {
  return useQuery<DigestData | null>({
    queryKey: ["dailyDigest"],
    queryFn: async () => {
      const res = await fetch(`${CHAT_API}/api/digest/latest`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.digest ?? null;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useRefreshDigest() {
  const queryClient = useQueryClient();
  return async () => {
    await fetch(`${CHAT_API}/api/digest/generate`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["dailyDigest"] });
  };
}
