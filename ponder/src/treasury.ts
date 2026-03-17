import { ponder } from "ponder:registry";
import { feeCollectedEvent, treasuryStats } from "ponder:schema";

ponder.on("Treasury:FeeCollected", async ({ event, context }) => {
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  await context.db.insert(feeCollectedEvent).values({
    id: eventId,
    payer: event.args.payer,
    amount: event.args.totalAmount,
    burnAmount: event.args.burned,
    devAmount: event.args.toDevWallet,
    foundationAmount: event.args.toFoundation,
    timestamp: event.block.timestamp,
  });

  await context.db
    .insert(treasuryStats)
    .values({
      id: "treasury-stats",
      totalCollected: event.args.totalAmount,
      totalBurned: event.args.burned,
      totalDev: event.args.toDevWallet,
      totalFoundation: event.args.toFoundation,
    })
    .onConflictDoUpdate((row) => ({
      totalCollected: row.totalCollected + event.args.totalAmount,
      totalBurned: row.totalBurned + event.args.burned,
      totalDev: row.totalDev + event.args.toDevWallet,
      totalFoundation: row.totalFoundation + event.args.toFoundation,
    }));
});
