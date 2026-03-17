"use client";

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, BATTLE_ABI, LINGSHI_APPROVE_ABI } from "@/lib/contracts";

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

/* ---------- Approve LingShi for Battle ---------- */

export function useApproveLingShiForBattle() {
  const tx = useTxState();

  const approve = useCallback(
    (amount: bigint) => {
      tx.writeContract({
        address: CONTRACTS.lingshi,
        abi: LINGSHI_APPROVE_ABI,
        functionName: "approve",
        args: [CONTRACTS.battle, amount],
      });
    },
    [tx.writeContract],
  );

  return { approve, ...tx };
}

/* ---------- Create Challenge (approve + create two-step) ---------- */

export function useCreateChallenge() {
  const approveTx = useTxState();
  const createTx = useTxState();
  const [step, setStep] = useState<"idle" | "approving" | "creating">("idle");
  const [pendingWager, setPendingWager] = useState<bigint | null>(null);

  const execute = useCallback(
    (wager: bigint) => {
      setPendingWager(wager);
      setStep("approving");
      approveTx.writeContract({
        address: CONTRACTS.lingshi,
        abi: LINGSHI_APPROVE_ABI,
        functionName: "approve",
        args: [CONTRACTS.battle, wager],
      });
    },
    [approveTx.writeContract],
  );

  const confirmCreate = useCallback(() => {
    if (pendingWager === null) return;
    setStep("creating");
    createTx.writeContract({
      address: CONTRACTS.battle,
      abi: BATTLE_ABI,
      functionName: "createChallenge",
      args: [pendingWager],
    });
  }, [createTx.writeContract, pendingWager]);

  return {
    execute,
    confirmCreate,
    step,
    pendingWager,
    approveSuccess: approveTx.isSuccess,
    isPending: approveTx.isPending || createTx.isPending,
    isConfirming: approveTx.isConfirming || createTx.isConfirming,
    isSuccess: createTx.isSuccess,
    error: approveTx.error ?? createTx.error,
    reset: () => {
      setStep("idle");
      setPendingWager(null);
      approveTx.reset();
      createTx.reset();
    },
  };
}

/* ---------- Cancel Challenge ---------- */

export function useCancelChallenge() {
  const tx = useTxState();

  const execute = useCallback(
    (challengeId: bigint) => {
      tx.writeContract({
        address: CONTRACTS.battle,
        abi: BATTLE_ABI,
        functionName: "cancelChallenge",
        args: [challengeId],
      });
    },
    [tx.writeContract],
  );

  return { execute, ...tx };
}

/* ---------- Accept Challenge (approve + accept two-step) ---------- */

export function useAcceptChallenge() {
  const approveTx = useTxState();
  const acceptTx = useTxState();
  const [step, setStep] = useState<"idle" | "approving" | "accepting">("idle");
  const [pendingChallengeId, setPendingChallengeId] = useState<bigint | null>(null);

  const execute = useCallback(
    (challengeId: bigint, wager: bigint) => {
      setPendingChallengeId(challengeId);
      setStep("approving");
      approveTx.writeContract({
        address: CONTRACTS.lingshi,
        abi: LINGSHI_APPROVE_ABI,
        functionName: "approve",
        args: [CONTRACTS.battle, wager],
      });
    },
    [approveTx.writeContract],
  );

  const confirmAccept = useCallback(() => {
    if (pendingChallengeId === null) return;
    setStep("accepting");
    acceptTx.writeContract({
      address: CONTRACTS.battle,
      abi: BATTLE_ABI,
      functionName: "acceptChallenge",
      args: [pendingChallengeId],
    });
  }, [acceptTx.writeContract, pendingChallengeId]);

  return {
    execute,
    confirmAccept,
    step,
    approveSuccess: approveTx.isSuccess,
    isPending: approveTx.isPending || acceptTx.isPending,
    isConfirming: approveTx.isConfirming || acceptTx.isConfirming,
    isSuccess: acceptTx.isSuccess,
    error: approveTx.error ?? acceptTx.error,
    reset: () => {
      setStep("idle");
      setPendingChallengeId(null);
      approveTx.reset();
      acceptTx.reset();
    },
  };
}
