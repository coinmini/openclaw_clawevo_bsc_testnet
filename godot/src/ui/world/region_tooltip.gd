extends PanelContainer
## Floating tooltip that follows the mouse when hovering over a region marker.
## Shows region name and difficulty stars.

@onready var _name_label: Label = $MarginContainer/VBox/NameLabel
@onready var _difficulty_label: Label = $MarginContainer/VBox/DifficultyLabel

const MOUSE_OFFSET := Vector2(16, 16)


func show_for_region(region: Dictionary) -> void:
	_name_label.text = region.get("name", "")
	_difficulty_label.text = _format_difficulty(region.get("difficulty", 1))
	visible = true


func hide_tooltip() -> void:
	visible = false


func _process(_delta: float) -> void:
	if visible:
		global_position = get_viewport().get_mouse_position() + MOUSE_OFFSET


static func _format_difficulty(level: int) -> String:
	var stars := ""
	for i in range(level):
		stars += "★"
	for i in range(3 - level):
		stars += "☆"
	return "Difficulty: " + stars
