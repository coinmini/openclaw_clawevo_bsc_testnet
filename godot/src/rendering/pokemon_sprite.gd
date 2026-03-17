class_name PokemonSprite
extends Node2D
## Procedurally draws a Pokemon using _draw() based on its ID and type.

var pokemon_id: int = 0
var pokemon_type: String = "normal"
var facing_back: bool = false


func setup(id: int, type: String, back: bool = false) -> void:
	pokemon_id = id
	pokemon_type = type
	facing_back = back
	queue_redraw()


func _draw() -> void:
	var palette := TypeColors.get_palette(pokemon_type)
	var primary: Color = palette["primary"]
	var secondary: Color = palette["secondary"]
	var light: Color = palette["light"]

	match pokemon_id:
		1:
			_draw_bulbasaur(primary, secondary, light)
		4:
			_draw_charmander(primary, secondary, light)
		7:
			_draw_squirtle(primary, secondary, light)
		25:
			_draw_pikachu(primary, secondary, light)
		_:
			_draw_default(primary, secondary)


func _draw_bulbasaur(primary: Color, secondary: Color, light: Color) -> void:
	# Body - round green shape
	draw_circle(Vector2(0, 4), 12, primary)
	# Bulb on back
	draw_circle(Vector2(-2, -8), 8, secondary)
	draw_circle(Vector2(-2, -10), 5, light)
	# Legs
	draw_rect(Rect2(-10, 12, 6, 5), secondary)
	draw_rect(Rect2(4, 12, 6, 5), secondary)
	if not facing_back:
		# Eyes
		draw_circle(Vector2(-5, 0), 2, Color.WHITE)
		draw_circle(Vector2(5, 0), 2, Color.WHITE)
		draw_circle(Vector2(-4, 0), 1, Color.BLACK)
		draw_circle(Vector2(6, 0), 1, Color.BLACK)
		# Mouth
		draw_line(Vector2(-3, 5), Vector2(3, 5), Color.BLACK, 1)


func _draw_charmander(primary: Color, secondary: Color, light: Color) -> void:
	# Body - orange lizard
	draw_circle(Vector2(0, 2), 10, primary)
	# Head
	draw_circle(Vector2(0, -10), 8, primary)
	# Tail
	var tail_points := PackedVector2Array([
		Vector2(8, 8), Vector2(16, 4), Vector2(18, 0)
	])
	draw_polyline(tail_points, secondary, 3)
	# Flame on tail tip
	draw_circle(Vector2(18, -2), 4, light)
	draw_circle(Vector2(18, -3), 2, Color("#FF4444"))
	# Legs
	draw_rect(Rect2(-8, 10, 5, 6), secondary)
	draw_rect(Rect2(3, 10, 5, 6), secondary)
	if not facing_back:
		# Eyes
		draw_circle(Vector2(-4, -12), 2, Color.WHITE)
		draw_circle(Vector2(4, -12), 2, Color.WHITE)
		draw_circle(Vector2(-3, -12), 1, Color.BLACK)
		draw_circle(Vector2(5, -12), 1, Color.BLACK)
		# Belly
		draw_circle(Vector2(0, 4), 6, light)


func _draw_squirtle(primary: Color, secondary: Color, light: Color) -> void:
	# Shell (back)
	draw_circle(Vector2(0, 2), 12, secondary)
	# Body - blue turtle
	draw_circle(Vector2(0, 2), 10, primary)
	# Head
	draw_circle(Vector2(0, -9), 7, primary)
	# Shell pattern
	draw_arc(Vector2(0, 2), 8, 0.3, 2.8, 12, secondary, 2)
	draw_line(Vector2(0, -6), Vector2(0, 10), secondary, 1)
	# Legs
	draw_rect(Rect2(-9, 10, 5, 5), primary)
	draw_rect(Rect2(4, 10, 5, 5), primary)
	# Tail
	draw_line(Vector2(0, 12), Vector2(-6, 16), light, 3)
	if not facing_back:
		# Eyes
		draw_circle(Vector2(-3, -11), 2, Color.WHITE)
		draw_circle(Vector2(3, -11), 2, Color.WHITE)
		draw_circle(Vector2(-2, -11), 1, Color.BLACK)
		draw_circle(Vector2(4, -11), 1, Color.BLACK)
		# Belly
		draw_circle(Vector2(0, 4), 6, light)


func _draw_pikachu(primary: Color, secondary: Color, _light: Color) -> void:
	# Body - yellow round
	draw_circle(Vector2(0, 2), 10, primary)
	# Head
	draw_circle(Vector2(0, -8), 8, primary)
	# Ears - pointy
	var left_ear := PackedVector2Array([
		Vector2(-6, -14), Vector2(-10, -26), Vector2(-2, -18)
	])
	var right_ear := PackedVector2Array([
		Vector2(6, -14), Vector2(10, -26), Vector2(2, -18)
	])
	draw_colored_polygon(left_ear, primary)
	draw_colored_polygon(right_ear, primary)
	# Ear tips
	draw_line(Vector2(-10, -26), Vector2(-8, -22), Color.BLACK, 2)
	draw_line(Vector2(10, -26), Vector2(8, -22), Color.BLACK, 2)
	# Tail - lightning bolt shape
	var tail := PackedVector2Array([
		Vector2(8, 4), Vector2(14, -2), Vector2(12, 2),
		Vector2(18, -6), Vector2(16, 0), Vector2(20, -4)
	])
	draw_polyline(tail, secondary, 2)
	# Cheeks
	draw_circle(Vector2(-7, -5), 3, Color("#FF4444"))
	draw_circle(Vector2(7, -5), 3, Color("#FF4444"))
	# Legs
	draw_rect(Rect2(-7, 10, 5, 4), secondary)
	draw_rect(Rect2(2, 10, 5, 4), secondary)
	if not facing_back:
		# Eyes
		draw_circle(Vector2(-4, -10), 2, Color.BLACK)
		draw_circle(Vector2(4, -10), 2, Color.BLACK)
		draw_circle(Vector2(-3, -11), 1, Color.WHITE)
		draw_circle(Vector2(5, -11), 1, Color.WHITE)
		# Mouth
		draw_line(Vector2(-2, -5), Vector2(0, -4), Color.BLACK, 1)
		draw_line(Vector2(0, -4), Vector2(2, -5), Color.BLACK, 1)


func _draw_default(primary: Color, secondary: Color) -> void:
	draw_circle(Vector2(0, 0), 12, primary)
	draw_circle(Vector2(0, 0), 8, secondary)
	if not facing_back:
		draw_circle(Vector2(-4, -2), 2, Color.WHITE)
		draw_circle(Vector2(4, -2), 2, Color.WHITE)
