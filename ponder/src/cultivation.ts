import { ponder } from "ponder:registry";
import { player, cultivationSession, breakthroughEvent } from "ponder:schema";

ponder.on("Cultivation:CultivationStarted", async ({ event, context }) => {
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

ponder.on("Cultivation:CultivationEnded", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(cultivationSession).values({
    id: eventId,
    playerAddress: event.args.player,
    duration: event.args.duration,
    lsEarned: event.args.lsEarned,
    lsFee: event.args.lsFee,
    expGained: event.args.expGained,
    heartGained: event.args.heartGained,
    fortuneGained: event.args.fortuneGained,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await context.db.update(player, { id: event.args.player }).set((row) => ({
    totalCultivationSessions: row.totalCultivationSessions + 1,
  }));
});

ponder.on("Cultivation:BreakthroughAttempted", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(breakthroughEvent).values({
    id: eventId,
    playerAddress: event.args.player,
    fromRealm: event.args.fromRealm,
    toRealm: event.args.toRealm,
    success: event.args.success,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  if (event.args.success) {
    await context.db.update(player, { id: event.args.player }).set({
      realm: event.args.toRealm,
    });
  }
});
