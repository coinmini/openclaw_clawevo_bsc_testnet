extends Control
## Post-battle result screen showing winner and stats.

const SpineCharacter := preload("res://src/rendering/spine_character.gd")

@onready var result_label: Label = $ResultLabel
@onready var detail_label: Label = $DetailLabel
@onready var sprite_anchor: Node2D = $SpriteAnchor
@onready var play_again_btn: Button = $PlayAgainBtn

var _winner_name := ""
var _player_won := false
var _turns := 0
var _player_pokemon: Dictionary = {}
var _opponent_pokemon: Dictionary = {}


func setup(
	winner_name: String,
	player_won: bool,
	turns: int,
	player_pokemon: Dictionary,
	opponent_pokemon: Dictionary
) -> void:
	_winner_name = winner_name
	_player_won = player_won
	_turns = turns
	_player_pokemon = player_pokemon
	_opponent_pokemon = opponent_pokemon


func _ready() -> void:
	play_again_btn.pressed.connect(_on_play_again)

	if _player_won:
		result_label.text = "YOU WIN!"
		result_label.add_theme_color_override("font_color", Color("#F8D030"))
	else:
		result_label.text = "YOU LOST..."
		result_label.add_theme_color_override("font_color", Color("#E04038"))

	detail_label.text = "%s won in %d turns!" % [_winner_name, _turns]

	# Show hero Spine character with win/die animation
	var hero := SpineCharacter.new()
	hero.scale = Vector2(0.5, 0.5)
	sprite_anchor.add_child(hero)
	hero.load_character("act_1050")
	await get_tree().create_timer(0.15).timeout
	if _player_won:
		hero.play_victory()
	else:
		hero.play_death()

	play_again_btn.grab_focus()


func _on_play_again() -> void:
	SceneManager.go_to_world_map()
