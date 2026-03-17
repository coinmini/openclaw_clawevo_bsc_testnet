"use client";

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../graphql/client";
import { PLAYERS_QUERY } from "../graphql/queries";
import type { Player } from "@/stores/useGameStore";

interface PlayersResponse {
  players: Player[];
}

export function usePlayers() {
  return useQuery<readonly Player[]>({
    queryKey: ["players"],
    queryFn: async () => {
      const data = await graphqlRequest<PlayersResponse>(PLAYERS_QUERY);
      return data.players;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
