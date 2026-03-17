import { GraphQLClient } from "graphql-request";
import { pool } from "../db.js";

const GRAPHQL_PRIMARY =
  process.env.GRAPHQL_ENDPOINT ??
  "https://api.studio.thegraph.com/query/1743007/huasheng-bsc-testnet/version/latest";

const GRAPHQL_FALLBACK =
  process.env.GRAPHQL_FALLBACK ??
  "https://api.clawevo.ai/subgraphs/name/huasheng";

const primaryClient = new GraphQLClient(GRAPHQL_PRIMARY);
const fallbackClient = new GraphQLClient(GRAPHQL_FALLBACK);

const REALM_NAMES = ["练气", "筑基", "金丹", "元婴", "化神"] as const;

const DIGEST_QUERY = `
  query DailyDigestActivity($since: BigInt!) {
    huntEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player { id }
      won
    }
    battleMatches(first: 1000, where: { settledAt_gte: $since }) {
      id
      playerA { id }
      playerB { id }
      winner
      payout
    }
    treasureEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player { id }
      quality
    }
    cultivationSessions(first: 1000, where: { timestamp_gte: $since }) {
      id
      player { id }
      lsEarned
      expGained
    }
    breakthroughEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player { id }
      fromRealm
      toRealm
      success
    }
    beastHuntEvents(first: 1000, where: { timestamp_gte: $since }) {
      id
      player { id }
      star
      captured
    }
  }
`;

interface DigestRaw {
  readonly huntEvents: readonly { id: string; player: { id: string }; won: boolean }[];
  readonly battleMatches: readonly { id: string; playerA: { id: string }; playerB: { id: string }; winner: string; payout: string }[];
  readonly treasureEvents: readonly { id: string; player: { id: string }; quality: number }[];
  readonly cultivationSessions: readonly { id: string; player: { id: string }; lsEarned: string; expGained: string }[];
  readonly breakthroughEvents: readonly { id: string; player: { id: string }; fromRealm: number; toRealm: number; success: boolean }[];
  readonly beastHuntEvents: readonly { id: string; player: { id: string }; star: number; captured: boolean }[];
}

async function fetchDigestData(since: string): Promise<DigestRaw> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const result = await primaryClient.request<DigestRaw>({
      document: DIGEST_QUERY,
      variables: { since },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch {
    return fallbackClient.request<DigestRaw>({ document: DIGEST_QUERY, variables: { since } });
  }
}

function truncAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function generateDigest(): Promise<{ summary: string; stats: Record<string, unknown> }> {
  const since = String(Math.floor(Date.now() / 1000) - 86_400);
  const data = await fetchDigestData(since);

  // Collect active players
  const activePlayers = new Set<string>();
  for (const h of data.huntEvents) activePlayers.add(h.player.id);
  for (const b of data.battleMatches) {
    activePlayers.add(b.playerA.id);
    activePlayers.add(b.playerB.id);
  }
  for (const t of data.treasureEvents) activePlayers.add(t.player.id);
  for (const c of data.cultivationSessions) activePlayers.add(c.player.id);
  for (const b of data.breakthroughEvents) activePlayers.add(b.player.id);
  for (const bh of data.beastHuntEvents) activePlayers.add(bh.player.id);

  // Top hunter (most hunts)
  const huntCounts = new Map<string, number>();
  for (const h of data.huntEvents) {
    huntCounts.set(h.player.id, (huntCounts.get(h.player.id) ?? 0) + 1);
  }
  const topHunter = [...huntCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // Top fighter (most battle wins)
  const winCounts = new Map<string, number>();
  for (const b of data.battleMatches) {
    winCounts.set(b.winner, (winCounts.get(b.winner) ?? 0) + 1);
  }
  const topFighter = [...winCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // Breakthrough details
  const breakthroughDetails = data.breakthroughEvents.map((b) => ({
    player: b.player.id,
    from: REALM_NAMES[b.fromRealm] ?? `Lv${b.fromRealm}`,
    to: REALM_NAMES[b.toRealm] ?? `Lv${b.toRealm}`,
    success: b.success,
  }));

  const stats = {
    totalHunts: data.huntEvents.length,
    totalBattles: data.battleMatches.length,
    totalTreasures: data.treasureEvents.length,
    totalCultivations: data.cultivationSessions.length,
    totalBreakthroughs: data.breakthroughEvents.length,
    totalBeastHunts: data.beastHuntEvents.length,
    totalBeastsCaptured: data.beastHuntEvents.filter((b) => b.captured).length,
    activeAgents: activePlayers.size,
    topHunter: topHunter ? { address: topHunter[0], count: topHunter[1] } : null,
    topFighter: topFighter ? { address: topFighter[0], count: topFighter[1] } : null,
    breakthroughDetails,
  };

  // Generate Chinese markdown summary
  const dateStr = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const lines: string[] = [
    `## ${dateStr} 化神日报`,
    "",
    `**活跃修仙者**: ${stats.activeAgents} 人`,
    "",
    "### 活动概览",
    `- 打野: ${stats.totalHunts} 次`,
    `- 对战: ${stats.totalBattles} 场`,
    `- 挖宝: ${stats.totalTreasures} 次`,
    `- 修炼: ${stats.totalCultivations} 次`,
    `- 突破: ${stats.totalBreakthroughs} 次`,
    `- 捕兽: ${stats.totalBeastHunts} 次 (捕获 ${stats.totalBeastsCaptured})`,
  ];

  if (topHunter) {
    lines.push("", `### 打野之王: ${truncAddr(topHunter[0])} (${topHunter[1]} 次)`);
  }
  if (topFighter) {
    lines.push(`### 对战之王: ${truncAddr(topFighter[0])} (${topFighter[1]} 胜)`);
  }

  if (breakthroughDetails.length > 0) {
    lines.push("", "### 突破事件");
    for (const b of breakthroughDetails) {
      const icon = b.success ? "✓" : "✗";
      lines.push(`- ${icon} ${truncAddr(b.player)}: ${b.from} → ${b.to}`);
    }
  }

  const summary = lines.join("\n");
  return { summary, stats };
}

/** Generate and save digest to database. Returns the saved summary. */
export async function generateAndSaveDigest(): Promise<string> {
  const { summary, stats } = await generateDigest();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  await pool.query(
    `INSERT INTO daily_digest (digest_date, summary, stats)
     VALUES ($1, $2, $3)
     ON CONFLICT (digest_date)
     DO UPDATE SET summary = EXCLUDED.summary, stats = EXCLUDED.stats, created_at = NOW()`,
    [today, summary, JSON.stringify(stats)]
  );

  console.log(`[dailyDigest] Generated digest for ${today}`);
  return summary;
}

/** Schedule daily digest generation at UTC 00:00 (Beijing 08:00). */
export function scheduleDailyDigest(): void {
  const run = () => {
    generateAndSaveDigest().catch((err) => {
      console.error("[dailyDigest] Failed to generate:", err);
    });
  };

  // Calculate ms until next UTC 00:00
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0
  ));
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`[dailyDigest] Next digest in ${Math.round(msUntilMidnight / 60_000)} minutes`);

  // First run at next midnight, then every 24h
  setTimeout(() => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}
