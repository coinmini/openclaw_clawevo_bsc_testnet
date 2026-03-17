extends Node
## Global audio manager. Ensures only one BGM plays at a time.

var _bgm_player: AudioStreamPlayer

const WORLD_BGM := "res://assets/audio/topic.ogg"
const BATTLE_BGM := [
	"res://assets/audio/bgm/battle_1.ogg",
	"res://assets/audio/bgm/battle_2.ogg",
	"res://assets/audio/bgm/battle_3.ogg",
	"res://assets/audio/bgm/battle_4.ogg",
]


func _ready() -> void:
	_bgm_player = AudioStreamPlayer.new()
	_bgm_player.volume_db = -10.0
	add_child(_bgm_player)


func play_world_bgm() -> void:
	_play(WORLD_BGM, true)


func play_battle_bgm() -> void:
	var path: String = BATTLE_BGM[randi() % BATTLE_BGM.size()]
	_play(path, true)


func stop_bgm() -> void:
	_bgm_player.stop()


func _play(path: String, loop: bool) -> void:
	_bgm_player.stop()
	var stream := load(path) as AudioStream
	if stream == null:
		return
	if stream is AudioStreamOggVorbis:
		stream.loop = loop
	elif stream is AudioStreamMP3:
		stream.loop = loop
	_bgm_player.stream = stream
	_bgm_player.play()
