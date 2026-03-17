import { Hono } from "hono";
import { verifyMessage } from "viem";
import { pool, type ChatMessageRow } from "../db.js";
import { checkRateLimit } from "../middleware/rateLimit.js";

const MAX_CONTENT_LENGTH = 200;

/** Chat API response message shape. */
interface ChatMessage {
  readonly id: number;
  readonly sender: string;
  readonly content: string;
  readonly createdAt: string;
}

function toMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sender: row.sender,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

export const chatRoutes = new Hono();

/* ───────── POST /api/chat — send a message ───────── */

chatRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    sender?: string;
    content?: string;
    timestamp?: number;
    signature?: string;
  }>();

  const { sender, content, timestamp, signature } = body;

  // Validate required fields
  if (!sender || !content || !timestamp || !signature) {
    return c.json(
      { error: "missing required fields: sender, content, timestamp, signature" },
      400
    );
  }

  // Validate content length
  if (content.length > MAX_CONTENT_LENGTH) {
    return c.json({ error: `content exceeds ${MAX_CONTENT_LENGTH} characters` }, 400);
  }

  // Rate limit
  const remaining = checkRateLimit(sender);
  if (remaining > 0) {
    return c.json({ error: `rate limited, retry in ${remaining}s` }, 429);
  }

  // Verify signature
  try {
    const message = `${content}|${timestamp}`;
    const valid = await verifyMessage({
      address: sender as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return c.json({ error: "invalid signature" }, 401);
    }
  } catch {
    return c.json({ error: "signature verification failed" }, 401);
  }

  // Insert into database
  const result = await pool.query<ChatMessageRow>(
    "INSERT INTO chat_messages (sender, content) VALUES ($1, $2) RETURNING id, created_at",
    [sender.toLowerCase(), content]
  );

  const row = result.rows[0];
  return c.json({ id: row.id, createdAt: row.created_at.toISOString() }, 201);
});

/* ───────── GET /api/chat — list recent messages ───────── */

chatRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const before = Number(c.req.query("before") ?? 0);

  const query = before > 0
    ? "SELECT * FROM chat_messages WHERE id < $1 ORDER BY id DESC LIMIT $2"
    : "SELECT * FROM chat_messages ORDER BY id DESC LIMIT $1";

  const params = before > 0 ? [before, limit] : [limit];
  const result = await pool.query<ChatMessageRow>(query, params);

  // Return in chronological order (oldest first)
  const messages: readonly ChatMessage[] = result.rows.reverse().map(toMessage);
  return c.json({ messages });
});

/* ───────── GET /api/chat/player/:address — player chat history ───────── */

chatRoutes.get("/player/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 200);
  const before = Number(c.req.query("before") ?? 0);

  const query = before > 0
    ? "SELECT * FROM chat_messages WHERE sender = $1 AND id < $2 ORDER BY id DESC LIMIT $3"
    : "SELECT * FROM chat_messages WHERE sender = $1 ORDER BY id DESC LIMIT $2";

  const params = before > 0 ? [address, before, limit] : [address, limit];
  const result = await pool.query<ChatMessageRow>(query, params);

  const messages: readonly ChatMessage[] = result.rows.reverse().map(toMessage);
  return c.json({ messages });
});
