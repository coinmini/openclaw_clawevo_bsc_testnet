import { Item } from "./types";

export const POTION: Item = {
  id: 101,
  name: "Potion",
  description: "Restores 20 HP to a single Pokemon.",
  category: "healing",
  effect: { type: "heal", value: 20 },
  quantity: 1,
};

export const SUPER_POTION: Item = {
  id: 102,
  name: "Super Potion",
  description: "Restores 50 HP to a single Pokemon.",
  category: "healing",
  effect: { type: "heal", value: 50 },
  quantity: 1,
};

export const X_ATTACK: Item = {
  id: 201,
  name: "X Attack",
  description: "Boosts a Pokemon's attack stat by 10.",
  category: "boost",
  effect: { type: "boost_attack", value: 10 },
  quantity: 1,
};

export const X_DEFENSE: Item = {
  id: 202,
  name: "X Defense",
  description: "Boosts a Pokemon's defense stat by 10.",
  category: "boost",
  effect: { type: "boost_defense", value: 10 },
  quantity: 1,
};

export const POKE_BALL: Item = {
  id: 301,
  name: "Poke Ball",
  description: "A standard ball for catching Pokemon. Catch rate: 0.5.",
  category: "pokeball",
  effect: { type: "catch", value: 0.5 },
  quantity: 1,
};

export const GREAT_BALL: Item = {
  id: 302,
  name: "Great Ball",
  description: "A high-performance ball for catching Pokemon. Catch rate: 0.75.",
  category: "pokeball",
  effect: { type: "catch", value: 0.75 },
  quantity: 1,
};

export const ITEM_CATALOG: readonly Item[] = [
  POTION,
  SUPER_POTION,
  X_ATTACK,
  X_DEFENSE,
  POKE_BALL,
  GREAT_BALL,
] as const;

export function findItemById(id: number): Item | undefined {
  return ITEM_CATALOG.find((item) => item.id === id);
}

export function findItemByName(name: string): Item | undefined {
  return ITEM_CATALOG.find(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );
}
