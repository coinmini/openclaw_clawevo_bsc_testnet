import { ponder } from "ponder:registry";
import {
  player,
  secretRealmRun,
  layerChallengeEvent,
  layerDropEvent,
  secretRealmParty,
} from "ponder:schema";

ponder.on("SecretRealm:SoloEntered", async ({ event, context }) => {
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

  await context.db.insert(secretRealmRun).values({
    id: eventId,
    playerAddress: event.args.player,
    realmId: event.args.realmId,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SecretRealm:LayerChallenged", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(layerChallengeEvent).values({
    id: eventId,
    player: event.args.player,
    realmId: event.args.realmId,
    layer: event.args.layer,
    won: event.args.won,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SecretRealm:LayerDropClaimed", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(layerDropEvent).values({
    id: eventId,
    player: event.args.player,
    realmId: event.args.realmId,
    layer: event.args.layer,
    reward: event.args.reward,
    timestamp: event.block.timestamp,
  });
});

ponder.on("SecretRealm:PartyCreated", async ({ event, context }) => {
  const partyId = event.args.partyId.toString();

  await context.db.insert(secretRealmParty).values({
    id: partyId,
    partyId: event.args.partyId,
    leader: event.args.leader,
    realmId: event.args.realmId,
    memberCount: 1,
    entered: false,
    createdAt: event.block.timestamp,
  });
});

ponder.on("SecretRealm:PartyJoined", async ({ event, context }) => {
  const partyId = event.args.partyId.toString();

  await context.db
    .update(secretRealmParty, { id: partyId })
    .set((row) => ({
      memberCount: row.memberCount + 1,
    }));
});

ponder.on("SecretRealm:PartyEntered", async ({ event, context }) => {
  const partyId = event.args.partyId.toString();

  await context.db
    .update(secretRealmParty, { id: partyId })
    .set({
      entered: true,
    });
});
