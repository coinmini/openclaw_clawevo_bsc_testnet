import { ponder } from "ponder:registry";
import { sect, sectMembership, sectWar, protocolStats } from "ponder:schema";

ponder.on("Sect:SectCreated", async ({ event, context }) => {
  const sectId = event.args.sectId.toString();

  await context.db.insert(sect).values({
    id: sectId,
    sectId: event.args.sectId,
    master: event.args.master,
    name: event.args.name,
    memberCount: 1,
    createdAt: event.block.timestamp,
  });

  const membershipId = `${sectId}-${event.args.master}`;
  await context.db.insert(sectMembership).values({
    id: membershipId,
    sectRef: sectId,
    player: event.args.master,
    active: true,
    joinedAt: event.block.timestamp,
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
      totalBeastsMinted: 0,
      totalSectsCreated: 1,
    })
    .onConflictDoUpdate((row) => ({
      totalSectsCreated: row.totalSectsCreated + 1,
    }));
});

ponder.on("Sect:MemberJoined", async ({ event, context }) => {
  const sectId = event.args.sectId.toString();
  const membershipId = `${sectId}-${event.args.member}`;

  await context.db.update(sect, { id: sectId }).set((row) => ({
    memberCount: row.memberCount + 1,
  }));

  await context.db.insert(sectMembership).values({
    id: membershipId,
    sectRef: sectId,
    player: event.args.member,
    active: true,
    joinedAt: event.block.timestamp,
  });
});

ponder.on("Sect:MemberLeft", async ({ event, context }) => {
  const sectId = event.args.sectId.toString();
  const membershipId = `${sectId}-${event.args.member}`;

  await context.db.update(sect, { id: sectId }).set((row) => ({
    memberCount: row.memberCount - 1,
  }));

  await context.db.update(sectMembership, { id: membershipId }).set({
    active: false,
    leftAt: event.block.timestamp,
  });
});

ponder.on("Sect:MemberKicked", async ({ event, context }) => {
  const sectId = event.args.sectId.toString();
  const membershipId = `${sectId}-${event.args.member}`;

  await context.db.update(sect, { id: sectId }).set((row) => ({
    memberCount: row.memberCount - 1,
  }));

  await context.db.update(sectMembership, { id: membershipId }).set({
    active: false,
    leftAt: event.block.timestamp,
  });
});

ponder.on("Sect:SectWarInitiated", async ({ event, context }) => {
  const warId = event.args.warId.toString();

  await context.db.insert(sectWar).values({
    id: warId,
    warId: event.args.warId,
    attackerSectId: event.args.attackerSectId,
    defenderSectId: event.args.defenderSectId,
    wager: event.args.wager,
    status: "Pending",
    initiatedAt: event.block.timestamp,
  });
});

ponder.on("Sect:SectWarAccepted", async ({ event, context }) => {
  const warId = event.args.warId.toString();

  await context.db.update(sectWar, { id: warId }).set({
    status: "Accepted",
  });
});

ponder.on("Sect:SectWarSettled", async ({ event, context }) => {
  const warId = event.args.warId.toString();

  await context.db.update(sectWar, { id: warId }).set({
    status: "Settled",
    winnerSectId: event.args.winnerSectId,
    settledAt: event.block.timestamp,
  });
});
