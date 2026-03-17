class_name BattleEngine
## Turn-based battle engine. All functions are pure — return new state, never mutate.


## Execute one turn of battle. Returns Dictionary with:
## - "state": updated BattleStateData
## - "events": Array of event Dictionaries for UI animation
static func execute_turn(
	state: Dictionary,
	player_move: Dictionary,
	opponent_move: Dictionary,
	effectiveness_fn: Callable
) -> Dictionary:
	var player: Dictionary = state["player_pokemon"]
	var opponent: Dictionary = state["opponent_pokemon"]
	var events: Array = []

	var p_speed: int = player["speed"]
	var o_speed: int = opponent["speed"]
	var player_first: bool = p_speed >= o_speed

	var first: Dictionary
	var second: Dictionary
	if player_first:
		first = _build_combatant(player, player_move, true)
		second = _build_combatant(opponent, opponent_move, false)
	else:
		first = _build_combatant(opponent, opponent_move, false)
		second = _build_combatant(player, player_move, true)

	# First attack
	var first_result: Dictionary = _execute_attack(
		first["pokemon"], second["pokemon"],
		first["move"], first["is_player"], effectiveness_fn
	)
	events.append_array(first_result["events"])
	var updated_second_pokemon: Dictionary = first_result["defender"]

	if PokemonData.is_fainted(updated_second_pokemon):
		var winner_name: String = first["pokemon"]["name"]
		events.append({"type": "faint", "target_is_player": second["is_player"]})
		var first_ko_state: Dictionary = _build_final_state(
			state, first["pokemon"], updated_second_pokemon,
			first["is_player"], _messages_from_events(events)
		)
		first_ko_state = BattleStateData.with_winner(first_ko_state, winner_name)
		return {"state": first_ko_state, "events": events}

	# Second attack
	var second_result: Dictionary = _execute_attack(
		second["pokemon"], first["pokemon"],
		second["move"], second["is_player"], effectiveness_fn
	)
	events.append_array(second_result["events"])
	var updated_first_pokemon: Dictionary = second_result["defender"]

	if PokemonData.is_fainted(updated_first_pokemon):
		var winner_name: String = second["pokemon"]["name"]
		events.append({"type": "faint", "target_is_player": first["is_player"]})
		var second_ko_state: Dictionary = _build_final_state(
			state, updated_first_pokemon, updated_second_pokemon,
			first["is_player"], _messages_from_events(events)
		)
		second_ko_state = BattleStateData.with_winner(second_ko_state, winner_name)
		return {"state": second_ko_state, "events": events}

	# No one fainted
	var new_state: Dictionary = _build_final_state(
		state, updated_first_pokemon, updated_second_pokemon,
		first["is_player"], _messages_from_events(events)
	)
	return {"state": new_state, "events": events}


static func _build_combatant(
	pokemon: Dictionary, move: Dictionary, is_player: bool
) -> Dictionary:
	return {"pokemon": pokemon, "move": move, "is_player": is_player}


static func _execute_attack(
	attacker: Dictionary,
	defender: Dictionary,
	move: Dictionary,
	attacker_is_player: bool,
	effectiveness_fn: Callable
) -> Dictionary:
	var events: Array = []

	if not DamageCalculator.check_accuracy(move):
		events.append({
			"type": "miss",
			"attacker": attacker["name"],
			"attacker_is_player": attacker_is_player,
			"move_name": move["name"],
		})
		return {"defender": defender, "events": events}

	var move_type: String = move["type"]
	var def_type: String = defender["type"]
	var eff: float = effectiveness_fn.call(move_type, def_type)
	var damage: int = DamageCalculator.calculate(attacker, defender, move, eff)
	var def_hp: int = defender["hp"]
	var new_defender: Dictionary = PokemonData.with_updated_hp(defender, def_hp - damage)

	events.append({
		"type": "attack",
		"attacker": attacker["name"],
		"attacker_is_player": attacker_is_player,
		"move_name": move["name"],
		"damage": damage,
		"effectiveness": eff,
		"defender_hp": new_defender["hp"],
		"defender_max_hp": new_defender["max_hp"],
	})

	if eff > 1.0:
		events.append({"type": "super_effective"})

	return {"defender": new_defender, "events": events}


static func _build_final_state(
	old_state: Dictionary,
	first_pokemon: Dictionary,
	second_pokemon: Dictionary,
	first_is_player: bool,
	messages: Array
) -> Dictionary:
	var player_poke: Dictionary
	var opponent_poke: Dictionary
	if first_is_player:
		player_poke = first_pokemon
		opponent_poke = second_pokemon
	else:
		player_poke = second_pokemon
		opponent_poke = first_pokemon
	return BattleStateData.with_updated_combatants(
		old_state, player_poke, opponent_poke, messages
	)


static func _messages_from_events(events: Array) -> Array:
	var messages: Array = []
	for event: Dictionary in events:
		var event_type: String = event["type"]
		match event_type:
			"attack":
				messages.append(
					"%s used %s! (%d damage)" % [
						event["attacker"], event["move_name"], event["damage"]
					]
				)
			"super_effective":
				messages.append("It's super effective!")
			"miss":
				messages.append(
					"%s used %s, but it missed!" % [
						event["attacker"], event["move_name"]
					]
				)
			"faint":
				var target_is_player: bool = event["target_is_player"]
				var who: String = "Your pokemon" if target_is_player else "The opponent's pokemon"
				messages.append("%s fainted!" % who)
	return messages
