extends Control
## Main battle scene controller. Orchestrates the battle flow via state machine.

enum State { INTRO, PLAYER_CHOOSING, EXECUTING, ANIMATING, BATTLE_OVER }

const PokemonDisplayScene := preload("res://src/ui/battle/pokemon_display.tscn")

@onready var battle_bg: TextureRect = $BattleBg
@onready var player_area: Control = $PlayerArea
@onready var opponent_area: Control = $OpponentArea
@onready var dialog: PanelContainer = $BattleDialog
@onready var action_menu: VBoxContainer = $ActionMenu
@onready var move_menu: VBoxContainer = $MoveMenu

var _state: State = State.INTRO
var _battle_state: Dictionary = {}
var _player_pokemon: Dictionary = {}
var _opponent_pokemon: Dictionary = {}
var _player_moves: Array = []
var _opponent_moves: Array = []
var _player_display: Control = null
var _opponent_display: Control = null
var _auto_battle := true
var _region: Dictionary = {}

const DEFAULT_BG := "verdant_plains"
const BG_PATH_TEMPLATE := "res://assets/images/battle_bgs/%s.png"


func setup(player: Dictionary, opponent: Dictionary, region: Dictionary = {}) -> void:
	_player_pokemon = player
	_opponent_pokemon = opponent
	_region = region
	_player_moves = MoveRegistry.get_moves_for_type(player["type"])
	_opponent_moves = MoveRegistry.get_moves_for_type(opponent["type"])
	_battle_state = BattleStateData.create(player, opponent)


func _ready() -> void:
	action_menu.fight_pressed.connect(_on_fight)
	action_menu.run_pressed.connect(_on_run)
	move_menu.move_selected.connect(_on_move_selected)
	action_menu.visible = false
	move_menu.visible = false

	_load_battle_bg()
	AudioManager.play_battle_bgm()
	_setup_displays()
	_run_intro()


func _load_battle_bg() -> void:
	var region_id: String = _region.get("id", DEFAULT_BG)
	var bg_path := BG_PATH_TEMPLATE % region_id
	var tex := load(bg_path) as Texture2D
	if tex != null:
		battle_bg.texture = tex
	else:
		# Fallback to default
		battle_bg.texture = load(BG_PATH_TEMPLATE % DEFAULT_BG) as Texture2D


func _setup_displays() -> void:
	# Player display - bottom left
	_player_display = PokemonDisplayScene.instantiate()
	player_area.add_child(_player_display)
	_player_display.setup(_player_pokemon, true)

	# Opponent display - top right
	_opponent_display = PokemonDisplayScene.instantiate()
	opponent_area.add_child(_opponent_display)
	_opponent_display.setup(_opponent_pokemon, false)


func _run_intro() -> void:
	_state = State.INTRO

	# Entrance animations
	_player_display.play_entrance(-80)
	await _opponent_display.play_entrance(80)

	await _show_dialog("A wild %s appeared!" % _opponent_pokemon["name"])
	await _wait_for_input()
	await _show_dialog("Go, %s!" % _player_pokemon["name"])
	await _wait_for_input()

	_enter_player_choice()


func _enter_player_choice() -> void:
	_state = State.PLAYER_CHOOSING
	if _auto_battle:
		var auto_move := AiOpponent.select_move(_player_moves)
		_on_move_selected(auto_move)
		return
	dialog.show_text_instant("What will %s do?" % _player_pokemon["name"])
	action_menu.visible = true
	move_menu.visible = false
	action_menu.focus_fight()


func _on_fight() -> void:
	if _state != State.PLAYER_CHOOSING:
		return
	action_menu.visible = false
	move_menu.visible = true
	move_menu.setup(_player_moves)


func _on_run() -> void:
	if _state != State.PLAYER_CHOOSING:
		return
	SceneManager.go_to_world_map()


func _on_move_selected(player_move: Dictionary) -> void:
	if _state != State.PLAYER_CHOOSING:
		return
	_state = State.EXECUTING
	action_menu.visible = false
	move_menu.visible = false

	var opponent_move := AiOpponent.select_move(_opponent_moves)
	var result := BattleEngine.execute_turn(
		_battle_state, player_move, opponent_move,
		Callable(GameData, "get_effectiveness")
	)

	_battle_state = result["state"]
	await _animate_events(result["events"])

	if BattleStateData.is_over(_battle_state):
		_state = State.BATTLE_OVER
		var winner: String = _battle_state["winner"]
		var player_won: bool = (winner == _player_pokemon["name"])
		await _show_dialog(
			"You win!" if player_won else "You lost..."
		)
		await _wait_for_input()
		SceneManager.go_to_result(
			_battle_state["winner"],
			player_won,
			_battle_state["turn"],
			_player_pokemon,
			_opponent_pokemon
		)
	else:
		_player_pokemon = _battle_state["player_pokemon"]
		_opponent_pokemon = _battle_state["opponent_pokemon"]
		_enter_player_choice()


func _animate_events(events: Array) -> void:
	_state = State.ANIMATING
	for event in events:
		match event["type"]:
			"attack":
				await _animate_attack(event)
			"super_effective":
				await _show_dialog("It's super effective!")
				await _wait_for_input()
			"miss":
				await _show_dialog(
					"%s used %s, but it missed!" % [event["attacker"], event["move_name"]]
				)
				await _wait_for_input()
			"faint":
				var is_player_target: bool = event["target_is_player"]
				var target: Control = _player_display if is_player_target else _opponent_display
				await target.play_faint()


func _animate_attack(event: Dictionary) -> void:
	var is_player_attacking: bool = event["attacker_is_player"]
	var attacker_display: Control = _player_display if is_player_attacking else _opponent_display
	var defender_display: Control = _opponent_display if is_player_attacking else _player_display

	await _show_dialog("%s used %s!" % [event["attacker"], event["move_name"]])
	await _wait_for_input()

	await attacker_display.play_attack_flash()
	await defender_display.play_hit_flash()
	await defender_display.animate_hp_to(event["defender_hp"])


func _show_dialog(text: String) -> void:
	await dialog.show_text(text)


func _wait_for_input() -> void:
	if _auto_battle:
		await get_tree().create_timer(0.6).timeout
		return
	await get_tree().create_timer(0.3).timeout
	# Wait for any key/click
	var waiting := true
	while waiting:
		await get_tree().process_frame
		if Input.is_action_just_pressed("ui_accept") or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			waiting = false
	await get_tree().create_timer(0.1).timeout
