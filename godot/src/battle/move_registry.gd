class_name MoveRegistry
## Registry of all moves and type-based move sets.

# Normal moves
const TACKLE := {"name": "Tackle", "type": "normal", "power": 40, "accuracy": 100}
const BODY_SLAM := {"name": "Body Slam", "type": "normal", "power": 85, "accuracy": 100}

# Fire moves
const EMBER := {"name": "Ember", "type": "fire", "power": 40, "accuracy": 100}
const FLAMETHROWER := {"name": "Flamethrower", "type": "fire", "power": 90, "accuracy": 100}

# Water moves
const WATER_GUN := {"name": "Water Gun", "type": "water", "power": 40, "accuracy": 100}
const HYDRO_PUMP := {"name": "Hydro Pump", "type": "water", "power": 110, "accuracy": 80}

# Grass moves
const VINE_WHIP := {"name": "Vine Whip", "type": "grass", "power": 45, "accuracy": 100}
const SOLAR_BEAM := {"name": "Solar Beam", "type": "grass", "power": 120, "accuracy": 100}

# Electric moves
const THUNDER_SHOCK := {"name": "Thunder Shock", "type": "electric", "power": 40, "accuracy": 100}
const THUNDERBOLT := {"name": "Thunderbolt", "type": "electric", "power": 90, "accuracy": 100}


static func get_moves_for_type(type: String) -> Array:
	match type:
		"fire":
			return [TACKLE, EMBER, FLAMETHROWER]
		"water":
			return [TACKLE, WATER_GUN, HYDRO_PUMP]
		"grass":
			return [TACKLE, VINE_WHIP, SOLAR_BEAM]
		"electric":
			return [TACKLE, THUNDER_SHOCK, THUNDERBOLT]
		_:
			return [TACKLE, BODY_SLAM, TACKLE]
