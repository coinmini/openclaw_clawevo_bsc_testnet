extends Node
## Manages scene transitions between world map, selection, battle, and result screens.

const WorldMapScene := preload("res://src/ui/world/world_map_scene.tscn")
const SelectionScene := preload("res://src/ui/selection/selection_scene.tscn")
const BattleScenePacked := preload("res://src/ui/battle/battle_scene.tscn")
const ResultScene := preload("res://src/ui/result/result_scene.tscn")

var _current_scene: Node = null
var _current_region: Dictionary = {}


func go_to_world_map() -> void:
	_change_scene(WorldMapScene.instantiate())


func go_to_selection() -> void:
	var scene: Control = SelectionScene.instantiate()
	if not _current_region.is_empty():
		scene.set_region(_current_region)
	_change_scene(scene)


func go_to_selection_with_region(region: Dictionary) -> void:
	_current_region = region
	var scene: Control = SelectionScene.instantiate()
	scene.set_region(region)
	_change_scene(scene)


func go_to_battle_for_region(region: Dictionary) -> void:
	_current_region = region
	var player := GameData.player_pokemon.duplicate()
	var opponent := GameData.get_opponent_for_region(region, player["id"])
	go_to_battle(player, opponent, region)


func go_to_battle(player_pokemon: Dictionary, opponent_pokemon: Dictionary, region: Dictionary = {}) -> void:
	var scene: Control = BattleScenePacked.instantiate()
	scene.setup(player_pokemon, opponent_pokemon, region)
	_change_scene(scene)


func go_to_result(
	winner_name: String,
	player_won: bool,
	turns: int,
	player_pokemon: Dictionary,
	opponent_pokemon: Dictionary
) -> void:
	var scene: Control = ResultScene.instantiate()
	scene.setup(winner_name, player_won, turns, player_pokemon, opponent_pokemon)
	_change_scene(scene)


func _change_scene(new_scene: Node) -> void:
	if _current_scene:
		_current_scene.queue_free()

	_current_scene = new_scene
	get_tree().root.call_deferred("add_child", new_scene)
