import { Pokemon, withUpdatedHp } from "../models/pokemon";
import { calculateDamage } from "./damage";
import { getMovesForType } from "./moves";
import { BattleResult, BattleState, Move, TurnResult } from "./types";

export function createBattleState(
  playerPokemon: Pokemon,
  opponentPokemon: Pokemon
): BattleState {
  return {
    playerPokemon,
    opponentPokemon,
    turn: 1,
    log: [`Battle started: ${playerPokemon.name} vs ${opponentPokemon.name}!`],
  };
}

function selectMove(pokemon: Pokemon): Move {
  const moves = getMovesForType(pokemon.type);
  const index = Math.floor(Math.random() * moves.length);
  return moves[index];
}

function applyAttack(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move
): { readonly updatedDefender: Pokemon; readonly damage: number } {
  const damage = calculateDamage(attacker, defender, move);
  const updatedDefender = withUpdatedHp(defender, defender.hp - damage);
  return { updatedDefender, damage };
}

function buildAttackMessage(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  damage: number
): string {
  return `${attacker.name} used ${move.name} on ${defender.name} for ${damage} damage!`;
}

export function executeTurn(
  state: BattleState,
  playerMove: Move,
  opponentMove: Move
): TurnResult {
  const { playerPokemon, opponentPokemon, turn, log } = state;

  const playerGoesFirst = playerPokemon.speed >= opponentPokemon.speed;

  const firstAttacker = playerGoesFirst ? playerPokemon : opponentPokemon;
  const firstDefender = playerGoesFirst ? opponentPokemon : playerPokemon;
  const firstMove = playerGoesFirst ? playerMove : opponentMove;

  const firstResult = applyAttack(firstAttacker, firstDefender, firstMove);
  const firstMessage = buildAttackMessage(
    firstAttacker,
    firstDefender,
    firstMove,
    firstResult.damage
  );

  const newLog = [...log, `Turn ${turn}:`, firstMessage];

  if (firstResult.updatedDefender.hp <= 0) {
    const faintMessage = `${firstResult.updatedDefender.name} fainted!`;
    const finalState: BattleState = playerGoesFirst
      ? {
          playerPokemon,
          opponentPokemon: firstResult.updatedDefender,
          turn,
          log: [...newLog, faintMessage],
        }
      : {
          playerPokemon: firstResult.updatedDefender,
          opponentPokemon,
          turn,
          log: [...newLog, faintMessage],
        };

    return {
      state: finalState,
      message: faintMessage,
    };
  }

  const secondAttacker = playerGoesFirst
    ? opponentPokemon
    : playerPokemon;
  const secondDefender = firstResult.updatedDefender;
  const secondMove = playerGoesFirst ? opponentMove : playerMove;

  const updatedSecondAttacker = playerGoesFirst
    ? opponentPokemon
    : playerPokemon;

  const secondResult = applyAttack(
    updatedSecondAttacker,
    secondDefender,
    secondMove
  );
  const secondMessage = buildAttackMessage(
    secondAttacker,
    secondDefender,
    secondMove,
    secondResult.damage
  );

  const fullLog = [...newLog, secondMessage];

  const secondFaintMessage =
    secondResult.updatedDefender.hp <= 0
      ? `${secondResult.updatedDefender.name} fainted!`
      : undefined;

  const finalLog = secondFaintMessage
    ? [...fullLog, secondFaintMessage]
    : fullLog;

  const updatedPlayer = playerGoesFirst
    ? secondResult.updatedDefender
    : firstResult.updatedDefender;
  const updatedOpponent = playerGoesFirst
    ? firstResult.updatedDefender
    : secondResult.updatedDefender;

  const finalState: BattleState = {
    playerPokemon: updatedPlayer,
    opponentPokemon: updatedOpponent,
    turn: turn + 1,
    log: finalLog,
  };

  return {
    state: finalState,
    message: secondFaintMessage ?? secondMessage,
  };
}

export function checkBattleEnd(
  state: BattleState
): BattleResult | undefined {
  const { playerPokemon, opponentPokemon, turn } = state;

  if (opponentPokemon.hp <= 0) {
    return {
      winner: playerPokemon,
      finalState: state,
      totalTurns: turn,
    };
  }

  if (playerPokemon.hp <= 0) {
    return {
      winner: opponentPokemon,
      finalState: state,
      totalTurns: turn,
    };
  }

  return undefined;
}
