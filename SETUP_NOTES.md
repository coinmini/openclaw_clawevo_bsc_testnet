# Spine-Godot GDExtension 集成踩坑记录

## 环境信息

- Godot: 4.5.1
- Spine Runtime: 4.2
- 平台: macOS (Apple Silicon M1 Max)

---

## 遇到的问题及解决方案

### 1. Spine 数据版本与运行时版本不匹配

**错误信息:**
```
Error while loading skeleton data:
Skeleton version "4.2.22" does not match runtime version 4.2
```

**原因:** Spine 运行时对版本匹配要求严格。即使是小版本号不同（如 4.2.22 vs 4.2）也会导致加载失败。

**解决方案:**
- 使用与 GDExtension 同一仓库分支的示例数据
- 从 `spine-runtimes/spine-godot/example-v4-extension/assets/` 下载匹配的资源文件
- 优先使用 `.skel` 二进制格式而非 `.json`

---

### 2. Spine 3.x 数据无法在 4.x 运行时加载

**问题:** 最初的 spineboy-pro.json 是 Spine 3.8.99 版本导出的，无法在 Spine 4.2 运行时中使用。

**原因:** Spine 运行时**不向后兼容**，4.x 运行时无法加载 3.x 导出的数据。

**解决方案:** 确保 Spine 编辑器导出版本与运行时版本匹配。

---

### 3. GDExtension 未被 Godot 识别/加载

**现象:**
- 添加节点时搜索不到 `SpineSprite` 等类型
- 双击场景文件无反应

**可能原因:**
1. `.gdextension` 文件位置不对
2. macOS 安全限制阻止了动态库加载
3. 存在重复的 `.gdextension` 文件导致类重复注册

**解决方案:**
```bash
# 移除 macOS 隔离属性
xattr -cr /path/to/project/bin

# 对 framework 进行代码签名
codesign --force --deep --sign - /path/to/bin/macos/*.framework
```

---

### 4. macOS 代码签名问题导致 Godot 无法启动

**错误信息:**
```
The application "Godot" can't be opened. -47
```

**原因:** 修改了 GDExtension 的 framework 文件后，可能影响了 Godot 应用的代码签名验证。

**解决方案:**
```bash
# 重新签名 Godot 应用
xattr -cr /path/to/Godot.app
codesign --force --deep --sign - /path/to/Godot.app

# 重新签名 GDExtension frameworks
codesign --force --deep --sign - /path/to/bin/macos/*.framework
```

---

### 5. SpineAtlasResource API 使用错误

**错误信息:**
```
Cannot set value into property "source_path" because it is read-only
Invalid call. Nonexistent function 'load_from_file' in base 'SpineAtlasResource'
```

**原因:** spine-godot GDExtension 的资源类属性是只读的，需要使用特定的加载方法。

**正确的 API 用法:**
```gdscript
# 加载 Atlas
var atlas_res = SpineAtlasResource.new()
atlas_res.load_from_atlas_file("res://path/to/file.atlas")  # 注意是 load_from_atlas_file

# 加载骨骼文件
var skeleton_file_res = SpineSkeletonFileResource.new()
skeleton_file_res.load_from_file("res://path/to/file.skel")  # 这个是 load_from_file

# 创建骨骼数据资源
var skeleton_data_res = SpineSkeletonDataResource.new()
skeleton_data_res.skeleton_file_res = skeleton_file_res
skeleton_data_res.atlas_res = atlas_res

# 创建并使用 SpineSprite
var sprite = SpineSprite.new()
sprite.skeleton_data_res = skeleton_data_res
add_child(sprite)

# 播放动画
sprite.get_animation_state().set_animation("idle", true, 0)
```

---

### 6. 动画状态为空 (null)

**错误信息:**
```
Cannot call method 'set_animation' on a null value
```

**原因:** SpineSprite 添加到场景后需要等待初始化完成才能获取动画状态。

**解决方案:**
```gdscript
add_child(sprite)

# 方法1: 等待帧处理
await get_tree().process_frame
await get_tree().process_frame
var animation_state = sprite.get_animation_state()

# 方法2: 连接 ready 信号
sprite.ready.connect(_on_spine_ready)
```

---

### 7. 重复注册扩展类

**错误信息:**
```
Attempt to register extension class 'SpineSprite', which appears to be already registered
```

**原因:** 项目中存在多个 `.gdextension` 文件指向相同的库。

**解决方案:** 确保项目中只有一个 `.gdextension` 文件。

---

## 正确的项目结构

```
project/
├── bin/
│   ├── macos/
│   │   ├── libspine_godot.macos.editor.framework
│   │   ├── libspine_godot.macos.template_debug.framework
│   │   └── libspine_godot.macos.template_release.framework
│   └── (其他平台的库文件)
├── spine_godot.gdextension          # 放在项目根目录
├── charactors/
│   ├── spineboy-pro.skel            # 骨骼数据 (二进制格式)
│   ├── spineboy.atlas               # 图集描述文件
│   └── spineboy.png                 # 纹理图片
├── main.tscn
├── main.gd
└── project.godot
```

---

## spine_godot.gdextension 配置示例

```ini
[configuration]
entry_symbol = "spine_godot_library_init"
compatibility_minimum = "4.1"

[libraries]
macos.editor = "res://bin/macos/libspine_godot.macos.editor.framework"
macos.debug = "res://bin/macos/libspine_godot.macos.template_debug.framework"
macos.release = "res://bin/macos/libspine_godot.macos.template_release.framework"
```

---

## 参考资源

- [spine-godot 官方文档](http://en.esotericsoftware.com/spine-godot)
- [spine-runtimes GitHub 仓库](https://github.com/EsotericSoftware/spine-runtimes)
- [官方示例代码 (example-v4-extension)](https://github.com/EsotericSoftware/spine-runtimes/tree/4.2/spine-godot/example-v4-extension)
