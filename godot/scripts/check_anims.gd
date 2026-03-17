extends SceneTree

var _chars := ["act_1001", "act_1002", "act_1003", "act_1004", "act_1050"]
var _sprites: Array = []
var _frame_count := 0


func _init() -> void:
	for char_id in _chars:
		var base_path := "res://assets/characters/%s/" % char_id
		var atlas_res := SpineAtlasResource.new()
		atlas_res.load_from_atlas_file(base_path + char_id + ".atlas")
		var skel_file_res := SpineSkeletonFileResource.new()
		skel_file_res.load_from_file(base_path + char_id + ".skel")
		var skel_data_res := SpineSkeletonDataResource.new()
		skel_data_res.skeleton_file_res = skel_file_res
		skel_data_res.atlas_res = atlas_res
		var sprite := SpineSprite.new()
		sprite.skeleton_data_res = skel_data_res
		sprite.name = char_id
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
			printerr("  %-12s  %.3fs" % [anim.get_name(), anim.get_duration()])

	quit()
	return false
