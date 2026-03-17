"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { useRealmProgress, useRealmFee } from "@/data/hooks/useSecretRealm";
import {
  useEnterSolo,
  useChallengeLayer,
  useClaimDrop,
  useApproveLingShiForRealm,
} from "@/data/hooks/useRealmActions";
import { ELEMENT_NAMES } from "@/lib/constants";

/* ---------- Realm config (matches SecretRealm.sol constructor) ---------- */

const REALMS = [
  { id: 0, name: "青云秘境", element: 1, layers: [
    { atk: 300, def: 200, reward: 40 }, { atk: 800, def: 600, reward: 120 }, { atk: 2000, def: 1500, reward: 400 },
  ]},
  { id: 1, name: "冰魄秘境", element: 2, layers: [
    { atk: 400, def: 400, reward: 50 }, { atk: 1000, def: 1000, reward: 150 }, { atk: 2500, def: 2500, reward: 500 },
  ]},
  { id: 2, name: "桃源秘境", element: 1, layers: [
    { atk: 250, def: 250, reward: 40 }, { atk: 700, def: 700, reward: 120 }, { atk: 1800, def: 1800, reward: 400 },
  ]},
  { id: 3, name: "剑冢秘境", element: 0, layers: [
    { atk: 500, def: 300, reward: 50 }, { atk: 1200, def: 800, reward: 150 }, { atk: 3000, def: 2000, reward: 500 },
  ]},
  { id: 4, name: "天枢秘境", element: 4, layers: [
    { atk: 400, def: 500, reward: 60 }, { atk: 1000, def: 1200, reward: 180 }, { atk: 2500, def: 3000, reward: 600 },
  ]},
  { id: 5, name: "雷霆秘境", element: 0, layers: [
    { atk: 600, def: 400, reward: 60 }, { atk: 1500, def: 1000, reward: 180 }, { atk: 3500, def: 2500, reward: 600 },
  ]},
  { id: 6, name: "流沙秘境", element: 4, layers: [
    { atk: 350, def: 450, reward: 50 }, { atk: 900, def: 1100, reward: 150 }, { atk: 2200, def: 2800, reward: 500 },
  ]},
  { id: 7, name: "炎魔秘境", element: 3, layers: [
    { atk: 700, def: 350, reward: 70 }, { atk: 1800, def: 900, reward: 200 }, { atk: 4000, def: 2000, reward: 700 },
  ]},
  { id: 8, name: "幽冥秘境", element: 2, layers: [
    { atk: 600, def: 600, reward: 70 }, { atk: 1500, def: 1500, reward: 200 }, { atk: 3500, def: 3500, reward: 700 },
  ]},
] as const;

const ELEMENT_COLORS: Record<number, string> = {
  0: "text-yellow-400",
  1: "text-green-400",
  2: "text-blue-400",
  3: "text-red-400",
  4: "text-amber-600",
};

/* ---------- Realm Card ---------- */

function RealmCard({
  realm,
  onEnter,
  entering,
  disabled,
}: {
  readonly realm: (typeof REALMS)[number];
  readonly onEnter: () => void;
  readonly entering: boolean;
  readonly disabled: boolean;
}) {
  return (
    <div className="bg-black/30 border border-xianxia-gold/30 rounded-lg p-3 space-y-2 hover:border-xianxia-gold transition-colors">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-xianxia-parchment">{realm.name}</h3>
        <span
          className={`text-xs font-mono px-1.5 py-0.5 rounded bg-black/40 border border-xianxia-gold/30 ${ELEMENT_COLORS[realm.element] ?? "text-gray-400"}`}
        >
          {ELEMENT_NAMES[realm.element]}系
        </span>
      </div>

      {/* Layer table */}
      <div className="text-[10px] space-y-0.5">
        {realm.layers.map((layer, i) => (
          <div key={i} className="flex items-center gap-2 text-xianxia-parchment/70">
            <span className="w-10 text-xianxia-gold/60">第{i + 1}层</span>
            <span className="flex-1">
              攻{layer.atk} / 防{layer.def}
            </span>
            <span className="text-xianxia-gold">{layer.reward} LS</span>
          </div>
        ))}
      </div>

      <button
        onClick={onEnter}
        disabled={disabled || entering}
        className="w-full text-xs py-1.5 rounded border border-xianxia-gold bg-amber-900/40 text-xianxia-parchment hover:bg-amber-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {entering ? "进入中..." : "独闯秘境"}
      </button>
    </div>
  );
}

/* ---------- Active Progress ---------- */

function ActiveProgress({
  realmId,
  currentLayer,
  dropClaimed,
  isSolo,
  onChallenge,
  onClaim,
  challengePending,
  claimPending,
}: {
  readonly realmId: number;
  readonly currentLayer: number;
  readonly dropClaimed: boolean;
  readonly isSolo: boolean;
  readonly onChallenge: () => void;
  readonly onClaim: () => void;
  readonly challengePending: boolean;
  readonly claimPending: boolean;
}) {
  const realm = REALMS[realmId];
  const allCleared = currentLayer >= 3;

  return (
    <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-purple-300">
          当前秘境: {realm?.name ?? `#${realmId}`}
        </h3>
        <span className="text-[10px] text-purple-400/60">
          {isSolo ? "独闯" : "组队"} · 第{Math.min(currentLayer + 1, 3)}/3层
        </span>
      </div>

      {/* Layer progress */}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full ${
              i < currentLayer
                ? "bg-green-500"
                : i === currentLayer && !allCleared
                  ? "bg-amber-500 animate-pulse"
                  : "bg-gray-700"
            }`}
          />
        ))}
      </div>

      {allCleared ? (
        <p className="text-xs text-green-400 text-center">
          秘境全部通关!
        </p>
      ) : !dropClaimed ? (
        <button
          onClick={onClaim}
          disabled={claimPending}
          className="w-full text-xs py-1.5 rounded bg-green-700/50 text-green-200 hover:bg-green-600/60 disabled:opacity-40 transition-colors"
        >
          {claimPending ? "领取中..." : "领取掉落"}
        </button>
      ) : (
        <button
          onClick={onChallenge}
          disabled={challengePending}
          className="w-full text-xs py-1.5 rounded bg-red-700/50 text-red-200 hover:bg-red-600/60 disabled:opacity-40 transition-colors"
        >
          {challengePending ? "挑战中..." : `挑战第${currentLayer + 1}层`}
        </button>
      )}
    </div>
  );
}

/* ---------- Main Panel ---------- */

export function RealmPanel() {
  const { address } = useAccount();
  const { data: progress } = useRealmProgress(address);
  const { data: fee } = useRealmFee();

  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useApproveLingShiForRealm();
  const { enterSolo, isPending: enterPending } = useEnterSolo();
  const { challengeLayer, isPending: challengePending } = useChallengeLayer();
  const { claimDrop, isPending: claimPending } = useClaimDrop();

  const [enteringRealmId, setEnteringRealmId] = useState<number | null>(null);

  const isActive = progress?.active ?? false;
  const feeDisplay = fee ? formatEther(fee) : "100";

  const handleEnter = (realmId: number) => {
    if (!fee) return;
    setEnteringRealmId(realmId);
    // Approve first, then enter
    approve(fee);
  };

  // After approve succeeds, trigger enterSolo
  if (approveSuccess && enteringRealmId !== null && !enterPending) {
    enterSolo(enteringRealmId);
    setEnteringRealmId(null);
  }

  return (
    <div className="space-y-3">
      {/* Fee info */}
      <div className="text-[10px] text-amber-500/60 text-center">
        入场费: {feeDisplay} LS / 人 · 独闯额外15%品质升级概率
      </div>

      {/* Active progress */}
      {isActive && progress && (
        <ActiveProgress
          realmId={progress.realmId}
          currentLayer={progress.currentLayer}
          dropClaimed={progress.dropClaimed}
          isSolo={progress.isSolo}
          onChallenge={challengeLayer}
          onClaim={claimDrop}
          challengePending={challengePending}
          claimPending={claimPending}
        />
      )}

      {/* Realm selection */}
      {!isActive && (
        <>
          <h3 className="text-xs font-semibold text-amber-100/80">
            选择秘境
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {REALMS.map((realm) => (
              <RealmCard
                key={realm.id}
                realm={realm}
                onEnter={() => handleEnter(realm.id)}
                entering={
                  (approvePending || enterPending) &&
                  enteringRealmId === realm.id
                }
                disabled={!address || approvePending || enterPending}
              />
            ))}
          </div>
        </>
      )}

      {/* Not connected */}
      {!address && (
        <p className="text-xs text-gray-500 text-center italic">
          请先连接钱包
        </p>
      )}
    </div>
  );
}
