"use client";

import { useReadContract } from "wagmi";
import { type Address } from "viem";
import { CONTRACTS, SECRET_REALM_ABI } from "@/lib/contracts";

const REFETCH_INTERVAL = 15_000;
const STALE_TIME = 10_000;

export interface RealmProgress {
  readonly realmId: number;
  readonly currentLayer: number;
  readonly blockNumber: bigint;
  readonly dropClaimed: boolean;
  readonly active: boolean;
  readonly isSolo: boolean;
}

export interface RealmParty {
  readonly leader: Address;
  readonly members: readonly [Address, Address, Address];
  readonly memberCount: number;
  readonly realmId: number;
  readonly entered: boolean;
  readonly createdAt: bigint;
}

export function useRealmProgress(address: Address | undefined) {
  return useReadContract({
    address: CONTRACTS.secretRealm,
    abi: SECRET_REALM_ABI,
    functionName: "getProgress",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: REFETCH_INTERVAL,
      staleTime: STALE_TIME,
    },
  });
}

export function useRealmParty(partyId: bigint | undefined) {
  return useReadContract({
    address: CONTRACTS.secretRealm,
    abi: SECRET_REALM_ABI,
    functionName: "getParty",
    args: partyId !== undefined ? [partyId] : undefined,
    query: {
      enabled: partyId !== undefined && partyId > 0n,
      refetchInterval: REFETCH_INTERVAL,
      staleTime: STALE_TIME,
    },
  });
}

export function useRealmFee() {
  return useReadContract({
    address: CONTRACTS.secretRealm,
    abi: SECRET_REALM_ABI,
    functionName: "secretRealmFee",
    query: {
      staleTime: 60_000,
    },
  });
}
