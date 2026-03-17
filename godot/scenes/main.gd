extends Node
## Entry point. Starts BGM and loads the world map.


func _ready() -> void:
	SceneManager.go_to_world_map.call_deferred()
