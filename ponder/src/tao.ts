import { ponder } from "ponder:registry";
import { partnership, taoEvent } from "ponder:schema";

function makePartnershipId(a: string, b: string): string {
  const sorted = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${sorted[0]}-${sorted[1]}`;
}

ponder.on("Tao:PartnershipProposed", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(taoEvent).values({
    id: eventId,
    eventType: "Proposed",
    initiator: event.args.proposer,
    target: event.args.target,
    fee: 0n,
    timestamp: event.block.timestamp,
  });
});

ponder.on("Tao:PartnershipFormed", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const partnershipId = makePartnershipId(
    event.args.partnerA,
    event.args.partnerB,
  );

  await context.db.insert(partnership).values({
    id: partnershipId,
    partnerA: event.args.partnerA,
    partnerB: event.args.partnerB,
    active: true,
    formedAt: event.block.timestamp,
  });

  await context.db.insert(taoEvent).values({
    id: eventId,
    eventType: "Formed",
    initiator: event.args.partnerA,
    target: event.args.partnerB,
    fee: 0n,
    timestamp: event.block.timestamp,
  });
});

ponder.on("Tao:ProposalCancelled", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(taoEvent).values({
    id: eventId,
    eventType: "Cancelled",
    initiator: event.args.proposer,
    target: event.args.target,
    fee: 0n,
    timestamp: event.block.timestamp,
  });
});

ponder.on("Tao:PartnershipDissolved", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;
  const partnershipId = makePartnershipId(
    event.args.initiator,
    event.args.partner,
  );

  const existing = await context.db.find(partnership, { id: partnershipId });
  if (existing) {
    await context.db
      .update(partnership, { id: partnershipId })
      .set({
        active: false,
        dissolvedAt: event.block.timestamp,
      });
  }

  await context.db.insert(taoEvent).values({
    id: eventId,
    eventType: "Dissolved",
    initiator: event.args.initiator,
    target: event.args.partner,
    fee: event.args.fee,
    timestamp: event.block.timestamp,
  });
});
