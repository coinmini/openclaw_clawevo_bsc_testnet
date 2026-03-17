import { createPokemon, Pokemon } from "../models/pokemon";

export const POKEDEX: readonly Pokemon[] = [
  createPokemon({
    id: 1,
    name: "Bulbasaur",
    type: "grass",
    level: 5,
    maxHp: 45,
    attack: 49,
    defense: 49,
    speed: 45,
  }),
  createPokemon({
    id: 4,
    name: "Charmander",
    type: "fire",
    level: 5,
    maxHp: 39,
    attack: 52,
    defense: 43,
    speed: 65,
  }),
  createPokemon({
    id: 7,
    name: "Squirtle",
    type: "water",
    level: 5,
    maxHp: 44,
    attack: 48,
    defense: 65,
    speed: 43,
  }),
  createPokemon({
    id: 25,
    name: "Pikachu",
    type: "electric",
    level: 5,
    maxHp: 35,
    attack: 55,
    defense: 40,
    speed: 90,
  }),
] as const;

export function findPokemonById(id: number): Pokemon | undefined {
  return POKEDEX.find((p) => p.id === id);
}
