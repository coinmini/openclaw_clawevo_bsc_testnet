import { Bytes } from "@graphprotocol/graph-ts";
import {
  PartnershipProposed,
  PartnershipFormed,
  ProposalCancelled,
  PartnershipDissolved,
} from "../generated/Tao/Tao";
import { Partnership, TaoEvent } from "../generated/schema";
import { eventId, ZERO_BI } from "./helpers";

// Build a deterministic partnership ID from two addresses (smaller first)
function partnershipId(a: Bytes, b: Bytes): Bytes {
  if (a.toHexString() < b.toHexString()) {
    return a.concat(b);
  }
  return b.concat(a);
}

export function handlePartnershipProposed(
  event: PartnershipProposed
): void {
  let ev = new TaoEvent(eventId(event));
  ev.eventType = "Proposed";
  ev.initiator = event.params.proposer;
  ev.target = event.params.target;
  ev.fee = ZERO_BI;
  ev.timestamp = event.block.timestamp;
  ev.save();
}

export function handlePartnershipFormed(event: PartnershipFormed): void {
  let id = partnershipId(event.params.partnerA, event.params.partnerB);
  let partnership = new Partnership(id);
  partnership.partnerA = event.params.partnerA;
  partnership.partnerB = event.params.partnerB;
  partnership.formedAt = event.block.timestamp;
  partnership.active = true;
  partnership.save();

  let ev = new TaoEvent(eventId(event));
  ev.eventType = "Formed";
  ev.initiator = event.params.partnerA;
  ev.target = event.params.partnerB;
  ev.fee = ZERO_BI;
  ev.timestamp = event.block.timestamp;
  ev.save();
}

export function handleProposalCancelled(event: ProposalCancelled): void {
  let ev = new TaoEvent(eventId(event));
  ev.eventType = "Cancelled";
  ev.initiator = event.params.proposer;
  ev.target = event.params.target;
  ev.fee = ZERO_BI;
  ev.timestamp = event.block.timestamp;
  ev.save();
}

export function handlePartnershipDissolved(
  event: PartnershipDissolved
): void {
  let id = partnershipId(event.params.initiator, event.params.partner);
  let partnership = Partnership.load(id);
  if (partnership != null) {
    partnership.active = false;
    partnership.dissolvedAt = event.block.timestamp;
    partnership.save();
  }

  let ev = new TaoEvent(eventId(event));
  ev.eventType = "Dissolved";
  ev.initiator = event.params.initiator;
  ev.target = event.params.partner;
  ev.fee = event.params.fee;
  ev.timestamp = event.block.timestamp;
  ev.save();
}
