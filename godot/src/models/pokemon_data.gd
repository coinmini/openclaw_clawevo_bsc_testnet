class_name PokemonData
## Pure data model for Pokemon. All functions return new Dictionaries (immutable pattern).


static func create(
	id: int, poke_name: String, type: String, level: int,
	max_hp: int, attack: int, defense: int, speed: int
) -> Dictionary:
	return {
		"id": id,
		"name": poke_name,
		"type": type,
		"level": level,
		"hp": max_hp,
		"max_hp": max_hp,
		"attack": attack,
		"defense": defense,
		"speed": speed,
	}


static func with_updated_hp(pokemon: Dictionary, new_hp: int) -> Dictionary:
	var result := pokemon.duplicate()
	result["hp"] = clampi(new_hp, 0, pokemon["max_hp"])
	return result


static func with_updated_stat(pokemon: Dictionary, stat: String, value: int) -> Dictionary:
	var result := pokemon.duplicate()
	result[stat] = value
	return result


static func is_fainted(pokemon: Dictionary) -> bool:
	return pokemon["hp"] <= 0


static func hp_ratio(pokemon: Dictionary) -> float:
	if pokemon["max_hp"] == 0:
		return 0.0
	return float(pokemon["hp"]) / float(pokemon["max_hp"])
