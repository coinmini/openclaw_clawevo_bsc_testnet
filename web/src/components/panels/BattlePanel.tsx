"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import {
  useOpenChallenges,
  useBattleConfig,
  type OpenChallenge,
} from "@/data/hooks/useBattleData";
import {
  useCreateChallenge,
  useCancelChallenge,
  useAcceptChallenge,
} from "@/data/hooks/useBattleActions";
import { ELEMENT_NAMES } from "@/lib/constants";
import { EventBus } from "@/game/EventBus";

/* ---------- Element badge colors ---------- */

const ELEMENT_COLORS: Record<number, string> = {
  0: "text-yellow-400",
  1: "text-green-400",
  2: "text-blue-400",
  3: "text-red-400",
  4: "text-amber-600",
};

/* ---------- Helpers ---------- */

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

/* ---------- Challenge Row ---------- */

function ChallengeRow({
  challenge,
  isOwn,
  onAccept,
  onCancel,
  accepting,
  cancelling,
  disabled,
}: {
  readonly challenge: OpenChallenge;
  readonly isOwn: boolean;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
  readonly accepting: boolean;
  readonly cancelling: boolean;
  readonly disabled: boolean;
}) {
  const elemColor = ELEMENT_COLORS[challenge.creatorElement] ?? "text-gray-400";

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-black/20 rounded border border-xianxia-gold/30 hover:border-xianxia-gold transition-colors">
      {/* Creator */}
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-xianxia-parchment/80 font-mono">
          {truncateAddr(challenge.creatorAddress)}
        </span>
        <span className={`ml-1.5 text-[10px] ${elemColor}`}>
          {ELEMENT_NAMES[challenge.creatorElement] ?? "?"}
        </span>
      </div>

      {/* Wager */}
      <span className="text-xs text-xianxia-gold font-mono whitespace-nowrap drop-shadow-sm">
        {formatEther(challenge.wager)} LS
      </span>

      {/* Time */}
      <span className="text-[10px] text-amber-100/40 whitespace-nowrap w-14 text-right">
        {timeAgo(challenge.createdAt)}
      </span>

      {/* Action */}
      {isOwn ? (
        <button
          onClick={onCancel}
          disabled={disabled || cancelling}
          className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50 disabled:opacity-40 transition-colors"
        >
          {cancelling ? "撤回中…" : "撤回"}
        </button>
      ) : (
        <button
          onClick={onAccept}
          disabled={disabled || accepting}
          className="text-[10px] px-2 py-0.5 rounded border border-xianxia-gold bg-amber-900/40 text-xianxia-parchment hover:bg-amber-800/60 disabled:opacity-40 transition-colors"
        >
          {accepting ? "应战中…" : "应战"}
        </button>
      )}
    </div>
  );
}

/* ---------- Create Challenge Form ---------- */

function CreateChallengeForm({
  minWager,
  feeBP,
  onSubmit,
  isPending,
  disabled,
}: {
  readonly minWager: bigint;
  readonly feeBP: bigint;
  readonly onSubmit: (wager: bigint) => void;
  readonly isPending: boolean;
  readonly disabled: boolean;
}) {
  const [wagerInput, setWagerInput] = useState("");
  const feePercent = Number(feeBP) / 100;
  const minDisplay = formatEther(minWager);

  const handleSubmit = () => {
    const trimmed = wagerInput.trim();
    if (!trimmed) return;
    try {
      const wager = parseEther(trimmed);
      if (wager < minWager) return;
      onSubmit(wager);
    } catch {
      // invalid input
    }
  };

  return (
    <div className="bg-xianxia-dark/50 border border-xianxia-gold/30 rounded-lg p-3 space-y-2">
      <h4 className="text-xs font-semibold text-xianxia-parchment/80">发起约战</h4>

      <div className="flex gap-2">
        <input
          type="text"
          value={wagerInput}
          onChange={(e) => setWagerInput(e.target.value)}
          placeholder={`最低 ${minDisplay} LS`}
          className="flex-1 text-xs px-2 py-1.5 rounded bg-black/40 border border-xianxia-gold/30 text-xianxia-parchment placeholder:text-xianxia-parchment/30 outline-none focus:border-xianxia-gold/70"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || isPending || !wagerInput.trim()}
          className="text-xs px-3 py-1.5 rounded border border-xianxia-gold bg-amber-900/40 text-xianxia-parchment hover:bg-amber-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {isPending ? "处理中…" : "发起"}
        </button>
      </div>

      <p className="text-[10px] text-amber-500/50">
        手续费 {feePercent}% · 败者赌注归胜者（扣手续费）
      </p>
    </div>
  );
}

/* ---------- Main Panel ---------- */

export function BattlePanel() {
  const { address } = useAccount();
  const { data: challenges, refetch: refetchChallenges } = useOpenChallenges();
  const { data: config } = useBattleConfig();

  const createChallenge = useCreateChallenge();
  const cancelChallenge = useCancelChallenge();
  const acceptChallenge = useAcceptChallenge();

  const [acceptingId, setAcceptingId] = useState<bigint | null>(null);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);

  const myAddr = address?.toLowerCase();

  // After approve succeeds for create, trigger the actual create
  useEffect(() => {
    if (createChallenge.approveSuccess && createChallenge.step === "approving") {
      createChallenge.confirmCreate();
    }
  }, [createChallenge.approveSuccess, createChallenge.step, createChallenge.confirmCreate]);

  // After create succeeds, reset and refetch
  useEffect(() => {
    if (createChallenge.isSuccess) {
      createChallenge.reset();
      refetchChallenges();
    }
  }, [createChallenge.isSuccess, createChallenge.reset, refetchChallenges]);

  // After approve succeeds for accept, trigger the actual accept
  useEffect(() => {
    if (acceptChallenge.approveSuccess && acceptChallenge.step === "approving") {
      acceptChallenge.confirmAccept();
    }
  }, [acceptChallenge.approveSuccess, acceptChallenge.step, acceptChallenge.confirmAccept]);

  // After accept succeeds, emit battle event and refetch
  useEffect(() => {
    if (acceptChallenge.isSuccess && acceptingId !== null) {
      // Find the accepted challenge to get battle data
      const accepted = challenges?.find((c) => c.challengeId === acceptingId);
      if (accepted && address) {
        EventBus.emit("start-battle", {
          playerAAddress: accepted.creatorAddress,
          playerBAddress: address.toLowerCase(),
          playerAElement: accepted.creatorElement,
          playerBElement: 0, // will be resolved by BattleScene from on-chain
          winner: "", // settled on-chain, animation picks up from event
        });
      }
      setAcceptingId(null);
      acceptChallenge.reset();
      refetchChallenges();
    }
  }, [acceptChallenge.isSuccess, acceptingId, challenges, address, acceptChallenge.reset, refetchChallenges]);

  // After cancel succeeds, refetch
  useEffect(() => {
    if (cancelChallenge.isSuccess) {
      setCancellingId(null);
      cancelChallenge.reset();
      refetchChallenges();
    }
  }, [cancelChallenge.isSuccess, cancelChallenge.reset, refetchChallenges]);

  const handleAccept = useCallback(
    (challenge: OpenChallenge) => {
      setAcceptingId(challenge.challengeId);
      acceptChallenge.execute(challenge.challengeId, challenge.wager);
    },
    [acceptChallenge.execute],
  );

  const handleCancel = useCallback(
    (challengeId: bigint) => {
      setCancellingId(challengeId);
      cancelChallenge.execute(challengeId);
    },
    [cancelChallenge.execute],
  );

  const minWager = config?.minBattleWager ?? parseEther("1");
  const feeBP = config?.battleFeeBP ?? 500n;

  return (
    <div className="space-y-3">
      {/* Config info */}
      <div className="text-[10px] text-amber-500/60 text-center">
        确定性比战力 · 五行克制 ×1.30 · 手续费{" "}
        {Number(feeBP) / 100}%
      </div>

      {/* Create challenge */}
      {address && (
        <CreateChallengeForm
          minWager={minWager}
          feeBP={feeBP}
          onSubmit={(wager) => createChallenge.execute(wager)}
          isPending={createChallenge.isPending || createChallenge.isConfirming}
          disabled={!address}
        />
      )}

      {/* Error display */}
      {(createChallenge.error ?? acceptChallenge.error ?? cancelChallenge.error) && (
        <p className="text-[10px] text-red-400 text-center">
          {(createChallenge.error ?? acceptChallenge.error ?? cancelChallenge.error)?.message?.slice(0, 80)}
        </p>
      )}

      {/* Challenge list */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-xianxia-parchment/80">
          开放挑战{" "}
          <span className="text-amber-500/40 font-normal">
            ({challenges?.length ?? 0})
          </span>
        </h4>

        {(!challenges || challenges.length === 0) && (
          <p className="text-[10px] text-amber-100/30 text-center py-4 italic">
            暂无开放挑战
          </p>
        )}

        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
          {challenges?.map((c) => (
            <ChallengeRow
              key={c.id}
              challenge={c}
              isOwn={c.creatorAddress.toLowerCase() === myAddr}
              onAccept={() => handleAccept(c)}
              onCancel={() => handleCancel(c.challengeId)}
              accepting={
                acceptingId === c.challengeId &&
                (acceptChallenge.isPending || acceptChallenge.isConfirming)
              }
              cancelling={
                cancellingId === c.challengeId &&
                (cancelChallenge.isPending || cancelChallenge.isConfirming)
              }
              disabled={!address}
            />
          ))}
        </div>
      </div>

      {/* Not connected */}
      {!address && (
        <p className="text-xs text-gray-500 text-center italic">
          请先连接钱包
        </p>
      )}
    </div>
  );
}
