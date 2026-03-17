import { Scene } from "phaser";

const SKILL_ANIMS = ["attack", "skill"];
const IDLE_ANIMS = ["idle", "stand"];
const HURT_ANIMS = ["hit", "hurt", "hit2", "hit3"];
const DEATH_ANIMS = ["die", "death"];

/** Try animation names in order, return true if one succeeds. */
function trySetAnim(
  animState: any,
  track: number,
  names: readonly string[],
  loop: boolean
): any {
  for (const name of names) {
    try {
      return animState.setAnimation(track, name, loop);
    } catch {
      // try next
    }
  }
  return null;
}

function tryAddAnim(
  animState: any,
  track: number,
  names: readonly string[],
  delay: number,
  loop: boolean
): void {
  for (const name of names) {
    try {
      animState.addAnimation(track, name, delay, loop);
      return;
    } catch {
      // try next
    }
  }
}

/**
 * Spine character for the BattleScene.
 * Falls back to a rectangle placeholder if Spine is unavailable.
 */
export class BattleCharacter {
  readonly scene: Scene;
  readonly spineObject: any;
  private readonly baseX: number;
  private readonly faceRight: boolean;
  private readonly isSpine: boolean;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    characterId: string,
    faceRight: boolean
  ) {
    this.scene = scene;
    this.baseX = x;
    this.faceRight = faceRight;

    const addFn = (scene.add as any).spine;
    if (typeof addFn === "function") {
      try {
        this.spineObject = addFn.call(
          scene.add,
          x,
          y,
          `${characterId}-skel`,
          `${characterId}-atlas`
        );
        this.spineObject.scaleX = faceRight ? -0.75 : 0.75;
        this.spineObject.scaleY = 0.75;
        trySetAnim(this.spineObject.animationState, 0, IDLE_ANIMS, true);
        this.isSpine = true;
        return;
      } catch (e) {
        console.warn(`[BattleCharacter] Spine failed for ${characterId}:`, e);
      }
    }

    // Fallback: colored rectangle
    this.isSpine = false;
    const color = faceRight ? 0x60a5fa : 0xf87171;
    this.spineObject = scene.add.rectangle(x, y, 90, 150, color, 0.8);
    scene.add
      .text(x, y, characterId.slice(-4), {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }

  playAttack(): Promise<void> {
    if (!this.isSpine) {
      // Simple lunge for fallback
      return new Promise((resolve) => {
        const lungeX = this.faceRight ? this.baseX + 40 : this.baseX - 40;
        this.scene.tweens.add({
          targets: this.spineObject,
          x: lungeX,
          duration: 200,
          yoyo: true,
          ease: "Power2",
          onComplete: () => resolve(),
        });
      });
    }

    return new Promise((resolve) => {
      const anim = SKILL_ANIMS[Math.floor(Math.random() * SKILL_ANIMS.length)];
      const entry = trySetAnim(
        this.spineObject.animationState,
        0,
        [anim, ...SKILL_ANIMS],
        false
      );
      tryAddAnim(this.spineObject.animationState, 0, IDLE_ANIMS, 0, true);

      // Lunge forward during attack
      const lungeX = this.faceRight ? this.baseX + 40 : this.baseX - 40;
      this.scene.tweens.add({
        targets: this.spineObject,
        x: lungeX,
        duration: 200,
        yoyo: true,
        ease: "Power2",
      });

      let resolved = false;
      if (entry) {
        this.spineObject.animationState.addListener({
          complete: (trackEntry: any) => {
            if (trackEntry === entry && !resolved) {
              resolved = true;
              this.spineObject.animationState.clearListeners();
              resolve();
            }
          },
        });
      }

      // Fallback timeout
      this.scene.time.delayedCall(1500, () => {
        if (!resolved) {
          resolved = true;
          try { this.spineObject.animationState.clearListeners(); } catch { /* */ }
          resolve();
        }
      });
    });
  }

  playHurt(): Promise<void> {
    if (!this.isSpine) {
      return new Promise((resolve) => {
        const knockX = this.faceRight ? this.baseX - 20 : this.baseX + 20;
        this.scene.tweens.add({
          targets: this.spineObject,
          x: knockX,
          duration: 100,
          yoyo: true,
          ease: "Power1",
          onComplete: () => resolve(),
        });
      });
    }

    return new Promise((resolve) => {
      trySetAnim(this.spineObject.animationState, 0, HURT_ANIMS, false);
      tryAddAnim(this.spineObject.animationState, 0, IDLE_ANIMS, 0, true);

      // Knockback stagger
      const knockX = this.faceRight ? this.baseX - 20 : this.baseX + 20;
      this.scene.tweens.add({
        targets: this.spineObject,
        x: knockX,
        duration: 100,
        yoyo: true,
        ease: "Power1",
      });

      // Red tint flash
      this.spineObject.setTint?.(0xff4444);
      this.scene.time.delayedCall(200, () => {
        this.spineObject.clearTint?.();
      });

      this.scene.time.delayedCall(800, resolve);
    });
  }

  playVictory(): void {
    if (!this.isSpine) return;
    // Try win animations, fall back to idle
    const entry = trySetAnim(
      this.spineObject.animationState,
      0,
      ["win_1", "idle"],
      false
    );
    if (entry) {
      tryAddAnim(
        this.spineObject.animationState,
        0,
        ["win_2", "idle"],
        0,
        true
      );
    }
  }

  playDeath(): void {
    if (this.isSpine) {
      trySetAnim(this.spineObject.animationState, 0, DEATH_ANIMS, false);
    }
    // Fade out on death (works for both spine and fallback)
    this.scene.tweens.add({
      targets: this.spineObject,
      alpha: 0.3,
      duration: 1000,
      delay: 500,
    });
  }

  destroy(): void {
    this.spineObject.destroy();
  }
}
