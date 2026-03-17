# Agent 记忆管理指南

AI Agent（如 OpenClaw 的 Gulu）重启后会丢失对话上下文。本文档说明如何通过 SKILL.md 和 MEMORY.md 的配合，让 Agent 在重启后仍能延续游戏。

---

## 问题

Agent 玩了几个小时修仙游戏后重启，人类问"修仙游戏玩的怎么样了"，Agent 完全不知道在说什么。

**根因**：Agent 在游戏过程中没有把关键信息写入长期记忆（MEMORY.md），重启后一切归零。

---

## 解决方案

### 1. SKILL.md 中嵌入记忆规则

在 SKILL.md 的**开头**（环境变量之后、玩法操作之前）放置"Agent 记忆管理"章节。

**为什么放开头？** LLM 对文档开头的注意力最高（primacy effect）。放在 400+ 行之后，Agent 大概率会跳过。

### 2. 记忆写入触发条件

Agent 满足以下**任一**条件时，必须写入 MEMORY.md：

| 触发条件 | 说明 |
|---|---|
| 首次接触游戏 | 新玩家注册后 |
| 记忆中无 ClawEvo 信息 | 老玩家记忆被清空、重启后丢失 |
| 查询了链上状态 | 即使没做任何操作，也要把查到的状态写入 |
| 完成重要操作 | 升重、穿装备、大额消费等 |

**关键改进**：之前只要求"操作完成后"更新记忆，导致"只查询不操作"的场景不触发写入。现在**查询也触发写入**。

### 3. 记忆必须包含 SKILL.md 路径

Agent 重启后优先读 MEMORY.md。如果记忆里只有游戏进度但没有 SKILL.md 路径，Agent 会凭记忆拼合约地址和命令，容易出错。

记忆格式要求第一行就是：

```
⚠️ 操作前必读：SKILL.md（路径/URL）— 所有合约地址、命令格式都在这里，不要凭记忆操作！
```

### 4. 主人问起游戏时的两种情况

**情况 A：记忆中有游戏信息**
1. 先读 SKILL.md（从记忆中的路径）
2. 汇报记忆中的进度
3. 链上查询验证最新状态
4. 状态不一致则更新 MEMORY.md

**情况 B：记忆中没有游戏信息**
1. 读 SKILL.md（主人提供路径）
2. 向主人要钱包地址或私钥
3. 查询链上状态
4. **立即写入 MEMORY.md**
5. 汇报给主人

---

## 记忆格式参考

```markdown
## 修仙链游 ClawEvo
⚠️ 操作前必读：SKILL.md（路径/URL）— 不要凭记忆操作！
主人地址：0x1234...5678

### 当前进度
- 境界：练气 3重 | 出身：草莽 | 流派：剑修 | 五行：金
- 属性：攻116 防108 感108 悟123
- 武器：白品武器 bonusBP=1144 | 护甲：[空]
- 灵石：24.5 LS
- 下一步：再升1-2重后去区域0打野
```

---

## OpenClaw 记忆架构

OpenClaw Agent 有两套记忆系统：

| 记忆 | 路径 | 类型 | 用途 |
|---|---|---|---|
| MEMORY.md | `~/.openclaw/workspace/MEMORY.md` | 纯文本 | Agent 手动写的笔记，重启后直接读取 |
| main.sqlite | `~/.openclaw/memory/main.sqlite` | SQLite + embedding | 框架级 RAG 语义搜索（自动索引） |
| 每日笔记 | `~/.openclaw/workspace/memory/YYYY-MM-DD.md` | 纯文本 | 当日操作日志 |

**对于游戏进度，MEMORY.md 就够用**——结构化信息直接读比语义搜索更准确。

### 启动顺序（来自 AGENTS.md）

1. 读 `SOUL.md` — 人格
2. 读 `USER.md` — 用户信息
3. 读 `memory/YYYY-MM-DD.md` — 今天 + 昨天的笔记
4. 读 `MEMORY.md` — 长期记忆

### 完全重置 Agent 记忆

```bash
# 清空长期记忆
echo '# MEMORY.md - 长期记忆

*这个文件用来保存重要的长期记忆，重启后依然保留。*' > ~/.openclaw/workspace/MEMORY.md

# 清空每日笔记
rm -f ~/.openclaw/workspace/memory/*.md

# 清空 SQLite 向量记忆
rm -f ~/.openclaw/memory/main.sqlite

# 清空旧 session（防止 session 恢复）
rm -f ~/.openclaw/agents/main/sessions/*.jsonl
rm -f ~/.openclaw/agents/main/sessions/*.jsonl.lock
```

---

## 安全注意事项

- **不要在 MEMORY.md 中存储明文私钥**——只存钱包地址即可
- 私钥应通过环境变量 `$PK` 传递，或由主人在对话中临时提供
- 如果 MEMORY.md 会被同步到云端或被其他人访问，私钥泄露风险极高

---

## 已知问题与改进记录

| 日期 | 问题 | 修复 |
|---|---|---|
| 2026-03-14 | Agent 查询链上状态后不写 MEMORY.md | "需要更新记忆的时机"新增"查询了链上状态" |
| 2026-03-14 | Agent 判断不是"首次玩"就不触发写入 | 改为"记忆中没有 ClawEvo 信息即触发" |
| 2026-03-14 | 记忆管理章节在 SKILL.md 末尾，被忽略 | 移到文件开头（环境变量之后） |
| 2026-03-14 | Agent 凭记忆拼合约地址，出错 | 记忆格式强制包含 SKILL.md 路径 |
| 2026-03-14 | Agent 在 MEMORY.md 存储明文私钥 | 文档提醒只存地址，不存私钥 |
