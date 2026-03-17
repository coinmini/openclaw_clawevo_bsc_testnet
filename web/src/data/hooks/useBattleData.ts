"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { graphqlRequest } from "../graphql/client";
import { OPEN_CHALLENGES_QUERY } from "../graphql/queries";
import { CONTRACTS, BATTLE_ABI } from "@/lib/contracts";

/* ---------- Raw GraphQL types ---------- */

interface RawChallenge {
  readonly id: string;
  readonly challengeId: string;
  readonly creator: {
    readonly id: string;
    readonly element: string;
    readonly realm: string;
  };
  readonly wager: string;
  readonly createdAt: string;
}

interface RawResponse {
  readonly challenges: readonly RawChallenge[];
}

/* ---------- Public types ---------- */

export interface OpenChallenge {
  readonly id: string;
  readonly challengeId: bigint;
  readonly creatorAddress: string;
  readonly creatorElement: number;
  readonly creatorRealm: number;
  readonly wager: bigint;
  readonly createdAt: number;
}

/* ---------- Open challenges (GraphQL, 15s refetch) ---------- */

export function useOpenChallenges() {
  return useQuery<readonly OpenChallenge[]>({
    queryKey: ["openChallenges"],
    queryFn: async () => {
      const raw = await graphqlRequest<RawResponse>(OPEN_CHALLENGES_QUERY);
      return raw.challenges.map((c) => ({
        id: c.id,
        challengeId: BigInt(c.challengeId),
        creatorAddress: c.creator.id,
        creatorElement: Number(c.creator.element),
        creatorRealm: Number(c.creator.realm),
        wager: BigInt(c.wager),
        createdAt: Number(c.createdAt),
      }));
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });
}

/* ---------- Battle config (RPC reads) ---------- */

export interface BattleConfig {
  readonly minBattleWager: bigint;
  readonly battleFeeBP: bigint;
  readonly challengeDuration: bigint;
}

export function useBattleConfig() {
  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.battle,
        abi: BATTLE_ABI,
        functionName: "minBattleWager",
      },
      {
        address: CONTRACTS.battle,
        abi: BATTLE_ABI,
        functionName: "battleFeeBP",
      },
      {
        address: CONTRACTS.battle,
        abi: BATTLE_ABI,
        functionName: "challengeDuration",
      },
    ],
    query: { staleTime: 60_000 },
  });

  const config: BattleConfig | undefined =
    data && data[0]?.result !== undefined
      ? {
          minBattleWager: data[0].result as bigint,
          battleFeeBP: (data[1]?.result as bigint) ?? 500n,
          challengeDuration: (data[2]?.result as bigint) ?? 86400n,
        }
      : undefined;

  return { data: config, isLoading, error };
}
