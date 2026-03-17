"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { zeroAddress, type Address } from "viem";
import { graphqlRequest } from "../graphql/client";
import { PLAYER_EQUIPMENT_QUERY } from "../graphql/queries";
import { CONTRACTS, EQUIPMENT_ABI } from "@/lib/contracts";

/* ---------- Raw GraphQL types ---------- */

interface RawEquipmentToken {
  readonly id: string;
  readonly tokenId: string;
  readonly equipmentType: number;
  readonly quality: number;
  readonly bonusBP: number;
  readonly enhanceLevel: number;
  readonly elementAffinity: number;
  readonly originAffinity: number;
  readonly factionAffinity: number;
  readonly equippedBy: string | null;
  readonly mintedAt: string;
}

interface RawResponse {
  readonly equipmentTokens: readonly RawEquipmentToken[];
}

/* ---------- Public types ---------- */

export interface EquipmentItem {
  readonly id: string;
  readonly tokenId: bigint;
  readonly equipmentType: number; // 0=WEAPON, 1=ARMOR
  readonly quality: number; // 0=WHITE, 1=GREEN, 2=BLUE, 3=PURPLE
  readonly bonusBP: number;
  readonly enhanceLevel: number;
  readonly elementAffinity: number; // 0=none, 1-5=element
  readonly originAffinity: number; // 0=none, 1-4=origin
  readonly factionAffinity: number; // 0=none, 1-4=faction
  readonly isEquipped: boolean;
  readonly mintedAt: number;
}

/* ---------- Hook ---------- */

export function usePlayerEquipment(address?: string) {
  const { address: connectedAddress } = useAccount();
  const owner = address ?? connectedAddress;

  // GraphQL: fetch all equipment tokens owned by player
  const { data: items, isLoading: graphLoading } = useQuery<
    readonly EquipmentItem[]
  >({
    queryKey: ["playerEquipment", owner],
    queryFn: async () => {
      if (!owner) return [];
      const raw = await graphqlRequest<RawResponse>(PLAYER_EQUIPMENT_QUERY, {
        owner: owner.toLowerCase(),
      });
      return raw.equipmentTokens.map((t) => ({
        id: t.id,
        tokenId: BigInt(t.tokenId),
        equipmentType: t.equipmentType,
        quality: t.quality,
        bonusBP: t.bonusBP,
        enhanceLevel: t.enhanceLevel,
        elementAffinity: t.elementAffinity,
        originAffinity: t.originAffinity,
        factionAffinity: t.factionAffinity,
        isEquipped: t.equippedBy !== null && t.equippedBy !== "",
        mintedAt: Number(t.mintedAt),
      }));
    },
    enabled: !!owner,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });

  // On-chain: read equipped slots + spirit materials
  const { data: chainBatch, isLoading: chainLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "getEquipped",
        args: [(owner ?? zeroAddress) as Address, 0], // WEAPON slot
      },
      {
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "getEquipped",
        args: [(owner ?? zeroAddress) as Address, 1], // ARMOR slot
      },
      {
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "getSpiritMaterials",
        args: [(owner ?? zeroAddress) as Address],
      },
    ],
    query: {
      enabled: !!owner,
      refetchInterval: 15_000,
      staleTime: 10_000,
    },
  });

  const equippedWeaponId = (chainBatch?.[0]?.result as bigint | undefined) ?? 0n;
  const equippedArmorId = (chainBatch?.[1]?.result as bigint | undefined) ?? 0n;
  const spiritMaterials = (chainBatch?.[2]?.result as bigint | undefined) ?? 0n;

  // Split into equipped vs inventory
  const equipped = (items ?? []).filter((i) => i.isEquipped);
  const inventory = (items ?? []).filter((i) => !i.isEquipped);

  return {
    items: items ?? [],
    equipped,
    inventory,
    equippedWeaponId,
    equippedArmorId,
    spiritMaterials,
    isLoading: graphLoading || chainLoading,
  };
}
