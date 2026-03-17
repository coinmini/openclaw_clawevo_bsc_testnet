extends Control
## Animated HP bar with color transitions: green > yellow > red.

signal drain_finished

@onready var bar_bg: ColorRect = $BarBg
@onready var bar_fill: ColorRect = $BarFill
@onready var hp_label: Label = $HpLabel

const BAR_WIDTH := 37.0
const DRAIN_DURATION := 0.5

var _current_ratio := 1.0


func setup(current_hp: int, max_hp: int) -> void:
	_current_ratio = float(current_hp) / float(max_hp) if max_hp > 0 else 0.0
	_update_bar_instant()
	_update_label(current_hp, max_hp)


func animate_to(current_hp: int, max_hp: int) -> void:
	var target_ratio := float(current_hp) / float(max_hp) if max_hp > 0 else 0.0
	var tween := create_tween()
	tween.tween_property(self, "_current_ratio", target_ratio, DRAIN_DURATION)
	tween.tween_callback(_update_bar_instant)
	tween.parallel().tween_method(
		func(r: float) -> void:
			bar_fill.size.x = r * BAR_WIDTH
			bar_fill.color = _color_for_ratio(r),
		_current_ratio, target_ratio, DRAIN_DURATION
	)
	_update_label(current_hp, max_hp)
	await tween.finished
	_current_ratio = target_ratio
	drain_finished.emit()


func _update_bar_instant() -> void:
	bar_fill.size.x = _current_ratio * BAR_WIDTH
	bar_fill.color = _color_for_ratio(_current_ratio)


func _update_label(_current_hp: int, _max_hp: int) -> void:
	pass


static func _color_for_ratio(ratio: float) -> Color:
	if ratio > 0.5:
		return Color("#48D048")  # Green
	elif ratio > 0.2:
		return Color("#F8C030")  # Yellow
	else:
		return Color("#E04038")  # Red
