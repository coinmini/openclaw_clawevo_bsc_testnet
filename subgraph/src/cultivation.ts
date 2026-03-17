import {
  CultivationStarted,
  CultivationEnded,
  BreakthroughAttempted,
} from "../generated/Cultivation/Cultivation";
import { CultivationSession, BreakthroughEvent } from "../generated/schema";
import { getOrCreatePlayer, eventId } from "./helpers";

export function handleCultivationStarted(
  event: CultivationStarted
): void {
  // CultivationStarted is a checkpoint; the real data comes from CultivationEnded.
  // We just ensure the player entity exists.
  getOrCreatePlayer(event.params.player);
}

export function handleCultivationEnded(event: CultivationEnded): void {
  let id = eventId(event);
  let session = new CultivationSession(id);

  let player = getOrCreatePlayer(event.params.player);

  session.player = player.id;
  session.duration = event.params.duration;
  session.effectiveSeconds = event.params.effectiveSeconds;
  session.lsEarned = event.params.lsEarned;
  session.lsFee = event.params.lsFee;
  session.expGained = event.params.expGained;
  session.heartGained = event.params.heartGained;
  session.fortuneGained = event.params.fortuneGained;
  session.timestamp = event.block.timestamp;
  session.blockNumber = event.block.number;
  session.save();

  player.totalCultivationSessions += 1;
  player.save();
}

export function handleBreakthroughAttempted(
  event: BreakthroughAttempted
): void {
  let id = eventId(event);
  let bt = new BreakthroughEvent(id);

  let player = getOrCreatePlayer(event.params.player);

  bt.player = player.id;
  bt.fromRealm = event.params.fromRealm;
  bt.toRealm = event.params.toRealm;
  bt.success = event.params.success;
  bt.timestamp = event.block.timestamp;
  bt.blockNumber = event.block.number;
  bt.save();

  // Update player realm if breakthrough succeeded
  if (event.params.success) {
    player.realm = event.params.toRealm;
    player.save();
  }
}
