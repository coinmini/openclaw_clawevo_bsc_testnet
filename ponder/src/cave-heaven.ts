import { ponder } from "ponder:registry";
import { player, caveHeavenState, caveEvent } from "ponder:schema";

function caveTierToString(tier: number): string {
  if (tier === 1) return "CaveHeaven";
  if (tier === 2) return "BlessedLand";
  if (tier === 3) return "SpiritLand";
  return "None";
}

ponder.on("CaveHeaven:CaveOpened", async ({ event, context }) => {
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

  await context.db.insert(caveHeavenState).values({
    id: event.args.player,
    playerAddress: event.args.player,
    tier: "CaveHeaven",
    totalMaintenancePaid: 0n,
    openedAt: event.block.timestamp,
  });

  await context.db.insert(caveEvent).values({
    id: eventId,
    player: event.args.player,
    eventType: "Opened",
    tier: 0,
    cost: event.args.cost,
    timestamp: event.block.timestamp,
  });
});

ponder.on("CaveHeaven:CaveUpgraded", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const tierStr = caveTierToString(event.args.newTier);

  await context.db
    .update(caveHeavenState, { id: event.args.player })
    .set({
      tier: tierStr,
      upgradedAt: event.block.timestamp,
    });

  await context.db.insert(caveEvent).values({
    id: eventId,
    player: event.args.player,
    eventType: "Upgraded",
    tier: event.args.newTier,
    cost: event.args.cost,
    timestamp: event.block.timestamp,
  });
});

ponder.on("CaveHeaven:MaintenancePaid", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db
    .update(caveHeavenState, { id: event.args.player })
    .set((row) => ({
      totalMaintenancePaid: row.totalMaintenancePaid + event.args.totalCost,
    }));

  await context.db.insert(caveEvent).values({
    id: eventId,
    player: event.args.player,
    eventType: "MaintenancePaid",
    tier: 0,
    cost: event.args.totalCost,
    timestamp: event.block.timestamp,
  });
});

ponder.on("CaveHeaven:CaveDowngraded", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const tierStr = caveTierToString(event.args.newTier);

  await context.db
    .update(caveHeavenState, { id: event.args.player })
    .set({
      tier: tierStr,
    });

  await context.db.insert(caveEvent).values({
    id: eventId,
    player: event.args.player,
    eventType: "Downgraded",
    tier: event.args.newTier,
    cost: 0n,
    timestamp: event.block.timestamp,
  });
});
