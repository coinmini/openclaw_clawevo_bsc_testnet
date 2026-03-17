import { Scene } from "phaser";

/**
 * On-demand Spine asset loader with LRU eviction.
 * Only agent characters (NPC_SPINE_IDS) are loaded lazily;
 * core NPCs, monsters, and player characters are still preloaded in BootScene.
 */

/** Max number of lazily-loaded agent characters to keep cached. */
const MAX_CACHED = 80;

/** Singleton state shared across scene changes. */
const loadedKeys = new Set<string>();
const lruOrder: string[] = [];
const loadingPromises = new Map<string, Promise<void>>();

/** Touch a key in the LRU list (move to end = most recently used). */
function touchLru(charId: string): void {
  const idx = lruOrder.indexOf(charId);
  if (idx >= 0) lruOrder.splice(idx, 1);
  lruOrder.push(charId);
}

/** Evict oldest cached characters if over the limit. */
function evictIfNeeded(scene: Scene): void {
  while (lruOrder.length > MAX_CACHED) {
    const oldest = lruOrder.shift();
    if (!oldest) break;
    // Remove spine data from Phaser caches
    try {
      const skelKey = `${oldest}-skel`;
      const atlasKey = `${oldest}-atlas`;
      // Remove spine skeleton data from the plugin cache
      const spinePlugin = (scene as any).spine;
      if (spinePlugin?.cache) {
        spinePlugin.cache.delete(skelKey);
        spinePlugin.cache.delete(atlasKey);
      }
      // Remove texture atlas from Phaser texture manager
      if (scene.textures.exists(atlasKey)) {
        scene.textures.remove(atlasKey);
      }
    } catch {
      // Non-critical — just log
      console.warn(`[SpineAssetLoader] Failed to evict ${oldest}`);
    }
    loadedKeys.delete(oldest);
  }
}

/**
 * Check if a character's Spine assets are already loaded.
 */
export function isCharacterLoaded(charId: string): boolean {
  return loadedKeys.has(charId);
}

/**
 * Load a character's Spine assets on-demand.
 * Returns immediately if already loaded. Deduplicates concurrent requests.
 */
export function loadCharacter(
  scene: Scene,
  charId: string
): Promise<void> {
  if (loadedKeys.has(charId)) {
    touchLru(charId);
    return Promise.resolve();
  }

  // Deduplicate: if already loading this character, return the same promise
  const existing = loadingPromises.get(charId);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const loader = scene.load as any;
    if (typeof loader.spineBinary !== "function") {
      reject(new Error("SpinePlugin not available"));
      return;
    }

    const skelKey = `${charId}-skel`;
    const atlasKey = `${charId}-atlas`;

    // Determine file path based on charId pattern
    const basePath = `/assets/characters/${charId}/${charId}`;
    loader.spineBinary(skelKey, `${basePath}.skel`);
    loader.spineAtlas(atlasKey, `${basePath}.atlas`);

    scene.load.once("complete", () => {
      loadedKeys.add(charId);
      touchLru(charId);
      evictIfNeeded(scene);
      loadingPromises.delete(charId);
      resolve();
    });

    scene.load.once("loaderror", (file: any) => {
      loadingPromises.delete(charId);
      console.warn(`[SpineAssetLoader] Failed to load ${charId}:`, file?.url);
      reject(new Error(`Failed to load ${charId}`));
    });

    scene.load.start();
  });

  loadingPromises.set(charId, promise);
  return promise;
}

/**
 * Preload a batch of characters (used for visible agents).
 * Non-blocking — agents will use placeholder until loaded.
 */
export function preloadBatch(
  scene: Scene,
  charIds: readonly string[]
): Promise<void> {
  const toLoad = charIds.filter((id) => !loadedKeys.has(id));
  if (toLoad.length === 0) return Promise.resolve();

  return Promise.allSettled(toLoad.map((id) => loadCharacter(scene, id))).then(
    () => {}
  );
}
