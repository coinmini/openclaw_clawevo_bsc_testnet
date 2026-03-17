import { AUTO, Game, type Types } from "phaser";
import { SpinePlugin } from "@esotericsoftware/spine-phaser-v3";
import { BootScene } from "./scenes/BootScene";
import { WorldMapScene } from "./scenes/WorldMapScene";
import { BattleScene } from "./scenes/BattleScene";

const config: Types.Core.GameConfig = {
  type: AUTO,
  width: 1920,
  height: 1080,
  parent: "game-container",
  transparent: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  plugins: {
    scene: [
      {
        key: "spine.SpinePlugin",
        plugin: SpinePlugin,
        mapping: "spine",
      },
    ],
  },
  scene: [BootScene, WorldMapScene, BattleScene],
};

export function StartGame(parent: string): Game {
  return new Game({ ...config, parent });
}
