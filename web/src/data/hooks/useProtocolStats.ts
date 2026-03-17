"use client";

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../graphql/client";
import { PROTOCOL_STATS_QUERY } from "../graphql/queries";
import type { ProtocolStatsData } from "@/stores/useGameStore";

interface StatsResponse {
  protocolStats: ProtocolStatsData | null;
}

export function useProtocolStats() {
  return useQuery<ProtocolStatsData | null>({
    queryKey: ["protocolStats"],
    queryFn: async () => {
      const data = await graphqlRequest<StatsResponse>(PROTOCOL_STATS_QUERY);
      return data.protocolStats ?? null;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
