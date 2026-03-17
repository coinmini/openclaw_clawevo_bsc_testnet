"use client";

import { useRef, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { useWorldChat } from "@/data/hooks/useWorldChat";
import { EventBus } from "@/game/EventBus";
import {
  truncateAddress,
  timeAgo,
  parseMentions,
  isMentionOf,
  mentionToAddress,
} from "@/lib/formatting";

/** Detect @mutual interactions (A mentions B, then B mentions A within window). */
function detectEncounters(
  messages: readonly { readonly sender: string; readonly content: string }[],
  emittedPairs: Set<string>,
): void {
  // Track who mentioned whom in recent messages
  const mentions = new Map<string, Set<string>>(); // sender → set of mentioned addresses

  for (const msg of messages) {
    const frags = parseMentions(msg.content);
    for (const frag of frags) {
      if (frag.type !== "mention") continue;
      const raw = mentionToAddress(frag.value).toLowerCase();
      const senderLower = msg.sender.toLowerCase();
      if (!mentions.has(senderLower)) {
        mentions.set(senderLower, new Set());
      }
      mentions.get(senderLower)!.add(raw);
    }
  }

  // Check for mutual mentions (A→B and B→A)
  for (const [a, aTargets] of mentions) {
    for (const bPartial of aTargets) {
      for (const [b, bTargets] of mentions) {
        if (a === b) continue;
        // Check if b's address matches bPartial (could be truncated)
        if (!b.startsWith(bPartial.replace(/\.\..*/,""))) continue;
        // Check if B also mentioned A
        for (const aPartial of bTargets) {
          if (!a.startsWith(aPartial.replace(/\.\..*/,""))) continue;
          const pairKey = [a, b].sort().join("|");
          if (emittedPairs.has(pairKey)) continue;
          emittedPairs.add(pairKey);
          EventBus.emit("agent-encounter", { addressA: a, addressB: b });
        }
      }
    }
  }
}

/** Render message content with @mention highlighting. */
function ChatContent({
  content,
  myAddress,
}: {
  readonly content: string;
  readonly myAddress: string | undefined;
}) {
  const fragments = useMemo(() => parseMentions(content), [content]);

  return (
    <span className="flex-1 text-amber-50 break-all">
      {fragments.map((frag, i) => {
        if (frag.type === "text") {
          return <span key={i}>{frag.value}</span>;
        }
        const isMentioningMe =
          myAddress && isMentionOf(frag.value, myAddress);
        return (
          <span
            key={i}
            className={
              isMentioningMe
                ? "text-xianxia-gold font-semibold bg-amber-900/40 rounded px-0.5"
                : "text-xianxia-jade font-medium"
            }
          >
            {frag.value}
          </span>
        );
      })}
    </span>
  );
}

export function WorldChat() {
  const { data: messages, isLoading } = useWorldChat();
  const { address } = useAccount();
  const bottomRef = useRef<HTMLDivElement>(null);
  const emittedPairsRef = useRef<Set<string>>(new Set());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Detect mutual @mentions and emit encounter events
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    detectEncounters(messages, emittedPairsRef.current);
  }, [messages]);

  // Clear stale encounter pairs periodically (every 5 minutes)
  useEffect(() => {
    const timer = setInterval(() => {
      emittedPairsRef.current.clear();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) {
    return <div className="text-amber-100/60 text-sm animate-pulse">Loading chat...</div>;
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="text-amber-500/50 text-sm italic">
        暂无聊天记录，等待修仙者发言...
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {messages.map((msg) => {
        const ts = Math.floor(new Date(msg.createdAt).getTime() / 1000);
        // Check if this message mentions current user
        const mentionsMe =
          address &&
          parseMentions(msg.content).some(
            (f) => f.type === "mention" && isMentionOf(f.value, address),
          );
        return (
          <div
            key={msg.id}
            className={`flex items-start gap-2 py-1 text-sm border-b border-xianxia-gold/30 ${
              mentionsMe
                ? "bg-amber-900/20 border-l-2 border-l-xianxia-gold pl-1"
                : ""
            }`}
          >
            <span className="shrink-0 text-xs font-mono text-emerald-400/90 drop-shadow-[0_0_2px_rgba(52,211,153,0.5)]">
              {truncateAddress(msg.sender)}
            </span>
            <ChatContent content={msg.content} myAddress={address} />
            <span className="text-amber-500/40 text-xs shrink-0">
              {timeAgo(ts)}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
