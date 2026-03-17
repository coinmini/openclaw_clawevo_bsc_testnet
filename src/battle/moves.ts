import { PokemonType } from "../models/pokemon";
import { Move } from "./types";

const TACKLE: Move = {
  name: "Tackle",
  type: "normal",
  power: 40,
  accuracy: 100,
};

const EMBER: Move = {
  name: "Ember",
  type: "fire",
  power: 40,
  accuracy: 100,
};

const WATER_GUN: Move = {
  name: "Water Gun",
  type: "water",
  power: 40,
  accuracy: 100,
};

const VINE_WHIP: Move = {
  name: "Vine Whip",
  type: "grass",
  power: 45,
  accuracy: 100,
};

const THUNDER_SHOCK: Move = {
  name: "Thunder Shock",
  type: "electric",
  power: 40,
  accuracy: 100,
};

const FLAMETHROWER: Move = {
  name: "Flamethrower",
  type: "fire",
  power: 90,
  accuracy: 100,
};

const HYDRO_PUMP: Move = {
  name: "Hydro Pump",
  type: "water",
  power: 110,
  accuracy: 80,
};

const SOLAR_BEAM: Move = {
  name: "Solar Beam",
  type: "grass",
  power: 120,
  accuracy: 100,
};

const THUNDERBOLT: Move = {
  name: "Thunderbolt",
  type: "electric",
  power: 90,
  accuracy: 100,
};

const BODY_SLAM: Move = {
  name: "Body Slam",
  type: "normal",
  power: 85,
  accuracy: 100,
};

export const ALL_MOVES: readonly Move[] = [
  TACKLE,
  EMBER,
  WATER_GUN,
  VINE_WHIP,
  THUNDER_SHOCK,
  FLAMETHROWER,
  HYDRO_PUMP,
  SOLAR_BEAM,
  THUNDERBOLT,
  BODY_SLAM,
];

const MOVES_BY_TYPE: Readonly<Record<PokemonType, readonly Move[]>> = {
  fire: [EMBER, FLAMETHROWER],
  water: [WATER_GUN, HYDRO_PUMP],
  grass: [VINE_WHIP, SOLAR_BEAM],
  electric: [THUNDER_SHOCK, THUNDERBOLT],
  normal: [BODY_SLAM],
};

export function getMovesForType(type: PokemonType): readonly Move[] {
  const typeMoves = MOVES_BY_TYPE[type] ?? [];
  return [...typeMoves, TACKLE];
}
