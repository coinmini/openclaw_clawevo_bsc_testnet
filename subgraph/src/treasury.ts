import {
  FeeCollected,
} from "../generated/Treasury/Treasury";
import { FeeCollectedEvent } from "../generated/schema";
import { getOrCreateTreasuryStats, eventId } from "./helpers";

export function handleFeeCollected(event: FeeCollected): void {
  let id = eventId(event);
  let fee = new FeeCollectedEvent(id);
  fee.payer = event.params.payer;
  fee.amount = event.params.totalAmount;
  fee.burnAmount = event.params.burned;
  fee.devAmount = event.params.toDevWallet;
  fee.foundationAmount = event.params.toFoundation;
  fee.timestamp = event.block.timestamp;
  fee.save();

  let stats = getOrCreateTreasuryStats();
  stats.totalCollected = stats.totalCollected.plus(event.params.totalAmount);
  stats.totalBurned = stats.totalBurned.plus(event.params.burned);
  stats.totalDev = stats.totalDev.plus(event.params.toDevWallet);
  stats.totalFoundation = stats.totalFoundation.plus(
    event.params.toFoundation
  );
  stats.save();
}
