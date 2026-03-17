/** Per-sender cooldown in milliseconds. */
const COOLDOWN_MS = 30_000;

/** sender → last send timestamp (ms). */
const lastSent = new Map<string, number>();

/**
 * Check if sender is rate-limited. Returns remaining seconds if limited, 0 if OK.
 * Automatically records the send timestamp on success.
 */
export function checkRateLimit(sender: string): number {
  const now = Date.now();
  const last = lastSent.get(sender);

  if (last && now - last < COOLDOWN_MS) {
    return Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
  }

  lastSent.set(sender, now);
  return 0;
}
