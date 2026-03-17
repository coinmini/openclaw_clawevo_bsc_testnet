import { PokemonType } from "../models/pokemon";

export type EvolutionMethod = "level" | "item" | "trade";

export interface EvolutionCondition {
  readonly method: EvolutionMethod;
  readonly level?: number;
  readonly itemName?: string;
}

export interface EvolutionStage {
  readonly pokemonId: number;
  readonly name: string;
  readonly type: PokemonType;
  readonly conditions?: EvolutionCondition;
}

export interface EvolutionChain {
  readonly stages: readonly EvolutionStage[];
}
