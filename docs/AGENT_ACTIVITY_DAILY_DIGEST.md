# Plan: 我的 Agent 24h 活动日志 + 每日晨报

## Context
用户登录 Web3 钱包后，想在 MyPlayerPanel 里看到自己 agent 最近 24 小时的所有链上活动（打野/对战/挖宝/修炼/突破）。同时每天早上自动生成"每日晨报"汇总全服 agent 活动数据。

**关键约束**：
- 活动数据已被 The Graph subgraph 索引，可直接通过 GraphQL `where: { player, timestamp_gte }` 查询
- 数据库用远程服务器 `ssh root@162.247.153.224` 上 TheGraph 节点自带的 PostgreSQL
- 展示在 MyPlayerPanel 里新增 tab 页
- 晨报：定时生成 + 用户可手动刷新

---

## Changes

### 1. 新增 GraphQL 查询 — 单个玩家 24h 活动

**文件**: `web/src/data/graphql/queries.ts` (修改)

```graphql
query MyAgentActivity($player: Bytes!, $since: BigInt!) {
  huntEvents(first: 50, orderBy: timestamp, orderDirection: desc,
    where: { player: $player, timestamp_gte: $since }) {
    id, regionId, won, playerScore, monsterScore, timestamp
  }
  battleMatches(first: 50, orderBy: settledAt, orderDirection: desc,
    where: { playerA: $player, settledAt_gte: $since }) {
    id, playerB { id }, winner, payout, settledAt
  }
  battleMatchesAsB: battleMatches(first: 50, orderBy: settledAt, orderDirection: desc,
    where: { playerB: $player, settledAt_gte: $since }) {
    id, playerA { id }, winner, payout, settledAt
  }
  treasureEvents(first: 50, orderBy: timestamp, orderDirection: desc,
    where: { player: $player, timestamp_gte: $since }) {
    id, regionId, quality, reward, timestamp
  }
  cultivationSessions(first: 50, orderBy: timestamp, orderDirection: desc,
    where: { player: $player, timestamp_gte: $since }) {
    id, duration, lsEarned, expGained, heartGained, fortuneGained, timestamp
  }
  breakthroughEvents(first: 50, orderBy: timestamp, orderDirection: desc,
    where: { player: $player, timestamp_gte: $since }) {
    id, fromRealm, toRealm, success, timestamp
  }
}
```

同时新增全服 24h 汇总查询（供晨报 API 用）：
```graphql
query DailyDigestActivity($since: BigInt!) {
  huntEvents(first: 1000, where: { timestamp_gte: $since }) { id, player { id }, won }
  battleMatches(first: 1000, where: { settledAt_gte: $since }) { id, playerA { id }, playerB { id }, winner, payout }
  treasureEvents(first: 1000, where: { timestamp_gte: $since }) { id, player { id }, quality }
  cultivationSessions(first: 1000, where: { timestamp_gte: $since }) { id, player { id }, lsEarned, expGained }
  breakthroughEvents(first: 1000, where: { timestamp_gte: $since }) { id, player { id }, fromRealm, toRealm, success }
}
```

### 2. 新增前端 Hook — useMyAgentActivity

**新文件**: `web/src/data/hooks/useMyAgentActivity.ts`

- 接收 `address: string | undefined`
- 计算 `since = Math.floor(Date.now()/1000) - 86400`
- 调用 `graphqlRequest(MY_AGENT_ACTIVITY_QUERY, { player: address, since })`
- 合并所有事件为统一 `AgentActivityEvent[]`，按 timestamp 排序
- 同时生成统计摘要：`{ hunts, battles, treasures, cultivations, breakthroughs, totalLsEarned }`
- refetch 30 秒, staleTime 15 秒
- 仅在 address 存在时启用 (`enabled: !!address`)

### 3. MyPlayerPanel — 新增"活动日志"tab

**文件**: `web/src/components/panels/MyPlayerPanel.tsx` (修改)

在 expanded view 的 Content 区域加入 tab 切换：
- **属性** tab (现有内容：基本信息 + 六维属性 + 宗门/灵兽 + 灵石)
- **活动日志** tab (新增：24h 活动列表 + 统计摘要)
- **聊天记录** tab (现有 chat 展开逻辑移入 tab)

活动日志 tab 内容：
```
┌───────────────────────────────┐
│ 24h 统计概览                    │
│ 打野 12 | 对战 5 | 挖宝 3      │
│ 修炼 8  | 突破 1 | 收益 450 LS  │
├───────────────────────────────┤
│ 活动时间线 (滚动列表)           │
│ 10:32  在青云山打野 — 胜利       │
│ 09:15  vs 0x1a..3f — 败         │
│ 08:40  修炼 2h — +120 exp       │
│ ...                             │
└───────────────────────────────┘
```

### 4. chat-server — 每日晨报定时任务 + API

**修改**: `chat-server/src/db.ts`
- 连接改为远程 TheGraph PostgreSQL：`postgresql://...@162.247.153.224:5432/...`
- 新增 `DailyDigestRow` 接口
- 新增 `ensureTables()` 函数创建 `daily_digest` 表（IF NOT EXISTS）

**新文件**: `chat-server/src/jobs/dailyDigest.ts`
- 定时任务：`setInterval` 每 24h 或每天 UTC 00:00 (北京 08:00)
- 从 GraphQL 拉 24h 全服事件
- 聚合统计 + 生成中文 markdown 摘要
- 存入 `daily_digest` 表
- 导出 `generateDigest()` 函数（供手动触发）

**新文件**: `chat-server/src/routes/digest.ts`
- `GET /api/digest` — 最近 7 条晨报
- `GET /api/digest/latest` — 最新一条
- `POST /api/digest/generate` — 手动触发生成（开发用）

**修改**: `chat-server/src/index.ts`
- 注册 `/api/digest` 路由
- 启动定时任务

**修改**: `chat-server/package.json`
- 新增 `graphql-request` + `graphql` 依赖

### 5. 前端晨报展示

**新文件**: `web/src/data/hooks/useDailyDigest.ts`
- 从 chat-server `/api/digest/latest` 拉取
- refetch 60 秒

**新文件**: `web/src/components/panels/DailyDigest.tsx`
- 展示晨报：日期、活跃 agent 数、各类活动统计、突破高亮
- 有"刷新"按钮可手动触发 `/api/digest/generate`

**修改**: `web/src/app/page.tsx`
- 右侧边栏新增 `<Section title="每日晨报"><DailyDigest /></Section>`

---

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `web/src/data/graphql/queries.ts` | 修改 — 新增 MY_AGENT_ACTIVITY_QUERY, DAILY_DIGEST_QUERY |
| `web/src/data/hooks/useMyAgentActivity.ts` | **新建** — 我的 24h 活动 hook |
| `web/src/components/panels/MyPlayerPanel.tsx` | 修改 — 新增 tab 切换 (属性/活动/聊天) |
| `chat-server/src/db.ts` | 修改 — 远程 DB 连接 + daily_digest 表 |
| `chat-server/src/jobs/dailyDigest.ts` | **新建** — 定时聚合任务 |
| `chat-server/src/routes/digest.ts` | **新建** — 晨报 API |
| `chat-server/src/index.ts` | 修改 — 注册路由 + 启动定时 |
| `chat-server/package.json` | 修改 — 新增 graphql-request 依赖 |
| `web/src/data/hooks/useDailyDigest.ts` | **新建** — 晨报 hook |
| `web/src/components/panels/DailyDigest.tsx` | **新建** — 晨报面板 |
| `web/src/app/page.tsx` | 修改 — 添加晨报 Section |

## 复用现有代码
- `graphqlRequest()` from `web/src/data/graphql/client.ts` — 带 fallback 的 GraphQL 客户端
- `truncateAddress()`, `formatLS()`, `timeAgo()` from `web/src/lib/formatting.ts`
- `REGIONS`, `REALM_NAMES`, `ELEMENT_NAMES` from `web/src/lib/constants.ts`
- chat-server 现有 Hono + PostgreSQL 基础设施

## Verification
1. `cd chat-server && npm install && npm run dev` — 确认启动无报错
2. `curl http://localhost:4000/api/digest/generate` — 手动生成晨报
3. `curl http://localhost:4000/api/digest/latest` — 确认晨报返回
4. `cd web && npm run dev` — 启动前端
5. 连接钱包 → 展开 MyPlayerPanel → 切换到"活动日志" tab → 确认 24h 活动列表显示
6. 右侧边栏"每日晨报" Section 确认显示
