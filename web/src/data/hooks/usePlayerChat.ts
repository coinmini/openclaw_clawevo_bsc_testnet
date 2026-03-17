"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChatMessage } from "./useWorldChat";

const CHAT_API = process.env.NEXT_PUBLIC_CHAT_API ?? "http://localhost:4000";

interface ChatResponse {
  readonly messages: readonly ChatMessage[];
}

export function usePlayerChat(address: string | undefined) {
  return useQuery<readonly ChatMessage[]>({
    queryKey: ["player-chat", address],
    queryFn: async () => {
      if (!address) return [];
      const res = await fetch(
        `${CHAT_API}/api/chat/player/${address}?limit=100`
      );
      if (!res.ok) return [];
      const data: ChatResponse = await res.json();
      return data.messages;
    },
    enabled: !!address,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
