import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://chat:chat-pass@162.247.153.224:5434/chat";

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
});

/** Typed row returned from chat_messages table. */
export interface ChatMessageRow {
  readonly id: number;
  readonly sender: string;
  readonly content: string;
  readonly created_at: Date;
}

/** Typed row returned from daily_digest table. */
export interface DailyDigestRow {
  readonly id: number;
  readonly digest_date: string;
  readonly summary: string;
  readonly stats: Record<string, unknown>;
  readonly created_at: Date;
}

/** Ensure required tables exist (idempotent). */
export async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_digest (
      id SERIAL PRIMARY KEY,
      digest_date DATE NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      stats JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
