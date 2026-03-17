"use client";

import { useEffect, useRef } from "react";
import type { Game } from "phaser";
import { EventBus } from "@/game/EventBus";

/**
 * Client-only Phaser game wrapper.
 * Must be imported with dynamic(() => import(...), { ssr: false }).
 */
export default function PhaserGame() {
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    // Dynamically import to avoid SSR issues with Phaser/Spine
    import("@/game/main").then(({ StartGame }) => {
      if (!gameRef.current) {
        const game = StartGame("game-container");
        gameRef.current = game;

        // Listen for battle scene switch requests
        const onSwitchBattle = (...args: unknown[]) => {
          const data = args[0] as Record<string, unknown>;
          game.scene.start("Battle", data);
        };
        EventBus.on("switch-to-battle", onSwitchBattle);
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        EventBus.removeAllListeners();
      }
    };
  }, []);

  return <div id="game-container" className="w-full h-full" />;
}
