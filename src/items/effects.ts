import { Pokemon, withUpdatedHp } from "../models/pokemon";
import { Item } from "./types";

/**
 * Applies an item's effect to a Pokemon, returning a new Pokemon with the effect applied.
 * Does not mutate the original Pokemon.
 *
 * - "heal": Restores HP by the effect value, capped at maxHp.
 * - "boost_attack": Increases attack by the effect value.
 * - "boost_defense": Increases defense by the effect value.
 * - "catch": No stat modification (catch logic handled elsewhere).
 */
export function applyItemEffect(pokemon: Pokemon, item: Item): Pokemon {
  const { type, value } = item.effect;

  switch (type) {
    case "heal":
      return withUpdatedHp(pokemon, pokemon.hp + value);

    case "boost_attack":
      return { ...pokemon, attack: pokemon.attack + value };

    case "boost_defense":
      return { ...pokemon, defense: pokemon.defense + value };

    case "catch":
      // Catch items don't modify Pokemon stats directly.
      // The catch rate value is used by battle/catch logic elsewhere.
      return pokemon;

    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unknown effect type: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Uses one unit of an item, returning a new Item with quantity decremented by 1.
 * Throws if the item has no remaining quantity.
 */
export function useItem(item: Item): Item {
  if (item.quantity <= 0) {
    throw new Error(`Cannot use item "${item.name}": quantity is 0.`);
  }

  return { ...item, quantity: item.quantity - 1 };
}
