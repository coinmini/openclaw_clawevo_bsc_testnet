import { Hono } from "hono";
import { pool, type DailyDigestRow } from "../db.js";
import { generateAndSaveDigest } from "../jobs/dailyDigest.js";

interface DigestResponse {
  readonly id: number;
  readonly digestDate: string;
  readonly summary: string;
  readonly stats: Record<string, unknown>;
  readonly createdAt: string;
}

function toResponse(row: DailyDigestRow): DigestResponse {
  return {
    id: row.id,
    digestDate: row.digest_date,
    summary: row.summary,
    stats: row.stats,
    createdAt: row.created_at.toISOString(),
  };
}

export const digestRoutes = new Hono();

/* ───────── GET /api/digest — recent digests (last 7) ───────── */

digestRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 7), 30);
  const result = await pool.query<DailyDigestRow>(
    "SELECT * FROM daily_digest ORDER BY digest_date DESC LIMIT $1",
    [limit]
  );
  const digests: readonly DigestResponse[] = result.rows.map(toResponse);
  return c.json({ digests });
});

/* ───────── GET /api/digest/latest — most recent digest ───────── */

digestRoutes.get("/latest", async (c) => {
  const result = await pool.query<DailyDigestRow>(
    "SELECT * FROM daily_digest ORDER BY digest_date DESC LIMIT 1"
  );
  if (result.rows.length === 0) {
    return c.json({ digest: null });
  }
  return c.json({ digest: toResponse(result.rows[0]) });
});

/* ───────── POST /api/digest/generate — manual trigger ───────── */

digestRoutes.post("/generate", async (c) => {
  try {
    const summary = await generateAndSaveDigest();
    return c.json({ ok: true, summary }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return c.json({ ok: false, error: message }, 500);
  }
});
