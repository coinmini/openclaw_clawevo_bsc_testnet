import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { AgentSprite } from "../objects/AgentSprite";
import { NpcSprite, NpcConfig } from "../objects/NpcSprite";
import { pickCharacterId } from "../characterPicker";
import { REGIONS } from "@/lib/constants";

/** Agent data from GraphQL (players list). */
interface AgentData {
  readonly address: string;
  readonly element: number;
  readonly regionId: number;
}

/** Chat message from React for bubble display. */
interface ChatBubbleData {
  readonly sender: string;
  readonly content: string;
}

/** Encounter event: two agents @-mentioned each other in chat. */
interface EncounterData {
  readonly addressA: string;
  readonly addressB: string;
}

/** Animation event dispatched from React via EventBus. */
interface AnimEvent {
  readonly id: string;
  readonly type: "hunt" | "battle" | "treasure" | "cultivation" | "realm";
  readonly playerAddress: string;
  readonly regionId?: number;
  readonly playerBAddress?: string;
  readonly winner?: string;
  readonly playerAElement?: number;
  readonly playerBElement?: number;
}

const BUBBLE_LABELS: Record<string, string> = {
  hunt: "打野!",
  battle: "对战!",
  treasure: "挖宝!",
  cultivation: "修炼...",
  realm: "秘境!",
};

/** World size matches the map image (gemini_huasheng.png 2752×1536). */
const MAP_W = 2752;
const MAP_H = 1536;

/** Performance: max Spine agents rendered on the map (rest only in leaderboard). */
const MAX_VISIBLE_AGENTS = 60;
/** Max camera zoom level (2.5× allows close-up detail view). */
const MAX_ZOOM = 2.5;
/** Zoom level used when auto-focusing on player's agent. */
const FOCUS_ZOOM = 1.5;
/** Viewport culling padding in world pixels (prevents pop-in at edges). */
const CULL_PAD = 200;

// pickCharacterId imported from ../characterPicker

/** Four divine beasts placed at cardinal direction regions (四象). */
const DIVINE_BEAST_NPCS: readonly NpcConfig[] = [
  {
    skelKey: "shenshou_xuanwu-skel",
    atlasKey: "shenshou_xuanwu-atlas",
    name: "玄武",
    x: 0.5 * MAP_W,
    y: 0.28 * MAP_H,
    scale: 1.2,
    idleAnim: "idle",
  },
  {
    skelKey: "qinglong-skel",
    atlasKey: "qinglong-atlas",
    name: "青龙",
    x: 0.82 * MAP_W,
    y: 0.5 * MAP_H,
    scale: 0.5,
    idleAnim: "idle",
    walkAnim: "run",
    patrol: true,
    specialAnim: "attack",
  },
  {
    skelKey: "baihu-skel",
    atlasKey: "baihu-atlas",
    name: "白虎",
    x: 0.28 * MAP_W,
    y: 0.55 * MAP_H,
    scale: 0.35,
    idleAnim: "idle",
    walkAnim: "run",
    flipX: true,
    patrol: true,
    specialAnim: "show",
  },
  {
    skelKey: "zhuque-skel",
    atlasKey: "zhuque-atlas",
    name: "朱雀",
    x: 0.45 * MAP_W,
    y: 0.9 * MAP_H,
    scale: 0.35,
    idleAnim: "idle",
    walkAnim: "run",
    patrol: true,
    specialAnim: "show",
  },
];

/** 猎灵对象配置 — 每区域自定义怪物数量、ID、scale、位置偏移、名字. */
const MONSTER_CONFIGS: readonly {
  readonly regionId: number;
  readonly monsters: readonly { readonly id: number; readonly name: string; readonly scale: number; readonly dx: number; readonly dy: number }[];
}[] = [
  { regionId: 0, monsters: [ // 青云山
    { id: 2000055, name: "青冥巨鹏", scale: 0.4, dx: -240, dy: -60 },
  ]},
  { regionId: 1, monsters: [ // 冰霜峰
    { id: 2000057, name: "九尾灵狐", scale: 0.3, dx: -120, dy: -60 },
  ]},
  { regionId: 2, monsters: [ // 桃花源
    { id: 2000044, name: "枯魂妖树", scale: 0.4, dx: -400, dy: 240 },
    { id: 2000037, name: "噬人花妖", scale: 0.4, dx: 120, dy: 160 },
    { id: 2000049, name: "赤焰年兽", scale: 0.6, dx: 0, dy: 80 },
  ]},
  { regionId: 3, monsters: [ // 剑冢
    { id: 2000033, name: "棺中厉鬼", scale: 0.4, dx: 120, dy: -30 },
  ]},
  { regionId: 4, monsters: [ // 天枢殿
    { id: 2000032, name: "灵角仙鹿", scale: 0.4, dx: -240, dy: -200 },
    { id: 2000026, name: "玄罴", scale: 0.4, dx: 0, dy: 240 },
  ]},
  { regionId: 5, monsters: [ // 雷鸣原
    { id: 2000099, name: "雷震天将", scale: 0.6, dx: -120, dy: -60 },
  ]},
  { regionId: 6, monsters: [ // 流沙域
    { id: 2000095, name: "岩魔巨灵", scale: 0.4, dx: -120, dy: -60 },
    { id: 2000090, name: "黑蛟", scale: 0.4, dx: 120, dy: -30 },
    { id: 2000024, name: "夜魔", scale: 0.6, dx: 0, dy: 80 },
  ]},
  { regionId: 7, monsters: [ // 炎魔山
    { id: 2000091, name: "熔岩石魔", scale: 0.4, dx: 100, dy: 160 },
  ]},
  { regionId: 8, monsters: [ // 幽冥涡
    { id: 2000045, name: "幽冥天马", scale: 0.6, dx: 120, dy: -30 },
  ]},
];

/** Sit hero at 青云山 gate (static, no patrol). */
const QINGYUN_GATE_NPC: NpcConfig = {
  skelKey: "sit_hero-skel",
  atlasKey: "sit_hero-atlas",
  name: "青云山守门人",
  x: 0.18 * MAP_W,
  y: 0.3 * MAP_H,
  scale: 0.2,
  idleAnim: "idle",
  patrol: false,
};

/** Peach tree at 龙脊岭 (static, no patrol). */
const LONGJI_PEACH_TREE_NPC: NpcConfig = {
  skelKey: "peach_tree-skel",
  atlasKey: "peach_tree-atlas",
  name: "仙桃",
  x: 0.68 * MAP_W,
  y: 0.32 * MAP_H,
  scale: 0.3,
  idleAnim: "idle",
  patrol: false,
};

/** Wind look at 右下台风区 (static, no patrol). */
const WIND_LOOK_NPC: NpcConfig = {
  skelKey: "wind_look-skel",
  atlasKey: "wind_look-atlas",
  name: "风眼望台",
  x: 0.7 * MAP_W,
  y: 0.6 * MAP_H,
  scale: 0.15,
  idleAnim: "idle_role",
  patrol: false,
};

/** 打野/猎灵对象 — 每区域自定义数量, 用于 hunt 动画. */
const WILD_ANIMAL_NPCS: readonly (NpcConfig & { readonly regionId: number })[] =
  MONSTER_CONFIGS.flatMap(({ regionId, monsters }) => {
    const region = REGIONS[regionId];
    return monsters.map(({ id, name, scale, dx, dy }) => {
      const key = `npc_${id}`;
      return {
        skelKey: `${key}-skel`,
        atlasKey: `${key}-atlas`,
        name,
        x: region.x * MAP_W + dx,
        y: region.y * MAP_H + dy,
        scale,
        idleAnim: "idle",
        walkAnim: "run",
        patrol: true,
        specialAnim: "attack",
        regionId,
      };
    });
  });

/** All world NPCs: divine beasts + scene decorations (monsters handled separately). */
const WORLD_NPCS: readonly NpcConfig[] = [
  ...DIVINE_BEAST_NPCS,
  QINGYUN_GATE_NPC,
  LONGJI_PEACH_TREE_NPC,
  WIND_LOOK_NPC,
];

/** Pixel-art spritesheet NPC roaming state. */
interface PixelNpc {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly homeX: number;
  readonly homeY: number;
  readonly speed: number;
  target: { x: number; y: number } | null;
  timer: number;
  state: "idle" | "run" | "attack";
}

export class WorldMapScene extends Scene {
  private agents: Map<string, AgentSprite> = new Map();
  /** address → element cache for spawning agents with correct character. */
  private agentElements: Map<string, number> = new Map();
  private npcs: NpcSprite[] = [];
  /** 打野/猎灵对象, keyed by regionId for hunt animations. */
  private wildAnimals: Map<number, NpcSprite[]> = new Map();
  private pixelNpcs: PixelNpc[] = [];
  private mapImage!: Phaser.GameObjects.Video | Phaser.GameObjects.Image;
  private waitingText: Phaser.GameObjects.Text | null = null;
  private selectedAgent: string | null = null;
  private animating = false;
  private followingAgent: string | null = null;
  /** Per-region population count labels. */
  private regionBubbles: Map<number, Phaser.GameObjects.Text> = new Map();
  /** Address waiting to be focused once its agent sprite is spawned. */
  private pendingFocusAddress: string | null = null;
  /** Minimum zoom level (fit full map into viewport). Updated on resize. */
  private fitZoom = 0.5;

  constructor() {
    super("WorldMap");
  }

  create(): void {
    // -- World map background (video replaces 64 individual frame textures) --
    const mapVideo = this.add.video(MAP_W / 2, MAP_H / 2, "world-map-video");
    mapVideo.setOrigin(0.5);
    mapVideo.setDepth(-1);
    mapVideo.play(true); // loop = true, noAudio set in preload enables autoplay
    // Wait for first frame to render, then force display size to match world
    mapVideo.on("play", () => {
      mapVideo.setDisplaySize(MAP_W, MAP_H);
    });
    // Also set immediately in case play fires synchronously
    mapVideo.setDisplaySize(MAP_W, MAP_H);
    mapVideo.on("error", () => {
      console.warn("[WorldMap] Video playback error");
    });
    this.mapImage = mapVideo;

    // -- Static cloud overlay (on top of animated map, below NPCs/agents) --
    if (this.textures.exists("cloud-overlay")) {
      this.add.image(MAP_W / 2, MAP_H / 2, "cloud-overlay");
    }

    // -- Camera: show entire map fitted to viewport, allow zoom & drag --
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);

    // Initial zoom to fit the full map into the game viewport (Contain mode to prevent cropping)
    this.fitZoom = Math.min(this.scale.width / MAP_W, this.scale.height / MAP_H);
    cam.setZoom(this.fitZoom);
    cam.centerOn(MAP_W / 2, MAP_H / 2);

    // Handle viewport resize (RESIZE scale mode)
    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      cam.setSize(gameSize.width, gameSize.height);
      this.fitZoom = Math.min(gameSize.width / MAP_W, gameSize.height / MAP_H);
      if (cam.zoom < this.fitZoom) {
        cam.setZoom(this.fitZoom);
      }
    });

    // Drag to pan
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && !this.animating) {
        this.followingAgent = null;
        cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
        cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
      }
    });

    // Scroll wheel to zoom
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _gameObjects: unknown[],
        _deltaX: number,
        deltaY: number
      ) => {
        const newZoom = Phaser.Math.Clamp(
          cam.zoom - deltaY * 0.001,
          this.fitZoom, // min zoom = full map view
          MAX_ZOOM
        );
        cam.setZoom(newZoom);
      }
    );

    // -- Listen for events from React --
    EventBus.on("update-agents", this.onUpdateAgents, this);
    EventBus.on("focus-agent", this.onFocusAgent, this);
    EventBus.on("focus-my-agent", this.onFocusMyAgent, this);
    EventBus.on("play-animation", this.onPlayAnimation, this);
    EventBus.on("chat-bubble", this.onChatBubble, this);
    EventBus.on("agent-encounter", this.onAgentEncounter, this);

    // -- Region labels --
    for (const region of REGIONS) {
      this.add
        .text(region.x * MAP_W, region.y * MAP_H - 80, region.name, {
          fontSize: "28px",
          color: "#9ca3af",
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: { left: 4, right: 4, top: 2, bottom: 2 },
        })
        .setOrigin(0.5)
        .setAlpha(0.8);
    }

    // -- World NPCs (Spine) --
    for (const npcConfig of WORLD_NPCS) {
      this.npcs.push(new NpcSprite(this, npcConfig));
    }

    // -- 打野/猎灵对象 (每区域 3 个) --
    for (const wildConfig of WILD_ANIMAL_NPCS) {
      const npc = new NpcSprite(this, wildConfig);
      this.npcs.push(npc);
      const arr = this.wildAnimals.get(wildConfig.regionId) ?? [];
      arr.push(npc);
      this.wildAnimals.set(wildConfig.regionId, arr);
    }

    // -- Pixel spritesheet NPC (Rika) --
    this.anims.create({
      key: "rika-idle-anim",
      frames: this.anims.generateFrameNumbers("rika-idle", {
        start: 0,
        end: 11,
      }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "rika-run-anim",
      frames: this.anims.generateFrameNumbers("rika-run", {
        start: 0,
        end: 11,
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "rika-attack-anim",
      frames: this.anims.generateFrameNumbers("rika-attack", {
        start: 0,
        end: 15,
      }),
      frameRate: 12,
      repeat: 0,
    });
    const rikaSprite = this.add.sprite(0.35 * MAP_W, 0.4 * MAP_H, "rika-idle");
    rikaSprite.setScale(0.3);
    rikaSprite.play("rika-idle-anim");
    this.pixelNpcs.push({
      sprite: rikaSprite,
      homeX: 0.35 * MAP_W,
      homeY: 0.4 * MAP_H,
      speed: 50,
      target: null,
      timer: 1 + Math.random() * 2,
      state: "idle",
    });

    // -- Waiting text (shown until real agent data arrives) --
    this.waitingText = this.add
      .text(MAP_W / 2, MAP_H / 2 + 120, "等待修仙者数据...", {
        fontSize: "36px",
        color: "#9ca3af",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
      })
      .setOrigin(0.5);

    // -- World BGM (deferred until user gesture to avoid AudioContext error) --
    this.startBgmOnGesture();

    EventBus.emit("current-scene-ready", this);
  }

  /** Incremental update: add new agents, remove stale ones, keep existing positions.
   *  When total players exceed MAX_VISIBLE_AGENTS, sample evenly per region. */
  private updateAgents(agentDataList: readonly AgentData[]): void {
    // Dismiss waiting text on first data
    if (this.waitingText) {
      this.waitingText.destroy();
      this.waitingText = null;
    }

    // Update region population bubbles
    this.updateRegionBubbles(agentDataList);

    // Cache element for every known player (used by getOrSpawnAgent)
    for (const data of agentDataList) {
      this.agentElements.set(data.address, data.element);
    }

    // Region-based sampling: pick up to MAX_VISIBLE_AGENTS spread evenly
    const selected = this.sampleAgents(agentDataList);
    const selectedAddrs = new Set(selected.map((d) => d.address));

    // Remove agents no longer selected
    for (const [addr, agent] of this.agents) {
      if (!selectedAddrs.has(addr)) {
        agent.destroy();
        this.agents.delete(addr);
      }
    }

    // Add new agents (skip already-existing ones to preserve position)
    for (const data of selected) {
      if (this.agents.has(data.address)) continue;

      const region = REGIONS[data.regionId] ?? REGIONS[0];
      const x = region.x * MAP_W;
      const y = region.y * MAP_H;
      const characterId = pickCharacterId(data.address);

      const agent = new AgentSprite(this, x, y, characterId, data.address);
      agent.enableInteraction();
      agent.startWander();
      this.agents.set(data.address, agent);
    }

    // Deferred focus: if a focus was requested before the agent was spawned
    if (this.pendingFocusAddress && this.agents.has(this.pendingFocusAddress)) {
      this.focusOnAgent(this.pendingFocusAddress);
    }
  }

  /** Sample agents evenly across regions, capped at MAX_VISIBLE_AGENTS total. */
  private sampleAgents(
    agentDataList: readonly AgentData[]
  ): readonly AgentData[] {
    if (agentDataList.length <= MAX_VISIBLE_AGENTS) return agentDataList;

    // Group by region
    const byRegion = new Map<number, AgentData[]>();
    for (const data of agentDataList) {
      const rid = data.regionId;
      const arr = byRegion.get(rid);
      if (arr) {
        arr.push(data);
      } else {
        byRegion.set(rid, [data]);
      }
    }

    const regionCount = Math.max(byRegion.size, 1);
    const perRegion = Math.ceil(MAX_VISIBLE_AGENTS / regionCount);
    const result: AgentData[] = [];

    for (const agents of byRegion.values()) {
      result.push(...agents.slice(0, perRegion));
    }

    return result;
  }

  /* ---------- Event handlers ---------- */

  private onUpdateAgents(...args: unknown[]): void {
    this.updateAgents(args[0] as AgentData[]);
  }

  private onFocusAgent(...args: unknown[]): void {
    const address = args[0] as string;
    this.selectedAgent = address;
    this.followingAgent = address;
    const agent = this.agents.get(address);
    if (agent) {
      this.cameras.main.pan(agent.x, agent.y, 500, "Power2");
    }
    EventBus.emit("agent-selected", address);
  }

  private onFocusMyAgent(...args: unknown[]): void {
    const { address } = args[0] as { address: string };
    this.focusOnAgent(address);
  }

  /** Pan + zoom camera to an agent. If not spawned yet, defer until updateAgents. */
  private focusOnAgent(address: string): void {
    const agent = this.agents.get(address);
    if (agent) {
      this.pendingFocusAddress = null;
      this.followingAgent = address;
      this.selectedAgent = address;
      const cam = this.cameras.main;
      cam.pan(agent.x, agent.y, 800, "Power2");
      cam.zoomTo(FOCUS_ZOOM, 800, "Power2");
      EventBus.emit("agent-selected", address);
    } else {
      // Agent not yet spawned — remember and focus later in updateAgents
      this.pendingFocusAddress = address;
    }
  }

  private onPlayAnimation(...args: unknown[]): void {
    const event = args[0] as AnimEvent;
    if (this.animating) return; // skip if already playing
    this.animateEvent(event);
  }

  private onChatBubble(...args: unknown[]): void {
    const data = args[0] as ChatBubbleData;
    const agent = this.agents.get(data.sender);
    if (!agent) return;
    // Truncate long messages for the bubble
    const text =
      data.content.length > 20
        ? data.content.slice(0, 20) + "..."
        : data.content;
    this.showBubble(agent, text);
  }

  private async onAgentEncounter(...args: unknown[]): Promise<void> {
    const data = args[0] as EncounterData;
    const agentA = this.agents.get(data.addressA);
    const agentB = this.agents.get(data.addressB);
    if (!agentA || !agentB) return;
    if (this.animating) return;

    // Pause both agents' roaming
    agentA.stopWander();
    agentB.stopWander();

    // Move both toward midpoint
    const midX = (agentA.x + agentB.x) / 2;
    const midY = (agentA.y + agentB.y) / 2;
    const offset = 40;

    await Promise.all([
      agentA.moveTo(midX - offset, midY, 1200),
      agentB.moveTo(midX + offset, midY, 1200),
    ]);

    // Face each other
    agentA.setFacing(true);
    agentB.setFacing(false);

    // Show greeting bubbles
    this.showBubble(agentA, "道友有礼");
    await this.delay(1500);
    this.showBubble(agentB, "幸会幸会");
    await this.delay(2000);

    // Resume roaming
    agentA.startWander();
    agentB.startWander();
  }

  /* ---------- Animation playback ---------- */

  private async animateEvent(event: AnimEvent): Promise<void> {
    this.animating = true;

    try {
      switch (event.type) {
        case "hunt":
          await this.animateHunt(event);
          break;
        case "treasure":
          await this.animateTreasure(event);
          break;
        case "battle":
          this.startBattle(event);
          break;
        case "cultivation":
          await this.animateCultivation(event);
          break;
        case "realm":
          await this.animateRealm(event);
          break;
      }
    } finally {
      this.animating = false;
      EventBus.emit("animation-done");
    }
  }

  private animateHunt(event: AnimEvent): void {
    const regionId = event.regionId ?? 0;
    // Find the monster config for this region to get spine key and name
    const regionConfig = MONSTER_CONFIGS.find((c) => c.regionId === regionId);
    const monsterInfo = regionConfig?.monsters[
      Math.floor(Math.random() * (regionConfig?.monsters.length ?? 1))
    ];

    const monsterCharId = monsterInfo ? `npc_${monsterInfo.id}` : undefined;
    const monsterName = monsterInfo?.name ?? "怪物";

    EventBus.emit("start-battle", {
      mode: "hunt",
      playerAAddress: event.playerAddress,
      playerBAddress: "0x0",
      playerAElement: event.playerAElement ?? 1,
      playerBElement: 0,
      winner: event.winner ?? event.playerAddress,
      monsterCharId,
      monsterName,
    });
  }

  private async animateTreasure(event: AnimEvent): Promise<void> {
    const agent = this.getOrSpawnAgent(
      event.playerAddress,
      event.playerAElement
    );
    const region = REGIONS[event.regionId ?? 0] ?? REGIONS[0];
    const tx = region.x * MAP_W;
    const ty = region.y * MAP_H;

    await agent.moveTo(tx, ty, 1500);
    this.showBubble(agent, BUBBLE_LABELS.treasure);
    agent.playAttack();
    await this.delay(1200);
  }

  private startBattle(event: AnimEvent): void {
    // Transition to BattleScene
    EventBus.emit("start-battle", {
      playerAAddress: event.playerAddress,
      playerBAddress: event.playerBAddress ?? "0x0",
      playerAElement: event.playerAElement ?? 1,
      playerBElement: event.playerBElement ?? 3,
      winner: event.winner ?? event.playerAddress,
    });
  }

  private async animateCultivation(event: AnimEvent): Promise<void> {
    const agent = this.getOrSpawnAgent(
      event.playerAddress,
      event.playerAElement
    );
    // Move to map center for cultivation
    await agent.moveTo(MAP_W / 2, MAP_H / 2, 2000);
    this.showBubble(agent, BUBBLE_LABELS.cultivation);
    await this.delay(2000);
  }

  private async animateRealm(event: AnimEvent): Promise<void> {
    const agent = this.getOrSpawnAgent(
      event.playerAddress,
      event.playerAElement
    );
    const region = REGIONS[event.regionId ?? 0] ?? REGIONS[0];
    const tx = region.x * MAP_W;
    const ty = region.y * MAP_H;

    await agent.moveTo(tx, ty, 1500);
    this.showBubble(agent, BUBBLE_LABELS.realm);
    agent.playAttack();
    await this.delay(1500);
  }

  /* ---------- Helpers ---------- */

  private startBgmOnGesture(): void {
    // If audio context is already running (e.g. returning from battle), play immediately
    if (this.sound.locked === false) {
      this.tryPlayWorldBgm();
      return;
    }
    // Otherwise wait for first user interaction
    this.sound.once("unlocked", () => {
      this.tryPlayWorldBgm();
    });
  }

  private tryPlayWorldBgm(): void {
    const existing = this.sound.get("bgm-world");
    if (existing && (existing as any).isPlaying) return;
    if (existing) existing.stop();
    this.sound.play("bgm-world", { loop: true, volume: 0.3 });
  }

  private getOrSpawnAgent(address: string, element?: number): AgentSprite {
    const existing = this.agents.get(address);
    if (existing) return existing;

    // Use provided element, cached element, or fallback to 1 (木)
    const resolvedElement = element ?? this.agentElements.get(address) ?? 1;
    const characterId = pickCharacterId(address);

    // Spawn at a random region
    const regionIdx = Math.floor(Math.random() * REGIONS.length);
    const region = REGIONS[regionIdx];
    const agent = new AgentSprite(
      this,
      region.x * MAP_W,
      region.y * MAP_H,
      characterId,
      address
    );
    agent.enableInteraction();
    agent.startWander();
    this.agents.set(address, agent);
    this.agentElements.set(address, resolvedElement);
    return agent;
  }

  /** Create or update per-region population count labels. */
  private updateRegionBubbles(agentDataList: readonly AgentData[]): void {
    // Count players per region
    const counts = new Map<number, number>();
    for (const data of agentDataList) {
      counts.set(data.regionId, (counts.get(data.regionId) ?? 0) + 1);
    }

    for (const region of REGIONS) {
      const count = counts.get(region.id) ?? 0;
      const existing = this.regionBubbles.get(region.id);

      if (count === 0) {
        // No players — hide bubble if it exists
        if (existing) {
          existing.setVisible(false);
        }
        continue;
      }

      const label = `⚡ ${count} 人`;
      if (existing) {
        existing.setText(label).setVisible(true);
      } else {
        const bubble = this.add
          .text(region.x * MAP_W, region.y * MAP_H - 50, label, {
            fontSize: "22px",
            color: "#fbbf24",
            backgroundColor: "rgba(0,0,0,0.6)",
            padding: { left: 6, right: 6, top: 2, bottom: 2 },
          })
          .setOrigin(0.5);
        this.regionBubbles.set(region.id, bubble);
      }
    }
  }

  private showBubble(agent: AgentSprite, text: string): void {
    const bubble = this.add
      .text(agent.x, agent.y - 100, text, {
        fontSize: "32px",
        color: "#fbbf24",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { left: 6, right: 6, top: 3, bottom: 3 },
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: bubble,
      y: bubble.y - 30,
      alpha: 0,
      duration: 2000,
      ease: "Power2",
      onComplete: () => bubble.destroy(),
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }

  /* ---------- Lifecycle ---------- */

  update(_time: number, delta: number): void {
    const dt = delta / 1000; // ms → seconds

    // Viewport culling — only update agents inside the camera view + padding
    const view = this.cameras.main.worldView;
    const vx = view.x - CULL_PAD;
    const vy = view.y - CULL_PAD;
    const vr = view.right + CULL_PAD;
    const vb = view.bottom + CULL_PAD;

    for (const agent of this.agents.values()) {
      const inView =
        agent.x >= vx && agent.x <= vr && agent.y >= vy && agent.y <= vb;
      agent.setCulled(!inView);
      if (inView) {
        agent.updateRoam(dt);
      }
    }

    // NPCs — viewport culling + roam update
    for (const npc of this.npcs) {
      const inView = npc.x >= vx && npc.x <= vr && npc.y >= vy && npc.y <= vb;
      npc.setCulled(!inView);
      if (inView) {
        npc.updateRoam(dt);
      }
    }

    // Pixel NPCs — roam update with idle/run/attack states
    for (const pnpc of this.pixelNpcs) {
      const s = pnpc.sprite;
      const inView = s.x >= vx && s.x <= vr && s.y >= vy && s.y <= vb;
      s.setVisible(inView);
      s.setActive(inView);
      if (!inView) continue;

      // Skip update while attack animation is playing
      if (pnpc.state === "attack") continue;

      if (pnpc.target) {
        const dx = pnpc.target.x - s.x;
        const dy = pnpc.target.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 3) {
          s.x = pnpc.target.x;
          s.y = pnpc.target.y;
          pnpc.target = null;
          pnpc.timer = 2 + Math.random() * 3;

          // 30% chance to play attack, otherwise idle
          if (Math.random() < 0.3) {
            pnpc.state = "attack";
            s.play("rika-attack-anim");
            s.once("animationcomplete", () => {
              pnpc.state = "idle";
              s.play("rika-idle-anim");
            });
          } else {
            pnpc.state = "idle";
            s.play("rika-idle-anim");
          }
        } else {
          const step = pnpc.speed * dt;
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
        }
      } else {
        pnpc.timer -= dt;
        if (pnpc.timer <= 0) {
          const tx = pnpc.homeX + (Math.random() * 2 - 1) * 150;
          const ty = pnpc.homeY + (Math.random() * 2 - 1) * 75;
          pnpc.target = { x: tx, y: ty };
          s.setFlipX(tx < s.x);
          pnpc.state = "run";
          s.play("rika-run-anim");
        }
      }
    }

    // Camera follow selected agent
    if (this.followingAgent) {
      const agent = this.agents.get(this.followingAgent);
      if (agent) {
        this.cameras.main.centerOn(agent.x, agent.y);
      }
    }

    // Push selected agent screen position to React every frame
    if (this.selectedAgent) {
      const agent = this.agents.get(this.selectedAgent);
      if (agent) {
        const cam = this.cameras.main;
        const sx = (agent.x - cam.worldView.x) * cam.zoom;
        const sy = (agent.y - cam.worldView.y) * cam.zoom;
        EventBus.emit("agent-screen-pos", { x: sx, y: sy });
      }
    }
  }

  shutdown(): void {
    EventBus.off("update-agents", this.onUpdateAgents, this);
    EventBus.off("focus-agent", this.onFocusAgent, this);
    EventBus.off("focus-my-agent", this.onFocusMyAgent, this);
    EventBus.off("play-animation", this.onPlayAnimation, this);
    EventBus.off("chat-bubble", this.onChatBubble, this);
    EventBus.off("agent-encounter", this.onAgentEncounter, this);
    this.sound.stopByKey("bgm-world");
    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();
    this.agentElements.clear();
    for (const bubble of this.regionBubbles.values()) {
      bubble.destroy();
    }
    this.regionBubbles.clear();
    for (const npc of this.npcs) {
      npc.destroy();
    }
    this.npcs = [];
    for (const pnpc of this.pixelNpcs) {
      pnpc.sprite.destroy();
    }
    this.pixelNpcs = [];
  }
}
