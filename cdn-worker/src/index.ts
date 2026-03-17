interface Env {
  CDN_BUCKET: R2Bucket;
  RATE_LIMIT: KVNamespace;
}

/** Max downloads per IP per day */
const MAX_DOWNLOADS_PER_DAY = 3;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Only handle /foundry/ paths
    if (!path.startsWith("/foundry/")) {
      return new Response("Not Found", { status: 404 });
    }

    // HEAD requests for health checks — no rate limit
    if (request.method === "HEAD") {
      const object = await env.CDN_BUCKET.head(path.slice(1));
      if (!object) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": String(object.size),
          "content-type": "application/gzip",
        },
      });
    }

    // GET only
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Rate limiting by IP
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const today = new Date().toISOString().slice(0, 10); // "2026-03-16"
    const kvKey = `dl:${ip}:${today}`;

    const countStr = await env.RATE_LIMIT.get(kvKey);
    const count = countStr ? parseInt(countStr, 10) : 0;

    if (count >= MAX_DOWNLOADS_PER_DAY) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Maximum ${MAX_DOWNLOADS_PER_DAY} downloads per day per IP`,
          retryAfter: "tomorrow",
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "86400",
          },
        }
      );
    }

    // Fetch from R2
    const objectKey = path.slice(1); // remove leading "/"
    const object = await env.CDN_BUCKET.get(objectKey);

    if (!object) {
      return new Response("Not Found", { status: 404 });
    }

    // Increment download count (TTL 24h)
    await env.RATE_LIMIT.put(kvKey, String(count + 1), {
      expirationTtl: 86400,
    });

    // Return file
    const headers = new Headers();
    headers.set("content-type", "application/gzip");
    headers.set("content-length", String(object.size));
    headers.set("content-disposition", `attachment; filename="${objectKey.split("/").pop()}"`);
    headers.set("cache-control", "public, max-age=86400");
    headers.set("x-downloads-remaining", String(MAX_DOWNLOADS_PER_DAY - count - 1));

    return new Response(object.body, { headers });
  },
};
