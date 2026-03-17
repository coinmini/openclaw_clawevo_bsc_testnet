import {
  RegisterIntentCreated,
  CultivatorRegistered,
  NameSet,
} from "../generated/Register/Register";
import { getOrCreatePlayer, getOrCreateProtocolStats } from "./helpers";

export function handleRegisterIntentCreated(
  event: RegisterIntentCreated
): void {
  // Intent is ephemeral — player stub will be created when needed
  // No entity needed for intent itself
}

export function handleCultivatorRegistered(
  event: CultivatorRegistered
): void {
  let player = getOrCreatePlayer(event.params.player);

  player.origin = event.params.origin;
  player.element = event.params.element;
  player.attack = event.params.attack;
  player.defense = event.params.defense;
  player.perception = event.params.perception;
  player.wisdom = event.params.wisdom;
  player.realm = 0;
  player.registeredAt = event.block.timestamp;
  player.registeredBlock = event.block.number;
  player.save();

  let stats = getOrCreateProtocolStats();
  stats.totalPlayers += 1;
  stats.save();
}

export function handleNameSet(event: NameSet): void {
  let player = getOrCreatePlayer(event.params.player);
  player.name = event.params.name;
  player.save();
}
