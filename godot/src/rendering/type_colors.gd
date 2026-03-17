class_name TypeColors
## Color palettes for each Pokemon type.

const PALETTES := {
	"fire": {
		"primary": Color("#F08030"),
		"secondary": Color("#C03028"),
		"light": Color("#F8D030"),
	},
	"water": {
		"primary": Color("#6890F0"),
		"secondary": Color("#4468A8"),
		"light": Color("#98D8D8"),
	},
	"grass": {
		"primary": Color("#78C850"),
		"secondary": Color("#4E8234"),
		"light": Color("#A7DB8D"),
	},
	"electric": {
		"primary": Color("#F8D030"),
		"secondary": Color("#A8A020"),
		"light": Color("#F8F078"),
	},
	"normal": {
		"primary": Color("#A8A878"),
		"secondary": Color("#6D6D4E"),
		"light": Color("#C6C6A7"),
	},
}


static func get_palette(type: String) -> Dictionary:
	return PALETTES.get(type, PALETTES["normal"])


static func get_primary(type: String) -> Color:
	return get_palette(type)["primary"]


static func get_secondary(type: String) -> Color:
	return get_palette(type)["secondary"]


static func get_light(type: String) -> Color:
	return get_palette(type)["light"]
