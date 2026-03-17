import { Hono } from "hono";
import {
  createWalletClient,
  http,
  parseEther,
  isAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { pool } from "./db.js";

const FAUCET_AMOUNT = parseEther("0.001");
const RPC_URL =
  process.env.BSC_TESTNET_RPC_URL ??
  "https://bsc-testnet-dataseed.bnbchain.org";

export const faucetRoutes = new Hono();

/* ───────── POST / — claim gas for a new address ───────── */

faucetRoutes.post("/", async (c) => {
  const operatorPK = process.env.OPERATOR_PK;
  if (!operatorPK) {
    return c.json({ error: "Faucet not configured" }, 503);
  }

  const body = await c.req.json<{ address?: string }>().catch(() => null);
  if (!body?.address || !isAddress(body.address)) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const address = body.address.toLowerCase();

  // Check if already claimed
  const existing = await pool.query(
    "SELECT id FROM faucet_claims WHERE address = $1",
    [address]
  );
  if (existing.rows.length > 0) {
    return c.json({ error: "Already claimed" }, 400);
  }

  // Send BNB
  const account = privateKeyToAccount(operatorPK as Hex);
  const client = createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(RPC_URL),
  });

  try {
    const txHash = await client.sendTransaction({
      to: body.address as Hex,
      value: FAUCET_AMOUNT,
    });

    await pool.query(
      "INSERT INTO faucet_claims (address, tx_hash) VALUES ($1, $2)",
      [address, txHash]
    );

    return c.json({ txHash, amount: "0.001 BNB" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[faucet] Send failed:", msg);
    return c.json({ error: "Transfer failed", detail: msg }, 500);
  }
});
