extends PanelContainer
## Typewriter-effect dialog box for battle messages.

signal text_finished

@onready var text_label: RichTextLabel = $MarginContainer/TextLabel

const CHAR_DELAY := 0.03

var _is_typing := false
var _full_text := ""
var _skip_requested := false


func show_text(message: String) -> void:
	_full_text = message
	_is_typing = true
	_skip_requested = false
	text_label.text = ""
	visible = true

	for i in range(message.length()):
		if _skip_requested:
			break
		text_label.text = message.substr(0, i + 1)
		await get_tree().create_timer(CHAR_DELAY).timeout

	text_label.text = _full_text
	_is_typing = false
	text_finished.emit()


func show_text_instant(message: String) -> void:
	_full_text = message
	text_label.text = message
	visible = true


func skip() -> void:
	if _is_typing:
		_skip_requested = true


func clear() -> void:
	text_label.text = ""


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept") and _is_typing:
		skip()
