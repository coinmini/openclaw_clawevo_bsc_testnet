class_name DamageCalculator
## Pure function for damage calculation.
## Formula: floor(((2*level/5+2) * power * attack / defense / 50 + 2) * effectiveness)


static func calculate(
	attacker: Dictionary,
	defender: Dictionary,
	move: Dictionary,
	effectiveness: float
) -> int:
	var atk_level: int = attacker["level"]
	var move_power: int = move["power"]
	var atk_stat: int = attacker["attack"]
	var def_stat: int = defender["defense"]
	var level_factor: float = (2.0 * atk_level) / 5.0 + 2.0
	var base_damage: float = (level_factor * move_power * atk_stat) / def_stat / 50.0 + 2.0
	return int(floor(base_damage * effectiveness))


static func check_accuracy(move: Dictionary) -> bool:
	var acc: int = move["accuracy"]
	if acc >= 100:
		return true
	return randi_range(1, 100) <= acc
