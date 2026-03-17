export type ItemCategory = "healing" | "boost" | "pokeball";

export type EffectType = "heal" | "boost_attack" | "boost_defense" | "catch";

export interface ItemEffect {
  readonly type: EffectType;
  readonly value: number;
}

export interface Item {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly category: ItemCategory;
  readonly effect: ItemEffect;
  readonly quantity: number;
}
