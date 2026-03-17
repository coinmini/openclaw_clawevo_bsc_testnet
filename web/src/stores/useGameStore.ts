import { create } from "zustand";

export interface Player {
  readonly id: string;
  readonly origin: number;
  readonly element: number;
  readonly realm: number;
  readonly totalMatchesPlayed: number;
  readonly totalMatchesWon: number;
  readonly totalWagerWon: string;
  readonly totalHunts: number;
  readonly totalTreasures: number;
}

export interface RecentEvent {
  readonly id: string;
  readonly type: string;
  readonly playerAddress: string;
  readonly description: string;
  readonly timestamp: number;
  /** Optional secondary player (e.g. battle opponent). */
  readonly playerBAddress?: string;
  /** Optional region for hunt/treasure events. */
  readonly regionId?: number;
  /** Battle winner address. */
  readonly winner?: string;
  /** Element IDs for battle participants. */
  readonly playerAElement?: number;
  readonly playerBElement?: number;
}

export interface ProtocolStatsData {
  readonly totalPlayers: number;
  readonly totalMatches: number;
  readonly totalChallenges: number;
  readonly totalOrders: number;
  readonly totalEquipmentMinted: number;
  readonly totalBeastsMinted: number;
  readonly totalSectsCreated: number;
}

/** Events queued for Phaser to animate, consumed one at a time. */
export interface AnimationEvent {
  readonly id: string;
  readonly type: "hunt" | "battle" | "treasure" | "cultivation" | "realm";
  readonly playerAddress: string;
  readonly regionId?: number;
  readonly playerBAddress?: string;
  readonly winner?: string;
  readonly playerAElement?: number;
  readonly playerBElement?: number;
}

interface GameState {
  readonly players: readonly Player[];
  readonly selectedAgentAddress: string | null;
  readonly recentEvents: readonly RecentEvent[];
  readonly protocolStats: ProtocolStatsData | null;
  /** IDs of events already dispatched to Phaser (dedup). */
  readonly seenEventIds: ReadonlySet<string>;
  /** Queue of events waiting to be animated. */
  readonly animationQueue: readonly AnimationEvent[];
  /** Whether a battle scene is currently playing. */
  readonly battlePlaying: boolean;
  /** Screen position of the selected agent (updated every frame by Phaser). */
  readonly selectedAgentScreenPos: { readonly x: number; readonly y: number } | null;
}

interface GameActions {
  setPlayers: (players: readonly Player[]) => void;
  selectAgent: (address: string | null) => void;
  setRecentEvents: (events: readonly RecentEvent[]) => void;
  setProtocolStats: (stats: ProtocolStatsData) => void;
  enqueueAnimations: (events: readonly AnimationEvent[]) => void;
  dequeueAnimation: () => AnimationEvent | undefined;
  setBattlePlaying: (playing: boolean) => void;
  setSelectedAgentScreenPos: (pos: { x: number; y: number } | null) => void;
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  players: [],
  selectedAgentAddress: null,
  recentEvents: [],
  protocolStats: null,
  seenEventIds: new Set(),
  animationQueue: [],
  battlePlaying: false,
  selectedAgentScreenPos: null,

  setPlayers: (players) => set({ players }),
  selectAgent: (address) => set({ selectedAgentAddress: address, selectedAgentScreenPos: null }),
  setRecentEvents: (events) => set({ recentEvents: events }),
  setProtocolStats: (stats) => set({ protocolStats: stats }),

  enqueueAnimations: (events) => {
    const { seenEventIds, animationQueue } = get();
    const newEvents = events.filter((e) => !seenEventIds.has(e.id));
    if (newEvents.length === 0) return;
    const updatedSeen = new Set(seenEventIds);
    for (const e of newEvents) updatedSeen.add(e.id);
    // Prune oldest IDs to prevent unbounded growth (keep last 200)
    const MAX_SEEN = 200;
    const trimmedSeen =
      updatedSeen.size > MAX_SEEN
        ? new Set([...updatedSeen].slice(updatedSeen.size - MAX_SEEN))
        : updatedSeen;
    set({
      seenEventIds: trimmedSeen,
      animationQueue: [...animationQueue, ...newEvents],
    });
  },

  dequeueAnimation: () => {
    const { animationQueue } = get();
    if (animationQueue.length === 0) return undefined;
    const [first, ...rest] = animationQueue;
    set({ animationQueue: rest });
    return first;
  },

  setBattlePlaying: (playing) => set({ battlePlaying: playing }),
  setSelectedAgentScreenPos: (pos) => set({ selectedAgentScreenPos: pos }),
}));
