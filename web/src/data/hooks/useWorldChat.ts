"use client";

import { useQuery } from "@tanstack/react-query";

const CHAT_API = process.env.NEXT_PUBLIC_CHAT_API ?? "http://localhost:4000";

export interface ChatMessage {
  readonly id: number;
  readonly sender: string;
  readonly content: string;
  readonly createdAt: string;
}

interface ChatResponse {
  readonly messages: readonly ChatMessage[];
}

export function useWorldChat() {
  return useQuery<readonly ChatMessage[]>({
    queryKey: ["world-chat"],
    queryFn: async () => {
      const res = await fetch(`${CHAT_API}/api/chat?limit=50`);
      if (!res.ok) return [];
      const data: ChatResponse = await res.json();
      return data.messages;
    },
    refetchInterval: 4_000,
    staleTime: 2_000,
  });
}
