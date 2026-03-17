import { Pokemon } from "../models/pokemon";
import { EvolutionChain, EvolutionStage } from "./types";

function findCurrentStageIndex(
  pokemon: Pokemon,
  chain: EvolutionChain
): number {
  return chain.stages.findIndex(
    (stage) => stage.pokemonId === pokemon.id
  );
}

function isLastStage(
  stageIndex: number,
  chain: EvolutionChain
): boolean {
  return stageIndex === chain.stages.length - 1;
}

function meetsLevelCondition(
  pokemon: Pokemon,
  stage: EvolutionStage
): boolean {
  if (stage.conditions?.method !== "level") {
    return false;
  }
  const requiredLevel = stage.conditions.level;
  if (requiredLevel === undefined) {
    return false;
  }
  return pokemon.level >= requiredLevel;
}

function meetsItemCondition(stage: EvolutionStage): boolean {
  if (stage.conditions?.method !== "item") {
    return false;
  }
  return stage.conditions.itemName !== undefined;
}

function meetsTradeCondition(stage: EvolutionStage): boolean {
  return stage.conditions?.method === "trade";
}

function meetsEvolutionConditions(
  pokemon: Pokemon,
  stage: EvolutionStage
): boolean {
  if (stage.conditions === undefined) {
    return false;
  }

  switch (stage.conditions.method) {
    case "level":
      return meetsLevelCondition(pokemon, stage);
    case "item":
      return meetsItemCondition(stage);
    case "trade":
      return meetsTradeCondition(stage);
    default:
      return false;
  }
}

export function canEvolve(
  pokemon: Pokemon,
  chain: EvolutionChain
): boolean {
  const currentIndex = findCurrentStageIndex(pokemon, chain);

  if (currentIndex === -1) {
    return false;
  }

  if (isLastStage(currentIndex, chain)) {
    return false;
  }

  const currentStage = chain.stages[currentIndex];
  return meetsEvolutionConditions(pokemon, currentStage);
}

export function getNextEvolution(
  pokemon: Pokemon,
  chain: EvolutionChain
): EvolutionStage | null {
  if (!canEvolve(pokemon, chain)) {
    return null;
  }

  const currentIndex = findCurrentStageIndex(pokemon, chain);
  return chain.stages[currentIndex + 1];
}
