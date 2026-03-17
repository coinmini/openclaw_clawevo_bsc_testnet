import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  SectCreated,
  MemberJoined,
  MemberLeft,
  MemberKicked,
  SectWarInitiated,
  SectWarAccepted,
  SectWarSettled,
} from "../generated/Sect/Sect";
import { Sect, SectMembership, SectWar } from "../generated/schema";
import { getOrCreateProtocolStats, bigIntToBytes, ZERO_BI } from "./helpers";

export function handleSectCreated(event: SectCreated): void {
  let id = bigIntToBytes(event.params.sectId);
  let sect = new Sect(id);
  sect.sectId = event.params.sectId;
  sect.name = event.params.name;
  sect.master = event.params.master;
  sect.memberCount = 1; // master is the first member
  sect.createdAt = event.block.timestamp;
  sect.save();

  // Create membership for master
  let memberId = id.concat(event.params.master);
  let membership = new SectMembership(memberId);
  membership.sect = id;
  membership.player = event.params.master;
  membership.joinedAt = event.block.timestamp;
  membership.active = true;
  membership.save();

  let stats = getOrCreateProtocolStats();
  stats.totalSectsCreated += 1;
  stats.save();
}

export function handleMemberJoined(event: MemberJoined): void {
  let sectId = bigIntToBytes(event.params.sectId);
  let sect = Sect.load(sectId);
  if (sect == null) return;

  sect.memberCount += 1;
  sect.save();

  let memberId = sectId.concat(event.params.member);
  let membership = new SectMembership(memberId);
  membership.sect = sectId;
  membership.player = event.params.member;
  membership.joinedAt = event.block.timestamp;
  membership.active = true;
  membership.save();
}

export function handleMemberLeft(event: MemberLeft): void {
  let sectId = bigIntToBytes(event.params.sectId);
  let sect = Sect.load(sectId);
  if (sect != null) {
    sect.memberCount -= 1;
    sect.save();
  }

  let memberId = sectId.concat(event.params.member);
  let membership = SectMembership.load(memberId);
  if (membership != null) {
    membership.active = false;
    membership.leftAt = event.block.timestamp;
    membership.save();
  }
}

export function handleMemberKicked(event: MemberKicked): void {
  let sectId = bigIntToBytes(event.params.sectId);
  let sect = Sect.load(sectId);
  if (sect != null) {
    sect.memberCount -= 1;
    sect.save();
  }

  let memberId = sectId.concat(event.params.member);
  let membership = SectMembership.load(memberId);
  if (membership != null) {
    membership.active = false;
    membership.leftAt = event.block.timestamp;
    membership.save();
  }
}

export function handleSectWarInitiated(event: SectWarInitiated): void {
  let id = bigIntToBytes(event.params.warId);
  let war = new SectWar(id);
  war.warId = event.params.warId;
  war.attackerSectId = event.params.attackerSectId;
  war.defenderSectId = event.params.defenderSectId;
  war.wager = event.params.wager;
  war.status = "Pending";
  war.initiatedAt = event.block.timestamp;
  war.save();
}

export function handleSectWarAccepted(event: SectWarAccepted): void {
  let id = bigIntToBytes(event.params.warId);
  let war = SectWar.load(id);
  if (war == null) return;

  war.status = "Accepted";
  war.save();
}

export function handleSectWarSettled(event: SectWarSettled): void {
  let id = bigIntToBytes(event.params.warId);
  let war = SectWar.load(id);
  if (war == null) return;

  war.status = "Settled";
  war.winnerSectId = event.params.winnerSectId;
  war.settledAt = event.block.timestamp;
  war.save();
}
