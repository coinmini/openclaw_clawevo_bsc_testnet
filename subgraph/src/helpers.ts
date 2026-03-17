import { BigInt, ByteArray, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Player, ProtocolStats, TreasuryStats } from "../generated/schema";

// ── Constants ──

export const ZERO_BI = BigInt.fromI32(0);
export const ONE_BI = BigInt.fromI32(1);
export const PROTOCOL_STATS_ID = Bytes.fromI32(1);
export const TREASURY_STATS_ID = Bytes.fromI32(0);

// ── BigInt → Bytes conversion ──

export function bigIntToBytes(value: BigInt): Bytes {
  return Bytes.fromByteArray(ByteArray.fromBigInt(value));
}

// ── Event ID ──

export function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

// ── Day ID from timestamp ──

export function getDayId(timestamp: BigInt): i32 {
  return timestamp.toI32() / 86400;
}

// ── Get or Create Player ──

export function getOrCreatePlayer(address: Bytes): Player {
  let player = Player.load(address);
  if (player == null) {
    player = new Player(address);
    player.origin = 0;
    player.element = 0;
    player.attack = ZERO_BI;
    player.defense = ZERO_BI;
    player.perception = ZERO_BI;
    player.wisdom = ZERO_BI;
    player.realm = 0;
    player.registeredAt = ZERO_BI;
    player.registeredBlock = ZERO_BI;
    player.totalMatchesPlayed = 0;
    player.totalMatchesWon = 0;
    player.totalMatchesLost = 0;
    player.totalWagerWon = ZERO_BI;
    player.totalWagerLost = ZERO_BI;
    player.totalHunts = 0;
    player.totalHuntsWon = 0;
    player.totalTreasures = 0;
    player.totalCultivationSessions = 0;
    player.spiritMaterials = ZERO_BI;
    player.save();
  }
  return player;
}

// ── Get or Create ProtocolStats (singleton) ──

export function getOrCreateProtocolStats(): ProtocolStats {
  let stats = ProtocolStats.load(PROTOCOL_STATS_ID);
  if (stats == null) {
    stats = new ProtocolStats(PROTOCOL_STATS_ID);
    stats.totalPlayers = 0;
    stats.totalMatches = 0;
    stats.totalChallenges = 0;
    stats.totalOrders = 0;
    stats.totalOrdersFilled = 0;
    stats.totalEquipmentMinted = 0;
    stats.totalBeastsMinted = 0;
    stats.totalSectsCreated = 0;
    stats.save();
  }
  return stats;
}

// ── Get or Create TreasuryStats (singleton) ──

export function getOrCreateTreasuryStats(): TreasuryStats {
  let stats = TreasuryStats.load(TREASURY_STATS_ID);
  if (stats == null) {
    stats = new TreasuryStats(TREASURY_STATS_ID);
    stats.totalCollected = ZERO_BI;
    stats.totalBurned = ZERO_BI;
    stats.totalDev = ZERO_BI;
    stats.totalFoundation = ZERO_BI;
    stats.save();
  }
  return stats;
}

// ── Cave Tier to string ──

export function caveTierToString(tier: i32): string {
  if (tier == 1) return "CaveHeaven";
  if (tier == 2) return "BlessedLand";
  if (tier == 3) return "SpiritLand";
  return "None";
}
