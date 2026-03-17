import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://graph-node:graph-node-pass@localhost:5433/clawevo_faucet";

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

export async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faucet_claims (
      id SERIAL PRIMARY KEY,
      address VARCHAR(42) UNIQUE NOT NULL,
      tx_hash VARCHAR(66) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
