# 世界地图视频背景 — 优化经验总结

## 背景

游戏世界地图背景原本是 **64 帧 JPG 序列**（2752x1536，8fps 循环），由 AI 从一段 4K 视频逐帧导出。
Phaser 将所有帧加载为纹理后，每帧解压为 RGBA 占 16.1MB，**64 帧共计 ~1,030MB**，是浏览器 1GB+ 内存占用的最大来源。

**优化方案**：将 64 帧合成为一个 MP4/WebM 视频文件，用 Phaser `Video` 对象播放。
视频解码器只需缓存 2-3 帧，内存从 1,030MB 降至 ~50MB。

---

## 视频生成流程

### 原始素材

| 文件 | 说明 |
|------|------|
| `word_map_video/new.mp4` | 原始 4K 视频 (3840x2160, 24fps, 8秒) |
| `web/public/assets/images/map_frames/frame_000.jpg` ~ `frame_063.jpg` | 已导出的 64 帧 JPG (2752x1536) |

### 生成命令

```bash
# 1. 用 Python 做首尾帧混合（解决循环跳帧）
python3 blend_frames.py   # 见下方脚本

# 2. 从 PNG 帧生成 MP4（强制 yuv420p + SAR 1:1）
ffmpeg -framerate 8 -i /tmp/sf/frame_%03d.png \
  -c:v libx264 -b:v 3M -pix_fmt yuv420p -vf setsar=1 \
  -movflags +faststart -an map_animated.mp4 -y

# 3. 生成 WebM 备用
ffmpeg -framerate 8 -i /tmp/sf/frame_%03d.png \
  -c:v libvpx-vp9 -b:v 3M -pix_fmt yuv420p -an map_animated.webm -y
```

### 帧混合脚本 (blend_frames.py)

```python
from PIL import Image
import os, shutil

SRC = "map_frames"       # 原始 64 帧 JPG
OUT = "/tmp/sf"           # 输出混合帧 PNG
TOTAL = 64
BLEND = 4                 # 混合最后 4 帧（0.5 秒）

os.makedirs(OUT, exist_ok=True)

# 转 PNG（避免 JPEG 的 yuvj420p 色彩空间问题）
for i in range(TOTAL):
    img = Image.open(f"{SRC}/frame_{i:03d}.jpg").convert("RGB")
    img.save(f"{OUT}/frame_{i:03d}.png")

# 最后 BLEND 帧与开头 BLEND 帧做 alpha 混合
for k in range(BLEND):
    tail_idx = TOTAL - BLEND + k
    head_idx = k
    alpha = (k + 1) / (BLEND + 1)
    tail = Image.open(f"{SRC}/frame_{tail_idx:03d}.jpg").convert("RGB")
    head = Image.open(f"{SRC}/frame_{head_idx:03d}.jpg").convert("RGB")
    blended = Image.blend(tail, head, alpha)
    blended.save(f"{OUT}/frame_{tail_idx:03d}.png")
```

---

## 踩过的坑

### 1. SAR (Sample Aspect Ratio) 不是 1:1

**现象**：视频在 Phaser 中显示错位/拉伸。

**原因**：从 4K (3840x2160) 缩放到 2752x1536 时，ffmpeg 自动计算了 `SAR 128:129` 来补偿微小的比例差异。

**解决**：
- 不从 4K 视频缩放，直接用已导出的 2752x1536 帧图合成
- 加 `-vf setsar=1` 强制方形像素

```bash
# 错误：从 4K 缩放
ffmpeg -i new.mp4 -vf "scale=2752:1536" ...
# → SAR 128:129 ❌

# 正确：从帧图合成 + 强制 SAR
ffmpeg -framerate 8 -i frame_%03d.jpg -vf setsar=1 ...
# → SAR 1:1 ✓
```

### 2. yuvj420p vs yuv420p

**现象**：视频在循环播放时出现闪烁。

**原因**：JPEG 帧源默认使用 `yuvj420p`（full range），不是标准的 `yuv420p`（limited range）。
某些浏览器解码器对 yuvj420p 处理不一致。

**解决**：先将 JPEG 转为 PNG 再编码，或加 `-pix_fmt yuv420p` 强制转换。

```bash
# 验证：
ffprobe map_animated.mp4 2>&1 | grep Stream
# 应该看到 yuv420p，不是 yuvj420p
```

### 3. 帧混合伪影（黑圈/鬼影）

**现象**：用 PIL `Image.blend` 混合首尾帧做无缝循环时，混合区域出现暗色圆圈闪烁。

**原因**：混合帧数太多（16 帧 = 2 秒），云层位移大的区域产生明显的半透明叠加伪影。

**解决**：减少混合帧数到 **4 帧（0.5 秒）**，伪影大幅减少，同时仍能平滑过渡循环跳帧。

| 混合帧数 | 效果 |
|---------|------|
| 0 帧 | 循环跳帧明显 |
| 4 帧 | 跳帧平滑，无明显伪影 ✓ |
| 8 帧 | 能看出轻微跳帧 |
| 16 帧 | 跳帧消除，但出现黑圈伪影 ❌ |

### 4. Phaser Video autoplay

**现象**：视频加载了但不播放，地图背景全黑。

**原因**：浏览器 autoplay 策略要求无音频视频标记 `noAudio`。

**解决**：
```typescript
// BootScene.ts — 第三个参数 true = noAudio
this.load.video("world-map-video",
  ["/assets/images/map_animated.mp4", "/assets/images/map_animated.webm"],
  true  // ← 关键：允许自动播放
);
```

---

## Phaser Video 集成

### BootScene 加载

```typescript
// 提供 MP4 + WebM 两种格式，Phaser 自动选择浏览器支持的
this.load.video("world-map-video",
  ["/assets/images/map_animated.mp4", "/assets/images/map_animated.webm"],
  true // noAudio → 允许 autoplay
);
```

### WorldMapScene 播放

```typescript
const mapVideo = this.add.video(MAP_W / 2, MAP_H / 2, "world-map-video");
mapVideo.setOrigin(0.5);
mapVideo.setDepth(-1);           // 确保在最底层
mapVideo.play(true);             // loop = true
mapVideo.on("play", () => {
  mapVideo.setDisplaySize(MAP_W, MAP_H);  // 视频渲染后再设尺寸
});
mapVideo.setDisplaySize(MAP_W, MAP_H);    // 也立即设一次
```

**要点**：
- `setDisplaySize` 需要在 `play` 事件后再调一次，因为视频元数据可能异步加载
- `setDepth(-1)` 确保视频在所有 NPC/Agent 下方
- `setOrigin(0.5)` 确保居中对齐

---

## 最终文件清单

| 文件 | 大小 | 说明 |
|------|------|------|
| `web/public/assets/images/map_animated.mp4` | ~5MB | H.264, yuv420p, 2752x1536, 8fps, SAR 1:1 |
| `web/public/assets/images/map_animated.webm` | ~4MB | VP9, yuv420p, 备用格式 |
| `web/public/assets/images/map_frames/` | 68MB | 原始 64 帧 JPG（保留，用于重新生成视频） |
| `word_map_video/new.mp4` | 26MB | 原始 4K 视频素材 |

---

## 内存效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 磁盘加载量 | 68MB (64 JPG) | 5MB (1 MP4) |
| 浏览器内存 | ~1,030MB | ~50MB |
| 初始加载时间 | 较长（64 个 HTTP 请求） | 较快（1 个请求） |
