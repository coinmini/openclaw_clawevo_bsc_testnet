# 前端内存优化方案

## Context

游戏当前内存占用达到 1GB。行业基准：轻量 2D 网页游戏 ~280MB，中等 ~487MB，复杂 3D ~850MB。
我们的 2D 修仙游戏不应该超过 400-500MB。

## 问题根因分析（按严重度排序）


### 2. [严重] 所有资源启动时全部预加载 — ~39MB 磁盘 / ~100+MB 解码后

`BootScene.ts` 一次性加载：
- 9 套 Spine 角色（5玩家 + 4神兽）~7MB
- 世界地图 7.1MB PNG（解码后 ~16MB RGBA）
- 6 张战斗背景 ~730KB
- 6 首音频 ~20MB

战斗背景 + 战斗音乐在大地图阶段完全用不到。

### 3. [中等] seenEventIds 无限增长

`useGameStore.ts:95` 每次 poll 创建新 Set，事件 ID 永不清理。

### 4. [中等] 世界地图 7.1MB (解码后 ~2752×1536×4 = ~16MB)

单张大图占用显著 GPU 纹理内存。

## 优化方案


### 方案 B：按需加载资源（分场景延迟加载）

**文件**: `web/src/game/scenes/BootScene.ts`

启动时只加载大地图必需的资源：
- 世界地图 + 世界BGM + 5 套玩家角色 + 4 套 NPC
- **不加载**: 6 张战斗背景 + 5 首战斗 BGM（~21MB）

进入战斗时再动态加载对应背景 + 1首音乐。



### 方案 D：清理 seenEventIds

**文件**: `web/src/stores/useGameStore.ts`

在 `enqueueAnimations` 中限制 Set 大小，超过 500 条时清除旧的。

### 方案 E：音频按需加载 + 用完释放

战斗结束后释放战斗 BGM，回到大地图时不保留战斗资源。



 
## 实现文件

- `web/src/game/scenes/BootScene.ts` — 拆分预加载
- `web/src/game/scenes/WorldMapScene.ts` — 降低 MAX_VISIBLE_AGENTS
- `web/src/game/scenes/BattleScene.ts` — 动态加载 + 退出清理
- `web/src/stores/useGameStore.ts` — seenEventIds 上限
 
## 验证

1. Chrome DevTools → Memory tab 对比优化前后 JS Heap + GPU Memory
2. `performance.memory.usedJSHeapSize` 输出到控制台
3. 确认战斗场景切换正常（延迟加载不影响体验）
