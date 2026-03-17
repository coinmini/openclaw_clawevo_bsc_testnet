# 音频系统

## 架构

所有 BGM 由全局 `AudioManager`（autoload）统一管理，内部只有一个 `AudioStreamPlayer`，
调用 `play_*` 方法时会先停止当前音乐再切换，保证同一时间只有一首 BGM 播放。

## 音频文件

| 文件 | 用途 | 时机 |
|------|------|------|
| `assets/audio/topic.mp3` | 世界地图 BGM | 进入世界地图时播放 |
| `assets/audio/bgm/battle_1.mp3` | 战斗 BGM 1 | 进入战斗时随机选一首 |
| `assets/audio/bgm/battle_2.mp3` | 战斗 BGM 2 | 同上 |
| `assets/audio/bgm/battle_3.mp3` | 战斗 BGM 3 | 同上 |
| `assets/audio/bgm/battle_4.mp3` | 战斗 BGM 4 | 同上 |

## 关键文件

- **`src/autoload/audio_manager.gd`** — 全局音频管理器（autoload）
- **`src/ui/world/world_map_scene.gd`** — 调用 `AudioManager.play_world_bgm()`
- **`src/ui/battle/battle_scene.gd`** — 调用 `AudioManager.play_battle_bgm()`

## AudioManager API

```gdscript
AudioManager.play_world_bgm()    # 播放世界地图 BGM（topic.mp3，循环）
AudioManager.play_battle_bgm()   # 随机播放一首战斗 BGM（循环）
AudioManager.stop_bgm()          # 停止当前 BGM
```

## 音乐切换流程

```
main.gd
  └─ SceneManager.go_to_world_map()

world_map_scene.gd _ready()
  └─ AudioManager.play_world_bgm()     ← topic.mp3 开始播放

_check_battle_proximity() 触发战斗
  └─ SceneManager.go_to_battle_for_region()

battle_scene.gd _ready()
  └─ AudioManager.play_battle_bgm()    ← 自动停止 topic.mp3，随机播放战斗曲

战斗结束 → SceneManager.go_to_result() / go_to_world_map()

world_map_scene.gd _ready()
  └─ AudioManager.play_world_bgm()     ← 自动停止战斗曲，恢复 topic.mp3
```

## 添加新音乐

1. 将 MP3 文件放入 `assets/audio/` 或 `assets/audio/bgm/`
2. 用 Godot 编辑器打开项目，等待自动导入生成 `.import` 文件
3. 在 `audio_manager.gd` 中添加路径常量和对应的 `play_*` 方法
4. 在目标场景的 `_ready()` 中调用新方法

## 音量调节

当前统一音量为 `-10.0 dB`，可在 `audio_manager.gd` 中修改。
