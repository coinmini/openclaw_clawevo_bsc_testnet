import { BigInt } from "@graphprotocol/graph-ts";
import {
  CaveOpened,
  CaveUpgraded,
  MaintenancePaid,
  CaveDowngraded,
} from "../generated/CaveHeaven/CaveHeaven";
import { CaveHeavenState, CaveEvent } from "../generated/schema";
import { getOrCreatePlayer, eventId, ZERO_BI, caveTierToString } from "./helpers";

export function handleCaveOpened(event: CaveOpened): void {
  let playerId = event.params.player;
  getOrCreatePlayer(playerId);

  let state = new CaveHeavenState(playerId);
  state.player = playerId;
  state.tier = "CaveHeaven";
  state.openedAt = event.block.timestamp;
  state.totalMaintenancePaid = ZERO_BI;
  state.save();

  let ev = new CaveEvent(eventId(event));
  ev.player = playerId;
  ev.eventType = "Opened";
  ev.tier = 1;
  ev.cost = event.params.cost;
  ev.timestamp = event.block.timestamp;
  ev.save();
}

export function handleCaveUpgraded(event: CaveUpgraded): void {
  let playerId = event.params.player;
  let state = CaveHeavenState.load(playerId);
  if (state == null) return;

  state.tier = caveTierToString(event.params.newTier);
  state.upgradedAt = event.block.timestamp;
  state.save();

  let ev = new CaveEvent(eventId(event));
  ev.player = playerId;
  ev.eventType = "Upgraded";
  ev.tier = event.params.newTier;
  ev.cost = event.params.cost;
  ev.timestamp = event.block.timestamp;
  ev.save();
}

export function handleMaintenancePaid(event: MaintenancePaid): void {
  let playerId = event.params.player;
  let state = CaveHeavenState.load(playerId);
  if (state == null) return;

  state.totalMaintenancePaid = state.totalMaintenancePaid.plus(
    event.params.totalCost
  );
  state.save();

  let ev = new CaveEvent(eventId(event));
  ev.player = playerId;
  ev.eventType = "MaintenancePaid";
  ev.tier = 0;
  ev.cost = event.params.totalCost;
  ev.timestamp = event.block.timestamp;
  ev.save();
}

export function handleCaveDowngraded(event: CaveDowngraded): void {
  let playerId = event.params.player;
  let state = CaveHeavenState.load(playerId);
  if (state == null) return;

  state.tier = caveTierToString(event.params.newTier);
  state.save();

  let ev = new CaveEvent(eventId(event));
  ev.player = playerId;
  ev.eventType = "Downgraded";
  ev.tier = event.params.newTier;
  ev.cost = ZERO_BI;
  ev.timestamp = event.block.timestamp;
  ev.save();
}
