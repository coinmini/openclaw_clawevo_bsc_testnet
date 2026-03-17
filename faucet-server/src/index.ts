import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { faucetRoutes } from "./faucet.js";
import { ensureTable } from "./db.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));
app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/api/faucet", faucetRoutes);

const PORT = Number(process.env.PORT ?? 4001);

ensureTable()
  .then(() => {
    serve({ fetch: app.fetch, port: PORT }, (info) => {
      console.log(`[faucet-server] listening on http://localhost:${info.port}`);
    });
  })
  .catch((err) => {
    console.error("[faucet-server] Failed to init:", err);
    process.exit(1);
  });
