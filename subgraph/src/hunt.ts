import {
  HuntStarted,
  HuntDropClaimed,
} from "../generated/Hunt/Hunt";
import { HuntEvent, HuntDropEvent } from "../generated/schema";
import { getOrCreatePlayer, eventId } from "./helpers";

export function handleHuntStarted(event: HuntStarted): void {
  let id = eventId(event);
  let hunt = new HuntEvent(id);

  let player = getOrCreatePlayer(event.params.player);

  hunt.player = player.id;
  hunt.regionId = event.params.regionId;
  hunt.won = event.params.won;
  hunt.timestamp = event.block.timestamp;
  hunt.blockNumber = event.block.number;
  hunt.save();

  player.totalHunts += 1;
  if (event.params.won) {
    player.totalHuntsWon += 1;
  }
  player.save();
}

export function handleHuntDropClaimed(event: HuntDropClaimed): void {
  let id = eventId(event);
  let drop = new HuntDropEvent(id);

  let player = getOrCreatePlayer(event.params.player);

  drop.player = player.id;
  drop.regionId = event.params.regionId;
  drop.dropQuality = event.params.dropQuality;
  drop.dropReward = event.params.dropReward;
  drop.equipmentTokenId = event.params.equipmentTokenId;
  drop.timestamp = event.block.timestamp;
  drop.blockNumber = event.block.number;
  drop.save();
}
