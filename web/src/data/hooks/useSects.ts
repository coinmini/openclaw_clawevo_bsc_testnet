"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { useMemo } from "react";
import { graphqlRequest } from "../graphql/client";
import { SECTS_QUERY } from "../graphql/queries";
import { CONTRACTS, SECT_ABI } from "@/lib/contracts";

interface SubgraphSect {
  readonly id: string;
  readonly sectId: string;
  readonly name: string;
  readonly master: string;
  readonly memberCount: number;
  readonly createdAt: string;
}

interface SectsResponse {
  readonly sects: readonly SubgraphSect[];
}

export interface Sect {
  readonly sectId: bigint;
  readonly name: string;
  readonly master: string;
  readonly level: number;
  readonly totalPoints: bigint;
  readonly treasury: bigint;
  readonly memberCount: number;
  readonly createdAt: bigint;
}

export function useSects() {
  const {
    data: subgraphSects,
    isLoading: graphLoading,
  } = useQuery<readonly SubgraphSect[]>({
    queryKey: ["sects"],
    queryFn: async () => {
      const data = await graphqlRequest<SectsResponse>(SECTS_QUERY);
      return data.sects;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  // Batch on-chain reads for level/treasury/totalPoints
  const contracts = useMemo(
    () =>
      (subgraphSects ?? []).map((s) => ({
        address: CONTRACTS.sect,
        abi: SECT_ABI,
        functionName: "getSectInfo" as const,
        args: [BigInt(s.sectId)] as const,
      })),
    [subgraphSects],
  );

  const { data: onChainResults, isLoading: chainLoading } = useReadContracts({
    contracts,
    query: {
      enabled: (subgraphSects ?? []).length > 0,
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  });

  const sects: readonly Sect[] = useMemo(() => {
    if (!subgraphSects || subgraphSects.length === 0) return [];

    return subgraphSects.map((s, i) => {
      const onChain = onChainResults?.[i]?.result as
        | readonly [string, string, number, bigint, bigint, bigint, bigint]
        | undefined;

      return {
        sectId: BigInt(s.sectId),
        name: onChain?.[0] ?? s.name,
        master: onChain?.[1] ?? s.master,
        level: onChain?.[2] ?? 1,
        totalPoints: onChain?.[3] ?? 0n,
        treasury: onChain?.[4] ?? 0n,
        memberCount: onChain ? Number(onChain[5]) : s.memberCount,
        createdAt: onChain?.[6] ?? BigInt(s.createdAt),
      };
    });
  }, [subgraphSects, onChainResults]);

  return {
    data: sects,
    isLoading: graphLoading || chainLoading,
  };
}
