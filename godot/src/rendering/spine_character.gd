extends Node2D
## Loads and displays a Spine character on the world map.

var _spine_sprite: Node = null
var _character_id: String = ""
var _animation_names: Array = []
var _animation_durations: Dictionary = {}
var _initialized := false

const CHARACTER_PATHS := {
	"act_1001": "res://assets/characters/act_1001/",
	"act_1002": "res://assets/characters/act_1002/",
	"act_1003": "res://assets/characters/act_1003/",
	"act_1004": "res://assets/characters/act_1004/",
	"act_1050": "res://assets/characters/act_1050/",
}

## Map pokemon types to Spine character IDs
const TYPE_TO_CHARACTER := {
	"grass": "act_1001",
	"fire": "act_1002",
	"water": "act_1003",
	"electric": "act_1004",
}


func load_character(character_id: String) -> void:
	_character_id = character_id
	var base_path: String = CHARACTER_PATHS.get(character_id, "")
	if base_path.is_empty():
		push_warning("Unknown character: %s" % character_id)
		return

	var atlas_path: String = base_path + character_id + ".atlas"
	var skel_path: String = base_path + character_id + ".skel"

	# Load atlas
	var atlas_res: SpineAtlasResource = SpineAtlasResource.new()
	atlas_res.load_from_atlas_file(atlas_path)

	# Load skeleton file
	var skel_file_res: SpineSkeletonFileResource = SpineSkeletonFileResource.new()
	skel_file_res.load_from_file(skel_path)

	# Create skeleton data resource
	var skel_data_res: SpineSkeletonDataResource = SpineSkeletonDataResource.new()
	skel_data_res.skeleton_file_res = skel_file_res
	skel_data_res.atlas_res = atlas_res

	# Create SpineSprite
	_spine_sprite = SpineSprite.new()
	_spine_sprite.skeleton_data_res = skel_data_res
	add_child(_spine_sprite)

	# Wait for initialization then discover animations and play idle
	await get_tree().process_frame
	await get_tree().process_frame
	_discover_animations()
	_initialized = true
	_play_animation("stand", true)


func load_for_type(pokemon_type: String) -> void:
	var char_id: String = TYPE_TO_CHARACTER.get(pokemon_type, "act_1001")
	load_character(char_id)


func _discover_animations() -> void:
	if _spine_sprite == null:
		return
	var skeleton = _spine_sprite.get_skeleton()
	if skeleton == null:
		return
	var data = skeleton.get_data()
	if data == null:
		return
	_animation_names = []
	_animation_durations = {}
	for anim in data.get_animations():
		var anim_name: String = anim.get_name()
		_animation_names.append(anim_name)
		_animation_durations[anim_name] = anim.get_duration()


func get_animation_names() -> Array:
	return _animation_names.duplicate()


func has_animation(anim_name: String) -> bool:
	return anim_name in _animation_names


func get_animation_duration(anim_name: String) -> float:
	return _animation_durations.get(anim_name, 1.0)


func _wait_for_init() -> void:
	if _initialized:
		return
	# Wait up to 30 frames for Spine to finish initializing
	for i in range(30):
		if _initialized:
			return
		await get_tree().process_frame


func _play_animation(anim_name: String, loop: bool) -> void:
	if _spine_sprite == null:
		return
	var anim_state: SpineAnimationState = _spine_sprite.get_animation_state()
	if anim_state == null:
		return
	anim_state.set_animation(anim_name, loop, 0)


func play_animation_by_name(anim_name: String, loop: bool = false, duration: float = -1.0) -> void:
	await _wait_for_init()
	if not has_animation(anim_name):
		push_warning("Animation '%s' not found on %s" % [anim_name, _character_id])
		return
	_play_animation(anim_name, loop)
	if not loop:
		var wait_time: float = duration if duration > 0.0 else get_animation_duration(anim_name)
		await get_tree().create_timer(wait_time).timeout
		_play_animation("stand", true)


func play_attack() -> void:
	await _wait_for_init()
	# Pick a random skill animation from available ones
	var skill_anims: Array = []
	for anim in ["skill0", "skill1", "skill2", "skill4"]:
		if has_animation(anim):
			skill_anims.append(anim)
	if skill_anims.size() > 0:
		var chosen: String = skill_anims[randi() % skill_anims.size()]
		var duration: float = get_animation_duration(chosen)
		_play_animation(chosen, false)
		await get_tree().create_timer(duration).timeout
		_play_animation("stand", true)
		return
	# Fallback: no animation available
	await get_tree().create_timer(0.3).timeout


func play_skill(skill_index: int = 1) -> void:
	await _wait_for_init()
	var anim_name := "skill%d" % skill_index
	if has_animation(anim_name):
		var duration: float = get_animation_duration(anim_name)
		_play_animation(anim_name, false)
		await get_tree().create_timer(duration).timeout
		_play_animation("stand", true)
	else:
		await play_attack()


func play_hit() -> void:
	await _wait_for_init()
	for anim in ["hurt", "hit"]:
		if has_animation(anim):
			var duration: float = get_animation_duration(anim)
			_play_animation(anim, false)
			await get_tree().create_timer(duration).timeout
			_play_animation("stand", true)
			return
	await get_tree().create_timer(0.3).timeout


func play_victory() -> void:
	await _wait_for_init()
	for anim in ["win_1", "win", "victory"]:
		if has_animation(anim):
			_play_animation(anim, false)
			return


func play_death() -> void:
	await _wait_for_init()
	for anim in ["die", "death"]:
		if has_animation(anim):
			_play_animation(anim, false)
			return


func play_run() -> void:
	await _wait_for_init()
	if has_animation("run"):
		_play_animation("run", true)


func play_idle() -> void:
	await _wait_for_init()
	for anim in ["stand", "idle"]:
		if has_animation(anim):
			_play_animation(anim, true)
			return
