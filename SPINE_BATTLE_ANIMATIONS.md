# Spine 战斗动画系统

## 角色资源

| 角色 ID | 路径 | 类型映射 | 说明 |
|---------|------|---------|------|
| act_1001 | `assets/characters/act_1001/` | grass | 草系 |
| act_1002 | `assets/characters/act_1002/` | fire | 火系 |
| act_1003 | `assets/characters/act_1003/` | water | 水系 |
| act_1004 | `assets/characters/act_1004/` | electric | 电系 |
| act_1050 | `assets/characters/act_1050/` | — | 主角（Hero，按 id=1050 直接匹配） |

每个角色目录包含：`.skel`（骨骼二进制）、`.atlas`（图集描述）、`.png`（纹理）。

## 动画名称（所有角色统一）

| 动画 | 名称 | 用途 | 循环 |
|------|------|------|------|
| stand | `stand` | 待机 | 是 |
| run | `run` | 跑动 | 是 |
| skill0 | `skill0` | 技能 0 | 否 |
| skill1 | `skill1` | 技能 1 | 否 |
| skill2 | `skill2` | 技能 2 | 否 |
| skill4 | `skill4` | 技能 4（注意：无 skill3） | 否 |
| hurt | `hurt` | 受击 | 否 |
| die | `die` | 死亡 | 否 |
| win_1 | `win_1` | 胜利 1 | 否 |
| win_2 | `win_2` | 胜利 2 | 否 |

## 关键文件

- **`src/rendering/spine_character.gd`** — Spine 角色加载与动画控制
- **`src/ui/battle/pokemon_display.gd`** — 战斗中角色显示与动画触发
- **`src/ui/battle/battle_scene.gd`** — 战斗流程控制

## 战斗动画调用链

```
battle_scene.gd                     pokemon_display.gd              spine_character.gd
─────────────────                   ──────────────────              ──────────────────
_animate_attack(event)
  ├─ attacker_display               .play_attack_flash()
  │                                   └─ _get_spine_node()
  │                                     └─ spine                    .play_attack()
  │                                                                   └─ 随机选择 skill0/1/2/4
  │
  ├─ defender_display               .play_hit_flash()
  │                                   └─ spine                      .play_hit()
  │                                                                   └─ 播放 hurt
  │
  └─ defender_display               .animate_hp_to(hp)
                                      └─ hp_bar 动画

_animate_events → "faint"
  └─ target_display                 .play_faint()
                                      └─ spine                      .play_death()
                                                                      └─ 播放 die
```

## 初始化机制

SpineSprite 添加到场景树后需要等待 2 帧才能访问动画数据：

```
load_character()
  ├─ 创建 SpineSprite, add_child()
  ├─ await 2 帧
  ├─ _discover_animations()  →  遍历 skeleton.get_data().get_animations()
  └─ _initialized = true
```

所有公开动画方法（play_attack、play_hit 等）在执行前会调用 `_wait_for_init()`，
最多等待 30 帧确保 Spine 初始化完成，避免因动画列表为空而跳过动画。

## 朝向控制

在 `pokemon_display.gd` 中通过 scale.x 正负控制朝向：

- 玩家方（左侧）：`Vector2(0.15, 0.15)` — 面朝右
- 对手方（右侧）：`Vector2(-0.12, 0.12)` — 面朝左（scale.x 取负值水平翻转）

## 添加新角色

1. 将 Spine 导出文件（`.skel`、`.atlas`、`.png`）放入 `assets/characters/act_XXXX/`
2. 在 `spine_character.gd` 的 `CHARACTER_PATHS` 中注册路径
3. 如果是类型映射，在 `TYPE_TO_CHARACTER` 中添加 `"类型": "act_XXXX"`
4. 如果按 ID 直接匹配，在 `pokemon_display.gd` 的 `_get_spine_character_id()` 中添加判断
5. 用 Godot 编辑器打开项目，等待 `.png` 自动导入生成 `.import` 文件
6. 确保动画名称遵循上述统一命名规范
