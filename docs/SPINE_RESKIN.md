# Spine AI 换皮工具

> 使用 Gemini AI 对 Spine 2D 骨骼动画角色进行批量换皮（reskin），自动重绘部件贴图并重建 atlas。

## 整体架构

```
spine_modify/1/                    脚本 spine_reskin.py                 输出
├── images/           ──────►  1. 部件分类（hair/armor/body/...）
│   ├── 1_84.png (头发)         2. 逐个发送到 Gemini AI 生图     ──────►  spine_modify/1_ice_mage/
│   ├── 1_56.png (面甲)         3. 后处理（resize + 恢复 alpha）          ├── images/ (新贴图)
│   ├── bei.png  (背甲)         4. 重建 atlas PNG                         ├── 1.atlas (不变)
│   └── ...                     5. 复制 .skel/.atlas                      ├── 1.skel  (不变)
├── 1.atlas                                                               └── 1.png   (新 atlas)
├── 1.skel
└── 1.png (atlas 贴图)
```

骨骼动画数据（.skel）和布局信息（.atlas）完全不变，只替换贴图，因此动画行为 100% 保持一致。

---

## 前置条件

| 依赖 | 说明 |
|------|------|
| Python 3.10+ | 本地运行脚本 |
| Pillow、numpy | `pip install Pillow numpy` |
| google-genai SDK | 远程服务器需安装 `pip install google-genai Pillow` |
| Gemini API Key | 需要支持图片生成的区域（中国大陆不可用，需要海外服务器中转） |
| SSH 访问 | 用于连接海外服务器执行 Gemini API 调用 |
| Spine CLI（可选） | 如需用官方工具重新打包 atlas：`/Applications/Spine.app/Contents/MacOS/Spine` |

### 远程服务器配置

```
服务器: root@162.247.153.224
Python: /root/miniconda3/envs/llama-factory/bin/python
模型:   gemini-3.1-flash-image-preview (fast, 默认)
        gemini-3-pro-image-preview     (pro, 质量优先)
```

---

## 步骤 1：Spine 角色目录结构

每个角色的标准目录结构：

```
spine_modify/1/
├── 1.atlas          # 纹理图集布局（文本格式，记录每个部件在 atlas 中的位置）
├── 1.png            # 纹理图集（所有部件打包在一张大图里）
├── 1.skel           # 骨骼 + 动画数据（二进制格式）
├── 1.spine          # Spine 编辑器项目文件
└── images/          # 每个部件的独立 PNG（从 Spine 导出或解包 atlas 得到）
    ├── 1_84.png     # 主长发
    ├── 1_56.png     # 面甲
    ├── bei.png      # 背甲
    ├── hand_L8.png  # 手部
    ├── qiliu_1_00000.png  # 气流特效帧
    ├── sword_light1_00000.png  # 剑光特效帧
    └── ... (约 105 个部件)
```

如果只有 atlas 没有 images/ 目录，可以用 Spine CLI 解包：

```bash
SPINE="/Applications/Spine.app/Contents/MacOS/Spine"
$SPINE -i spine_modify/1/ -o spine_modify/1/images/ -c spine_modify/1/1.atlas
```

---

## 步骤 2：部件分类

脚本自动将所有部件分为 6 类：

| 类别 | 说明 | AI 处理 | 示例 |
|------|------|---------|------|
| **hair** | 头发部件 | 重绘颜色和纹理 | 1_84, 1_30, 1_29, 1_82, 1_83 |
| **armor** | 衣甲/服饰 | 重绘颜色和纹理 | 1_56 (面甲), bei (背甲), 1_40 (袍子), 1_80 (护甲) |
| **body** | 皮肤/身体 | 调整肤色 | 1_25 (脸), hand_L8, 1_51, 1_72 |
| **weapon** | 武器 | 重绘外观 | 1_34, 1_35 |
| **fx** | 特效帧序列 | **保持原样** | qiliu_1_*, sword_light1_* |
| **skip** | 阴影/模糊/细节点 | **保持原样** | diying (地面阴影), sprint (运动模糊), 小于 20x20 的部件 |

分类逻辑优先级：
1. 命名匹配（`PART_CATEGORIES` 字典）
2. 前缀匹配（`PREFIX_RULES`，如 `qiliu_1_*` → fx）
3. 编号映射（`NUMBERED_PART_MAP`，逐个视觉检查确定）
4. 面积过滤（< 400px → skip）
5. 默认 → armor

用 `--dry-run` 查看分类结果：

```bash
python scripts/spine_reskin.py -i spine_modify/1 --dry-run
```

输出示例：

```
Part classification:
  hair    :   5 parts  1_29, 1_30, 1_82, 1_83, 1_84
  armor   :  34 parts  1_0, 1_1, 1_18, 1_19, 1_2, 1_20, ...
  body    :  18 parts  1_25, 1_36, 1_37, 1_47, 1_48, 1_49, ...
  weapon  :   2 parts  1_34, 1_35
  fx      :  30 parts  qiliu_1_00000, qiliu_1_00001, ...
  skip    :  16 parts  1_10, 1_11, 1_12, ...

Reskinnable: 59 parts
```

---

## 步骤 3：AI 生图（Gemini Image-to-Image）

### 3.1 Prompt 构建

对每个可换皮部件，根据其类别和目标风格生成 prompt：

```
This is a 2D game character sprite part (88x212px).
Redraw this EXACT same shape and silhouette, but change its appearance to:
ice blue / cyan colored, with frosty shimmer highlights.
CRITICAL requirements:
1) Keep the EXACT same shape/outline/silhouette as the input image.
2) Keep the transparent background.
3) Keep the same 2D anime/game art style.
4) The output should look like a game sprite asset, not a photograph.
Output as image only.
```

### 3.2 远程执行流程

由于 Gemini 图片生成在中国大陆不可用，通过 SSH 中转：

```
本地                          海外服务器 (162.247.153.224)
  │                                │
  ├─ scp 临时脚本.py ──────────►  │
  │  (含 base64 编码的图片)        │
  │                                ├─ 调用 Gemini API
  │                                ├─ 返回 base64 编码结果
  │  ◄──── stdout (base64) ───────┤
  ├─ 解码结果图片                   │
```

### 3.3 模型选择

通过 `-m` 参数切换模型：

| 模型 ID | `-m` 参数 | 定位 | 每张参考价 |
|---------|----------|------|-----------|
| `gemini-3.1-flash-image-preview` | `fast`（默认） | 高速批量，速度优先 | $0.045 (512px) / $0.067 (1K) |
| `gemini-3-pro-image-preview` | `pro` | 专业素材，质量优先 | $0.134 (1K/2K) |
| `imagen-4.0-generate-001` | — | 纯文生图（不支持输入参考图） | $0.04 |

> 详细定价见 [GEMINI_IMAGE_API.md](GEMINI_IMAGE_API.md#定价pricing)

### 3.4 image_size 分辨率控制

通过 `--image-size` 参数控制 Gemini 输出分辨率，直接影响成本：

| 值 | 说明 | fast 单价 | pro 单价 |
|---|------|----------|---------|
| `512px` | 512 像素（仅 fast 支持） | **$0.045** | 不支持 |
| `1K` | 1024 像素 | $0.067 | $0.134 |
| `2K` | 2048 像素 | $0.101 | $0.134 |
| `auto`（默认） | 小部件 512px，大部件 1K | 混合 | 混合 |

`auto` 策略：部件最大边 > 256px 用 `1K`，否则用 `512px`。大多数 Spine 部件都很小，`auto` 可自动省钱。

**成本估算**（以角色 1 为例，59 个可换皮部件）：

| 配置 | 单价 | 59 张总成本 |
|------|------|-----------|
| fast + auto（默认） | ~$0.048 | **~$2.83** |
| fast + 512px | $0.045 | **~$2.66** |
| fast + 1K | $0.067 | **~$3.95** |
| pro + 1K | $0.134 | **~$7.91** |

---

## 步骤 4：后处理

AI 生成的图片存在两个问题需要修正：

### 4.1 尺寸不匹配

Gemini 输出通常是大尺寸（如 656x1600），需要 resize 回原始尺寸（如 88x212）。

```python
resized = generated.convert("RGB").resize(original.size, Image.LANCZOS)
```

### 4.2 Alpha 通道恢复

Gemini 输出为 RGB（无透明通道），而 Spine 部件需要 RGBA 透明背景。

解决方案：从原始部件提取 alpha 通道，与新 RGB 合并。

```python
original_alpha = original.convert("RGBA").split()[3]  # 提取原始 alpha
r, g, b = resized.split()
result = Image.merge("RGBA", (r, g, b, original_alpha))  # 合并
```

这样确保新贴图的形状轮廓与原始完全一致。

---

## 步骤 5：Atlas 重建

### 5.1 解析 .atlas 文件

.atlas 文件记录了每个部件在大图中的位置：

```
1.png
size:2033,840
filter:Linear,Linear
pma:true
1_84
bounds:1482,488,88,199
offsets:0,13,88,212
bei
bounds:1653,150,57,62
offsets:0,0,58,63
1_56
bounds:1950,329,59,59
```

关键字段：
- `bounds: x, y, w, h` — 在 atlas 大图中的位置和尺寸
- `rotate: 90` — 部件在 atlas 中旋转了 90 度存储
- `offsets: x, y, origW, origH` — 裁切偏移

### 5.2 贴回 atlas

将新生成的部件按照 .atlas 记录的位置贴回大图：

```python
for entry in atlas_entries:
    if entry["name"] in new_parts:
        x, y, w, h = entry["bounds"]
        if entry["rotate"]:
            region = new_img.rotate(90, expand=True).resize((h, w))
        else:
            region = new_img.resize((w, h))
        atlas.paste(region, (x, y))
```

### 5.3 输出文件

| 文件 | 处理方式 |
|------|---------|
| `images/*.png` | 新生成的部件贴图 |
| `1.png` | 重建的 atlas 大图 |
| `1.atlas` | 直接复制（布局不变） |
| `1.skel` | 直接复制（骨骼动画不变） |
| `1.spine` | 直接复制（项目文件不变） |

---

## 风格预设

| 预设名 | 中文名 | 头发 | 衣甲 | 武器 |
|--------|--------|------|------|------|
| `ice_mage` | 冰霜法师 | 冰蓝 + 霜光 | 冰蓝金属 + 银霜纹 | 冰晶剑 |
| `fire_lord` | 烈焰领主 | 火红橙 + 余烬光 | 深红金甲 + 火焰纹 | 烈焰剑 |
| `shadow_assassin` | 暗影刺客 | 白金 + 紫尖 | 暗紫黑甲 + 暗影符文 | 暗影之刃 |
| `nature_druid` | 自然德鲁伊 | 翠绿 + 叶光 | 活木叶甲 + 藤蔓纹 | 自然法杖 |
| `thunder_god` | 雷神 | 金色 + 电弧光 | 金紫甲 + 雷纹 | 雷电武器 |

---

## CLI 使用示例

```bash
# 查看所有风格
python scripts/spine_reskin.py --list

# 干跑 — 只看部件分类，不生成图片
python scripts/spine_reskin.py -i spine_modify/1 --dry-run

# 完整换皮 — 冰霜法师风格（通过海外服务器，fast 模型）
python scripts/spine_reskin.py \
  -i spine_modify/1 \
  -s ice_mage \
  --server root@162.247.153.224

# 使用 pro 模型（质量优先，成本更高）
python scripts/spine_reskin.py \
  -i spine_modify/1 \
  -s ice_mage \
  -m pro \
  --server root@162.247.153.224

# 只处理指定部件（快速测试）
python scripts/spine_reskin.py \
  -i spine_modify/1 \
  -s fire_lord \
  --server root@162.247.153.224 \
  --parts 1_84 1_56 bei

# 指定输出目录
python scripts/spine_reskin.py \
  -i spine_modify/1 \
  -s shadow_assassin \
  -o spine_modify/1_shadow \
  --server root@162.247.153.224

# 本地运行（需要非中国大陆网络）
python scripts/spine_reskin.py -i spine_modify/1 -s ice_mage
```

### CLI 参数

| 参数 | 缩写 | 说明 |
|------|------|------|
| `--input` | `-i` | 输入角色目录（必须含 images/） |
| `--style` | `-s` | 风格预设名（默认 ice_mage） |
| `--output` | `-o` | 输出目录（默认 `<input>_<style>`） |
| `--server` | | SSH 服务器地址 |
| `--api-key` | | Gemini API Key |
| `--python-bin` | | 远程服务器 Python 路径 |
| `--parts` | | 只处理指定部件（空格分隔） |
| `--dry-run` | | 只显示分类，不生成 |
| `--list` | | 列出所有风格预设 |
| `--model` | `-m` | 模型选择：`fast`（默认）/ `pro` |
| `--image-size` | | 输出分辨率：`auto`（默认）/ `512px` / `1K` / `2K` |

---

## 可选：用 Spine CLI 重新打包 Atlas

脚本内置了 atlas 重建逻辑（直接贴图），但如果需要更精确的打包（如优化布局），可以用 Spine 官方 CLI：

```bash
SPINE="/Applications/Spine.app/Contents/MacOS/Spine"

# 用新 images/ 重新打包 atlas（关联原项目防止 mesh 误裁）
$SPINE -i spine_modify/1_ice_mage/images/ \
       -j spine_modify/1/1.spine \
       -o spine_modify/1_ice_mage/ \
       -p 1
```

---

## 扩展：添加新角色

对于新角色，需要更新 `NUMBERED_PART_MAP`：

1. 将新角色放入 `spine_modify/<name>/`，确保有 `images/` 目录
2. 运行 `--dry-run` 查看自动分类结果
3. 对分类不准确的部件，在脚本中添加映射：

```python
NUMBERED_PART_MAP = {
    # 角色 1
    "1_84": "hair",
    "1_56": "armor",
    # 角色 2 — 新增
    "2_10": "hair",
    "2_15": "armor",
}
```

4. 也可以将映射外置为 JSON 配置文件，按角色 ID 加载

---

## 扩展：添加新风格

在 `STYLE_PRESETS` 中添加：

```python
"blood_knight": {
    "label": "血骑士 — 暗红衣甲 + 血红发",
    "hair_prompt": "dark crimson blood-red colored, with dripping blood-like highlights",
    "armor_prompt": "dark blood-red heavy armor with bone and skull ornaments",
    "weapon_prompt": "blood-soaked great sword with crimson glow",
    "body_prompt": "pale undead skin with dark veins visible",
    "fx_prompt": "dark red blood energy swirl with crimson particles",
},
```

每个风格需定义 5 个 prompt 字段：`hair_prompt`、`armor_prompt`、`weapon_prompt`、`body_prompt`、`fx_prompt`。

---

## 已知限制

| 限制 | 说明 | 解决方案 |
|------|------|---------|
| Gemini 地区限制 | 中国大陆无法调用图片生成 | 通过 SSH 中转海外服务器 |
| 输出尺寸不一致 | AI 生成图尺寸与原始不同 | 后处理自动 resize |
| 透明通道丢失 | AI 输出为 RGB 无 alpha | 从原图提取 alpha 合并 |
| 部件分类需人工标注 | 新角色的编号部件需手动映射 | 可扩展为自动识别 |
| API 速率限制 | Gemini 有 QPM 限制 | 每部件间隔 1 秒 |
| 生成质量不稳定 | 小部件（<30px）效果较差 | 小部件自动跳过，保持原样 |

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/spine_reskin.py` | 主脚本 |
| `scripts/modify_spine_max.py` | HSV 换色工具（不依赖 AI，纯算法） |
| `docs/GEMINI_IMAGE_API.md` | Gemini 图片生成 API 参考（模型、定价、SDK 用法） |
| `docs/spine_cli.md` | Spine CLI 命令行参考 |
| `spine_modify/1/` | 测试用角色素材 |
