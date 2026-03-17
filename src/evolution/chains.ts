import { EvolutionChain } from "./types";

const BULBASAUR_CHAIN: EvolutionChain = {
  stages: [
    {
      pokemonId: 1,
      name: "Bulbasaur",
      type: "grass",
      conditions: { method: "level", level: 16 },
    },
    {
      pokemonId: 2,
      name: "Ivysaur",
      type: "grass",
      conditions: { method: "level", level: 32 },
    },
    {
      pokemonId: 3,
      name: "Venusaur",
      type: "grass",
    },
  ],
};

const CHARMANDER_CHAIN: EvolutionChain = {
  stages: [
    {
      pokemonId: 4,
      name: "Charmander",
      type: "fire",
      conditions: { method: "level", level: 16 },
    },
    {
      pokemonId: 5,
      name: "Charmeleon",
      type: "fire",
      conditions: { method: "level", level: 36 },
    },
    {
      pokemonId: 6,
      name: "Charizard",
      type: "fire",
    },
  ],
};

const SQUIRTLE_CHAIN: EvolutionChain = {
  stages: [
    {
      pokemonId: 7,
      name: "Squirtle",
      type: "water",
      conditions: { method: "level", level: 16 },
    },
    {
      pokemonId: 8,
      name: "Wartortle",
      type: "water",
      conditions: { method: "level", level: 36 },
    },
    {
      pokemonId: 9,
      name: "Blastoise",
      type: "water",
    },
  ],
};

const PIKACHU_CHAIN: EvolutionChain = {
  stages: [
    {
      pokemonId: 25,
      name: "Pikachu",
      type: "electric",
      conditions: { method: "item", itemName: "Thunder Stone" },
    },
    {
      pokemonId: 26,
      name: "Raichu",
      type: "electric",
    },
  ],
};

export const EVOLUTION_CHAINS: readonly EvolutionChain[] = [
  BULBASAUR_CHAIN,
  CHARMANDER_CHAIN,
  SQUIRTLE_CHAIN,
  PIKACHU_CHAIN,
];

export function findChainByPokemonId(
  pokemonId: number
): EvolutionChain | undefined {
  return EVOLUTION_CHAINS.find((chain) =>
    chain.stages.some((stage) => stage.pokemonId === pokemonId)
  );
}
