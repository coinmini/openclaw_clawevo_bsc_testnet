extends Node2D
## World map scene. Hero runs around the map; approaching enemies triggers battle.

@onready var camera: Camera2D = $Camera2D
@onready var map_sprite: Sprite2D = $MapSprite
@onready var markers_container: Node2D = $Markers

const MOVE_SPEED := 600.0
const BATTLE_TRIGGER_DISTANCE := 150.0
const CAMERA_ZOOM := Vector2(0.25, 0.25)
const ZOOM_MIN := 0.1
const ZOOM_MAX := 1.0
const ZOOM_STEP := 0.05
const HERO_SCALE := 0.4
const ENEMY_SCALE := Vector2(0.3, 0.3)
const MAP_MARGIN := 50.0

# Enemy roaming constants
const ROAM_RANGE := 120.0
const ROAM_SPEED := 80.0
const ROAM_PAUSE_MIN := 1.0
const ROAM_PAUSE_MAX := 3.5

const SpineCharacter := preload("res://src/rendering/spine_character.gd")

var _hero: Node2D = null
var _is_running := false
var _battle_triggered := false
var _map_size := Vector2(5504, 3072)
var _hero_start_pos := Vector2(2600, 2700)  # Near Coastal Harbor but not on top of marker
var _battle_cooldown := 1.0  # Seconds before proximity check activates
var _time_since_start := 0.0


func _ready() -> void:
	camera.zoom = CAMERA_ZOOM
	_create_region_markers()
	_create_hero()
	AudioManager.play_world_bgm()


func _create_hero() -> void:
	_hero = SpineCharacter.new()
	_hero.position = _hero_start_pos
	_hero.scale = Vector2(HERO_SCALE, HERO_SCALE)
	add_child(_hero)
	_hero.load_character("act_1050")


func _create_region_markers() -> void:
	for region in GameData.regions:
		var marker := _build_marker(region)
		markers_container.add_child(marker)
	_load_spine_characters()


func _build_marker(region: Dictionary) -> Node2D:
	var marker := Node2D.new()
	marker.position = region["map_position"]
	marker.set_meta("region", region)

	# Spine character for the enemy
	var spine_char := SpineCharacter.new()
	spine_char.name = "SpineChar"
	spine_char.scale = ENEMY_SCALE
	spine_char.set_meta("pokemon_type", _get_primary_type(region))
	marker.add_child(spine_char)

	# Region name label
	var label := Label.new()
	label.text = region["name"]
	label.position = Vector2(-100, 100)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.custom_minimum_size = Vector2(200, 0)
	label.add_theme_font_size_override("font_size", 32)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 2)
	marker.add_child(label)

	# Roaming state: SpineChar moves relative to marker origin (0,0)
	marker.set_meta("roam_target", Vector2.ZERO)
	marker.set_meta("roam_timer", randf_range(0.5, 2.0))  # Stagger initial start
	marker.set_meta("roam_moving", false)

	return marker


func _get_primary_type(region: Dictionary) -> String:
	var types: Array = region.get("enemy_types", [])
	return types[0] if types.size() > 0 else "grass"


func _load_spine_characters() -> void:
	for marker in markers_container.get_children():
		var spine_char: Node = marker.get_node_or_null("SpineChar")
		if spine_char != null:
			var ptype: String = spine_char.get_meta("pokemon_type", "grass")
			spine_char.load_for_type(ptype)


func _process(delta: float) -> void:
	if _battle_triggered:
		return

	_time_since_start += delta
	_move_hero(delta)
	_update_camera()
	_update_enemy_roaming(delta)
	if _time_since_start >= _battle_cooldown:
		_check_battle_proximity()


func _move_hero(delta: float) -> void:
	var direction := Vector2.ZERO
	if Input.is_action_pressed("ui_left"):
		direction.x -= 1
	if Input.is_action_pressed("ui_right"):
		direction.x += 1
	if Input.is_action_pressed("ui_up"):
		direction.y -= 1
	if Input.is_action_pressed("ui_down"):
		direction.y += 1

	if direction != Vector2.ZERO:
		direction = direction.normalized()
		_hero.position += direction * MOVE_SPEED * delta
		_hero.position.x = clampf(_hero.position.x, MAP_MARGIN, _map_size.x - MAP_MARGIN)
		_hero.position.y = clampf(_hero.position.y, MAP_MARGIN, _map_size.y - MAP_MARGIN)

		# Flip hero based on horizontal direction
		if direction.x != 0:
			_hero.scale.x = HERO_SCALE if direction.x > 0 else -HERO_SCALE

		# Play run animation
		if not _is_running:
			_is_running = true
			_hero.play_run()
	else:
		if _is_running:
			_is_running = false
			_hero.play_idle()


func _update_camera() -> void:
	camera.position = _hero.position
	_clamp_camera()


func _clamp_camera() -> void:
	var half_view: Vector2 = get_viewport_rect().size / (2.0 * camera.zoom)
	camera.position.x = clampf(camera.position.x, half_view.x, _map_size.x - half_view.x)
	camera.position.y = clampf(camera.position.y, half_view.y, _map_size.y - half_view.y)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_camera(ZOOM_STEP)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_camera(-ZOOM_STEP)
	elif event is InputEventMagnifyGesture:
		# Trackpad pinch-to-zoom (macOS)
		var new_zoom := clampf(camera.zoom.x * event.factor, ZOOM_MIN, ZOOM_MAX)
		camera.zoom = Vector2(new_zoom, new_zoom)
		_clamp_camera()


func _zoom_camera(step: float) -> void:
	var new_zoom := clampf(camera.zoom.x + step, ZOOM_MIN, ZOOM_MAX)
	camera.zoom = Vector2(new_zoom, new_zoom)
	_clamp_camera()


func _update_enemy_roaming(delta: float) -> void:
	for marker in markers_container.get_children():
		var spine_char: Node = marker.get_node_or_null("SpineChar")
		if spine_char == null:
			continue

		var is_moving: bool = marker.get_meta("roam_moving")
		var timer: float = marker.get_meta("roam_timer")

		if not is_moving:
			# Counting down pause timer
			timer -= delta
			marker.set_meta("roam_timer", timer)
			if timer <= 0.0:
				# Pick a new random target relative to marker origin
				var target := Vector2(
					randf_range(-ROAM_RANGE, ROAM_RANGE),
					randf_range(-ROAM_RANGE * 0.5, ROAM_RANGE * 0.5)
				)
				marker.set_meta("roam_target", target)
				marker.set_meta("roam_moving", true)

				# Flip direction and play run
				var enemy_scale_x: float = ENEMY_SCALE.x
				if target.x < spine_char.position.x:
					spine_char.scale.x = -enemy_scale_x
				else:
					spine_char.scale.x = enemy_scale_x
				spine_char.play_run()
		else:
			# Moving toward target
			var target: Vector2 = marker.get_meta("roam_target")
			var direction: Vector2 = target - spine_char.position
			var dist: float = direction.length()
			if dist < 2.0:
				# Arrived — stop and start pause
				spine_char.position = target
				marker.set_meta("roam_moving", false)
				marker.set_meta("roam_timer", randf_range(ROAM_PAUSE_MIN, ROAM_PAUSE_MAX))
				spine_char.play_idle()
			else:
				spine_char.position += direction.normalized() * ROAM_SPEED * delta


func _check_battle_proximity() -> void:
	for marker in markers_container.get_children():
		var dist: float = _hero.position.distance_to(marker.position)
		if dist < BATTLE_TRIGGER_DISTANCE:
			var region: Dictionary = marker.get_meta("region")
			_battle_triggered = true
			SceneManager.go_to_battle_for_region(region)
			return
