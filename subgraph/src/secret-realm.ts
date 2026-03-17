import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  SoloEntered,
  LayerChallenged,
  LayerDropClaimed,
  PartyCreated,
  PartyJoined,
  PartyEntered,
} from "../generated/SecretRealm/SecretRealm";
import {
  SecretRealmRun,
  LayerChallengeEvent,
  LayerDropEvent,
  SecretRealmParty,
} from "../generated/schema";
import { getOrCreatePlayer, eventId, bigIntToBytes } from "./helpers";

export function handleSoloEntered(event: SoloEntered): void {
  let id = eventId(event);
  let run = new SecretRealmRun(id);

  let player = getOrCreatePlayer(event.params.player);

  run.player = player.id;
  run.realmId = event.params.realmId;
  run.timestamp = event.block.timestamp;
  run.save();
}

export function handleLayerChallenged(event: LayerChallenged): void {
  let id = eventId(event);
  let lce = new LayerChallengeEvent(id);
  lce.player = event.params.player;
  lce.realmId = event.params.realmId;
  lce.layer = event.params.layer;
  lce.won = event.params.won;
  lce.timestamp = event.block.timestamp;
  lce.save();
}

export function handleLayerDropClaimed(event: LayerDropClaimed): void {
  let id = eventId(event);
  let lde = new LayerDropEvent(id);
  lde.player = event.params.player;
  lde.realmId = event.params.realmId;
  lde.layer = event.params.layer;
  lde.reward = event.params.reward;
  lde.timestamp = event.block.timestamp;
  lde.save();
}

export function handlePartyCreated(event: PartyCreated): void {
  let id = bigIntToBytes(event.params.partyId);
  let party = new SecretRealmParty(id);
  party.partyId = event.params.partyId;
  party.leader = event.params.leader;
  party.realmId = event.params.realmId;
  party.memberCount = 1;
  party.entered = false;
  party.createdAt = event.block.timestamp;
  party.save();
}

export function handlePartyJoined(event: PartyJoined): void {
  let id = bigIntToBytes(event.params.partyId);
  let party = SecretRealmParty.load(id);
  if (party == null) return;

  party.memberCount += 1;
  party.save();
}

export function handlePartyEntered(event: PartyEntered): void {
  let id = bigIntToBytes(event.params.partyId);
  let party = SecretRealmParty.load(id);
  if (party == null) return;

  party.entered = true;
  party.save();
}
