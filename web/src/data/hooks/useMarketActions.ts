"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  CONTRACTS,
  MARKET_ABI,
  EQUIPMENT_ABI,
  LINGSHI_APPROVE_ABI,
  BEAST_ABI,
  PILL_ABI,
} from "@/lib/contracts";
import type { Address } from "viem";

/* ---------- fillOrder (buy) ---------- */

export function useFillOrder() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const fill = (orderId: bigint) => {
    writeContract({
      address: CONTRACTS.market,
      abi: MARKET_ABI,
      functionName: "fillOrder",
      args: [orderId],
    });
  };

  return { fill, isPending, isConfirming, isSuccess, error, hash };
}

/* ---------- cancelOrder ---------- */

export function useCancelOrder() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = (orderId: bigint) => {
    writeContract({
      address: CONTRACTS.market,
      abi: MARKET_ABI,
      functionName: "cancelOrder",
      args: [orderId],
    });
  };

  return { cancel, isPending, isConfirming, isSuccess, error, hash };
}

/* ---------- createOrder (ERC-721) ---------- */

export function useCreateOrder() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const create = (tokenContract: Address, tokenId: bigint, price: bigint) => {
    writeContract({
      address: CONTRACTS.market,
      abi: MARKET_ABI,
      functionName: "createOrder",
      args: [tokenContract, tokenId, price],
    });
  };

  return { create, isPending, isConfirming, isSuccess, error, hash };
}

/* ---------- createOrder1155 (ERC-1155) ---------- */

export function useCreateOrder1155() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const create = (tokenContract: Address, tokenId: bigint, amount: bigint, price: bigint) => {
    writeContract({
      address: CONTRACTS.market,
      abi: MARKET_ABI,
      functionName: "createOrder1155",
      args: [tokenContract, tokenId, amount, price],
    });
  };

  return { create, isPending, isConfirming, isSuccess, error, hash };
}

/* ---------- approve NFT to Market (ERC-721) ---------- */

export function useApproveNft() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (tokenContract: Address, tokenId: bigint) => {
    const abi = tokenContract.toLowerCase() === CONTRACTS.beast.toLowerCase()
      ? BEAST_ABI
      : EQUIPMENT_ABI;

    writeContract({
      address: tokenContract,
      abi,
      functionName: "approve" as any,
      args: [CONTRACTS.market, tokenId],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}

/* ---------- approve Pill to Market (ERC-1155 setApprovalForAll) ---------- */

export function useApprovePill() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = () => {
    writeContract({
      address: CONTRACTS.pill,
      abi: PILL_ABI,
      functionName: "setApprovalForAll",
      args: [CONTRACTS.market, true],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}

/* ---------- approve LingShi spending to Market ---------- */

export function useApproveLingShi() {
  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    writeContract({
      address: CONTRACTS.lingshi,
      abi: LINGSHI_APPROVE_ABI,
      functionName: "approve",
      args: [CONTRACTS.market, amount],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash };
}
