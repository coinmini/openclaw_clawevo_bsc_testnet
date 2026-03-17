"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { EventBus } from "@/game/EventBus";
import { useGameStore, type AnimationEvent } from "@/stores/useGameStore";
import { useRecentEvents } from "@/data/hooks/useRecentEvents";
import { usePlayers } from "@/data/hooks/usePlayers";
import { useWorldChat } from "@/data/hooks/useWorldChat";
import { REGIONS, REALM_NAMES, ELEMENT_NAMES } from "@/lib/constants";
import { truncateAddress } from "@/lib/formatting";
import { ProtocolStats } from "@/components/panels/ProtocolStats";
import { ActivityFeed } from "@/components/panels/ActivityFeed";
import { Leaderboard } from "@/components/panels/Leaderboard";
import { PlayerProfile } from "@/components/panels/PlayerProfile";
import { MyPlayerPanel, MyPlayerModalContent } from "@/components/panels/MyPlayerPanel";
import { WorldChat } from "@/components/panels/WorldChat";
import { DailyDigest } from "@/components/panels/DailyDigest";
import { MarketPanel } from "@/components/panels/MarketPanel";
import { RealmPanel } from "@/components/panels/RealmPanel";
import { BattlePanel } from "@/components/panels/BattlePanel";
import { SectPanel } from "@/components/panels/SectPanel";
import { GameModal } from "@/components/ui/GameModal";
import { SideButtonBar, type PanelKey } from "@/components/ui/SideButtonBar";

// Phaser must be client-only (no SSR)
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500">
      Loading game...
    </div>
  ),
});

/* ---------- Modal config ---------- */

const MODAL_CONFIG: Record<PanelKey, { title: string; size: "md" | "lg" | "xl" }> = {
  leaderboard: { title: "排行榜",       size: "md" },
  market:      { title: "坊市",         size: "lg" },
  digest:      { title: "每日晨报",     size: "md" },
  profile:     { title: "Agent 详情",   size: "md" },
  realm:       { title: "秘境探索",     size: "lg" },
  battle:      { title: "约战",         size: "md" },
  sect:        { title: "宗门",         size: "md" },
  myPlayer:    { title: "修仙者",       size: "xl" },
};

export default function Home() {
  const selectAgent = useGameStore((s) => s.selectAgent);
  const enqueueAnimations = useGameStore((s) => s.enqueueAnimations);
  const dequeueAnimation = useGameStore((s) => s.dequeueAnimation);
  const setBattlePlaying = useGameStore((s) => s.setBattlePlaying);
  const { data: events } = useRecentEvents();
  const { data: players } = usePlayers();
  const { data: chatMessages } = useWorldChat();
  const { address, isConnected } = useAccount();
  const phaserReady = useRef(false);
  const draining = useRef(false);
  const lastChatId = useRef<number>(0);
  const focusSent = useRef(false);
  const initialEventsLoaded = useRef(false);

  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const [agentTooltip, setAgentTooltip] = useState<{ address: string; x: number; y: number } | null>(null);
  const togglePanel = useCallback((key: PanelKey) => {
    setActivePanel((prev) => (prev === key ? null : key));
  }, []);

  // Mark Phaser scene as ready
  useEffect(() => {
    const onReady = () => {
      phaserReady.current = true;
    };
    EventBus.on("current-scene-ready", onReady);
    return () => {
      EventBus.off("current-scene-ready", onReady);
    };
  }, []);

  // Agent selection from Phaser — show floating tooltip
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const address = args[0] as string;
      selectAgent(address);
      setAgentTooltip({ address, x: 0, y: 0 });
    };
    EventBus.on("agent-selected", handler);
    return () => {
      EventBus.off("agent-selected", handler);
    };
  }, [selectAgent]);

  // Track selected agent screen position (updated every frame by Phaser)
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const pos = args[0] as { x: number; y: number };
      setAgentTooltip((prev) => prev ? { ...prev, x: pos.x, y: pos.y } : null);
    };
    EventBus.on("agent-screen-pos", handler);
    return () => {
      EventBus.off("agent-screen-pos", handler);
    };
  }, []);

  // Battle scene start from WorldMapScene
  useEffect(() => {
    const onStartBattle = (...args: unknown[]) => {
      const data = args[0] as Record<string, unknown>;
      setBattlePlaying(true);
      // Tell PhaserGame to switch to Battle scene
      EventBus.emit("switch-to-battle", data);
    };
    const onBattleEnd = () => {
      setBattlePlaying(false);
    };
    EventBus.on("start-battle", onStartBattle);
    EventBus.on("battle-end", onBattleEnd);
    return () => {
      EventBus.off("start-battle", onStartBattle);
      EventBus.off("battle-end", onBattleEnd);
    };
  }, [setBattlePlaying]);

  // Push real registered players to Phaser WorldMapScene
  // Re-emit whenever players data changes OR Phaser scene becomes ready
  useEffect(() => {
    if (!players || players.length === 0 || !phaserReady.current) return;
    const agentDataList = players.map((p, i) => ({
      address: p.id,
      element: p.element,
      regionId: i % REGIONS.length,
    }));
    EventBus.emit("update-agents", agentDataList);
  }, [players]);

  // Also push players when Phaser scene becomes ready (data may have arrived first)
  useEffect(() => {
    const onReady = () => {
      if (!players || players.length === 0) return;
      const agentDataList = players.map((p, i) => ({
        address: p.id,
        element: p.element,
        regionId: i % REGIONS.length,
      }));
      EventBus.emit("update-agents", agentDataList);
    };
    EventBus.on("current-scene-ready", onReady);
    return () => {
      EventBus.off("current-scene-ready", onReady);
    };
  }, [players]);

  // Auto-focus camera on player's agent after wallet connect (once)
  useEffect(() => {
    if (!isConnected || !address || !phaserReady.current || focusSent.current) return;
    if (!players || players.length === 0) return;
    const timer = setTimeout(() => {
      EventBus.emit("focus-my-agent", { address: address.toLowerCase() });
      focusSent.current = true;
    }, 500);
    return () => clearTimeout(timer);
  }, [isConnected, address, players]);

  // Emit chat bubbles on map for new messages
  useEffect(() => {
    if (!chatMessages || chatMessages.length === 0 || !phaserReady.current) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (latest.id <= lastChatId.current) return;
    // Emit bubbles for all messages newer than last seen
    for (const msg of chatMessages) {
      if (msg.id > lastChatId.current) {
        EventBus.emit("chat-bubble", { sender: msg.sender, content: msg.content });
      }
    }
    lastChatId.current = latest.id;
  }, [chatMessages]);

  // Enqueue new events from polling into animation queue
  // On first load, mark all existing events as seen without animating them
  useEffect(() => {
    if (!events || events.length === 0) return;

    // Build address→element lookup from players cache
    const elementByAddr = new Map<string, number>();
    if (players) {
      for (const p of players) {
        elementByAddr.set(p.id, p.element);
      }
    }
    const animEvents: AnimationEvent[] = events
      .filter(
        (e) => e.type === "hunt" || e.type === "battle" || e.type === "treasure" || e.type === "realm"
      )
      .map((e) => ({
        id: e.id,
        type: e.type as AnimationEvent["type"],
        playerAddress: e.playerAddress,
        regionId: e.regionId,
        playerBAddress: e.playerBAddress,
        winner: e.winner,
        playerAElement: e.playerAElement ?? elementByAddr.get(e.playerAddress),
        playerBElement:
          e.playerBElement ??
          (e.playerBAddress ? elementByAddr.get(e.playerBAddress) : undefined),
      }));

    if (!initialEventsLoaded.current) {
      // First load: mark all as seen but don't animate (prevents replaying old battles)
      initialEventsLoaded.current = true;
      const { seenEventIds } = useGameStore.getState();
      const updatedSeen = new Set(seenEventIds);
      for (const e of animEvents) updatedSeen.add(e.id);
      useGameStore.setState({ seenEventIds: updatedSeen });
      return;
    }

    // Only animate battles related to the connected wallet
    const myAddr = address?.toLowerCase();
    const myEvents = myAddr
      ? animEvents.filter(
          (e) =>
            e.playerAddress.toLowerCase() === myAddr ||
            e.playerBAddress?.toLowerCase() === myAddr
        )
      : [];
    enqueueAnimations(myEvents);
  }, [events, players, enqueueAnimations, address]);

  // Drain animation queue one at a time
  const drainQueue = useCallback(() => {
    if (draining.current || !phaserReady.current) return;
    const next = dequeueAnimation();
    if (!next) return;

    draining.current = true;
    EventBus.emit("play-animation", next);

    // Wait for animation to finish, then drain next
    const onDone = () => {
      EventBus.off("animation-done", onDone);
      draining.current = false;
      // Schedule next drain on next tick
      setTimeout(drainQueue, 200);
    };
    EventBus.on("animation-done", onDone);
  }, [dequeueAnimation]);

  // Kick off drain whenever queue changes
  useEffect(() => {
    if (!draining.current) {
      drainQueue();
    }
  }, [events, drainQueue]);

  const modalCfg = activePanel ? MODAL_CONFIG[activePanel] : null;

  return (
    <div className="h-screen overflow-hidden bg-black relative">
      {/* Blurred background map to seamlessly fill letterboxing without darkening */}
      <div 
        className="absolute inset-0 bg-cover bg-center blur-2xl opacity-50 scale-110 pointer-events-none"
        style={{ backgroundImage: "url('/assets/images/gemini_huasheng.png')" }}
      />

      <div className="w-full h-full relative z-10">
        <PhaserGame />

        {/* Agent tooltip — floating card near clicked Spine character */}
        {agentTooltip && (
          <AgentTooltip
            address={agentTooltip.address}
            x={agentTooltip.x}
            y={agentTooltip.y}
            players={players ?? []}
            onClose={() => setAgentTooltip(null)}
          />
        )}

        <MyPlayerPanel onExpand={() => setActivePanel("myPlayer")} />

        {/* Icon buttons — to the right of player panel */}
        <div className="absolute top-[6px] left-[18rem] z-20">
          <SideButtonBar activePanel={activePanel} onToggle={togglePanel} />
        </div>

        {/* 实时动态 — 右侧全高 */}
        <div className="absolute top-0 right-0 bottom-0 w-80 z-20 bg-xianxia-dark backdrop-blur border-l border-xianxia-jade flex flex-col">
          {/* 全局数据 */}
          <div className="shrink-0 px-3 pt-3 pb-2 border-b border-xianxia-jade">
            <h2 className="text-xs font-semibold tracking-wider text-xianxia-jade mb-2">
              全局数据
            </h2>
            <ProtocolStats />
          </div>
          {/* 实时动态 */}
          <h2 className="text-xs font-semibold tracking-wider text-xianxia-jade px-3 pt-3 pb-2 shrink-0">
            实时动态
          </h2>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <ActivityFeed />
          </div>
        </div>

        {/* 世界聊天 — 左下角浮动 */}
        <div className="absolute bottom-4 left-4 z-20 w-80">
          <div className="bg-xianxia-dark backdrop-blur border border-xianxia-gold shadow-[0_0_15px_rgba(212,175,55,0.15)] rounded-lg p-3">
            <h2 className="text-xs font-semibold tracking-wider text-xianxia-gold mb-2">
              世界聊天
            </h2>
            <WorldChat />
          </div>
        </div>

        {/* Modal overlay */}
        {activePanel && modalCfg && (
          <GameModal
            open
            onClose={() => setActivePanel(null)}
            title={modalCfg.title}
            size={modalCfg.size}
          >
            {activePanel === "leaderboard" && <Leaderboard />}
            {activePanel === "market" && <MarketPanel />}
            {activePanel === "digest" && <DailyDigest />}
            {activePanel === "profile" && <PlayerProfile />}
            {activePanel === "realm" && <RealmPanel />}
            {activePanel === "battle" && <BattlePanel />}
            {activePanel === "sect" && <SectPanel />}
            {activePanel === "myPlayer" && <MyPlayerModalContent />}
          </GameModal>
        )}
      </div>
    </div>
  );
}

/* ---------- Agent Tooltip (floating card near Spine character) ---------- */

interface AgentTooltipProps {
  readonly address: string;
  readonly x: number;
  readonly y: number;
  readonly players: readonly { id: string; name?: string | null; realm: number; element: number; totalMatchesWon: number; totalMatchesPlayed: number; totalHunts: number; totalTreasures: number }[];
  readonly onClose: () => void;
}

function AgentTooltip({ address, x, y, players, onClose }: AgentTooltipProps) {
  const player = players.find((p) => p.id.toLowerCase() === address.toLowerCase());
  const displayName = player?.name || truncateAddress(address);
  const realm = player ? (REALM_NAMES[player.realm] ?? `Lv${player.realm}`) : "?";
  const element = player ? (ELEMENT_NAMES[player.element] ?? "?") : "?";

  // Clamp position to stay within viewport
  const clampedX = Math.min(Math.max(x, 120), typeof window !== "undefined" ? window.innerWidth - 120 : 800);
  const clampedY = Math.max(y - 60, 10);

  return (
    <>
      {/* Invisible backdrop to close on click */}
      <div className="absolute inset-0 z-25" onClick={onClose} />
      {/* Tooltip card */}
      <div
        className="absolute z-30 pointer-events-auto animate-[fade-in-up_0.2s_ease-out]"
        style={{ left: clampedX, top: clampedY, transform: "translate(-50%, -100%)" }}
      >
        <div className="bg-[#181A25]/95 backdrop-blur border border-[#D4AF37]/40 rounded-lg px-4 py-3 shadow-[0_0_20px_rgba(212,175,55,0.15)] min-w-[180px]">
          <div className="text-sm font-bold text-[#ebdcb5] mb-2 tracking-wide">
            {displayName}
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-[#D4AF37]">{realm}</span>
            <span className="text-amber-500/60">|</span>
            <span className="text-cyan-400">{element}</span>
          </div>
          {player && (
            <div className="flex gap-3 text-xs mt-1.5 text-amber-100/50">
              <span>对战 {player.totalMatchesWon}/{player.totalMatchesPlayed}</span>
              <span>打野 {player.totalHunts}</span>
            </div>
          )}
          {/* Small triangle pointer */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 rotate-45 bg-[#181A25]/95 border-r border-b border-[#D4AF37]/40" />
        </div>
      </div>
    </>
  );
}
