# Gemini Image Generation API 参考

> 来源：[Google AI - Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
> 整理日期：2026-03-07

## 可用模型

| 模型 ID | 定位 | 特点 |
|---------|------|------|
| `gemini-3.1-flash-image-preview` | 高速批量 | 速度优先，支持 512px 分辨率，支持 Image Search grounding |
| `gemini-3-pro-image-preview` | 专业素材 | 质量优先，适合最终资产生产、准确文字渲染 |
| `gemini-2.5-flash-image` | 速度效率 | 基础模型 |

## 核心能力

### 1. 文生图（Text-to-Image）

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_KEY")

response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents=["A futuristic city floating in space"],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
    ),
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("output.png")
```

### 2. 图片编辑（Image-to-Image）

发送原始图片 + 文字描述，返回修改后的图片：

```python
from PIL import Image

image = Image.open("input.png")

response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents=["Change the hair color to ice blue", image],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
    ),
)
```

也可以用 bytes 方式传入：

```python
response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents=[
        types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
        "Change the hair color to ice blue",
    ],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
    ),
)
```

### 3. 多轮编辑（Multi-Turn Chat）

图片在对话中持续存在，可以逐步修改：

```python
chat = client.chats.create(
    model="gemini-3.1-flash-image-preview",
    config=types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
    ),
)

# 第一轮：生成
response1 = chat.send_message("Draw a cat wearing a hat")

# 第二轮：在第一轮基础上修改
response2 = chat.send_message("Change the hat to a crown")

# 第三轮：继续修改
response3 = chat.send_message("Add a golden background")
```

---

## 配置参数

### response_modalities

控制输出类型：

```python
config=types.GenerateContentConfig(
    response_modalities=["IMAGE", "TEXT"],  # 图片+文字
    # response_modalities=["IMAGE"],        # 仅图片
    # response_modalities=["TEXT"],          # 仅文字
)
```

### image_config — 图片输出控制

```python
config=types.GenerateContentConfig(
    response_modalities=["IMAGE", "TEXT"],
    image_config=types.ImageConfig(
        aspect_ratio="16:9",    # 宽高比
        image_size="2K",        # 分辨率
    ),
)
```

### 支持的宽高比 (aspect_ratio)

```
"1:1"   "1:4"   "1:8"
"2:3"   "3:2"   "3:4"
"4:1"   "4:3"   "4:5"
"5:4"   "8:1"   "9:16"
"16:9"  "21:9"
```

### 支持的分辨率 (image_size)

| 值 | 说明 | 备注 |
|---|------|------|
| `"512px"` | 512 像素 | 仅 gemini-3.1-flash-image-preview 支持 |
| `"1K"` | 1024 像素 | 所有模型 |
| `"2K"` | 2048 像素 | 所有模型 |
| `"4K"` | 4096 像素 | 所有模型 |

**注意：必须用大写 K**（如 `"1K"`），小写 `"1k"` 会被拒绝。

---

## 参考图片（Reference Images）

Gemini 3 系列支持多参考图片输入：

| 模型 | 物体参考图 | 角色参考图 | 总计 |
|------|-----------|-----------|------|
| gemini-3.1-flash-image-preview | 最多 10 张 | 最多 4 张 | 最多 14 张 |
| gemini-3-pro-image-preview | 最多 6 张 | 最多 5 张 | 最多 11 张 |

用途：保持物体/角色在多张图片中的一致性。

---

## 高级功能

### Thinking 模式

Thinking 默认启用且无法关闭，可以控制级别：

```python
config=types.GenerateContentConfig(
    response_modalities=["IMAGE"],
    thinking_config=types.ThinkingConfig(
        thinking_level="High",       # "minimal"(默认) 或 "High"
        include_thoughts=True,       # 是否返回思考过程
    ),
)
```

**注意：** 无论 `include_thoughts` 设为什么，thinking tokens 都会计费。

### Google Search Grounding

让模型使用 Google 搜索来验证事实：

```python
config=types.GenerateContentConfig(
    response_modalities=["TEXT", "IMAGE"],
    tools=[{"google_search": {}}],
)
```

Gemini 3.1 Flash 还支持 Image Search：

```python
tools=[types.Tool(google_search=types.GoogleSearch(
    search_types=types.SearchTypes(
        web_search=types.WebSearch(),
        image_search=types.ImageSearch(),
    )
))]
```

**显示要求：** 使用 Image Search grounding 时，必须提供源图片的网页链接。

### Batch API（批量处理）

高量生产可以使用 Batch API，获得更高的速率限制，但处理时间最长 24 小时。

---

## Thought Signatures

所有响应中的 `inline_data`（图片）部分都包含签名（thought signatures）。
这是模型内部思考过程的加密表示，用于多轮交互中保持连贯性。

**SDK 自动处理：** 如果使用官方 Google Gen AI SDK 的 chat 功能，签名会自动管理。

---

## 提示词策略

### 写实风照片

```
模板：A photorealistic [镜头类型] of [主体], [动作或表情],
      set in [环境]. 提及相机角度、镜头类型、光线和细节。
```

### 风格化插画

```
要点：明确说明风格，请求透明背景。
适用于：贴纸、图标、游戏素材。
```

### 精确文字渲染

```
要点：明确指定文字内容、字体风格、整体设计。
推荐：使用 gemini-3-pro-image-preview 获得最佳效果。
```

---

## 限制和注意事项

| 项目 | 说明 |
|------|------|
| SynthID 水印 | 所有生成的图片都包含 SynthID 数字水印 |
| 内容政策 | 受 Google Prohibited Use Policy 约束 |
| 地区限制 | 部分地区（如中国大陆）不支持图片生成 |
| 速率限制 | 有 QPM 限制，具体数值未公开，Batch API 有更高限额 |
| 分辨率限制 | 512px 仅限 3.1 Flash |

---

## 响应解析代码模板

```python
from google import genai
from google.genai import types
from PIL import Image
import io

client = genai.Client(api_key="YOUR_KEY")

response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents=[
        types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
        "Your prompt here",
    ],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
        image_config=types.ImageConfig(
            aspect_ratio="1:1",
            image_size="1K",
        ),
    ),
)

# 解析响应
for part in response.candidates[0].content.parts:
    if part.inline_data and part.inline_data.mime_type.startswith("image/"):
        img = Image.open(io.BytesIO(part.inline_data.data))
        img.save("output.png")
    elif part.text:
        print(part.text)
```

---

## 与本项目的集成

本项目的 `scripts/spine_reskin.py` 使用此 API 进行 Spine 角色换皮：

```bash
# 使用 fast 模型（gemini-3.1-flash-image-preview）
python scripts/spine_reskin.py -i spine_modify/1 -s ice_mage -m fast --server root@162.247.153.224

# 使用 pro 模型（gemini-3-pro-image-preview）
python scripts/spine_reskin.py -i spine_modify/1 -s ice_mage -m pro --server root@162.247.153.224
```

脚本自动处理：
- 根据部件尺寸选择最接近的 `aspect_ratio`
- 将 AI 输出 resize 回原始尺寸
- 从原图恢复 alpha 通道（透明背景）
- 重建 atlas 大图

---

## 定价（Pricing）

> 更新日期：2026-03-07
> 来源：[Google AI - Pricing](https://ai.google.dev/gemini-api/docs/pricing)

### 图片生成模型定价

| 模型 | 层级 | 文本输入 ($/1M tokens) | 文本输出 ($/1M tokens) | 图片输出 ($/1M tokens) | 每张图片参考价 |
|------|------|----------------------|----------------------|----------------------|--------------|
| **gemini-3.1-flash-image-preview** | Standard | $0.50 | $3.00 | $60.00 | $0.045 (512px) / $0.067 (1K) / $0.101 (2K) / $0.151 (4K) |
| | Batch | $0.25 | $1.50 | $30.00 | $0.022 (512px) / $0.034 (1K) / $0.050 (2K) / $0.076 (4K) |
| **gemini-3-pro-image-preview** | Standard | $2.00 | $12.00 | $120.00 | $0.134 (1K/2K) / $0.24 (4K) |
| | Batch | $1.00 | $6.00 | $60.00 | $0.067 (1K/2K) / $0.12 (4K) |
| **gemini-2.5-flash-image** | Standard | — | — | — | $0.039/张 |
| | Batch | — | — | — | $0.0195/张 |

### Imagen 4 定价（纯图片生成，非多模态）

| 模型 | 每张价格 |
|------|---------|
| imagen-4.0-fast-generate-001 | $0.02 |
| imagen-4.0-generate-001 | $0.04 |
| imagen-4.0-ultra-generate-001 | $0.06 |

### 本项目成本估算

以 `gemini-3.1-flash-image-preview` (Standard) 为例，换皮一个角色（约 51 张部件图）：

| 分辨率 | 单价 | 51 张总成本 |
|--------|------|-----------|
| 512px | $0.045 | **$2.30** |
| 1K | $0.067 | **$3.42** |
| 混合 (大部分 512px) | ~$0.05 | **~$2.55** |

使用 Batch API 可降低 50% 成本，但处理时间最长 24 小时。

### 免费层级

图片生成模型（gemini-*-image-preview）**没有免费层级**，必须使用付费 API Key。

### 注意事项

- Preview 模型可能在稳定版发布前发生变化，速率限制更严格
- 付费层级的内容不会被用于改进 Google 产品
- Thinking tokens 也会计费，无论是否返回思考过程
- 图片输出 token 价格远高于文本输出（20x），控制分辨率是省钱关键
