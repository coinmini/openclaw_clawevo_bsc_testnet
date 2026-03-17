import { ponder } from "ponder:registry";
import { player, treasureEvent } from "ponder:schema";

ponder.on("Treasure:TreasureStarted", async ({ event, context }) => {
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
});

ponder.on("Treasure:TreasureFinished", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(treasureEvent).values({
    id: eventId,
    playerAddress: event.args.player,
    regionId: event.args.regionId,
    quality: event.args.quality,
    reward: event.args.reward,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await context.db.update(player, { id: event.args.player }).set((row) => ({
    totalTreasures: row.totalTreasures + 1,
  }));
});
