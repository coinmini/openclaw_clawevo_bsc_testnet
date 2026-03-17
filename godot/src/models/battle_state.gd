class_name BattleStateData
## Pure data model for battle state. Returns new Dictionaries (immutable pattern).


static func create(player_pokemon: Dictionary, opponent_pokemon: Dictionary) -> Dictionary:
	return {
		"player_pokemon": player_pokemon.duplicate(),
		"opponent_pokemon": opponent_pokemon.duplicate(),
		"turn": 1,
		"log": [],
		"winner": "",
	}


static func with_updated_combatants(
	state: Dictionary,
	player: Dictionary,
	opponent: Dictionary,
	new_messages: Array
) -> Dictionary:
	var result := state.duplicate(true)
	result["player_pokemon"] = player
	result["opponent_pokemon"] = opponent
	result["turn"] = state["turn"] + 1
	result["log"] = state["log"] + new_messages
	return result


static func with_winner(state: Dictionary, winner_name: String) -> Dictionary:
	var result := state.duplicate(true)
	result["winner"] = winner_name
	return result


static func is_over(state: Dictionary) -> bool:
	return state["winner"] != ""
