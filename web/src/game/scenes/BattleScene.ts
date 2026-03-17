import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { BattleCharacter } from "../objects/BattleCharacter";
import { ELEMENT_TO_CHARACTER, ELEMENT_NAMES } from "@/lib/constants";
import { truncateAddress } from "@/lib/formatting";

const BATTLE_BGS = [
  "bg-coastal_harbor",
  "bg-frozen_peaks",
  "bg-shadow_grove",
  "bg-thunder_ruins",
  "bg-verdant_plains",
  "bg-volcano_isle",
];

const TOTAL_ROUNDS = 3;

/* ---------- Layout constants (in battle-local coordinates) ---------- */
/** Battle viewport occupies 60% of screen, centered. */
const VP_RATIO = 0.6;
const CHAR_A_X = 520;
const CHAR_B_X = 1400;
const CHAR_Y = 580;
const HP_BAR_W = 360;
const HP_OFFSET_Y = -250;
const NAME_OFFSET_Y = -285;

interface BattleData {
  readonly mode?: "battle" | "hunt";
  readonly playerAAddress: string;
  readonly playerBAddress: string;
  readonly playerAElement: number;
  readonly playerBElement: number;
  readonly winner: string;
  /** For hunt mode: monster spine character id (e.g. "npc_2000055") */
  readonly monsterCharId?: string;
  /** For hunt mode: monster display name */
  readonly monsterName?: string;
}

export class BattleScene extends Scene {
  private playerA: BattleCharacter | null = null;
  private playerB: BattleCharacter | null = null;
  private hpBarA!: Phaser.GameObjects.Graphics;
  private hpBarB!: Phaser.GameObjects.Graphics;
  private roundText!: Phaser.GameObjects.Text;
  private hpA = 1;
  private hpB = 1;
  private battleBgmKey: string | null = null;

  constructor() {
    super("Battle");
  }

  /** Load battle backgrounds & BGM on-demand (not at boot). */
  preload(): void {
    for (const bgKey of BATTLE_BGS) {
      if (!this.textures.exists(bgKey)) {
        const fileName = bgKey.replace("bg-", "");
        this.load.image(bgKey, `/assets/images/battle_bgs/${fileName}.png`);
      }
    }
    for (let i = 1; i <= 5; i++) {
      const key = `bgm-battle-${i}`;
      if (!this.cache.audio.exists(key)) {
        this.load.audio(key, `/assets/audio/bgm/battle_${i}.ogg`);
      }
    }
  }

  create(data: BattleData): void {
    // -- Set camera viewport to center 60% of screen --
    const cam = this.cameras.main;
    const gameW = this.scale.width;
    const gameH = this.scale.height;
    const vpW = Math.round(gameW * VP_RATIO);
    const vpH = Math.round(gameH * VP_RATIO);
    const vpX = Math.round((gameW - vpW) / 2);
    const vpY = Math.round((gameH - vpH) / 2);
    cam.setViewport(vpX, vpY, vpW, vpH);
    cam.setBackgroundColor(0x000000);

    // -- Stop world BGM, play battle BGM --
    this.sound.stopByKey("bgm-world");
    const bgmIdx = Math.floor(Math.random() * 5) + 1;
    this.battleBgmKey = `bgm-battle-${bgmIdx}`;
    this.sound.play(this.battleBgmKey, { loop: true, volume: 0.4 });

    // -- Random battle background --
    const bgKey = BATTLE_BGS[Math.floor(Math.random() * BATTLE_BGS.length)];
    const bg = this.add.image(960, 540, bgKey);
    const scaleX = 1920 / bg.width;
    const scaleY = 1080 / bg.height;
    bg.setScale(Math.max(scaleX, scaleY));
    // -- Dim overlay for atmosphere --
    this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.15);

    const isHunt = data.mode === "hunt";

    // -- Player name labels --
    const nameA = `${truncateAddress(data.playerAAddress)} [${
      ELEMENT_NAMES[data.playerAElement] ?? "?"
    }]`;
    const nameB = isHunt
      ? (data.monsterName ?? "怪物")
      : `${truncateAddress(data.playerBAddress)} [${
          ELEMENT_NAMES[data.playerBElement] ?? "?"
        }]`;

    this.add
      .text(CHAR_A_X, CHAR_Y + NAME_OFFSET_Y, nameA, {
        fontSize: "22px",
        color: "#60a5fa",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(CHAR_B_X, CHAR_Y + NAME_OFFSET_Y, nameB, {
        fontSize: "22px",
        color: "#f87171",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // -- HP bars --
    this.hpBarA = this.add.graphics();
    this.hpBarB = this.add.graphics();
    this.hpA = 1;
    this.hpB = 1;
    this.drawHpBar(this.hpBarA, CHAR_A_X - HP_BAR_W / 2, CHAR_Y + HP_OFFSET_Y, this.hpA, 0x60a5fa);
    this.drawHpBar(this.hpBarB, CHAR_B_X - HP_BAR_W / 2, CHAR_Y + HP_OFFSET_Y, this.hpB, 0xf87171);

    // -- Round counter --
    this.roundText = this.add
      .text(960, 70, "Round 1", {
        fontSize: "32px",
        color: "#fbbf24",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // -- Characters (start off-screen, entrance tween) --
    const charA = ELEMENT_TO_CHARACTER[data.playerAElement] ?? "act_1001";
    const charB = isHunt && data.monsterCharId
      ? data.monsterCharId
      : (ELEMENT_TO_CHARACTER[data.playerBElement] ?? "act_1002");

    this.playerA = new BattleCharacter(this, -150, CHAR_Y, charA, true);
    this.playerB = new BattleCharacter(this, 2070, CHAR_Y, charB, false);

    // -- Entrance tweens --
    this.tweens.add({
      targets: this.playerA.spineObject,
      x: CHAR_A_X,
      duration: 600,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: this.playerB.spineObject,
      x: CHAR_B_X,
      duration: 600,
      ease: "Back.easeOut",
      onComplete: () => this.playBattleSequence(data),
    });

    EventBus.emit("current-scene-ready", this);
  }

  private async playBattleSequence(data: BattleData): Promise<void> {
    if (!this.playerA || !this.playerB) return;

    const aWins =
      data.winner.toLowerCase() === data.playerAAddress.toLowerCase();

    // Determine how much HP each loses per round
    const loserHpLossPerRound = 1 / TOTAL_ROUNDS;
    const winnerHpLossPerRound = 0.15; // winner takes some damage too

    for (let round = 0; round < TOTAL_ROUNDS; round++) {
      // Show round number
      this.roundText.setText(`Round ${round + 1}`);
      this.tweens.add({
        targets: this.roundText,
        alpha: 1,
        duration: 200,
        yoyo: true,
        hold: 400,
      });
      await this.delay(300);

      // A attacks B
      await this.playerA.playAttack();
      this.shakeCamera(3);
      await this.playerB.playHurt();
      if (aWins) {
        this.hpB = Math.max(0, this.hpB - loserHpLossPerRound);
      } else {
        this.hpB = Math.max(0, this.hpB - winnerHpLossPerRound);
      }
      this.drawHpBar(this.hpBarB, CHAR_B_X - HP_BAR_W / 2, CHAR_Y + HP_OFFSET_Y, this.hpB, 0xf87171);
      this.flashScreen();
      await this.delay(250);

      // B attacks A
      await this.playerB.playAttack();
      this.shakeCamera(3);
      await this.playerA.playHurt();
      if (!aWins) {
        this.hpA = Math.max(0, this.hpA - loserHpLossPerRound);
      } else {
        this.hpA = Math.max(0, this.hpA - winnerHpLossPerRound);
      }
      this.drawHpBar(this.hpBarA, CHAR_A_X - HP_BAR_W / 2, CHAR_Y + HP_OFFSET_Y, this.hpA, 0x60a5fa);
      this.flashScreen();
      await this.delay(250);
    }

    // -- Final result --
    if (aWins) {
      this.hpB = 0;
      this.drawHpBar(this.hpBarB, CHAR_B_X - HP_BAR_W / 2, CHAR_Y + HP_OFFSET_Y, 0, 0xf87171);
      this.playerA.playVictory();
      this.playerB.playDeath();
    } else {
      this.hpA = 0;
      this.drawHpBar(this.hpBarA, CHAR_A_X - HP_BAR_W / 2, CHAR_Y + HP_OFFSET_Y, 0, 0x60a5fa);
      this.playerB.playVictory();
      this.playerA.playDeath();
    }

    // -- Victory/Defeat banner --
    await this.delay(500);
    this.showResultBanner(aWins ? data.playerAAddress : data.playerBAddress);

    // Wait then return
    await this.delay(3500);
    this.cleanupAudio();
    EventBus.emit("battle-end");
    this.scene.start("WorldMap");
  }

  /* ---------- UI Drawing ---------- */

  private drawHpBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    ratio: number,
    color: number
  ): void {
    const width = 360;
    const height = 16;
    graphics.clear();
    // Background
    graphics.fillStyle(0x1f2937, 0.8);
    graphics.fillRoundedRect(x, y, width, height, 4);
    // Border
    graphics.lineStyle(1, 0x374151);
    graphics.strokeRoundedRect(x, y, width, height, 4);
    // Fill
    if (ratio > 0) {
      const fillColor = ratio > 0.3 ? color : 0xef4444;
      graphics.fillStyle(fillColor, 1);
      graphics.fillRoundedRect(
        x + 1,
        y + 1,
        (width - 2) * ratio,
        height - 2,
        3
      );
    }
  }

  private showResultBanner(winnerAddress: string): void {
    // Dark overlay
    const overlay = this.add
      .rectangle(960, 540, 1920, 1080, 0x000000, 0)
      .setDepth(10);
    this.tweens.add({ targets: overlay, fillAlpha: 0.4, duration: 300 });

    // Banner background
    const banner = this.add
      .rectangle(960, 500, 600, 100, 0x000000, 0.8)
      .setDepth(11)
      .setStrokeStyle(2, 0xfbbf24);

    // Banner text
    const text = this.add
      .text(960, 488, "VICTORY", {
        fontSize: "42px",
        color: "#fbbf24",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(0);

    const subText = this.add
      .text(960, 520, truncateAddress(winnerAddress), {
        fontSize: "18px",
        color: "#9ca3af",
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(0);

    // Animate in
    this.tweens.add({
      targets: [banner],
      scaleX: { from: 0, to: 1 },
      duration: 300,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: [text, subText],
      alpha: 1,
      duration: 400,
      delay: 200,
    });
  }

  /* ---------- Effects ---------- */

  private shakeCamera(intensity: number): void {
    this.cameras.main.shake(150, intensity / 1000);
  }

  private flashScreen(): void {
    const flash = this.add
      .rectangle(960, 540, 1920, 1080, 0xffffff, 0.15)
      .setDepth(5);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 150,
      onComplete: () => flash.destroy(),
    });
  }

  /* ---------- Helpers ---------- */

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }

  private cleanupAudio(): void {
    if (this.battleBgmKey) {
      this.sound.stopByKey(this.battleBgmKey);
      this.battleBgmKey = null;
    }
  }

  shutdown(): void {
    this.cleanupAudio();
    this.playerA?.destroy();
    this.playerB?.destroy();
    this.playerA = null;
    this.playerB = null;
  }
}
