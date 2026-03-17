extends SceneTree

var _sprites: Array = []
var _frame_count := 0


func _init() -> void:
	_load_char("GAME_ver", "res://assets/characters/act_1004/act_1004")
	_load_char("ORIG_ver", "res://assets/characters/act_1004_orig/act_1004")


func _load_char(label: String, base_path: String) -> void:
	var atlas_res := SpineAtlasResource.new()
	atlas_res.load_from_atlas_file(base_path + ".atlas")
	var skel_file_res := SpineSkeletonFileResource.new()
	skel_file_res.load_from_file(base_path + ".skel")
	var skel_data_res := SpineSkeletonDataResource.new()
	skel_data_res.skeleton_file_res = skel_file_res
	skel_data_res.atlas_res = atlas_res
	var sprite := SpineSprite.new()
	sprite.skeleton_data_res = skel_data_res
	sprite.name = label
	root.add_child(sprite)
	_sprites.append(sprite)


func _process(_delta: float) -> bool:
	_frame_count += 1
	if _frame_count < 5:
		return false

	for sprite in _sprites:
		var skeleton = sprite.get_skeleton()
		if skeleton == null:
			printerr("[%s] skeleton null" % sprite.name)
			continue
		var data = skeleton.get_data()
		if data == null:
			printerr("[%s] data null" % sprite.name)
			continue
		var anims = data.get_animations()
		printerr("=== %s: %d animations ===" % [sprite.name, anims.size()])
		for anim in anims:
			var a_name: String = anim.get_name()
			var a_dur: float = anim.get_duration()
			var timelines = anim.get_timelines()
			var tl_count: int = timelines.size() if timelines != null else -1
			printerr("  %-12s  dur=%.3fs  timelines=%d" % [a_name, a_dur, tl_count])

	quit()
	return false
