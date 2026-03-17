class_name MoveData
## Pure data model for moves.


static func create(move_name: String, type: String, power: int, accuracy: int) -> Dictionary:
	return {
		"name": move_name,
		"type": type,
		"power": power,
		"accuracy": accuracy,
	}
