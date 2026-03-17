import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { chatRoutes } from "./routes/chat.js";
import { digestRoutes } from "./routes/digest.js";
import { ensureTables } from "./db.js";
import { scheduleDailyDigest } from "./jobs/dailyDigest.js";

const app = new Hono();

// CORS — allow frontend and common dev origins
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://clawevo.ai",
      "https://www.clawevo.ai",
      "https://chat.clawevo.ai",
    ],
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Chat routes
app.route("/api/chat", chatRoutes);

// Digest routes
app.route("/api/digest", digestRoutes);

const PORT = Number(process.env.PORT ?? 4000);

// Initialize tables then start server
ensureTables()
  .then(() => {
    console.log("[chat-server] Tables ensured.");
    scheduleDailyDigest();
    serve({ fetch: app.fetch, port: PORT }, (info) => {
      console.log(`[chat-server] listening on http://localhost:${info.port}`);
    });
  })
  .catch((err) => {
    console.error("[chat-server] Failed to init tables:", err);
    process.exit(1);
  });
