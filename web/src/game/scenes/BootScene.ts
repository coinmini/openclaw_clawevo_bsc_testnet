import { Scene } from "phaser";

/** Character IDs to preload. */
const CHARACTERS = ["act_1001", "act_1002", "act_1003", "act_1004", "act_1050"];

/** NPC Spine characters to preload (divine beasts). */
const NPC_DIVINE_BEASTS = ["shenshou_xuanwu", "baihu", "zhuque", "qinglong"];

/** Agent character skins (NPC_SPINE_IDS) are now loaded on-demand via SpineAssetLoader. */

/** 打野/猎灵对象 Spine IDs — 与 MONSTER_CONFIGS 保持同步. */
const MONSTER_SPINE_IDS = [
  1100000, 1200000, 1400000, 1500000, 1600000, 2000002,
  2000024, 2000025, 2000026, 2000029, 2000030, 2000033,
  2000032, 2000034, 2000035, 2000037, 2000041, 2000044, 2000045, 2000055,
  2000049, 2000057, 2000090, 2000091, 2000094, 2000095, 2000099, 2000106,
] as const;

export class BootScene extends Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    // -- Loading UI --
    const cx = 640;
    const cy = 360;
    const barW = 320;
    const barH = 16;

    this.add
      .text(cx, cy - 50, "ClawEvo", {
        fontSize: "28px",
        color: "#fbbf24",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const progressText = this.add
      .text(cx, cy + 30, "Loading 0%", {
        fontSize: "14px",
        color: "#6b7280",
      })
      .setOrigin(0.5);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x1f2937, 1);
    barBg.fillRoundedRect(cx - barW / 2, cy - barH / 2, barW, barH, 4);

    const barFill = this.add.graphics();

    this.load.on("progress", (value: number) => {
      barFill.clear();
      barFill.fillStyle(0xfbbf24, 1);
      barFill.fillRoundedRect(
        cx - barW / 2 + 2,
        cy - barH / 2 + 2,
        (barW - 4) * value,
        barH - 4,
        3
      );
      progressText.setText(`Loading ${Math.round(value * 100)}%`);
    });

    // -- Spine characters (check if SpinePlugin registered the loader methods) --
    const loader = this.load as any;
    if (typeof loader.spineBinary === "function") {
      for (const id of CHARACTERS) {
        loader.spineBinary(`${id}-skel`, `/assets/characters/${id}/${id}.skel`);
        loader.spineAtlas(
          `${id}-atlas`,
          `/assets/characters/${id}/${id}.atlas`
        );
      }
      for (const id of NPC_DIVINE_BEASTS) {
        loader.spineBinary(`${id}-skel`, `/assets/characters/${id}/${id}.skel`);
        loader.spineAtlas(
          `${id}-atlas`,
          `/assets/characters/${id}/${id}.atlas`
        );
      }
      // Monster Spine characters (猎灵对象, 3 per region)
      for (const numId of MONSTER_SPINE_IDS) {
        const key = `npc_${numId}`;
        loader.spineBinary(`${key}-skel`, `/assets/characters/${key}/${key}.skel`);
        loader.spineAtlas(
          `${key}-atlas`,
          `/assets/characters/${key}/${key}.atlas`
        );
      }
      // Sit hero (青云山门口)
      loader.spineBinary(
        "sit_hero-skel",
        "/assets/characters/sit_hero/uieffect_hero_book_spine.skel"
      );
      loader.spineAtlas(
        "sit_hero-atlas",
        "/assets/characters/sit_hero/uieffect_hero_book_spine.atlas"
      );
      // Peach tree (龙脊岭)
      loader.spineBinary(
        "peach_tree-skel",
        "/assets/characters/peach_tree/uieffect_weekly_clearance_plan_entry_2.skel"
      );
      loader.spineAtlas(
        "peach_tree-atlas",
        "/assets/characters/peach_tree/uieffect_weekly_clearance_plan_entry_2.atlas"
      );
      // Wind look (右下台风区)
      loader.spineBinary(
        "wind_look-skel",
        "/assets/characters/wind_look/11.skel"
      );
      loader.spineAtlas(
        "wind_look-atlas",
        "/assets/characters/wind_look/11.atlas"
      );
      // Agent character skins loaded on-demand via SpineAssetLoader (not here)
    } else {
      console.warn(
        "[BootScene] SpinePlugin not registered — spineBinary/spineAtlas unavailable. Spine characters will not load."
      );
    }

    // -- Pixel spritesheet NPCs (Rika: 256x256 frames) --
    this.load.spritesheet("rika-idle", "/assets/characters/rika_idle.png", {
      frameWidth: 256,
      frameHeight: 256,
    });
    this.load.spritesheet("rika-run", "/assets/characters/rika_run.png", {
      frameWidth: 256,
      frameHeight: 256,
    });
    this.load.spritesheet("rika-attack", "/assets/characters/rika_attack.png", {
      frameWidth: 256,
      frameHeight: 256,
    });

    // -- World map video (animated background, replaces 64 individual frames) --
    // Provide both MP4 and WebM; Phaser picks the first supported format.
    // 3rd param `true` = noAudio, enables autoplay without user interaction.
    this.load.video(
      "world-map-video",
      ["/assets/images/map_animated.mp4", "/assets/images/map_animated.webm"],
      true
    );
    // Static cloud overlay (rendered on top of animated map)
    this.load.image("cloud-overlay", "/assets/images/cloud_overlay.png");

    // -- Audio (world BGM only; battle assets loaded on-demand in BattleScene) --
    this.load.audio("bgm-world", "/assets/audio/world_map_huasheng.ogg");

    // -- Error handling --
    this.load.on("loaderror", (file: any) => {
      console.error("[BootScene] Failed to load:", file.key, file.url);
    });
  }

  create(): void {
    console.log("[BootScene] All assets loaded, starting WorldMap.");
    this.scene.start("WorldMap");
  }
}
