import { ponder } from "ponder:registry";
import {
  player,
  challenge,
  battleMatch,
  playerDailyStats,
  protocolStats,
} from "ponder:schema";

ponder.on("Battle:ChallengeCreated", async ({ event, context }) => {
  const challengeId = event.args.challengeId.toString();

  await context.db
    .insert(player)
    .values({
      id: event.args.creator,
      origin: 0,
      element: 0,
      attack: 0n,
      defense: 0n,
      perception: 0n,
      wisdom: 0n,
      realm: 0,
      registeredAt: 0n,
      registeredBlock: 0n,
      totalMatchesPlayed: 0,
      totalMatchesWon: 0,
      totalMatchesLost: 0,
      totalWagerWon: 0n,
      totalWagerLost: 0n,
      totalHunts: 0,
      totalHuntsWon: 0,
      totalTreasures: 0,
      totalCultivationSessions: 0,
    })
    .onConflictDoNothing();

  await context.db.insert(challenge).values({
    id: challengeId,
    challengeId: event.args.challengeId,
    creatorAddress: event.args.creator,
    wager: event.args.wager,
    status: "Open",
    createdAt: event.block.timestamp,
    createdBlock: event.block.number,
  });

  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 0,
      totalMatches: 0,
      totalChallenges: 1,
      totalOrders: 0,
      totalOrdersFilled: 0,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalChallenges: row.totalChallenges + 1,
    }));
});

ponder.on("Battle:ChallengeCancelled", async ({ event, context }) => {
  const challengeId = event.args.challengeId.toString();

  const existing = await context.db.find(challenge, { id: challengeId });
  if (existing) {
    await context.db.update(challenge, { id: challengeId }).set({
      status: "Cancelled",
      cancelledAt: event.block.timestamp,
    });
  }
});

ponder.on("Battle:MatchSettled", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const challengeId = event.args.challengeId.toString();
  const dayId = Number(event.block.timestamp / 86400n);

  const isPlayerAWinner = event.args.winner === event.args.playerA;

  await context.db.insert(battleMatch).values({
    id: eventId,
    matchId: event.args.matchId,
    challengeId: event.args.challengeId,
    challengeRef: challengeId,
    playerAAddress: event.args.playerA,
    playerBAddress: event.args.playerB,
    winner: event.args.winner,
    payout: event.args.payout,
    settledAt: event.block.timestamp,
    settledBlock: event.block.number,
    transactionHash: event.transaction.hash,
  });

  const existingChallenge = await context.db.find(challenge, {
    id: challengeId,
  });
  if (existingChallenge) {
    await context.db.update(challenge, { id: challengeId }).set({
      status: "Settled",
      settledAt: event.block.timestamp,
    });
  }

  // Update playerA stats
  await context.db.update(player, { id: event.args.playerA }).set((row) => ({
    totalMatchesPlayed: row.totalMatchesPlayed + 1,
    totalMatchesWon: isPlayerAWinner
      ? row.totalMatchesWon + 1
      : row.totalMatchesWon,
    totalMatchesLost: isPlayerAWinner
      ? row.totalMatchesLost
      : row.totalMatchesLost + 1,
    totalWagerWon: isPlayerAWinner
      ? row.totalWagerWon + event.args.payout
      : row.totalWagerWon,
    totalWagerLost: isPlayerAWinner
      ? row.totalWagerLost
      : row.totalWagerLost + event.args.payout,
  }));

  // Update playerB stats
  await context.db.update(player, { id: event.args.playerB }).set((row) => ({
    totalMatchesPlayed: row.totalMatchesPlayed + 1,
    totalMatchesWon: isPlayerAWinner
      ? row.totalMatchesWon
      : row.totalMatchesWon + 1,
    totalMatchesLost: isPlayerAWinner
      ? row.totalMatchesLost + 1
      : row.totalMatchesLost,
    totalWagerWon: isPlayerAWinner
      ? row.totalWagerWon
      : row.totalWagerWon + event.args.payout,
    totalWagerLost: isPlayerAWinner
      ? row.totalWagerLost + event.args.payout
      : row.totalWagerLost,
  }));

  // Daily stats for playerA
  await context.db
    .insert(playerDailyStats)
    .values({
      playerAddress: event.args.playerA,
      dayId,
      matchesPlayed: 1,
      matchesWon: isPlayerAWinner ? 1 : 0,
      wagerWon: isPlayerAWinner ? event.args.payout : 0n,
      wagerLost: isPlayerAWinner ? 0n : event.args.payout,
    })
    .onConflictDoUpdate((row) => ({
      matchesPlayed: row.matchesPlayed + 1,
      matchesWon: isPlayerAWinner ? row.matchesWon + 1 : row.matchesWon,
      wagerWon: isPlayerAWinner
        ? row.wagerWon + event.args.payout
        : row.wagerWon,
      wagerLost: isPlayerAWinner
        ? row.wagerLost
        : row.wagerLost + event.args.payout,
    }));

  // Daily stats for playerB
  await context.db
    .insert(playerDailyStats)
    .values({
      playerAddress: event.args.playerB,
      dayId,
      matchesPlayed: 1,
      matchesWon: isPlayerAWinner ? 0 : 1,
      wagerWon: isPlayerAWinner ? 0n : event.args.payout,
      wagerLost: isPlayerAWinner ? event.args.payout : 0n,
    })
    .onConflictDoUpdate((row) => ({
      matchesPlayed: row.matchesPlayed + 1,
      matchesWon: isPlayerAWinner ? row.matchesWon : row.matchesWon + 1,
      wagerWon: isPlayerAWinner
        ? row.wagerWon
        : row.wagerWon + event.args.payout,
      wagerLost: isPlayerAWinner
        ? row.wagerLost + event.args.payout
        : row.wagerLost,
    }));

  // Update protocol stats
  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 0,
      totalMatches: 1,
      totalChallenges: 0,
      totalOrders: 0,
      totalOrdersFilled: 0,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalMatches: row.totalMatches + 1,
    }));
});
