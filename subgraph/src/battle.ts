import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  ChallengeCreated,
  ChallengeCancelled,
  MatchSettled,
} from "../generated/Battle/Battle";
import {
  Challenge,
  BattleMatch,
  PlayerDailyStats,
} from "../generated/schema";
import {
  getOrCreatePlayer,
  getOrCreateProtocolStats,
  eventId,
  getDayId,
  bigIntToBytes,
  ZERO_BI,
} from "./helpers";

export function handleChallengeCreated(event: ChallengeCreated): void {
  let id = bigIntToBytes(event.params.challengeId);
  let challenge = new Challenge(id);

  let creator = getOrCreatePlayer(event.params.creator);

  challenge.challengeId = event.params.challengeId;
  challenge.creator = creator.id;
  challenge.wager = event.params.wager;
  challenge.status = "Open";
  challenge.createdAt = event.block.timestamp;
  challenge.createdBlock = event.block.number;
  challenge.save();

  let stats = getOrCreateProtocolStats();
  stats.totalChallenges += 1;
  stats.save();
}

export function handleChallengeCancelled(event: ChallengeCancelled): void {
  let id = bigIntToBytes(event.params.challengeId);
  let challenge = Challenge.load(id);
  if (challenge == null) return;

  challenge.status = "Cancelled";
  challenge.cancelledAt = event.block.timestamp;
  challenge.save();
}

export function handleMatchSettled(event: MatchSettled): void {
  // New event: MatchSettled(indexed uint256 matchId, indexed address winner, uint256 payout)
  let matchId = bigIntToBytes(event.params.matchId);
  let match = new BattleMatch(matchId);

  let winner = getOrCreatePlayer(event.params.winner);

  match.matchId = event.params.matchId;
  match.winner = event.params.winner;
  match.payout = event.params.payout;
  match.settledAt = event.block.timestamp;
  match.settledBlock = event.block.number;
  match.transactionHash = event.transaction.hash;
  match.save();

  // Update winner stats
  winner.totalMatchesPlayed += 1;
  winner.totalMatchesWon += 1;
  winner.totalWagerWon = winner.totalWagerWon.plus(event.params.payout);
  winner.save();

  // Update daily stats for winner
  let dayId = getDayId(event.block.timestamp);
  updateDailyStats(winner.id, dayId, event.params.winner, event.params.payout);

  // Update protocol stats
  let stats = getOrCreateProtocolStats();
  stats.totalMatches += 1;
  stats.save();
}

function updateDailyStats(
  playerId: Bytes,
  dayId: i32,
  winner: Bytes,
  payout: BigInt
): void {
  let id = playerId.concatI32(dayId);
  let daily = PlayerDailyStats.load(id);
  if (daily == null) {
    daily = new PlayerDailyStats(id);
    daily.player = playerId;
    daily.dayId = dayId;
    daily.matchesPlayed = 0;
    daily.matchesWon = 0;
    daily.wagerWon = ZERO_BI;
    daily.wagerLost = ZERO_BI;
  }

  daily.matchesPlayed += 1;
  if (winner == playerId) {
    daily.matchesWon += 1;
    daily.wagerWon = daily.wagerWon.plus(payout);
  } else {
    daily.wagerLost = daily.wagerLost.plus(payout);
  }
  daily.save();
}
