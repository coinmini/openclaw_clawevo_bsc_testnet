import { Item } from "./types";
import { useItem as decrementItem } from "./effects";

export type Inventory = readonly Item[];

/**
 * Creates an empty inventory.
 */
export function createInventory(): Inventory {
  return [];
}

/**
 * Adds an item to the inventory. If an item with the same id already exists,
 * its quantity is increased. Otherwise the item is appended.
 * Returns a new inventory; the original is not mutated.
 */
export function addItem(inventory: Inventory, item: Item): Inventory {
  const existingIndex = inventory.findIndex((i) => i.id === item.id);

  if (existingIndex >= 0) {
    const existing = inventory[existingIndex];
    const updated: Item = {
      ...existing,
      quantity: existing.quantity + item.quantity,
    };
    return [
      ...inventory.slice(0, existingIndex),
      updated,
      ...inventory.slice(existingIndex + 1),
    ];
  }

  return [...inventory, item];
}

/**
 * Removes an item from the inventory by id.
 * Returns a new inventory without the specified item.
 */
export function removeItem(inventory: Inventory, itemId: number): Inventory {
  return inventory.filter((item) => item.id !== itemId);
}

/**
 * Finds an item in the inventory by id.
 * Returns the item or undefined if not found.
 */
export function findItem(
  inventory: Inventory,
  itemId: number
): Item | undefined {
  return inventory.find((item) => item.id === itemId);
}

/**
 * Uses an item from the inventory, decrementing its quantity by 1.
 * If the item's quantity reaches 0, it is removed from the inventory.
 * Throws if the item is not found or has no remaining quantity.
 * Returns a new inventory; the original is not mutated.
 */
export function useItemFromInventory(
  inventory: Inventory,
  itemId: number
): Inventory {
  const itemIndex = inventory.findIndex((item) => item.id === itemId);

  if (itemIndex < 0) {
    throw new Error(`Item with id ${itemId} not found in inventory.`);
  }

  const item = inventory[itemIndex];
  const updatedItem = decrementItem(item);

  if (updatedItem.quantity <= 0) {
    return [
      ...inventory.slice(0, itemIndex),
      ...inventory.slice(itemIndex + 1),
    ];
  }

  return [
    ...inventory.slice(0, itemIndex),
    updatedItem,
    ...inventory.slice(itemIndex + 1),
  ];
}
