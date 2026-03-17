import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  EquipmentMinted,
  EquipmentEquipped,
  EquipmentUnequipped,
  EquipmentEnhanced,
  UpgradeStarted,
  UpgradeFinished,
  EquipmentDecomposed,
  MaterialsChanged,
} from "../generated/Equipment/Equipment";
import {
  EquipmentToken,
  EquipmentEnhancedEvent,
  EquipmentUpgradeEvent,
  EquipmentDecomposedEvent,
} from "../generated/schema";
import { getOrCreatePlayer, getOrCreateProtocolStats, eventId, bigIntToBytes, ZERO_BI } from "./helpers";

export function handleEquipmentMinted(event: EquipmentMinted): void {
  let id = bigIntToBytes(event.params.tokenId);
  let equip = new EquipmentToken(id);

  let owner = getOrCreatePlayer(event.params.to);

  equip.tokenId = event.params.tokenId;
  equip.owner = owner.id;
  equip.ownerAddress = event.params.to;
  equip.equipmentType = event.params.eType;
  equip.quality = event.params.quality;
  equip.bonusBP = event.params.bonusBP;
  equip.enhanceLevel = 0;
  equip.elementAffinity = event.params.elementAffinity;
  equip.originAffinity = event.params.originAffinity;
  equip.factionAffinity = event.params.factionAffinity;
  equip.mintedAt = event.block.timestamp;
  equip.mintedBlock = event.block.number;
  equip.decomposed = false;
  equip.save();

  let stats = getOrCreateProtocolStats();
  stats.totalEquipmentMinted += 1;
  stats.save();
}

export function handleEquipmentEquipped(event: EquipmentEquipped): void {
  let id = bigIntToBytes(event.params.tokenId);
  let equip = EquipmentToken.load(id);
  if (equip == null) return;

  equip.equippedBy = event.params.player;
  equip.save();
}

export function handleEquipmentUnequipped(
  event: EquipmentUnequipped
): void {
  let id = bigIntToBytes(event.params.tokenId);
  let equip = EquipmentToken.load(id);
  if (equip == null) return;

  equip.equippedBy = null;
  equip.save();
}

export function handleEquipmentEnhanced(event: EquipmentEnhanced): void {
  // Update equipment level
  let equipId = bigIntToBytes(event.params.tokenId);
  let equip = EquipmentToken.load(equipId);
  if (equip != null) {
    equip.enhanceLevel = event.params.newLevel;
    equip.save();
  }

  // Create immutable event record
  let id = eventId(event);
  let enhanced = new EquipmentEnhancedEvent(id);
  enhanced.tokenId = event.params.tokenId;
  enhanced.newLevel = event.params.newLevel;
  enhanced.cost = event.params.cost;
  enhanced.timestamp = event.block.timestamp;
  enhanced.save();
}

export function handleUpgradeStarted(event: UpgradeStarted): void {
  // UpgradeStarted is a checkpoint; real result comes from UpgradeFinished.
  getOrCreatePlayer(event.params.player);
}

export function handleUpgradeFinished(event: UpgradeFinished): void {
  let id = eventId(event);
  let upgrade = new EquipmentUpgradeEvent(id);
  upgrade.player = event.params.player;
  upgrade.newTokenId = event.params.newTokenId;
  upgrade.quality = event.params.quality;
  upgrade.success = event.params.success;
  upgrade.timestamp = event.block.timestamp;
  upgrade.save();
}

export function handleEquipmentDecomposed(
  event: EquipmentDecomposed
): void {
  // Mark equipment as decomposed
  let equipId = bigIntToBytes(event.params.tokenId);
  let equip = EquipmentToken.load(equipId);
  if (equip != null) {
    equip.decomposed = true;
    equip.equippedBy = null;
    equip.save();
  }

  // Create immutable event record
  let id = eventId(event);
  let decomposed = new EquipmentDecomposedEvent(id);
  decomposed.tokenId = event.params.tokenId;
  decomposed.spiritMaterials = event.params.spiritMaterials;
  decomposed.lsRefund = event.params.lsRefund;
  decomposed.timestamp = event.block.timestamp;
  decomposed.save();
}

export function handleMaterialsChanged(event: MaterialsChanged): void {
  let player = getOrCreatePlayer(event.params.player);
  player.spiritMaterials = event.params.newBalance;
  player.save();
}
