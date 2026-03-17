"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { truncateAddress, formatLS, timeAgo } from "@/lib/formatting";
import {
  ELEMENT_NAMES,
  REALM_NAMES,
  ORIGIN_NAMES,
  FACTION_NAMES,
  ATTRIBUTE_NAMES,
  PILL_NAMES,
  PILL_DESCRIPTIONS,
  PILL_COLORS,
} from "@/lib/constants";
import { useMyPlayer } from "@/data/hooks/useMyPlayer";
import { CONTRACTS, REGISTER_ABI } from "@/lib/contracts";
import { usePlayerChat } from "@/data/hooks/usePlayerChat";
import { useMyAgentActivity } from "@/data/hooks/useMyAgentActivity";
import { AttributeBar } from "@/components/ui/AttributeBar";
import { EventBus } from "@/game/EventBus";
import { EquipmentTabContent } from "@/components/equipment/EquipmentTabContent";
import { usePlayerPills } from "@/data/hooks/usePlayerPills";
import type { AgentActivityEvent, ActivitySummary } from "@/data/hooks/useMyAgentActivity";

/** Five-element color mapping for avatar accent. */
const ELEMENT_COLORS: readonly string[] = [
  "bg-yellow-500", // 金
  "bg-green-500",  // 木
  "bg-blue-500",   // 水
  "bg-red-500",    // 火
  "bg-amber-700",  // 土
];

const RANK_NAMES = ["外门", "内门", "长老", "掌门"] as const;

/** Address prefix → avatar image path. */
const AVATAR_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["0x928b", "/assets/avatars/42.png"],
]);

type TabKey = "stats" | "equipment" | "inventory" | "beast" | "activity" | "chat";

const TABS: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: "stats", label: "属性" },
  { key: "equipment", label: "装备" },
  { key: "inventory", label: "物品" },
  { key: "beast", label: "灵兽" },
  { key: "activity", label: "活动" },
  { key: "chat", label: "聊天" },
];

interface MyPlayerPanelProps {
  readonly onExpand?: () => void;
}

export function MyPlayerPanel({ onExpand }: MyPlayerPanelProps) {
  const { isConnected } = useAccount();
  const { player, isLoading, isUnregistered } = useMyPlayer();

  // Not connected — show connect button
  if (!isConnected) {
    return (
      <div className="absolute top-4 left-4 z-20">
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => {
            if (!mounted) return null;
            return (
              <button
                onClick={openConnectModal}
                className="px-3 py-1.5 bg-xianxia-slate backdrop-blur border border-xianxia-gold rounded-lg text-sm text-xianxia-gold hover:bg-xianxia-dark shadow-[0_0_10px_rgba(212,175,55,0.1)] transition-colors animate-glow-amber"
              >
                连接钱包
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="absolute top-4 left-4 z-20">
        <div className="px-3 py-2 bg-xianxia-slate backdrop-blur border border-xianxia-gold rounded-lg text-sm text-xianxia-gold animate-pulse shadow-[0_0_10px_rgba(212,175,55,0.1)]">
          探索天地中...
        </div>
      </div>
    );
  }

  // Not registered
  if (isUnregistered) {
    return (
      <div className="absolute top-4 left-4 z-20">
        <div className="px-3 py-2 bg-xianxia-slate backdrop-blur border border-xianxia-gold rounded-lg text-sm text-xianxia-parchment shadow-[0_0_10px_rgba(212,175,55,0.1)]">
          未入仙途
          <ConnectButton.Custom>
            {({ openAccountModal, mounted }) => {
              if (!mounted) return null;
              return (
                <button
                  onClick={openAccountModal}
                  className="ml-2 text-[#D4AF37] hover:text-amber-300 transition-colors"
                >
                  管理钱包
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    );
  }

  // No data yet (edge case)
  if (!player) return null;

  const handleLocate = () => {
    EventBus.emit("focus-my-agent", { address: player.address.toLowerCase() });
  };

  const realmText = `${REALM_NAMES[player.realm] ?? `Lv${player.realm}`}${player.subRealm > 0 ? `${numToChinese(player.subRealm + 1)}重` : ""}`;
  const elementName = ELEMENT_NAMES[player.element] ?? "?";
  const avatarSrc = getAvatarSrc(player.address);

  // Six attributes in display order: 灵力/体质/神识/悟性/道心/气运
  const attributeValues = [
    player.attack,
    player.defense,
    player.perception,
    player.wisdom,
    player.heart,
    player.fortune,
  ];

  return (
    <div className="absolute top-4 left-4 z-20">
      <div
        onClick={() => onExpand?.()}
        className="flex items-center gap-2 px-3 py-2 bg-xianxia-slate backdrop-blur border border-xianxia-gold rounded-lg hover:bg-xianxia-dark transition-colors shadow-[0_0_15px_rgba(212,175,55,0.1)] cursor-pointer"
      >
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <span
              className={`w-6 h-6 rounded-full ${ELEMENT_COLORS[player.element]} flex items-center justify-center text-xs font-bold text-white shadow-inner`}
            >
              {elementName}
            </span>
          )}
          <span className="text-sm text-xianxia-parchment">
            {realmText}
          </span>
          <span className="text-xs text-amber-200/60 font-mono">
            {player.name ?? truncateAddress(player.address)}
          </span>
          <span className="text-xs text-xianxia-gold font-semibold">
            {formatLS(player.spiritStones)} LS
          </span>
          {player.cultivationActive && (
            <span className="text-xs text-purple-400 font-medium animate-pulse">
              闭关中
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleLocate(); }}
            title="定位我的角色"
            className="w-6 h-6 flex items-center justify-center rounded-full border border-[#D4AF37]/60 bg-[#0c1218] text-[#D4AF37] hover:border-[#D4AF37] hover:shadow-[0_0_12px_rgba(212,175,55,0.5)] transition-all text-xs"
          >
            ◎
          </button>
          <span className="text-amber-500/50 text-xs">▼</span>
        </div>
      </div>
  );
}

/* ---------- Modal Content (used inside GameModal) ---------- */

export function MyPlayerModalContent() {
  const { player } = useMyPlayer();
  const [activeTab, setActiveTab] = useState<TabKey>("stats");
  const [avatarZoomed, setAvatarZoomed] = useState(false);
  const { data: chatHistory } = usePlayerChat(
    activeTab === "chat" ? player?.address : undefined
  );
  const { data: activityData, isLoading: activityLoading } = useMyAgentActivity(
    activeTab === "activity" ? player?.address : undefined
  );

  if (!player) return null;

  const realmText = `${REALM_NAMES[player.realm] ?? `Lv${player.realm}`}${player.subRealm > 0 ? `${numToChinese(player.subRealm + 1)}重` : ""}`;
  const elementName = ELEMENT_NAMES[player.element] ?? "?";
  const avatarSrc = getAvatarSrc(player.address);
  const attributeValues = [
    player.attack,
    player.defense,
    player.perception,
    player.wisdom,
    player.heart,
    player.fortune,
  ];

  const handleLocate = () => {
    EventBus.emit("focus-my-agent", { address: player.address.toLowerCase() });
  };

  return (
    <div className="relative flex flex-col h-full min-h-0 animate-[fade-in-up_0.3s_ease-out] bg-[#181A25] rounded-sm mx-10 mt-12 mb-4">
      {/* Header Panel */}
      <div className="relative pt-10 px-8 pb-4 mb-2 overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.05)_0%,transparent_70%)] pointer-events-none transition-transform duration-700 group-hover:scale-110" />
        
        <div className="flex items-center gap-5 relative z-10">
          <div className="relative z-20">
            {/* Spinning Golden Aura */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-[#D4AF37] via-amber-200 to-amber-700 rounded-full blur-[2px] opacity-30 group-hover:opacity-50 transition duration-500 animate-[spin_4s_linear_infinite]" style={{ maskImage: 'radial-gradient(transparent 65%, black 70%)', WebkitMaskImage: 'radial-gradient(transparent 65%, black 70%)' }}></div>
            <div className="absolute -inset-1.5 border-[3px] border-[#D4AF37]/40 rounded-full"></div>
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="relative w-28 h-28 rounded-full object-cover cursor-pointer shadow-[0_0_30px_rgba(212,175,55,0.2)]"
                onClick={() => setAvatarZoomed(true)}
              />
            ) : (
              <div
                className={`relative w-28 h-28 rounded-full flex items-center justify-center ${ELEMENT_COLORS[player?.element ?? 'earth']} cursor-pointer`}
                onClick={() => setAvatarZoomed(true)}
              >
                <span className="text-4xl font-bold text-white shadow-inner drop-shadow-md">
                  {elementName}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex-1 pt-2 ml-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-3xl text-[#ebdcb5] font-bold tracking-wide drop-shadow-sm flex items-center gap-3">
                  {player.name ?? truncateAddress(player.address)}
                  {player.cultivationActive && (
                    <div className="text-sm text-[#a585e8] font-normal flex items-center gap-2 opacity-90 px-3 py-1 bg-[#a585e8]/10 rounded-full border border-[#a585e8]/30">
                      <div className="w-2 h-2 rounded-full bg-[#a585e8] animate-pulse"></div>
                      <CultivationTag startTime={player.cultivationStartTime} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <span className="text-lg text-[#D4AF37] font-medium tracking-widest bg-gradient-to-r from-[#D4AF37]/10 to-transparent pr-6 border-l-[3px] border-[#D4AF37] pl-3 py-0.5">
                    {realmText}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-3 mt-1">
                <button
                  onClick={handleLocate}
                  title="定位我的角色"
                  className="flex items-center gap-1.5 text-[#8f96a3] hover:text-[#D4AF37] transition-colors text-sm tracking-widest border border-white/5 bg-black/20 px-3 py-1.5 rounded-md"
                >
                  ◎ 寻录
                </button>
                <div className="flex items-center gap-2.5 bg-black/40 border border-[#D4AF37]/20 rounded-full px-4 py-2 mt-1 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                  <span className="text-sm text-cyan-400">💎</span>
                  <span className="text-[#ebdcb5] font-bold text-lg font-mono tracking-wider">
                    {formatLS(player.spiritStones)} LS
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#6B5A3E]/20 mb-4 mx-8 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-xl font-bold transition-all relative ${
              activeTab === tab.key
                ? "text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]"
                : "text-[#8f96a3] hover:text-[#ebdcb5]"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-[-1px] left-1/2 -translate-x-1/2 w-12 h-[3px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-8 flex-1 min-h-0 overflow-y-auto flex flex-col">
        {activeTab === "stats" && (
          <StatsTab
            player={player}
            elementName={elementName}
            attributeValues={attributeValues}
          />
        )}
        {activeTab === "equipment" && (
          <EquipmentTabContent playerAddress={player.address} />
        )}
        {activeTab === "inventory" && (
          <InventoryTab playerAddress={player.address} />
        )}
        {activeTab === "beast" && (
          <BeastTab player={player} />
        )}
        {activeTab === "activity" && (
          <ActivityTab
            data={activityData}
            isLoading={activityLoading}
          />
        )}
        {activeTab === "chat" && (
          <ChatTab chatHistory={chatHistory} />
        )}

        {/* Disconnect */}
        <div className="pt-3">
          <ConnectButton.Custom>
            {({ openAccountModal, mounted }) => {
              if (!mounted) return null;
              return (
                <button
                  onClick={openAccountModal}
                  className="w-full text-center text-sm text-amber-500/50 hover:text-amber-200/80 transition-colors"
                >
                  管理钱包
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>

      {/* Avatar zoom overlay */}
      {avatarZoomed && avatarSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
          onClick={() => setAvatarZoomed(false)}
        >
          <img
            src={avatarSrc}
            alt=""
            className="max-w-[280px] max-h-[280px] rounded-xl shadow-[0_0_30px_rgba(212,175,55,0.3)] border border-amber-900/50"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Stats Tab ---------- */

function StatsTab({
  player,
  elementName,
  attributeValues,
}: {
  player: NonNullable<ReturnType<typeof useMyPlayer>["player"]>;
  elementName: string;
  attributeValues: readonly (string | bigint | number)[];
}) {
  return (
    <div className="space-y-3 mt-2">
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <InfoItem label="出身" value={ORIGIN_NAMES[player.origin] ?? "?"} />
        <InfoItem label="流派" value={FACTION_NAMES[player.faction] ?? "?"} />
        <InfoItem label="五行" value={elementName} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {ATTRIBUTE_NAMES.map((name, i) => (
          <AttributeBar
            key={name}
            name={name}
            value={Number(attributeValues[i])}
          />
        ))}
      </div>
      <div className="space-y-1 text-xs">
        <InfoRow
          label="宗门"
          value={
            player.sectName
              ? `${player.sectName} (${RANK_NAMES[player.sectRank] ?? "?"})`
              : "散修"
          }
        />
        {player.partnerAddress && (
          <InfoRow label="道侣" value={truncateAddress(player.partnerAddress)} />
        )}
      </div>
      <div className="flex items-center justify-between text-xs pt-1 border-t border-xianxia-gold">
        <span className="text-xianxia-gold font-semibold drop-shadow-[0_0_5px_rgba(212,175,55,0.5)] font-mono animate-pulse">
          {formatLS(player.spiritStones)} LS
        </span>
      </div>
    </div>
  );
}

/* ---------- Inventory Tab ---------- */

function InventoryTab({ playerAddress }: { playerAddress: `0x${string}` }) {
  const { balances, isLoading } = usePlayerPills(playerAddress);

  if (isLoading) {
    return <div className="text-sm text-amber-100/60 animate-pulse mt-4">加载物品数据...</div>;
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-4 gap-3">
        {PILL_NAMES.map((name, i) => {
          const count = balances ? Number(balances[i]) : 0;
          const hasAny = count > 0;
          return (
            <div
              key={i}
              className={`relative bg-black/30 border rounded-lg px-3 py-4 text-center transition-all ${
                hasAny
                  ? "border-[#6B5A3E]/40 hover:border-[#D4AF37]/50"
                  : "border-[#6B5A3E]/15 opacity-40"
              }`}
            >
              {hasAny && (
                <div className="absolute -top-2 -right-2 min-w-[22px] h-[22px] flex items-center justify-center bg-[#D4AF37] text-black text-xs font-bold rounded-full px-1 shadow-[0_0_8px_rgba(212,175,55,0.4)]">
                  {count}
                </div>
              )}
              <div className={`text-lg font-bold ${PILL_COLORS[i]}`}>
                {name}
              </div>
              <div className="text-xs text-amber-500/50 mt-1">
                {PILL_DESCRIPTIONS[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Beast Tab ---------- */

function BeastTab({
  player,
}: {
  player: NonNullable<ReturnType<typeof useMyPlayer>["player"]>;
}) {
  if (!player.beastName) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-amber-500/40">
        <span className="text-3xl mb-3">🐾</span>
        <span className="text-sm">尚未收服灵兽</span>
        <span className="text-xs mt-1 text-amber-500/25">可通过「猎灵」捕获野生灵兽</span>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-4 p-4 bg-black/30 border border-[#6B5A3E]/20 rounded-lg">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-900/40 to-purple-900/40 border border-cyan-500/30 flex items-center justify-center text-2xl">
          🐉
        </div>
        <div className="flex-1">
          <div className="text-lg text-[#ebdcb5] font-bold tracking-wide">
            {player.beastName}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-yellow-400 text-sm tracking-wider">
              {"★".repeat(player.beastStar)}{"☆".repeat(Math.max(0, 5 - player.beastStar))}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/30 border border-[#6B5A3E]/20 rounded-md px-3 py-3 text-center">
          <div className="text-xs text-amber-500/50 mb-1">五行属性</div>
          <div className="text-lg font-bold text-cyan-400">
            {ELEMENT_NAMES[player.beastElement] ?? "?"}
          </div>
        </div>
        <div className="bg-black/30 border border-[#6B5A3E]/20 rounded-md px-3 py-3 text-center">
          <div className="text-xs text-amber-500/50 mb-1">战力加成</div>
          <div className="text-lg font-bold text-[#D4AF37]">
            +{(player.beastPowerRate / 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Activity Tab ---------- */

const EVENT_TYPE_COLORS: Record<string, string> = {
  hunt: "text-green-400",
  battle: "text-red-400",
  treasure: "text-yellow-400",
  cultivation: "text-emerald-400",
  breakthrough: "text-purple-400",
  beastHunt: "text-cyan-400",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  hunt: "打野",
  battle: "对战",
  treasure: "挖宝",
  cultivation: "修炼",
  breakthrough: "突破",
  beastHunt: "捕兽",
};

function ActivityTab({
  data,
  isLoading,
}: {
  data: { events: readonly AgentActivityEvent[]; summary: ActivitySummary } | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <div className="text-sm text-amber-100/60 animate-pulse mt-4">加载活动数据...</div>;
  }

  if (!data || data.events.length === 0) {
    return <div className="text-sm text-amber-500/50 italic mt-4">7天内暂无活动</div>;
  }

  const { summary, events } = data;

  return (
    <div className="flex flex-col flex-1 min-h-0 mt-4 gap-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 text-sm shrink-0">
        <StatChip label="打野" value={`${summary.huntsWon}/${summary.hunts}`} color="text-green-400" />
        <StatChip label="对战" value={`${summary.battlesWon}/${summary.battles}`} color="text-red-400" />
        <StatChip label="挖宝" value={String(summary.treasures)} color="text-yellow-400" />
        <StatChip label="修炼" value={String(summary.cultivations)} color="text-emerald-400" />
        <StatChip label="突破" value={`${summary.breakthroughsSuccess}/${summary.breakthroughs}`} color="text-purple-400" />
        <StatChip label="捕兽" value={`${summary.beastsCaptured}/${summary.beastHunts}`} color="text-cyan-400" />
        <StatChip label="收益" value={`${formatLS(summary.totalLsEarned)}`} color="text-[#D4AF37]" />
      </div>

      {/* Timeline */}
      <div className="overflow-y-auto space-y-2 pr-2 custom-scrollbar flex-1 min-h-0">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 py-2 border-b border-[#6B5A3E]/15 text-sm"
          >
            <span
              className={`shrink-0 font-mono px-2 py-1 rounded text-sm ${EVENT_TYPE_COLORS[event.type] ?? "text-amber-200"} bg-black/30 border border-[#6B5A3E]/20`}
            >
              {EVENT_TYPE_LABELS[event.type] ?? event.type}
            </span>
            <span className="flex-1 text-amber-100/90 leading-relaxed text-base pt-0.5">
              {event.description}
            </span>
            <span className="text-amber-500/50 text-sm shrink-0 pt-0.5">
              {timeAgo(event.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-black/30 border border-[#6B5A3E]/20 rounded-md px-2 py-2 text-center shadow-[inset_0_0_8px_rgba(0,0,0,0.5)]">
      <div className="text-amber-500/50 text-xs mb-1">{label}</div>
      <div className={`${color} font-bold text-lg`}>{value}</div>
    </div>
  );
}

/* ---------- Chat Tab ---------- */

function ChatTab({
  chatHistory,
}: {
  chatHistory: readonly { id: number; content: string; createdAt: string }[] | undefined;
}) {
  return (
    <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
      {!chatHistory || chatHistory.length === 0 ? (
        <div className="text-xs text-amber-500/50">暂无聊天记录</div>
      ) : (
        chatHistory.map((msg) => (
          <div key={msg.id} className="text-xs text-amber-100/90 py-0.5 border-b border-amber-900/30">
            {msg.content}
            <span className="ml-1 text-amber-500/40">
              {timeAgo(Math.floor(new Date(msg.createdAt).getTime() / 1000))}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- Shared UI ---------- */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/30 border border-amber-900/30 rounded px-2 py-1">
      <div className="text-amber-500/60">{label}</div>
      <div className="text-amber-100">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-amber-500/60">{label}</span>
      <span className="text-amber-100">{value}</span>
    </div>
  );
}

/* ---------- Cultivation Tag (inline) ---------- */

function CultivationTag({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(startTime));

  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(startTime)), 60_000);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <span className="text-purple-400/80"> · 闭关{elapsed}</span>
  );
}

function formatElapsed(startTime: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - startTime);
  if (seconds < 60) return "刚开始";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return remainMinutes > 0 ? `${hours}时${remainMinutes}分` : `${hours}时`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}天${remainHours}时` : `${days}天`;
}

/** Resolve avatar image path by address prefix, or null for default. */
function getAvatarSrc(address: string): string | null {
  const lower = address.toLowerCase();
  for (const [prefix, src] of AVATAR_OVERRIDES) {
    if (lower.startsWith(prefix)) return src;
  }
  return null;
}

/** Convert number 1-9 to Chinese numeral. */
function numToChinese(n: number): string {
  const chars = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  return chars[n] ?? String(n);
}
