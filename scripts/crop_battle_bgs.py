"""Crop battle background images from the world map for each region."""

from PIL import Image
from pathlib import Path

MAP_PATH = Path(__file__).parent.parent / "godot" / "assets" / "images" / "world_map.jpeg"
OUTPUT_DIR = Path(__file__).parent.parent / "godot" / "assets" / "images" / "battle_bgs"

# World map size: 5504 x 3072
# Viewport: 320 x 180 (ratio ~1.778)
# Crop size on map: pick a region that looks good and scale down
# We'll crop 960x540 from the map (same 16:9 ratio), then resize to 320x180

CROP_W = 960
CROP_H = 540

# Region centers on the world map and their crop regions
# Each entry: (region_id, center_x, center_y)
REGIONS = [
    ("verdant_plains", 2200, 1600),
    ("volcano_isle", 4600, 2500),
    ("frozen_peaks", 1200, 600),
    ("thunder_ruins", 4000, 1400),
    ("shadow_grove", 600, 1600),
    ("coastal_harbor", 2600, 2400),
]

MAP_W = 5504
MAP_H = 3072


def clamp(value: int, min_val: int, max_val: int) -> int:
    return max(min_val, min(value, max_val))


def crop_region(img: Image.Image, cx: int, cy: int) -> Image.Image:
    """Crop a CROP_W x CROP_H region centered on (cx, cy), clamped to image bounds."""
    left = clamp(cx - CROP_W // 2, 0, MAP_W - CROP_W)
    top = clamp(cy - CROP_H // 2, 0, MAP_H - CROP_H)
    right = left + CROP_W
    bottom = top + CROP_H
    cropped = img.crop((left, top, right, bottom))
    return cropped.resize((320, 180), Image.LANCZOS)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.open(MAP_PATH)
    print(f"Map size: {img.size}")

    for region_id, cx, cy in REGIONS:
        result = crop_region(img, cx, cy)
        out_path = OUTPUT_DIR / f"{region_id}.png"
        result.save(out_path)
        print(f"Saved: {out_path.name} (center: {cx},{cy})")

    print(f"\nDone! {len(REGIONS)} battle backgrounds saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
