import { ponder } from "ponder:registry";
import {
  player,
  marketOrder,
  allowedToken,
  protocolStats,
} from "ponder:schema";

ponder.on("Market:OrderCreated", async ({ event, context }) => {
  const orderId = event.args.orderId.toString();

  await context.db
    .insert(player)
    .values({
      id: event.args.seller,
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

  await context.db.insert(marketOrder).values({
    id: orderId,
    orderId: event.args.orderId,
    sellerAddress: event.args.seller,
    tokenContract: event.args.tokenContract,
    tokenId: event.args.tokenId,
    price: event.args.price,
    isERC1155: false,
    status: "Active",
    createdAt: event.block.timestamp,
    createdBlock: event.block.number,
  });

  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 0,
      totalMatches: 0,
      totalChallenges: 0,
      totalOrders: 1,
      totalOrdersFilled: 0,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalOrders: row.totalOrders + 1,
    }));
});

ponder.on("Market:OrderCancelled", async ({ event, context }) => {
  const orderId = event.args.orderId.toString();

  await context.db.update(marketOrder, { id: orderId }).set({
    status: "Cancelled",
    cancelledAt: event.block.timestamp,
  });
});

ponder.on("Market:OrderFilled", async ({ event, context }) => {
  const orderId = event.args.orderId.toString();

  await context.db.update(marketOrder, { id: orderId }).set({
    status: "Filled",
    buyer: event.args.buyer,
    fee: event.args.fee,
    filledAt: event.block.timestamp,
  });

  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 0,
      totalMatches: 0,
      totalChallenges: 0,
      totalOrders: 0,
      totalOrdersFilled: 1,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalOrdersFilled: row.totalOrdersFilled + 1,
    }));
});

ponder.on("Market:OrderCreated1155", async ({ event, context }) => {
  const orderId = event.args.orderId.toString();

  await context.db
    .insert(player)
    .values({
      id: event.args.seller,
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

  await context.db.insert(marketOrder).values({
    id: orderId,
    orderId: event.args.orderId,
    sellerAddress: event.args.seller,
    tokenContract: event.args.tokenContract,
    tokenId: event.args.tokenId,
    price: event.args.price,
    isERC1155: true,
    amount: event.args.amount,
    status: "Active",
    createdAt: event.block.timestamp,
    createdBlock: event.block.number,
  });

  await context.db
    .insert(protocolStats)
    .values({
      id: "protocol-stats",
      totalPlayers: 0,
      totalMatches: 0,
      totalChallenges: 0,
      totalOrders: 1,
      totalOrdersFilled: 0,
      totalEquipmentMinted: 0,
      totalBeastsMinted: 0,
      totalSectsCreated: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalOrders: row.totalOrders + 1,
    }));
});

ponder.on("Market:TokenAllowed", async ({ event, context }) => {
  await context.db
    .insert(allowedToken)
    .values({
      id: event.args.tokenContract,
      allowed: event.args.allowed,
      updatedAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      allowed: event.args.allowed,
      updatedAt: event.block.timestamp,
    });
});
