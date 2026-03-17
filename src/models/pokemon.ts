export interface Pokemon {
  readonly id: number;
  readonly name: string;
  readonly type: PokemonType;
  readonly level: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
}

export type PokemonType =
  | "fire"
  | "water"
  | "grass"
  | "electric"
  | "normal";

export function createPokemon(
  params: Omit<Pokemon, "hp">
): Pokemon {
  return { ...params, hp: params.maxHp };
}

export function withUpdatedHp(
  pokemon: Pokemon,
  newHp: number
): Pokemon {
  return { ...pokemon, hp: Math.max(0, Math.min(newHp, pokemon.maxHp)) };
}
