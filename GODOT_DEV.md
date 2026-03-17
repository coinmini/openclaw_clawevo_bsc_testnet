# Godot 客户端开发经验

Godot 客户端（`godot/` 目录）是独立的视觉演示层，不阻塞链上游戏 Phase 1 开发。
主题更新（宝可梦 → 修仙灵兽）计划在 Phase 2/3 进行。

---

## Spine 动画集成

### 版本兼容性

Spine 的 `.skel` 二进制文件有严格的版本要求。运行时只能加载与其匹配的 Spine 版本导出的 `.skel` 文件：

- 当前使用 spine-godot 运行时版本：**4.2**
- 原始美术资源（`spine_730/hero-spine/`）中的 `.skel` 是旧版 Spine 导出的，**无法直接使用**
- 必须用 Spine 编辑器打开 `.spine` 项目文件，重新导出为当前运行时版本的 `.skel`
- 导出后 `.atlas` 格式也会变化（旧版详细格式 → 新版紧凑格式），这是正常的

### 动画时长：必须动态获取，禁止硬编码

不同角色、不同动画的时长各不相同，硬编码等待时间会导致动画被截断或显示异常：

```
各角色动画时长示例：
  skill0:  2.000s（所有角色一致）
  skill1:  2.500s
  skill2:  2.000s
  skill4:  2.500s
  hurt:    0.500s
  die:     1.433s ~ 2.100s（角色间差异大）
  run:     0.667s ~ 1.000s
  stand:   1.667s ~ 2.333s
```

正确做法：在 `_discover_animations()` 时同时记录每个动画的 `get_duration()`，播放时通过 `get_animation_duration(anim_name)` 动态获取：

```gdscript
# 错误：硬编码 1.0 秒，skill4 的 2.5 秒动画会被截断 60%
_play_animation(chosen, false)
await get_tree().create_timer(1.0).timeout  # ← 不要这样做
_play_animation("stand", true)

# 正确：使用实际动画时长
var duration: float = get_animation_duration(chosen)
_play_animation(chosen, false)
await get_tree().create_timer(duration).timeout
_play_animation("stand", true)
```

### 动画验证脚本

可用 Godot headless 模式运行脚本批量检查所有角色的动画名和时长（`scripts/check_anims.gd`），用于：
- 确认导出后动画完整性（动画数量、时长是否合理）
- 对比不同版本的 `.skel` 文件差异

---

## 战斗场景背景

战斗背景从世界地图裁剪而来，每个区域对应一张独立背景图：

```
裁剪参数：
- 源图：world_map.jpeg (5504×3072)
- 裁剪区域：960×540（16:9），以区域 map_position 为中心
- 缩放到：320×180（游戏 viewport 尺寸）
- 输出：assets/images/battle_bgs/{region_id}.png
```

战斗场景通过 `region.id` 动态加载对应背景，默认回退到 `verdant_plains`。

---

## 世界地图敌人巡逻

地图上的敌人角色使用 `_process` 驱动的状态机实现小范围巡逻：

```
巡逻参数：
- 范围：区域原点 ±120px（水平）/ ±60px（垂直）
- 移动速度：80px/s
- 停顿时间：1.0s ~ 3.5s（随机）
- 初始延迟：随机错开，避免同步
```

状态通过 `marker.set_meta()` 存储（`roam_target`、`roam_timer`、`roam_moving`），移动时播放 `run` 动画并翻转朝向，到达后切回 `idle`。

---

> 相关文档：[SPINE_BATTLE_ANIMATIONS.md](SPINE_BATTLE_ANIMATIONS.md)
