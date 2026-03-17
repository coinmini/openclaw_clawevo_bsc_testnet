import { ponder } from "ponder:registry";
import {
  player,
  beastToken,
  beastHuntEvent,
  protocolStats,
} from "ponder:schema";

ponder.on("Beast:BeastHuntStarted", async ({ event, context }) => {
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

ponder.on("Beast:BeastHuntFinished", async ({ event, context }) => {
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

  await context.db.insert(beastHuntEvent).values({
    id: eventId,
    playerAddress: event.args.player,
    regionId: event.args.regionId,
    star: event.args.star,
    captured: event.args.captured,
    beastTokenId: event.args.tokenId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("Beast:BeastEquipped", async ({ event, context }) => {
  const tokenId = event.args.tokenId.toString();

  await context.db.update(beastToken, { id: tokenId }).set({
    equippedBy: event.args.player,
  });
});

ponder.on("Beast:BeastUnequipped", async ({ event, context }) => {
  const tokenId = event.args.tokenId.toString();

  await context.db.update(beastToken, { id: tokenId }).set({
    equippedBy: null,
  });
});

ponder.on("Beast:BeastMinted", async ({ event, context }) => {
  const tokenId = event.args.tokenId.toString();

  await context.db
    .insert(player)
    .values({
      id: event.args.to,
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

  await context.db.insert(beastToken).values({
    id: tokenId,
    tokenId: event.args.tokenId,
    ownerAddress: event.args.to,
    star: event.args.star,
    element: event.args.element,
    powerRate: event.args.powerRate,
    speciesId: event.args.speciesId,
    mintedAt: event.block.timestamp,
    mintedBlock: event.block.number,
  });

  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 0,
      totalMatches: 0,
      totalChallenges: 0,
      totalOrders: 0,
      totalOrdersFilled: 0,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 1,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalBeastsMinted: row.totalBeastsMinted + 1,
    }));
});
