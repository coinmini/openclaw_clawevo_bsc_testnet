extends VBoxContainer
## Action menu with Fight and Run buttons.

signal fight_pressed
signal run_pressed

@onready var fight_btn: Button = $FightBtn
@onready var run_btn: Button = $RunBtn


func _ready() -> void:
	fight_btn.pressed.connect(func() -> void: fight_pressed.emit())
	run_btn.pressed.connect(func() -> void: run_pressed.emit())


func focus_fight() -> void:
	fight_btn.grab_focus()
