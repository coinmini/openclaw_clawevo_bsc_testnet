import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { isCharacterLoaded, loadCharacter } from "../SpineAssetLoader";

/** Skill animations available on all characters. */
const SKILL_ANIMS = ["attack", "skill", "skill_exclusive"];

/* ── Roam constants (ported from Godot world_map_scene.gd) ── */
const ROAM_RANGE = 120;       // max wander radius in world px
const ROAM_SPEED = 80;        // px per second
const ROAM_PAUSE_MIN = 1.0;   // seconds
const ROAM_PAUSE_MAX = 3.5;

/**
 * Wraps a SpineGameObject on the world map.
 * Falls back to a colored circle + label if Spine is unavailable.
 * Supports lazy-loading: starts as placeholder, upgrades to Spine when ready.
 */
export class AgentSprite {
  readonly scene: Scene;
  readonly address: string;
  spineObject: any;
  private isSpine = false;
  private _moving = false;
  private _destroyed = false;

  /* ── Roam state ── */
  private readonly homeX: number;
  private readonly homeY: number;
  private _roaming = false;
  private _roamTarget: { readonly x: number; readonly y: number } | null = null;
  private _roamTimer = 0;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    characterId: string,
    address: string
  ) {
    this.scene = scene;
    this.address = address;
    this.homeX = x;
    this.homeY = y;

    // Try creating Spine object immediately if assets are already loaded
    if (isCharacterLoaded(characterId)) {
      const created = this.tryCreateSpine(x, y, characterId);
      if (created) return;
    }

    // Start with placeholder, load Spine assets in background
    this.isSpine = false;
    this.createPlaceholder(x, y, address);

    // Lazy-load character assets then upgrade to Spine
    loadCharacter(scene, characterId)
      .then(() => {
        if (this._destroyed) return;
        this.upgradeToSpine(characterId);
      })
      .catch(() => {
        // Keep placeholder — loading failed
      });
  }

  /** Attempt to create Spine object. Returns true on success. */
  private tryCreateSpine(x: number, y: number, characterId: string): boolean {
    const addFn = (this.scene.add as any).spine;
    if (typeof addFn !== "function") return false;
    try {
      this.spineObject = addFn.call(
        this.scene.add,
        x,
        y,
        `${characterId}-skel`,
        `${characterId}-atlas`
      );
      this.spineObject.scale = 0.25;
      this.isSpine = true;
      this.playIdle();
      return true;
    } catch (e) {
      console.warn(`[AgentSprite] Spine failed for ${characterId}:`, e);
      return false;
    }
  }

  /** Create a colored circle placeholder. */
  private createPlaceholder(x: number, y: number, address: string): void {
    const circle = this.scene.add.circle(x, y, 40, 0xfbbf24, 0.8);
    const label = this.scene.add
      .text(x, y - 56, address.slice(0, 6), {
        fontSize: "24px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this.spineObject = this.scene.add.container(0, 0, [circle, label]);
    (this.spineObject as any)._circle = circle;
    (this.spineObject as any)._label = label;
    Object.defineProperty(this.spineObject, "x", {
      get: () => circle.x,
      set: (v: number) => {
        circle.x = v;
        label.x = v;
      },
    });
    Object.defineProperty(this.spineObject, "y", {
      get: () => circle.y,
      set: (v: number) => {
        circle.y = v;
        label.y = v - 56;
      },
    });
  }

  /** Replace placeholder with Spine object once assets are loaded. */
  private upgradeToSpine(characterId: string): void {
    const curX = this.x;
    const curY = this.y;
    const wasRoaming = this._roaming;

    // Destroy placeholder
    this.spineObject.destroy();

    if (!this.tryCreateSpine(curX, curY, characterId)) return;

    // Restore state
    this.enableInteraction();
    if (wasRoaming) this.startWander();
    if (this._culled) {
      this.spineObject.setVisible(false);
      this.spineObject.setActive(false);
    }
  }

  private _culled = false;

  get x(): number {
    return this.spineObject.x;
  }
  get y(): number {
    return this.spineObject.y;
  }

  /** Hide and pause when outside viewport; show and resume when inside. */
  setCulled(culled: boolean): void {
    if (culled === this._culled) return;
    this._culled = culled;
    const visible = !culled;
    if (this.isSpine) {
      this.spineObject.setVisible(visible);
      this.spineObject.setActive(visible);
    } else {
      this.spineObject.setVisible(visible);
    }
  }

  playIdle(): void {
    if (this.isSpine) {
      try {
        this.spineObject.animationState.setAnimation(0, "idle", true);
      } catch {
        // Animation not available — ignore
      }
    }
  }

  playRun(): void {
    if (this.isSpine) {
      try {
        this.spineObject.animationState.setAnimation(0, "run", true);
      } catch {
        // Fallback: try "sprint" (common in NPC spines)
        try {
          this.spineObject.animationState.setAnimation(0, "sprint", true);
        } catch {
          // No run animation available
        }
      }
    }
  }

  playAttack(): void {
    if (this.isSpine) {
      const anim = SKILL_ANIMS[Math.floor(Math.random() * SKILL_ANIMS.length)];
      try {
        this.spineObject.animationState.setAnimation(0, anim, false);
        this.spineObject.animationState.addAnimation(0, "idle", 0, true);
      } catch {
        // Animation not available — fallback to attack or idle
        try {
          this.spineObject.animationState.setAnimation(0, "attack", false);
          this.spineObject.animationState.addAnimation(0, "idle", 0, true);
        } catch {
          this.playIdle();
        }
      }
    }
  }

  playHurt(): void {
    if (this.isSpine) {
      try {
        this.spineObject.animationState.setAnimation(0, "hit", false);
        this.spineObject.animationState.addAnimation(0, "idle", 0, true);
      } catch {
        this.playIdle();
      }
    }
  }

  playDeath(): void {
    if (this.isSpine) {
      try {
        this.spineObject.animationState.setAnimation(0, "die", false);
      } catch {
        // Animation not available — ignore
      }
    }
  }

  playVictory(): void {
    if (this.isSpine) {
      this.spineObject.animationState.setAnimation(0, "idle", false);
      this.spineObject.animationState.addAnimation(0, "idle", 0, true);
    }
  }

  /** Face right or left. Spine characters face left by default (positive scaleX). */
  setFacing(faceRight: boolean): void {
    if (this.isSpine) {
      this.spineObject.scaleX = faceRight
        ? -Math.abs(this.spineObject.scaleX)
        : Math.abs(this.spineObject.scaleX);
    }
  }

  /** Tween to a new position, playing run animation. */
  moveTo(targetX: number, targetY: number, duration = 2000): Promise<void> {
    if (this._moving) return Promise.resolve();
    this._moving = true;

    this.setFacing(targetX > this.x);
    this.playRun();

    // For fallback (container with circle), tween the circle directly
    const tweenTarget = this.isSpine
      ? this.spineObject
      : (this.spineObject as any)._circle;

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: tweenTarget,
        x: targetX,
        y: targetY,
        duration,
        ease: "Power2",
        onUpdate: () => {
          // Keep label in sync for fallback
          if (!this.isSpine) {
            const label = (this.spineObject as any)._label;
            if (label) {
              label.x = tweenTarget.x;
              label.y = tweenTarget.y - 56;
            }
          }
        },
        onComplete: () => {
          this._moving = false;
          this.playIdle();
          resolve();
        },
      });
    });
  }

  /** Make this agent interactable (click to select). */
  enableInteraction(): void {
    if (this.isSpine) {
      this.spineObject.setInteractive();
      this.spineObject.on("pointerdown", () => {
        EventBus.emit("focus-agent", this.address);
      });
    } else {
      const circle = (this.spineObject as any)._circle;
      if (circle) {
        circle.setInteractive();
        circle.on("pointerdown", () => {
          EventBus.emit("focus-agent", this.address);
        });
      }
    }
  }

  /* ── Idle roaming (ported from Godot world_map_scene.gd) ── */

  startWander(): void {
    if (this._roaming) return;
    this._roaming = true;
    this._roamTimer = 0.5 + Math.random() * 1.5; // stagger start
  }

  stopWander(): void {
    this._roaming = false;
    this._roamTarget = null;
  }

  /** Call every frame from WorldMapScene.update(). delta is in seconds. */
  updateRoam(delta: number): void {
    if (!this._roaming) return;
    if (this._moving) return; // event animation in progress

    if (!this._roamTarget) {
      // Paused — count down
      this._roamTimer -= delta;
      if (this._roamTimer <= 0) {
        // Pick random target (Y range halved for natural horizontal patrol)
        const tx = this.homeX + (Math.random() * 2 - 1) * ROAM_RANGE;
        const ty = this.homeY + (Math.random() * 2 - 1) * ROAM_RANGE * 0.5;
        this._roamTarget = { x: tx, y: ty };
        this.setFacing(tx > this.x);
        this.playRun();
      }
    } else {
      // Moving — step toward target at constant speed
      const dx = this._roamTarget.x - this.x;
      const dy = this._roamTarget.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        // Arrived
        this.spineObject.x = this._roamTarget.x;
        this.spineObject.y = this._roamTarget.y;
        this._roamTarget = null;
        this._roamTimer =
          ROAM_PAUSE_MIN + Math.random() * (ROAM_PAUSE_MAX - ROAM_PAUSE_MIN);
        // 30% chance to play a skill animation before idling
        if (Math.random() < 0.3) {
          this.playAttack();
        } else {
          this.playIdle();
        }
      } else {
        const step = ROAM_SPEED * delta;
        this.spineObject.x += (dx / dist) * step;
        this.spineObject.y += (dy / dist) * step;
      }
    }
  }

  destroy(): void {
    this._destroyed = true;
    this.stopWander();
    this.spineObject.destroy();
  }
}
