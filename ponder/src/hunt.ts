import { ponder } from "ponder:registry";
import { player, huntEvent, huntDropEvent } from "ponder:schema";

ponder.on("Hunt:HuntStarted", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(huntEvent).values({
    id: eventId,
    playerAddress: event.args.player,
    regionId: event.args.regionId,
    won: event.args.won,
    playerScore: event.args.playerScore,
    monsterScore: event.args.monsterScore,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await context.db.update(player, { id: event.args.player }).set((row) => ({
    totalHunts: row.totalHunts + 1,
    totalHuntsWon: event.args.won ? row.totalHuntsWon + 1 : row.totalHuntsWon,
  }));
});

ponder.on("Hunt:HuntDropClaimed", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db
    .insert(player)
    .values({
      id: event.args.player,
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

  await context.db.insert(huntDropEvent).values({
    id: eventId,
    playerAddress: event.args.player,
    regionId: event.args.regionId,
    dropQuality: event.args.dropQuality,
    dropReward: event.args.dropReward,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});
