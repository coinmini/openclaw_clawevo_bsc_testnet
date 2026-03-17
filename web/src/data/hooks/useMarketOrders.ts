"use client";

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "../graphql/client";
import { MARKET_ORDERS_QUERY } from "../graphql/queries";
import { CONTRACTS } from "@/lib/contracts";

/* ---------- Raw GraphQL types ---------- */

interface RawMarketOrder {
  readonly id: string;
  readonly orderId: string;
  readonly sellerAddress: string;
  readonly tokenContract: string;
  readonly tokenId: string;
  readonly price: string;
  readonly status: string;
  readonly createdAt: string;
  readonly isERC1155: boolean;
  readonly amount: string | null;
}

interface RawResponse {
  readonly marketOrders: readonly RawMarketOrder[];
}

/* ---------- Public types ---------- */

export type NftType = "equipment" | "beast" | "pill" | "unknown";

export interface MarketOrder {
  readonly id: string;
  readonly orderId: bigint;
  readonly seller: string;
  readonly tokenContract: string;
  readonly tokenId: bigint;
  readonly price: bigint;
  readonly nftType: NftType;
  readonly createdAt: number;
  readonly isERC1155: boolean;
  readonly amount: bigint | null;
}

function classifyNft(tokenContract: string): NftType {
  const addr = tokenContract.toLowerCase();
  if (addr === CONTRACTS.equipment.toLowerCase()) return "equipment";
  if (addr === CONTRACTS.beast.toLowerCase()) return "beast";
  if (addr === CONTRACTS.pill.toLowerCase()) return "pill";
  return "unknown";
}

export function useMarketOrders() {
  return useQuery<readonly MarketOrder[]>({
    queryKey: ["marketOrders"],
    queryFn: async () => {
      const raw = await graphqlRequest<RawResponse>(MARKET_ORDERS_QUERY);
      return raw.marketOrders.map((o) => ({
        id: o.id,
        orderId: BigInt(o.orderId),
        seller: o.sellerAddress,
        tokenContract: o.tokenContract,
        tokenId: BigInt(o.tokenId),
        price: BigInt(o.price),
        nftType: classifyNft(o.tokenContract),
        createdAt: Number(o.createdAt),
        isERC1155: o.isERC1155,
        amount: o.amount != null ? BigInt(o.amount) : null,
      }));
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
}
