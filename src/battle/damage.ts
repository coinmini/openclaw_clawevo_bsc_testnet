import { Pokemon, PokemonType } from "../models/pokemon";
import { Move } from "./types";

type EffectivenessKey = `${PokemonType}>${PokemonType}`;

const TYPE_EFFECTIVENESS: Readonly<Record<string, number>> = {
  "fire>grass": 2.0,
  "grass>water": 2.0,
  "water>fire": 2.0,
  "electric>water": 2.0,
};

const DEFAULT_EFFECTIVENESS = 1.0;

export function getTypeEffectiveness(
  attackType: PokemonType,
  defenseType: PokemonType
): number {
  const key: EffectivenessKey = `${attackType}>${defenseType}`;
  return TYPE_EFFECTIVENESS[key] ?? DEFAULT_EFFECTIVENESS;
}

export function calculateDamage(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move
): number {
  const levelFactor = (2 * attacker.level) / 5 + 2;
  const baseDamage =
    (levelFactor * move.power * attacker.attack) / defender.defense / 50 + 2;
  const effectiveness = getTypeEffectiveness(move.type, defender.type);

  return Math.floor(baseDamage * effectiveness);
}
