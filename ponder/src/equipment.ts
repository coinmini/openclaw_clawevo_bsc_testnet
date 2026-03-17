import { ponder } from "ponder:registry";
import {
  player,
  equipmentToken,
  equipmentEnhancedEvent,
  equipmentUpgradeEvent,
  equipmentDecomposedEvent,
  protocolStats,
} from "ponder:schema";

ponder.on("Equipment:EquipmentMinted", async ({ event, context }) => {
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

  await context.db.insert(equipmentToken).values({
    id: tokenId,
    tokenId: event.args.tokenId,
    ownerAddress: event.args.to,
    equipmentType: event.args.eType,
    quality: event.args.quality,
    bonusBP: event.args.bonusBP,
    enhanceLevel: 0,
    decomposed: false,
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
      totalEquipmentMinted: 1,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalEquipmentMinted: row.totalEquipmentMinted + 1,
    }));
});

ponder.on("Equipment:EquipmentEquipped", async ({ event, context }) => {
  const tokenId = event.args.tokenId.toString();

  await context.db.update(equipmentToken, { id: tokenId }).set({
    equippedBy: event.args.player,
  });
});

ponder.on("Equipment:EquipmentUnequipped", async ({ event, context }) => {
  const tokenId = event.args.tokenId.toString();

  await context.db.update(equipmentToken, { id: tokenId }).set({
    equippedBy: null,
  });
});

ponder.on("Equipment:EquipmentEnhanced", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const tokenId = event.args.tokenId.toString();

  await context.db.update(equipmentToken, { id: tokenId }).set({
    enhanceLevel: event.args.newLevel,
  });

  await context.db.insert(equipmentEnhancedEvent).values({
    id: eventId,
    tokenId: event.args.tokenId,
    newLevel: event.args.newLevel,
    cost: event.args.cost,
    timestamp: event.block.timestamp,
  });
});

ponder.on("Equipment:UpgradeStarted", async ({ event, context }) => {
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

ponder.on("Equipment:UpgradeFinished", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(equipmentUpgradeEvent).values({
    id: eventId,
    player: event.args.player,
    newTokenId: event.args.newTokenId,
    quality: event.args.quality,
    success: event.args.success,
    timestamp: event.block.timestamp,
  });
});

ponder.on("Equipment:EquipmentDecomposed", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const tokenId = event.args.tokenId.toString();

  await context.db.update(equipmentToken, { id: tokenId }).set({
    decomposed: true,
    equippedBy: null,
  });

  await context.db.insert(equipmentDecomposedEvent).values({
    id: eventId,
    tokenId: event.args.tokenId,
    spiritMaterials: event.args.spiritMaterials,
    lsRefund: event.args.lsRefund,
    timestamp: event.block.timestamp,
  });
});
