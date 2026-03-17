extends PanelContainer
## A selectable Pokemon card showing sprite, name, type, and stats.

signal card_pressed(pokemon: Dictionary)

var _pokemon: Dictionary = {}
var _selected := false

@onready var sprite_container: Node2D = $VBoxContainer/SpriteCenter/Sprite
@onready var name_label: Label = $VBoxContainer/NameLabel
@onready var type_label: Label = $VBoxContainer/TypeLabel
@onready var stats_label: Label = $VBoxContainer/StatsLabel


func setup(pokemon: Dictionary) -> void:
	_pokemon = pokemon
	name_label.text = pokemon["name"]
	type_label.text = pokemon["type"].to_upper()
	type_label.add_theme_color_override("font_color", TypeColors.get_primary(pokemon["type"]))
	stats_label.text = "HP:%d ATK:%d\nDEF:%d SPD:%d" % [
		pokemon["max_hp"], pokemon["attack"], pokemon["defense"], pokemon["speed"]
	]

	# Add sprite
	for child in sprite_container.get_children():
		child.queue_free()
	var poke_sprite := PokemonSprite.new()
	poke_sprite.setup(pokemon["id"], pokemon["type"], false)
	sprite_container.add_child(poke_sprite)


func set_selected(selected: bool) -> void:
	_selected = selected
	var style := StyleBoxFlat.new()
	if selected:
		style.bg_color = Color(0.2, 0.3, 0.5, 0.8)
		style.border_color = Color(1, 1, 0.5)
		style.set_border_width_all(2)
	else:
		style.bg_color = Color(0.15, 0.15, 0.2, 0.8)
		style.border_color = Color(0.4, 0.4, 0.5)
		style.set_border_width_all(1)
	style.set_corner_radius_all(2)
	style.set_content_margin_all(2)
	add_theme_stylebox_override("panel", style)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		card_pressed.emit(_pokemon)
