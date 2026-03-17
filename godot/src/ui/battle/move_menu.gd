extends VBoxContainer
## Move selection menu with type-colored buttons.

signal move_selected(move: Dictionary)

var _moves: Array = []


func setup(moves: Array) -> void:
	_moves = moves
	_clear_buttons()

	for i in range(moves.size()):
		var btn := Button.new()
		var move: Dictionary = moves[i]
		btn.text = "%s (%s)" % [move["name"], move["type"].to_upper()]
		btn.custom_minimum_size = Vector2(66, 8)
		btn.add_theme_font_size_override("font_size", 4)
		btn.pressed.connect(_on_move_pressed.bind(i))

		# Style with type color
		var style := StyleBoxFlat.new()
		style.bg_color = TypeColors.get_primary(move["type"]).darkened(0.3)
		style.border_color = TypeColors.get_primary(move["type"])
		style.set_border_width_all(1)
		style.set_corner_radius_all(1)
		style.set_content_margin_all(1)
		btn.add_theme_stylebox_override("normal", style)

		var hover_style := style.duplicate()
		hover_style.bg_color = TypeColors.get_primary(move["type"])
		btn.add_theme_stylebox_override("hover", hover_style)
		btn.add_theme_stylebox_override("focus", hover_style)

		add_child(btn)

	# Focus the first button
	if get_child_count() > 0:
		get_child(0).grab_focus()


func _clear_buttons() -> void:
	for child in get_children():
		child.queue_free()


func _on_move_pressed(index: int) -> void:
	if index < _moves.size():
		move_selected.emit(_moves[index])
