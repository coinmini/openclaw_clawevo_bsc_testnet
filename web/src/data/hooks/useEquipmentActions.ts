"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, EQUIPMENT_ABI, LINGSHI_APPROVE_ABI } from "@/lib/contracts";
import { parseEther } from "viem";
import { ENHANCE_COSTS, UPGRADE_COSTS } from "@/lib/equipment-constants";

/* ---------- Generic tx hook wrapper ---------- */

interface TxState {
  readonly isPending: boolean;
  readonly isConfirming: boolean;
  readonly isSuccess: boolean;
  readonly error: Error | null;
}

function useTxState(): TxState & {
  hash: `0x${string}` | undefined;
  writeContract: ReturnType<typeof useWriteContract>["writeContract"];
  reset: () => void;
} {
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  return {
    hash,
    writeContract,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ?? null,
    reset,
  };
}

/* ---------- Equip ---------- */

export function useEquipItem() {
  const tx = useTxState();

  const execute = useCallback(
    (tokenId: bigint) => {
      tx.writeContract({
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "equip",
        args: [tokenId],
      });
    },
    [tx.writeContract],
  );

  return { execute, ...tx };
}

/* ---------- Unequip ---------- */

export function useUnequipItem() {
  const tx = useTxState();

  const execute = useCallback(
    (slot: number) => {
      tx.writeContract({
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "unequip",
        args: [slot],
      });
    },
    [tx.writeContract],
  );

  return { execute, ...tx };
}

/* ---------- Enhance ---------- */

export function useEnhanceItem() {
  const tx = useTxState();
  const approveTx = useTxState();
  const [step, setStep] = useState<"idle" | "approving" | "enhancing">("idle");

  const execute = useCallback(
    (tokenId: bigint, currentLevel: number) => {
      const cost = ENHANCE_COSTS[currentLevel];
      if (cost === undefined) return;

      setStep("approving");
      approveTx.writeContract({
        address: CONTRACTS.lingshi,
        abi: LINGSHI_APPROVE_ABI,
        functionName: "approve",
        args: [CONTRACTS.equipment, parseEther(String(cost))],
      });
    },
    [approveTx.writeContract],
  );

  // After approve succeeds, call enhance
  const confirmEnhance = useCallback(
    (tokenId: bigint) => {
      setStep("enhancing");
      tx.writeContract({
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "enhance",
        args: [tokenId],
      });
    },
    [tx.writeContract],
  );

  return {
    execute,
    confirmEnhance,
    step,
    isPending: tx.isPending || approveTx.isPending,
    isConfirming: tx.isConfirming || approveTx.isConfirming,
    isSuccess: tx.isSuccess,
    error: tx.error ?? approveTx.error,
  };
}

/* ---------- Start Upgrade ---------- */

export function useStartUpgrade() {
  const tx = useTxState();
  const approveTx = useTxState();

  const execute = useCallback(
    (materialIds: bigint[], quality: number) => {
      const cost = UPGRADE_COSTS[quality];
      if (cost === undefined) return;

      approveTx.writeContract({
        address: CONTRACTS.lingshi,
        abi: LINGSHI_APPROVE_ABI,
        functionName: "approve",
        args: [CONTRACTS.equipment, parseEther(String(cost))],
      });
    },
    [approveTx.writeContract],
  );

  const confirmUpgrade = useCallback(
    (materialIds: bigint[]) => {
      tx.writeContract({
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "startUpgrade",
        args: [materialIds],
      });
    },
    [tx.writeContract],
  );

  return {
    execute,
    confirmUpgrade,
    isPending: tx.isPending || approveTx.isPending,
    isConfirming: tx.isConfirming || approveTx.isConfirming,
    isSuccess: tx.isSuccess,
    error: tx.error ?? approveTx.error,
  };
}

/* ---------- Finish Upgrade ---------- */

export function useFinishUpgrade() {
  const tx = useTxState();

  const execute = useCallback(() => {
    tx.writeContract({
      address: CONTRACTS.equipment,
      abi: EQUIPMENT_ABI,
      functionName: "finishUpgrade",
      args: [],
    });
  }, [tx.writeContract]);

  return { execute, ...tx };
}

/* ---------- Decompose ---------- */

export function useDecomposeItem() {
  const tx = useTxState();

  const execute = useCallback(
    (tokenId: bigint) => {
      tx.writeContract({
        address: CONTRACTS.equipment,
        abi: EQUIPMENT_ABI,
        functionName: "decompose",
        args: [tokenId],
      });
    },
    [tx.writeContract],
  );

  return { execute, ...tx };
}
