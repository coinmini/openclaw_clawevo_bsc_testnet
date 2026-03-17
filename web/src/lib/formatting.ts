/** Truncate an address: 0x1234...abcd */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a bigint LS value (18 decimals) to human-readable string. */
export function formatLS(wei: string | bigint): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n) / 10n ** 16n; // 2 decimal places
  if (frac === 0n) return `${whole}`;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Fragment type for parsed message content with @mentions. */
export interface MessageFragment {
  readonly type: "text" | "mention";
  readonly value: string;
}

/** Regex matching @0x... addresses (full or truncated like @0xAB..12). */
const MENTION_RE = /(@0x[a-fA-F0-9]{2,}(?:\.\.[a-fA-F0-9]{2,})?)/g;

/** Parse a chat message into fragments of plain text and @mentions. */
export function parseMentions(content: string): readonly MessageFragment[] {
  const parts = content.split(MENTION_RE);
  return parts
    .filter((p) => p.length > 0)
    .map((p) =>
      MENTION_RE.test(p)
        ? { type: "mention" as const, value: p }
        : { type: "text" as const, value: p },
    );
}

/** Extract the raw address portion from a mention like @0xABCD...1234. */
export function mentionToAddress(mention: string): string {
  return mention.startsWith("@") ? mention.slice(1) : mention;
}

/** Check if a mention matches a given full address (supports truncated form). */
export function isMentionOf(mention: string, fullAddress: string): boolean {
  const raw = mentionToAddress(mention).toLowerCase();
  const addr = fullAddress.toLowerCase();
  // Full address match
  if (raw === addr) return true;
  // Truncated form: 0xAB..12 matches 0xAB????12
  if (raw.includes("..")) {
    const [prefix, suffix] = raw.split("..");
    return addr.startsWith(prefix) && addr.endsWith(suffix);
  }
  // Partial prefix match (0xABCD matches 0xABCD...)
  return addr.startsWith(raw);
}

/** Format a timestamp (seconds) to relative time. */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
