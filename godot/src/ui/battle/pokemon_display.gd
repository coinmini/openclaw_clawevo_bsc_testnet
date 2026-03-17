extends Control
## Displays a Pokemon with sprite, name, level, and HP bar during battle.

@onready var sprite: Node2D = $Sprite
@onready var name_label: Label = $InfoPanel/NameLabel
@onready var level_label: Label = $InfoPanel/LevelLabel
@onready var hp_bar: Control = $InfoPanel/HpBar
@onready var platform: ColorRect = $Platform

var _pokemon_data: Dictionary = {}
var _is_player: bool = false


func setup(pokemon: Dictionary, is_player: bool) -> void:
	_pokemon_data = pokemon
	_is_player = is_player

	name_label.text = pokemon["name"]
	level_label.text = "Lv%d" % pokemon["level"]
	hp_bar.setup(pokemon["hp"], pokemon["max_hp"])

	# Create and setup the sprite
	_setup_sprite(pokemon, is_player)


func _setup_sprite(pokemon: Dictionary, is_player: bool) -> void:
	# Remove old sprite children
	for child in sprite.get_children():
		child.queue_free()

	var char_id := _get_spine_character_id(pokemon)
	if not char_id.is_empty():
		const SpineCharacter := preload("res://src/rendering/spine_character.gd")
		var spine_node: Node2D = SpineCharacter.new()
		var char_scale := Vector2(0.15, 0.15) if is_player else Vector2(-0.12, 0.12)
		spine_node.scale = char_scale
		sprite.add_child(spine_node)
		spine_node.load_character(char_id)
	else:
		var poke_sprite := PokemonSprite.new()
		poke_sprite.setup(pokemon["id"], pokemon["type"], is_player)
		sprite.add_child(poke_sprite)
		if is_player:
			poke_sprite.scale = Vector2(1.5, 1.5)
		else:
			poke_sprite.scale = Vector2(1.2, 1.2)


func _get_spine_character_id(pokemon: Dictionary) -> String:
	const SpineCharacter := preload("res://src/rendering/spine_character.gd")

	# Hero uses act_1050 directly
	if pokemon["id"] == 1050:
		return "act_1050"

	# Other pokemon use type-based mapping
	var char_id: String = SpineCharacter.TYPE_TO_CHARACTER.get(pokemon["type"], "")
	if char_id.is_empty() or not SpineCharacter.CHARACTER_PATHS.has(char_id):
		return ""
	return char_id


func _get_spine_node() -> Node2D:
	for child in sprite.get_children():
		if child.has_method("play_attack"):
			return child
	return null


func animate_hp_to(new_hp: int) -> void:
	await hp_bar.animate_to(new_hp, _pokemon_data["max_hp"])
	_pokemon_data = PokemonData.with_updated_hp(_pokemon_data, new_hp)


func play_attack_flash() -> void:
	var spine := _get_spine_node()
	if spine != null:
		await spine.play_attack()
		return
	# Fallback: tween flash
	var tween := create_tween()
	tween.tween_property(sprite, "modulate", Color.WHITE * 3.0, 0.05)
	tween.tween_property(sprite, "modulate", Color.WHITE, 0.05)
	tween.tween_property(sprite, "position:x", sprite.position.x + 4, 0.05)
	tween.tween_property(sprite, "position:x", sprite.position.x - 4, 0.05)
	tween.tween_property(sprite, "position:x", sprite.position.x, 0.05)
	await tween.finished


func play_hit_flash() -> void:
	var spine := _get_spine_node()
	if spine != null:
		await spine.play_hit()
		return
	# Fallback: tween flash
	var tween := create_tween()
	tween.tween_property(sprite, "modulate", Color(1, 0.3, 0.3), 0.1)
	tween.tween_property(sprite, "modulate", Color.WHITE, 0.1)
	tween.tween_property(sprite, "modulate", Color(1, 0.3, 0.3), 0.1)
	tween.tween_property(sprite, "modulate", Color.WHITE, 0.1)
	await tween.finished


func play_faint() -> void:
	var spine := _get_spine_node()
	if spine != null:
		await spine.play_death()
		return
	# Fallback: tween fade
	var tween := create_tween()
	tween.tween_property(sprite, "position:y", sprite.position.y + 20, 0.5)
	tween.parallel().tween_property(sprite, "modulate:a", 0.0, 0.5)
	await tween.finished


func play_entrance(from_offset: float) -> void:
	var target_x := sprite.position.x
	sprite.position.x = target_x + from_offset
	sprite.modulate.a = 0.0
	var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(sprite, "position:x", target_x, 0.6)
	tween.parallel().tween_property(sprite, "modulate:a", 1.0, 0.4)
	await tween.finished
