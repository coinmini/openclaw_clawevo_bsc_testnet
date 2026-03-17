class_name AiOpponent
## Simple AI that selects moves randomly.


static func select_move(available_moves: Array) -> Dictionary:
	return available_moves[randi_range(0, available_moves.size() - 1)]
