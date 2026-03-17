# Spine CLI 命令行工具参考

> 来源：[Spine 官方文档 - Command line interface](https://esotericsoftware.com/spine-command-line-interface)

Spine CLI 允许通过命令行批量导出项目、打包纹理图集等，适合集成到构建流水线中。

## 快速参考

| 命令 | 用途 | 示例 |
|------|------|------|
| `-e` | 导出 JSON/Binary/图片/视频 | `Spine -i project.spine -o out/ -e binary+pack` |
| `-r` | 导入骨架到项目 | `Spine -i skeleton.json -o project.spine -r name` |
| `-m` | 动画清理 | `Spine -i project.spine -m` |
| `-p` | 纹理图集打包 | `Spine -i images/ -o out/ -p atlas_name` |
| `-c` | 纹理图集解包 | `Spine -i atlas_images/ -o out/ -c atlas.atlas` |
| `-i` (无其他) | 查看项目信息 | `Spine -i project.spine` |

## Mac 调用方式

```bash
SPINE="/Applications/Spine.app/Contents/MacOS/Spine"

# 后续命令中的 Spine 均指此路径
$SPINE -e /path/to/export.json
```

## 1. 导出（Export）

```
Spine [-i <path>] [-m] [-o <path>] -e <path>
Spine [-i <path>] [-m] [-o <path>] -e json[+pack]|binary[+pack]
```

| 参数 | 说明 |
|------|------|
| `-i, --input` | 输入路径（项目/文件夹/数据文件），覆盖导出 JSON 中的路径 |
| `-o, --output` | 输出路径（文件或文件夹），覆盖导出 JSON 中的路径 |
| `-e, --export` | 导出设置 JSON 文件路径，或快捷值 `json` / `binary` / `json+pack` / `binary+pack` |
| `-m, --clean` | 导出前执行动画清理（不修改源项目文件） |

**导出设置 JSON** 通过 Spine 编辑器的 Export 对话框底部 Save 按钮生成。

### 常用导出示例

```bash
# 使用导出设置文件
$SPINE -i project.spine -o output/ -e export_settings.json

# 快捷导出 binary + 自动打包纹理
$SPINE -i project.spine -o output/ -e binary+pack

# 批量导出多个项目
$SPINE -e export1.json -e export2.json

# 指定编辑器版本 + 导出
$SPINE --update 4.2.xx -i project.spine -o output/ -e binary+pack
```

## 2. 纹理图集打包（Pack）

```
Spine -i <path> [-j <path>]... -o <path> -p <name>
Spine -i <path> [-j <path>]... -o <path> [-n <name>] -p <path>
```

| 参数 | 说明 |
|------|------|
| `-i, --input` | 待打包图片所在文件夹 |
| `-o, --output` | 输出文件夹（atlas + PNG） |
| `-p, --pack` | 图集名称（使用默认设置），或打包设置 JSON 文件路径 |
| `-n, --name` | 图集文件名前缀（当 `-p` 是设置文件时可选） |
| `-j, --project` | 关联项目文件（mesh 白边裁剪时参考） |

### 打包示例

```bash
# 默认设置打包，输出 atlas_name.atlas + atlas_name.png
$SPINE -i images/ -o output/ -p atlas_name

# 使用自定义打包设置
$SPINE -i images/ -o output/ -n myatlas -p pack_settings.json

# 关联项目（防止 mesh 区域被白边裁剪误裁）
$SPINE -i images/ -j project.spine -o output/ -p atlas_name
```

> **提示**：输入文件夹中可放置 `pack.json` 覆盖默认打包参数。

## 3. 纹理图集解包（Unpack）

```
Spine -i <path> -o <path> -c <path>
```

| 参数 | 说明 |
|------|------|
| `-i, --input` | 包含 atlas PNG 图片的文件夹 |
| `-o, --output` | 解包后单独图片的输出文件夹 |
| `-c, --unpack` | atlas 文件路径 |

```bash
$SPINE -i atlas_folder/ -o unpacked_images/ -c myatlas.atlas
```

## 4. 导入（Import）

```
Spine -i <path> [-s <scale>] -o <path> -r [<name>]
```

| 参数 | 说明 |
|------|------|
| `-i, --input` | 输入（项目/.json/.skel 文件或包含它们的文件夹） |
| `-o, --output` | 目标项目文件（不存在则自动创建） |
| `-s, --scale` | 导入前缩放比例 |
| `-r, --import` | 执行骨架导入，可指定重命名 |

```bash
# 将 JSON 数据导入项目并重命名骨架
$SPINE -i skeleton.json -o target_project.spine -r newSkeletonName

# 缩放后导入
$SPINE -i source.spine -s 0.5 -o target.spine -r
```

## 5. 动画清理（Clean up）

```
Spine -i <path> -m
```

对项目中所有动画执行清理并保存。输入可以是 `.spine` 文件或包含 `.spine` 文件的文件夹。

```bash
$SPINE -i project.spine -m
```

## 6. 项目信息（Info）

```
Spine -i <path>
```

输出项目版本号、动画数量等元信息。

```bash
$SPINE -i project.spine
```

## 高级参数

| 参数 | 说明 |
|------|------|
| `-Xmx2048m` | 最大内存（默认 2048MB） |
| `--update <ver>` | 指定编辑器版本（如 `4.2.xx` 获取最新补丁） |
| `--trace` | 启用详细日志 |
| `--clean-all` | 对所有导出执行动画清理 |
| `--ignore-unknown` | 忽略不认识的参数（不报错） |
| `--disable-audio` | 禁用音频 |
| `--ui-scale x` | 界面缩放（如 200） |
| `--pretty-settings` | 格式化设置文件 |

**版本号规则**：`--update 4.2.xx`（最新补丁）、`--update latest`（最新稳定版）、`--update beta`（最新测试版）

## 与本项目的集成场景

### 场景 A：换色后重新打包 Atlas

我们用 `scripts/modify_spine_max.py` 处理单独 PNG 后，可用 Spine CLI 重新打包官方 atlas：

```bash
# 1. Python 脚本换色（只处理单独 PNG，不处理 atlas）
python scripts/modify_spine_max.py --preset blue

# 2. Spine CLI 重新打包（比 Python 手动重建 atlas 更精确）
$SPINE -i need_change_color/1_blue/images/ \
       -j need_change_color/1/1.spine \
       -o need_change_color/1_blue/ \
       -p 1
```

### 场景 B：批量导出所有角色

```bash
for project in assets/spine/*.spine; do
  $SPINE -i "$project" -o "dist/spine/$(basename "$project" .spine)/" -e binary+pack
done
```

### 场景 C：CI/CD 中自动化

```bash
# 锁定 Spine 版本 + headless 批量导出
$SPINE --update 4.2.xx \
       -i assets/spine/character.spine \
       -o dist/spine/ \
       -e binary+pack
```

## 注意事项

- **授权要求**：CLI 需要有效的 Spine 授权（Professional 或 Essential）
- **Headless 限制**：JSON/Binary 导出可 headless 运行，但图片/视频导出需要 OpenGL 窗口系统
- **失败退出码**：命令失败时返回非零退出码，可用于 CI 判断
- **输出目录**：自动创建不存在的输出目录
- **多命令合并**：一次调用可串联多个 `-i`/`-e`/`-p` 命令
