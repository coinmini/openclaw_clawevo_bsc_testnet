extends Node
## Global game data: Pokedex, type effectiveness chart, and world regions.

var pokedex: Array = []
var regions: Array = []
var player_pokemon: Dictionary = {}

var _type_chart: Dictionary = {}


func _ready() -> void:
	player_pokemon = PokemonData.create(1050, "Hero", "fire", 5, 50, 55, 45, 60)
	pokedex = [
		PokemonData.create(1, "Bulbasaur", "grass", 5, 45, 49, 49, 45),
		PokemonData.create(4, "Charmander", "fire", 5, 39, 52, 43, 65),
		PokemonData.create(7, "Squirtle", "water", 5, 44, 48, 65, 43),
		PokemonData.create(25, "Pikachu", "electric", 5, 35, 55, 40, 90),
	]
	_type_chart = {
		"fire>grass": 2.0,
		"grass>water": 2.0,
		"water>fire": 2.0,
		"electric>water": 2.0,
	}
	regions = [
		RegionData.create(
			"verdant_plains", "Verdant Plains",
			"Lush grasslands with gentle rivers. Home to Grass-type Pikemon.",
			["grass"], Vector2(2200, 1600), 1
		),
		RegionData.create(
			"volcano_isle", "Volcano Isle",
			"A fiery volcanic island. Powerful Fire-types lurk here.",
			["fire"], Vector2(4600, 2500), 3
		),
		RegionData.create(
			"frozen_peaks", "Frozen Peaks",
			"Snow-covered mountains shrouded in mist. Water-types thrive in the ice.",
			["water"], Vector2(1200, 600), 2
		),
		RegionData.create(
			"thunder_ruins", "Thunder Ruins",
			"Ancient desert ruins crackling with electric energy.",
			["electric"], Vector2(4000, 1400), 2
		),
		RegionData.create(
			"shadow_grove", "Shadow Grove",
			"A dark, glowing forest full of mystery. All types may appear.",
			["grass", "electric"], Vector2(600, 1600), 2
		),
		RegionData.create(
			"coastal_harbor", "Coastal Harbor",
			"The starting town. A peaceful harbor by the sea.",
			["water", "normal"], Vector2(2600, 2400), 1
		),
	]


func get_effectiveness(attack_type: String, defense_type: String) -> float:
	var key := "%s>%s" % [attack_type, defense_type]
	return _type_chart.get(key, 1.0)


func get_pokemon_by_id(id: int) -> Dictionary:
	for pokemon in pokedex:
		if pokemon["id"] == id:
			return pokemon.duplicate()
	return {}


func get_random_opponent_excluding(player_id: int) -> Dictionary:
	var candidates: Array = []
	for pokemon in pokedex:
		if pokemon["id"] != player_id:
			candidates.append(pokemon)
	return candidates[randi_range(0, candidates.size() - 1)].duplicate()


func get_opponent_for_region(region: Dictionary, player_id: int) -> Dictionary:
	var enemy_types: Array = region["enemy_types"]
	# Try to find a pokemon matching the region's types
	var typed_candidates: Array = []
	for pokemon in pokedex:
		if pokemon["id"] != player_id and pokemon["type"] in enemy_types:
			typed_candidates.append(pokemon)
	if typed_candidates.size() > 0:
		return typed_candidates[randi_range(0, typed_candidates.size() - 1)].duplicate()
	# Fallback to any opponent
	return get_random_opponent_excluding(player_id)
