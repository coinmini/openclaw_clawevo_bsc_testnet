"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { zeroAddress, type Address } from "viem";
import {
  CONTRACTS,
  REGISTER_ABI,
  LINGSHI_ABI,
  SECT_ABI,
  TAO_ABI,
  BEAST_ABI,
  CULTIVATION_ABI,
} from "@/lib/contracts";

// ── Types ───────────────────────────────────────────────────

export interface MyPlayerData {
  readonly address: Address;
  readonly name: string | null;
  readonly origin: number;
  readonly faction: number;
  readonly element: number;
  readonly realm: number;
  readonly subRealm: number;
  readonly attack: bigint;
  readonly defense: bigint;
  readonly perception: bigint;
  readonly wisdom: bigint;
  readonly heart: bigint;
  readonly fortune: bigint;
  readonly spiritStones: bigint;
  readonly sectName: string | null;
  readonly sectRank: number;
  readonly partnerAddress: Address | null;
  readonly beastName: string | null;
  readonly beastStar: number;
  readonly beastElement: number;
  readonly beastPowerRate: number;
  readonly cultivationActive: boolean;
  readonly cultivationStartTime: number;
}

// viem returns Solidity structs as named objects, not positional tuples.

interface CultivatorResult {
  readonly origin: number;
  readonly element: number;
  readonly faction: number;
  readonly realm: number;
  readonly subRealm: number;
  readonly attack: bigint;
  readonly defense: bigint;
  readonly perception: bigint;
  readonly wisdom: bigint;
  readonly heart: bigint;
  readonly fortune: bigint;
  readonly registeredAt: bigint;
  readonly name: string;
}

interface MembershipResult {
  readonly sectId: bigint;
  readonly rank: number;
  readonly contribution: bigint;
  readonly joinedAt: bigint;
  readonly lastClaimedDay: bigint;
}

interface SectInfoResult {
  readonly name: string;
  readonly master: Address;
  readonly level: number;
  readonly totalPoints: bigint;
  readonly treasury: bigint;
  readonly memberCount: bigint;
  readonly createdAt: bigint;
}

interface BeastInfoResult {
  readonly star: number;
  readonly element: number;
  readonly powerRate: number;
  readonly level: number;
  readonly speciesId: number;
}

// ── Hook ────────────────────────────────────────────────────

const REFETCH_INTERVAL = 15_000;
const STALE_TIME = 10_000;

export function useMyPlayer() {
  const { address, isConnected } = useAccount();

  // ── Primary batch: 6 reads → 1 RPC multicall ──

  const { data: batch, isLoading: batchLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.register,
        abi: REGISTER_ABI,
        functionName: "isRegistered",
        args: [address ?? zeroAddress],
      },
      {
        address: CONTRACTS.register,
        abi: REGISTER_ABI,
        functionName: "getCultivator",
        args: [address ?? zeroAddress],
      },
      {
        address: CONTRACTS.lingshi,
        abi: LINGSHI_ABI,
        functionName: "balanceOf",
        args: [address ?? zeroAddress],
      },
      {
        address: CONTRACTS.sect,
        abi: SECT_ABI,
        functionName: "getMembership",
        args: [address ?? zeroAddress],
      },
      {
        address: CONTRACTS.tao,
        abi: TAO_ABI,
        functionName: "getPartner",
        args: [address ?? zeroAddress],
      },
      {
        address: CONTRACTS.beast,
        abi: BEAST_ABI,
        functionName: "getEquippedBeast",
        args: [address ?? zeroAddress],
      },
      {
        address: CONTRACTS.cultivation,
        abi: CULTIVATION_ABI,
        functionName: "getSession",
        args: [address ?? zeroAddress],
      },
    ],
    query: {
      enabled: isConnected && !!address,
      refetchInterval: REFETCH_INTERVAL,
      staleTime: STALE_TIME,
    },
  });

  // ── Extract primary results ──

  const isRegistered = batch?.[0]?.result as boolean | undefined;
  const cultivator = batch?.[1]?.result as CultivatorResult | undefined;
  const balance = batch?.[2]?.result as bigint | undefined;
  const membership = batch?.[3]?.result as MembershipResult | undefined;
  const partner = batch?.[4]?.result as Address | undefined;
  const equippedBeastId = batch?.[5]?.result as bigint | undefined;
  const cultivationSession = batch?.[6]?.result as
    | { readonly startTime: bigint; readonly active: boolean }
    | undefined;

  const sectId = membership?.sectId ?? 0n;
  const beastId = equippedBeastId ?? 0n;

  // ── Conditional: sect name (only if in a sect) ──

  const { data: sectInfo } = useReadContract({
    address: CONTRACTS.sect,
    abi: SECT_ABI,
    functionName: "getSectInfo",
    args: [sectId],
    query: {
      enabled: sectId > 0n,
      staleTime: 60_000,
    },
  });

  // ── Conditional: beast info (only if beast equipped) ──

  const { data: beastInfo } = useReadContract({
    address: CONTRACTS.beast,
    abi: BEAST_ABI,
    functionName: "getBeastInfo",
    args: [beastId],
    query: {
      enabled: beastId > 0n,
      staleTime: 60_000,
    },
  });

  const beastResult = beastInfo as BeastInfoResult | undefined;

  // ── Conditional: beast species name ──

  const { data: beastSpeciesName } = useReadContract({
    address: CONTRACTS.beast,
    abi: BEAST_ABI,
    functionName: "speciesNames",
    args: [BigInt(beastResult?.speciesId ?? 0)],
    query: {
      enabled: beastId > 0n && beastResult !== undefined,
      staleTime: 300_000,
    },
  });

  // ── Assemble immutable MyPlayerData ──

  const player = useMemo<MyPlayerData | null>(() => {
    if (!address || !cultivator || !isRegistered) return null;

    const sect = sectInfo as SectInfoResult | undefined;
    const partnerAddr =
      partner && partner !== zeroAddress ? partner : null;

    return {
      address,
      name: cultivator.name || null,
      origin: cultivator.origin,
      faction: cultivator.faction,
      element: cultivator.element,
      realm: cultivator.realm,
      subRealm: cultivator.subRealm,
      attack: cultivator.attack,
      defense: cultivator.defense,
      perception: cultivator.perception,
      wisdom: cultivator.wisdom,
      heart: cultivator.heart,
      fortune: cultivator.fortune,
      spiritStones: balance ?? 0n,
      sectName: sectId > 0n && sect ? sect.name : null,
      sectRank: membership ? membership.rank : 0,
      partnerAddress: partnerAddr,
      beastName:
        beastId > 0n && beastSpeciesName
          ? (beastSpeciesName as string)
          : null,
      beastStar: beastId > 0n && beastResult ? beastResult.star : 0,
      beastElement: beastId > 0n && beastResult ? beastResult.element : 0,
      beastPowerRate: beastId > 0n && beastResult ? beastResult.powerRate : 0,
      cultivationActive: cultivationSession?.active ?? false,
      cultivationStartTime: Number(cultivationSession?.startTime ?? 0n),
    };
  }, [
    address,
    isRegistered,
    cultivator,
    balance,
    membership,
    sectId,
    sectInfo,
    partner,
    beastId,
    beastResult,
    beastSpeciesName,
    cultivationSession,
  ]);

  const isUnregistered = isConnected && isRegistered === false;

  return {
    player,
    isLoading: batchLoading,
    isUnregistered,
  };
}
