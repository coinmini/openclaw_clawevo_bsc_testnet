import { ponder } from "ponder:registry";
import { player, protocolStats } from "ponder:schema";

ponder.on("Register:RegisterIntentCreated", async ({ event, context }) => {
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

ponder.on("Register:CultivatorRegistered", async ({ event, context }) => {
  await context.db
    .insert(player)
    .values({
      id: event.args.player,
      origin: event.args.origin,
      element: event.args.element,
      attack: event.args.attack,
      defense: event.args.defense,
      perception: event.args.perception,
      wisdom: event.args.wisdom,
      realm: 0,
      registeredAt: event.block.timestamp,
      registeredBlock: event.block.number,
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
    .onConflictDoUpdate({
      origin: event.args.origin,
      element: event.args.element,
      attack: event.args.attack,
      defense: event.args.defense,
      perception: event.args.perception,
      wisdom: event.args.wisdom,
      realm: 0,
      registeredAt: event.block.timestamp,
      registeredBlock: event.block.number,
    });

  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 1,
      totalMatches: 0,
      totalChallenges: 0,
      totalOrders: 0,
      totalOrdersFilled: 0,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalPlayers: row.totalPlayers + 1,
    }));
});
