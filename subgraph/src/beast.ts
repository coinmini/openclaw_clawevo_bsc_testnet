import { Bytes } from "@graphprotocol/graph-ts";
import {
  BeastHuntStarted,
  BeastHuntFinished,
  BeastEquipped,
  BeastUnequipped,
  BeastMinted,
} from "../generated/Beast/Beast";
import { BeastToken, BeastHuntEvent } from "../generated/schema";
import { getOrCreatePlayer, getOrCreateProtocolStats, eventId, bigIntToBytes } from "./helpers";

export function handleBeastHuntStarted(event: BeastHuntStarted): void {
  // BeastHuntStarted is a checkpoint; result comes from BeastHuntFinished.
  getOrCreatePlayer(event.params.player);
}

export function handleBeastHuntFinished(event: BeastHuntFinished): void {
  let id = eventId(event);
  let hunt = new BeastHuntEvent(id);

  let player = getOrCreatePlayer(event.params.player);

  hunt.player = player.id;
  hunt.regionId = event.params.regionId;
  hunt.star = event.params.star;
  hunt.captured = event.params.captured;
  hunt.beastTokenId = event.params.tokenId;
  hunt.timestamp = event.block.timestamp;
  hunt.blockNumber = event.block.number;
  hunt.save();
}

export function handleBeastEquipped(event: BeastEquipped): void {
  let id = bigIntToBytes(event.params.tokenId);
  let beast = BeastToken.load(id);
  if (beast == null) return;

  beast.equippedBy = event.params.player;
  beast.save();
}

export function handleBeastUnequipped(event: BeastUnequipped): void {
  let id = bigIntToBytes(event.params.tokenId);
  let beast = BeastToken.load(id);
  if (beast == null) return;

  beast.equippedBy = null;
  beast.save();
}

export function handleBeastMinted(event: BeastMinted): void {
  let id = bigIntToBytes(event.params.tokenId);
  let beast = new BeastToken(id);

  let owner = getOrCreatePlayer(event.params.to);

  beast.tokenId = event.params.tokenId;
  beast.owner = owner.id;
  beast.star = event.params.star;
  beast.element = event.params.element;
  beast.powerRate = event.params.powerRate;
  beast.speciesId = event.params.speciesId;
  beast.mintedAt = event.block.timestamp;
  beast.mintedBlock = event.block.number;
  beast.save();

  let stats = getOrCreateProtocolStats();
  stats.totalBeastsMinted += 1;
  stats.save();
}
