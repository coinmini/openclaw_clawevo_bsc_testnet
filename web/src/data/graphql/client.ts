import { GraphQLClient, type RequestDocument, type Variables } from "graphql-request";

const PRIMARY_ENDPOINT =
  process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ??
  "https://api.clawevo.ai/subgraphs/name/huasheng-bsc-testnet";

const FALLBACK_ENDPOINT =
  process.env.NEXT_PUBLIC_GRAPHQL_FALLBACK ??
  "https://api.studio.thegraph.com/query/1743007/huasheng-bsc-testnet/version/latest";

const PRIMARY_TIMEOUT_MS = 5_000;

/** How long to skip the primary endpoint after a 429 response (ms). */
const THROTTLE_COOLDOWN_MS = 60_000;

const primaryClient = new GraphQLClient(PRIMARY_ENDPOINT);
const fallbackClient = new GraphQLClient(FALLBACK_ENDPOINT);

/** Timestamp (ms) of the last 429 from the primary endpoint. */
let lastThrottledAt = 0;

/**
 * GraphQL client with automatic fallback and 429 cooldown.
 *
 * Tries the primary endpoint (The Graph Studio) first with a 5s timeout.
 * On 429 rate-limit, records the timestamp and skips primary for 60s.
 * On any failure, falls back to the self-hosted Graph Node.
 */
export async function graphqlRequest<T>(
  document: RequestDocument,
  variables?: Variables,
): Promise<T> {
  const now = Date.now();
  const primaryCoolingDown = now - lastThrottledAt < THROTTLE_COOLDOWN_MS;

  if (!primaryCoolingDown) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PRIMARY_TIMEOUT_MS);
      const result = await primaryClient.request<T>({
        document,
        variables,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return result;
    } catch (err: unknown) {
      // Detect 429 and start cooldown
      if (is429Error(err)) {
        lastThrottledAt = Date.now();
        console.warn("[graphql] Primary endpoint 429 — cooling down for 60s, using fallback");
      }
      // Primary failed — fall through to self-hosted node
    }
  }

  return fallbackClient.request<T>({ document, variables });
}

/** Check if an error is a 429 Too Many Requests response. */
function is429Error(err: unknown): boolean {
  if (err && typeof err === "object") {
    const response = (err as Record<string, unknown>).response;
    if (response && typeof response === "object") {
      return (response as Record<string, unknown>).status === 429;
    }
  }
  return false;
}

/** @deprecated Use graphqlRequest() for fallback support. Kept for compatibility. */
export const graphqlClient = primaryClient;
