import { Pokemon, PokemonType } from "../models/pokemon";

export interface Move {
  readonly name: string;
  readonly type: PokemonType;
  readonly power: number;
  readonly accuracy: number;
}

export interface BattleState {
  readonly playerPokemon: Pokemon;
  readonly opponentPokemon: Pokemon;
  readonly turn: number;
  readonly log: readonly string[];
}

export interface BattleResult {
  readonly winner: Pokemon;
  readonly finalState: BattleState;
  readonly totalTurns: number;
}

export interface TurnResult {
  readonly state: BattleState;
  readonly message: string;
}
