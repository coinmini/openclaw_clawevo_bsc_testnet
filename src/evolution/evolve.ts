import { Pokemon } from "../models/pokemon";
import { EvolutionStage } from "./types";

const STAT_BOOST = 5;

export function evolvePokemon(
  pokemon: Pokemon,
  nextStage: EvolutionStage
): Pokemon {
  return {
    ...pokemon,
    id: nextStage.pokemonId,
    name: nextStage.name,
    type: nextStage.type,
    maxHp: pokemon.maxHp + STAT_BOOST,
    hp: pokemon.hp + STAT_BOOST,
    attack: pokemon.attack + STAT_BOOST,
    defense: pokemon.defense + STAT_BOOST,
    speed: pokemon.speed + STAT_BOOST,
  };
}
