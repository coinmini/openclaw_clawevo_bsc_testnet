"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, SECRET_REALM_ABI, LINGSHI_APPROVE_ABI } from "@/lib/contracts";

/* ---------- enterSolo ---------- */

export function useEnterSolo() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enterSolo = (realmId: number) => {
    writeContract({
      address: CONTRACTS.secretRealm,
      abi: SECRET_REALM_ABI,
      functionName: "enterSolo",
      args: [realmId],
    });
  };

  return { enterSolo, isPending, isConfirming, isSuccess, error, hash, reset };
}

/* ---------- challengeLayer ---------- */

export function useChallengeLayer() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const challengeLayer = () => {
    writeContract({
      address: CONTRACTS.secretRealm,
      abi: SECRET_REALM_ABI,
      functionName: "challengeLayer",
    });
  };

  return { challengeLayer, isPending, isConfirming, isSuccess, error, hash, reset };
}

/* ---------- claimLayerDrop ---------- */

export function useClaimDrop() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const claimDrop = () => {
    writeContract({
      address: CONTRACTS.secretRealm,
      abi: SECRET_REALM_ABI,
      functionName: "claimLayerDrop",
    });
  };

  return { claimDrop, isPending, isConfirming, isSuccess, error, hash, reset };
}

/* ---------- createParty ---------- */

export function useCreateParty() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createParty = (realmId: number) => {
    writeContract({
      address: CONTRACTS.secretRealm,
      abi: SECRET_REALM_ABI,
      functionName: "createParty",
      args: [realmId],
    });
  };

  return { createParty, isPending, isConfirming, isSuccess, error, hash, reset };
}

/* ---------- joinParty ---------- */

export function useJoinParty() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const joinParty = (partyId: bigint) => {
    writeContract({
      address: CONTRACTS.secretRealm,
      abi: SECRET_REALM_ABI,
      functionName: "joinParty",
      args: [partyId],
    });
  };

  return { joinParty, isPending, isConfirming, isSuccess, error, hash, reset };
}

/* ---------- enterAsParty ---------- */

export function useEnterAsParty() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enterAsParty = (partyId: bigint) => {
    writeContract({
      address: CONTRACTS.secretRealm,
      abi: SECRET_REALM_ABI,
      functionName: "enterAsParty",
      args: [partyId],
    });
  };

  return { enterAsParty, isPending, isConfirming, isSuccess, error, hash, reset };
}

/* ---------- approve LingShi for SecretRealm ---------- */

export function useApproveLingShiForRealm() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    writeContract({
      address: CONTRACTS.lingshi,
      abi: LINGSHI_APPROVE_ABI,
      functionName: "approve",
      args: [CONTRACTS.secretRealm, amount],
    });
  };

  return { approve, isPending, isConfirming, isSuccess, error, hash, reset };
}
