class_name RegionData
## Data model for world map regions.


static func create(
	id: String,
	region_name: String,
	description: String,
	enemy_types: Array,
	map_position: Vector2,
	difficulty: int
) -> Dictionary:
	return {
		"id": id,
		"name": region_name,
		"description": description,
		"enemy_types": enemy_types,
		"map_position": map_position,
		"difficulty": difficulty,
	}
