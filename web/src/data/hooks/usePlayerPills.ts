"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { CONTRACTS, PILL_ABI } from "@/lib/contracts";

/** Returns an array of 8 pill balances (index = pill type). */
export function usePlayerPills(address: Address | undefined) {
  const { data, isLoading } = useReadContract({
    address: CONTRACTS.pill,
    abi: PILL_ABI,
    functionName: "getAllPillBalances",
    args: [address!],
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
      staleTime: 10_000,
    },
  });

  // data is a readonly bigint[8] tuple from the contract
  const balances = data as readonly bigint[] | undefined;

  return { balances, isLoading };
}
