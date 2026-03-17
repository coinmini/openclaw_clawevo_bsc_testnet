import { Scene } from "phaser";

/** Roam parameters. */
const ROAM_RANGE = 150;
const ROAM_SPEED = 50;
const ROAM_PAUSE_MIN = 2.0;
const ROAM_PAUSE_MAX = 5.0;

/** Configuration for placing an NPC on the world map. */
export interface NpcConfig {
  /** Spine skeleton key (e.g. "shenshou_xuanwu-skel"). */
  readonly skelKey: string;
  /** Spine atlas key (e.g. "shenshou_xuanwu-atlas"). */
  readonly atlasKey: string;
  /** Display name shown above the NPC. */
  readonly name: string;
  /** World-space X position (also patrol home). */
  readonly x: number;
  /** World-space Y position (also patrol home). */
  readonly y: number;
  /** Scale factor (default 0.5). */
  readonly scale?: number;
  /** Idle animation name (default "idle"). */
  readonly idleAnim?: string;
  /** Walk/run animation name (default "sprint"). */
  readonly walkAnim?: string;
  /** Flip horizontally (default false). */
  readonly flipX?: boolean;
  /** Enable patrol roaming (default false). */
  readonly patrol?: boolean;
  /** Special animation played occasionally during patrol pause (e.g. "show"). */
  readonly specialAnim?: string;
}

/**
 * An NPC on the world map using Spine animation.
 * Supports idle loop + optional patrol roaming around its home position.
 */
export class NpcSprite {
  readonly scene: Scene;
  readonly config: NpcConfig;
  readonly spineObject: any;
  private readonly isSpine: boolean;
  private readonly scale: number;
  private nameLabel: Phaser.GameObjects.Text | null = null;

  /** Roaming state. */
  private readonly homeX: number;
  private readonly homeY: number;
  private roamTarget: { x: number; y: number } | null = null;
  private roamTimer = 0;
  private readonly defaultFlipX: boolean;
  private playingSpecial = false;
  private _culled = false;
  private _patrolPaused = false;

  get x(): number {
    return this.spineObject?.x ?? this.config.x;
  }

  get y(): number {
    return this.spineObject?.y ?? this.config.y;
  }

  constructor(scene: Scene, config: NpcConfig) {
    this.scene = scene;
    this.config = config;
    this.scale = config.scale ?? 0.5;
    this.homeX = config.x;
    this.homeY = config.y;
    this.defaultFlipX = config.flipX ?? false;

    const idleAnim = config.idleAnim ?? "idle";

    // Try creating Spine object
    const addFn = (scene.add as any).spine;
    if (typeof addFn === "function") {
      try {
        this.spineObject = addFn.call(
          scene.add,
          config.x,
          config.y,
          config.skelKey,
          config.atlasKey,
        );
        this.applyScale(this.defaultFlipX);
        this.isSpine = true;

        // Play idle loop
        try {
          this.spineObject.animationState.setAnimation(0, idleAnim, true);
        } catch {
          console.warn(`[NpcSprite] Animation "${idleAnim}" not found for ${config.name}`);
        }

        // Start patrol with a random initial delay
        if (config.patrol) {
          this.roamTimer = Math.random() * ROAM_PAUSE_MAX;
        }

        this.setupInteraction();
        return;
      } catch (e) {
        console.warn(`[NpcSprite] Spine failed for ${config.name}:`, e);
      }
    }

    // Fallback: simple placeholder
    this.isSpine = false;
    const circle = scene.add.circle(config.x, config.y, 50, 0x6366f1, 0.7);
    const label = scene.add
      .text(config.x, config.y, config.name.slice(0, 4), {
        fontSize: "22px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this.spineObject = scene.add.container(0, 0, [circle, label]);
  }

  /** Hide when outside viewport, show when inside. */
  setCulled(culled: boolean): void {
    if (culled === this._culled) return;
    this._culled = culled;
    if (this.spineObject) {
      this.spineObject.setVisible(!culled);
      if (this.isSpine) {
        this.spineObject.setActive(!culled);
      }
    }
  }

  /** Called every frame from WorldMapScene.update(). */
  updateRoam(dt: number): void {
    if (!this.isSpine || !this.config.patrol || this._patrolPaused) return;

    if (this.roamTarget) {
      // Moving toward target
      const dx = this.roamTarget.x - this.spineObject.x;
      const dy = this.roamTarget.y - this.spineObject.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 3) {
        // Arrived — pause
        this.spineObject.x = this.roamTarget.x;
        this.spineObject.y = this.roamTarget.y;
        this.roamTarget = null;
        this.roamTimer = ROAM_PAUSE_MIN + Math.random() * (ROAM_PAUSE_MAX - ROAM_PAUSE_MIN);

        // 30% chance to play special animation before idling
        if (this.config.specialAnim && Math.random() < 0.3) {
          this.playingSpecial = true;
          this.playAnimOnce(this.config.specialAnim, () => {
            this.playingSpecial = false;
            this.playAnim(this.config.idleAnim ?? "idle");
          });
        } else {
          this.playAnim(this.config.idleAnim ?? "idle");
        }
      } else {
        const step = ROAM_SPEED * dt;
        this.spineObject.x += (dx / dist) * step;
        this.spineObject.y += (dy / dist) * step;
      }
    } else {
      // Pausing — wait for special anim or count down
      if (this.playingSpecial) return;
      this.roamTimer -= dt;
      if (this.roamTimer <= 0) {
        // Pick new random target near home
        const tx = this.homeX + (Math.random() * 2 - 1) * ROAM_RANGE;
        const ty = this.homeY + (Math.random() * 2 - 1) * ROAM_RANGE * 0.5;
        this.roamTarget = { x: tx, y: ty };

        // Face movement direction
        // applyScale(true) → scaleX negative → face right
        // applyScale(false) → scaleX positive → face left (Spine default)
        const movingRight = tx > this.spineObject.x;
        this.applyScale(movingRight);

        this.playAnim(this.config.walkAnim ?? "sprint");
      }
    }
  }

  private playAnim(name: string): void {
    if (!this.isSpine) return;
    try {
      this.spineObject.animationState.setAnimation(0, name, true);
    } catch {
      // Animation not available — ignore
    }
  }

  /** Play a non-looping animation, then call onComplete. */
  private playAnimOnce(name: string, onComplete: () => void): void {
    if (!this.isSpine) { onComplete(); return; }
    try {
      const entry = this.spineObject.animationState.setAnimation(0, name, false);
      const listener = {
        complete: () => {
          this.spineObject.animationState.removeListener(listener);
          onComplete();
        },
      };
      this.spineObject.animationState.addListener(listener);
      // Safety: if entry is null (animation missing), complete immediately
      if (!entry) {
        this.spineObject.animationState.removeListener(listener);
        onComplete();
      }
    } catch {
      onComplete();
    }
  }

  private applyScale(flipped: boolean): void {
    this.spineObject.scaleX = flipped ? -this.scale : this.scale;
    this.spineObject.scaleY = this.scale;
  }

  private setupInteraction(): void {
    if (!this.isSpine) return;

    this.spineObject.setInteractive();

    this.spineObject.on("pointerover", () => {
      if (this.nameLabel) return;
      this.nameLabel = this.scene.add
        .text(this.spineObject.x, this.spineObject.y - 120, this.config.name, {
          fontSize: "24px",
          color: "#e0e7ff",
          backgroundColor: "rgba(30,27,75,0.8)",
          padding: { left: 8, right: 8, top: 4, bottom: 4 },
        })
        .setOrigin(0.5)
        .setDepth(10);
    });

    this.spineObject.on("pointerout", () => {
      if (this.nameLabel) {
        this.nameLabel.destroy();
        this.nameLabel = null;
      }
    });
  }

  /* ── Battle support (called from WorldMapScene hunt animations) ── */

  /** Face toward a world-space X position. */
  setFacing(targetX: number): void {
    if (!this.isSpine) return;
    const faceRight = targetX > this.spineObject.x;
    this.applyScale(faceRight);
  }

  /** Temporarily stop patrol (e.g. during battle). */
  pausePatrol(): void {
    this.roamTarget = null;
    this._patrolPaused = true;
  }

  /** Resume patrol after battle. */
  resumePatrol(): void {
    this._patrolPaused = false;
    this.roamTimer = ROAM_PAUSE_MIN + Math.random() * (ROAM_PAUSE_MAX - ROAM_PAUSE_MIN);
    this.playAnim(this.config.idleAnim ?? "idle");
  }

  /** Play attack animation once (non-looping). */
  playAttackOnce(): void {
    if (!this.isSpine) return;
    const anims = ["attack", "skill", "skill_exclusive"];
    for (const name of anims) {
      try {
        this.spineObject.animationState.setAnimation(0, name, false);
        this.spineObject.animationState.addAnimation(0, this.config.idleAnim ?? "idle", 0, true);
        return;
      } catch {
        // try next
      }
    }
  }

  /** Play hit reaction then return to idle. */
  playHit(): void {
    if (!this.isSpine) return;
    try {
      this.spineObject.animationState.setAnimation(0, "hit", false);
      this.spineObject.animationState.addAnimation(0, this.config.idleAnim ?? "idle", 0, true);
    } catch {
      this.playAnim(this.config.idleAnim ?? "idle");
    }
  }

  destroy(): void {
    if (this.nameLabel) {
      this.nameLabel.destroy();
      this.nameLabel = null;
    }
    this.spineObject.destroy();
  }
}
