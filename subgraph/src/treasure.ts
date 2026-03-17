import {
  TreasureStarted,
  TreasureFinished,
} from "../generated/Treasure/Treasure";
import { TreasureEvent } from "../generated/schema";
import { getOrCreatePlayer, eventId, ZERO_BI } from "./helpers";

export function handleTreasureStarted(event: TreasureStarted): void {
  // TreasureStarted is a checkpoint; real data comes from TreasureFinished.
  getOrCreatePlayer(event.params.player);
}

export function handleTreasureFinished(event: TreasureFinished): void {
  let id = eventId(event);
  let treasure = new TreasureEvent(id);

  let player = getOrCreatePlayer(event.params.player);

  treasure.player = player.id;
  treasure.regionId = event.params.regionId;
  treasure.quality = event.params.quality;
  treasure.reward = event.params.reward;
  treasure.equipmentTokenId = event.params.equipmentTokenId;
  treasure.timestamp = event.block.timestamp;
  treasure.blockNumber = event.block.number;
  treasure.save();

  player.totalTreasures += 1;
  player.save();
}
