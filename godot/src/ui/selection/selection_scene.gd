extends Control
## Pokemon selection screen. Player picks one of 4 Pokemon, then starts battle.

const PokemonCardScene := preload("res://src/ui/selection/pokemon_card.tscn")

@onready var title_label: Label = $TitleLabel
@onready var region_label: Label = $RegionLabel
@onready var card_container: HBoxContainer = $CardContainer
@onready var confirm_btn: Button = $ConfirmBtn
@onready var back_btn: Button = $BackBtn

var _selected_pokemon: Dictionary = {}
var _current_region: Dictionary = {}
var _cards: Array = []


func set_region(region: Dictionary) -> void:
	_current_region = region


func _ready() -> void:
	confirm_btn.disabled = true
	confirm_btn.pressed.connect(_on_confirm)
	back_btn.pressed.connect(_on_back)

	if not _current_region.is_empty():
		region_label.text = "[%s]" % _current_region["name"]
	_populate_cards()


func _populate_cards() -> void:
	for pokemon in GameData.pokedex:
		var card: PanelContainer = PokemonCardScene.instantiate()
		card_container.add_child(card)
		card.setup(pokemon)
		card.set_selected(false)
		card.card_pressed.connect(_on_card_pressed)
		_cards.append(card)


func _on_card_pressed(pokemon: Dictionary) -> void:
	_selected_pokemon = pokemon
	confirm_btn.disabled = false
	var selected_id: int = pokemon["id"]
	for card in _cards:
		var card_id: int = card._pokemon["id"]
		card.set_selected(card_id == selected_id)


func _on_confirm() -> void:
	if _selected_pokemon.is_empty():
		return
	var player_id: int = _selected_pokemon["id"]
	var opponent: Dictionary
	if not _current_region.is_empty():
		opponent = GameData.get_opponent_for_region(_current_region, player_id)
	else:
		opponent = GameData.get_random_opponent_excluding(player_id)
	SceneManager.go_to_battle(_selected_pokemon, opponent)


func _on_back() -> void:
	SceneManager.go_to_world_map()
