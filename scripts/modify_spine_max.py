"""
Maximum visual modification for Spine 2D character (no pixelation).

9-step pipeline with multiple color presets:
  1. Selective color replace (per preset)
  2. Qi effect hue shift (per preset)
  3. Temperature shift (per preset)
  4. Contrast boost (1.3)
  5. Saturation boost (1.4)
  6. Posterize (5 bits)
  7. Sharpen (UnsharpMask)
  8. Alpha boost on qi effects (×1.5)
  9. Glow/bloom on sword effects

Usage:
  python scripts/modify_spine_max.py --preset blue
  python scripts/modify_spine_max.py --preset all
  python scripts/modify_spine_max.py --list
"""

import argparse
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# ── Color presets ─────────────────────────────────────────────

COLOR_PRESETS = {
    "red": {
        "label": "赤焰 — 深红衣甲 + 银白发",
        "armor_hue": 0.0,
        "armor_sat_mult": 1.5,
        "hair_val_delta": 0.5,
        "hair_sat_mult": 0.2,
        "warm_hue": 340.0,
        "temp_r": -15,
        "temp_b": 15,
        "qi_hue_shift": 180,
    },
    "blue": {
        "label": "寒冰 — 深蓝衣甲 + 浅金发",
        "armor_hue": 220.0,
        "armor_sat_mult": 1.4,
        "hair_val_delta": 0.4,
        "hair_sat_mult": 0.4,
        "warm_hue": 240.0,
        "temp_r": -20,
        "temp_b": 20,
        "qi_hue_shift": 90,
    },
    "green": {
        "label": "翠林 — 翠绿衣甲 + 浅紫发",
        "armor_hue": 140.0,
        "armor_sat_mult": 1.3,
        "hair_val_delta": 0.35,
        "hair_sat_mult": 0.5,
        "warm_hue": 160.0,
        "temp_r": 10,
        "temp_b": -10,
        "qi_hue_shift": 60,
    },
    "purple": {
        "label": "幽冥 — 紫色衣甲 + 白金发",
        "armor_hue": 280.0,
        "armor_sat_mult": 1.4,
        "hair_val_delta": 0.5,
        "hair_sat_mult": 0.15,
        "warm_hue": 320.0,
        "temp_r": -10,
        "temp_b": 20,
        "qi_hue_shift": 120,
    },
    "dark": {
        "label": "暗影 — 暗红衣甲 + 纯黑发",
        "armor_hue": 0.0,
        "armor_sat_mult": 1.2,
        "hair_val_delta": -0.1,
        "hair_sat_mult": 0.1,
        "warm_hue": 20.0,
        "temp_r": -20,
        "temp_b": 10,
        "qi_hue_shift": 180,
    },
}

# ── Fixed configuration ───────────────────────────────────────

INPUT_DIR = Path(__file__).resolve().parent.parent / "need_change_color" / "1"
BASE_OUTPUT = Path(__file__).resolve().parent.parent / "need_change_color"

CONTRAST_FACTOR = 1.3
SATURATION_FACTOR = 1.4
POSTERIZE_BITS = 5
ALPHA_BOOST_FACTOR = 1.5
SHARPEN_RADIUS = 1
SHARPEN_PERCENT = 80
GLOW_RADIUS = 3
GLOW_INTENSITY = 0.6
MIN_SIZE_FOR_POSTERIZE = 10

# ── Active preset (set by main) ──────────────────────────────

_active_preset: dict = COLOR_PRESETS["red"]


# ── Part classification ───────────────────────────────────────


def classify_part(filename: str) -> str:
    name = Path(filename).stem
    if name.startswith("qiliu_1_"):
        return "qi"
    if name.startswith("sword_light1_"):
        return "sword"
    if name == "diying":
        return "shadow"
    return "body"


# ── Transform functions ───────────────────────────────────────


def _split_alpha(img: Image.Image) -> tuple[Image.Image, Image.Image]:
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    return Image.merge("RGB", (r, g, b)), a


def _merge_alpha(rgb: Image.Image, alpha: Image.Image) -> Image.Image:
    r, g, b = rgb.split()
    return Image.merge("RGBA", (r, g, b, alpha))


def _rgb_to_hsv(r, g, b):
    """Vectorized RGB [0-1] to HSV [0-360, 0-1, 0-1]."""
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    hue = np.zeros_like(r)
    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0)
    mask_b = (cmax == b) & (delta > 0)
    hue[mask_r] = 60.0 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60.0 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60.0 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    sat = np.zeros_like(r)
    nonzero = cmax > 0
    sat[nonzero] = delta[nonzero] / cmax[nonzero]

    return hue, sat, cmax


def _hsv_to_rgb(hue, sat, val):
    """Vectorized HSV [0-360, 0-1, 0-1] to RGB [0-1]."""
    h60 = hue / 60.0
    hi = np.floor(h60).astype(int) % 6
    f = h60 - np.floor(h60)
    p = val * (1 - sat)
    q = val * (1 - f * sat)
    t = val * (1 - (1 - f) * sat)

    new_r, new_g, new_b = np.zeros_like(val), np.zeros_like(val), np.zeros_like(val)
    for i, (rv, gv, bv) in enumerate(
        [(val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q)]
    ):
        mask = hi == i
        new_r[mask] = rv[mask]
        new_g[mask] = gv[mask]
        new_b[mask] = bv[mask]

    return new_r, new_g, new_b


def selective_color_replace(img: Image.Image) -> Image.Image:
    """Replace colors based on active preset."""
    preset = _active_preset
    arr = np.array(img.convert("RGBA"), dtype=np.float64)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    opaque = alpha > 10

    r, g, b = rgb[:, :, 0] / 255.0, rgb[:, :, 1] / 255.0, rgb[:, :, 2] / 255.0
    hue, sat, val = _rgb_to_hsv(r, g, b)

    # Rule 1: Armor/clothing gold/cream (H:15-55, S>0.05)
    armor_mask = opaque & (hue >= 15) & (hue <= 55) & (sat > 0.05)
    hue[armor_mask] = preset["armor_hue"]
    sat[armor_mask] = np.clip(sat[armor_mask] * preset["armor_sat_mult"], 0, 1)

    # Rule 2: Dark hair (V<0.35, S<0.3)
    hair_mask = opaque & (val < 0.35) & (sat < 0.3)
    val[hair_mask] = np.clip(val[hair_mask] + preset["hair_val_delta"], 0, 1)
    sat[hair_mask] = sat[hair_mask] * preset["hair_sat_mult"]

    # Rule 3: Warm tan/brown (H:25-45, S:0.1-0.5)
    warm_mask = opaque & (hue >= 25) & (hue <= 45) & (sat >= 0.1) & (sat <= 0.5)
    warm_mask = warm_mask & ~armor_mask & ~hair_mask
    hue[warm_mask] = preset["warm_hue"]

    new_r, new_g, new_b = _hsv_to_rgb(hue, sat, val)

    result = np.zeros_like(arr, dtype=np.uint8)
    result[:, :, 0] = np.clip(new_r * 255, 0, 255).astype(np.uint8)
    result[:, :, 1] = np.clip(new_g * 255, 0, 255).astype(np.uint8)
    result[:, :, 2] = np.clip(new_b * 255, 0, 255).astype(np.uint8)
    result[:, :, 3] = alpha.astype(np.uint8)

    return Image.fromarray(result, "RGBA")


def hue_shift(img: Image.Image, degrees: int) -> Image.Image:
    arr = np.array(img.convert("RGBA"), dtype=np.float64)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]

    r, g, b = rgb[:, :, 0] / 255.0, rgb[:, :, 1] / 255.0, rgb[:, :, 2] / 255.0
    hue, sat, val = _rgb_to_hsv(r, g, b)
    hue = (hue + degrees) % 360.0
    new_r, new_g, new_b = _hsv_to_rgb(hue, sat, val)

    result = np.zeros_like(arr, dtype=np.uint8)
    result[:, :, 0] = np.clip(new_r * 255, 0, 255).astype(np.uint8)
    result[:, :, 1] = np.clip(new_g * 255, 0, 255).astype(np.uint8)
    result[:, :, 2] = np.clip(new_b * 255, 0, 255).astype(np.uint8)
    result[:, :, 3] = alpha.astype(np.uint8)

    return Image.fromarray(result, "RGBA")


def temperature_shift(img: Image.Image) -> Image.Image:
    preset = _active_preset
    arr = np.array(img.convert("RGBA"), dtype=np.int16)
    alpha = arr[:, :, 3]
    opaque = alpha > 0

    arr[:, :, 0] = np.where(opaque, np.clip(arr[:, :, 0] + preset["temp_r"], 0, 255), arr[:, :, 0])
    arr[:, :, 2] = np.where(opaque, np.clip(arr[:, :, 2] + preset["temp_b"], 0, 255), arr[:, :, 2])

    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def boost_contrast(img: Image.Image) -> Image.Image:
    rgb, alpha = _split_alpha(img)
    return _merge_alpha(ImageEnhance.Contrast(rgb).enhance(CONTRAST_FACTOR), alpha)


def boost_saturation(img: Image.Image) -> Image.Image:
    rgb, alpha = _split_alpha(img)
    return _merge_alpha(ImageEnhance.Color(rgb).enhance(SATURATION_FACTOR), alpha)


def posterize_rgba(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w < MIN_SIZE_FOR_POSTERIZE or h < MIN_SIZE_FOR_POSTERIZE:
        return img
    rgb, alpha = _split_alpha(img)
    return _merge_alpha(ImageOps.posterize(rgb, POSTERIZE_BITS), alpha)


def sharpen_rgba(img: Image.Image) -> Image.Image:
    rgb, alpha = _split_alpha(img)
    sharpened = rgb.filter(ImageFilter.UnsharpMask(radius=SHARPEN_RADIUS, percent=SHARPEN_PERCENT))
    return _merge_alpha(sharpened, alpha)


def alpha_boost(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    result = arr.copy()
    result[:, :, 3] = np.clip(arr[:, :, 3].astype(np.float64) * ALPHA_BOOST_FACTOR, 0, 255).astype(np.uint8)
    return Image.fromarray(result, "RGBA")


def glow_bloom(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"), dtype=np.float64)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]

    luminosity = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    bright_mask = (luminosity > 200) & (alpha > 10)

    glow = np.zeros_like(rgb)
    glow[bright_mask] = rgb[bright_mask]

    blurred = np.array(
        Image.fromarray(glow.astype(np.uint8), "RGB").filter(
            ImageFilter.GaussianBlur(radius=GLOW_RADIUS)
        ),
        dtype=np.float64,
    )

    result = np.zeros_like(arr, dtype=np.uint8)
    result[:, :, :3] = np.clip(rgb + blurred * GLOW_INTENSITY, 0, 255).astype(np.uint8)
    result[:, :, 3] = alpha.astype(np.uint8)

    return Image.fromarray(result, "RGBA")


# ── Processing pipelines ─────────────────────────────────────


def process_body(img: Image.Image) -> Image.Image:
    img = selective_color_replace(img)
    img = temperature_shift(img)
    img = boost_contrast(img)
    img = boost_saturation(img)
    img = posterize_rgba(img)
    img = sharpen_rgba(img)
    return img


def process_qi(img: Image.Image) -> Image.Image:
    img = hue_shift(img, _active_preset["qi_hue_shift"])
    img = alpha_boost(img)
    return img


def process_sword(img: Image.Image) -> Image.Image:
    return glow_bloom(img)


def process_shadow(img: Image.Image) -> Image.Image:
    return img


PIPELINE = {
    "body": process_body,
    "qi": process_qi,
    "sword": process_sword,
    "shadow": process_shadow,
}


# ── Atlas parsing and reconstruction ─────────────────────────


def parse_atlas(atlas_path: Path) -> list[dict]:
    entries: list[dict] = []
    lines = atlas_path.read_text().splitlines()

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("size:") or line.startswith("filter:") or line.startswith("scale:") or line == "" or line.endswith(".png"):
            i += 1
            continue
        break

    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        if not line.startswith("bounds:") and not line.startswith("offsets:") and not line.startswith("rotate:"):
            entry = {"name": line, "bounds": None, "rotate": False, "offsets": None}
            i += 1

            while i < len(lines):
                prop = lines[i].strip()
                if prop.startswith("bounds:"):
                    entry["bounds"] = tuple(int(x) for x in prop[7:].split(","))
                    i += 1
                elif prop.startswith("rotate:"):
                    entry["rotate"] = prop[7:].strip() == "90"
                    i += 1
                elif prop.startswith("offsets:"):
                    entry["offsets"] = tuple(int(x) for x in prop[8:].split(","))
                    i += 1
                else:
                    break

            if entry["bounds"]:
                entries.append(entry)
        else:
            i += 1

    return entries


def process_atlas(atlas_img: Image.Image, entries: list[dict]) -> Image.Image:
    result = atlas_img.copy()

    for entry in entries:
        x, y, w, h = entry["bounds"]
        rotated = entry["rotate"]
        name = entry["name"]
        category = classify_part(name + ".png")
        pipeline = PIPELINE[category]

        if rotated:
            region = result.crop((x, y, x + h, y + w))
        else:
            region = result.crop((x, y, x + w, y + h))

        result.paste(pipeline(region), (x, y))

    return result


# ── Main ──────────────────────────────────────────────────────


def run_preset(preset_name: str) -> None:
    global _active_preset
    _active_preset = COLOR_PRESETS[preset_name]

    output_dir = BASE_OUTPUT / f"1_{preset_name}"
    images_in = INPUT_DIR / "images"
    images_out = output_dir / "images"
    images_out.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*50}")
    print(f"  Preset: {preset_name} — {_active_preset['label']}")
    print(f"  Output: {output_dir}")
    print(f"{'='*50}")

    # Process individual PNGs
    png_files = sorted(images_in.glob("*.png"))
    print(f"Processing {len(png_files)} individual PNGs...")

    for png_path in png_files:
        category = classify_part(png_path.name)
        img = Image.open(png_path).convert("RGBA")
        processed = PIPELINE[category](img)
        processed.save(images_out / png_path.name)
        print(f"  [{category:6s}] {png_path.name}")

    # Process atlas
    atlas_png = INPUT_DIR / "1.png"
    if atlas_png.exists():
        print("\nProcessing atlas...")
        atlas_img = Image.open(atlas_png).convert("RGBA")
        entries = parse_atlas(INPUT_DIR / "1.atlas")
        print(f"  Parsed {len(entries)} atlas entries")
        processed_atlas = process_atlas(atlas_img, entries)
        processed_atlas.save(output_dir / "1.png")
        print(f"  Atlas saved: {processed_atlas.size[0]}x{processed_atlas.size[1]}")

    # Copy unchanged files
    for fname in ("1.atlas", "1.skel", "1.spine"):
        src = INPUT_DIR / fname
        if src.exists():
            shutil.copy2(src, output_dir / fname)
            print(f"  Copied {fname}")

    print(f"Done! → {output_dir}")


def main():
    parser = argparse.ArgumentParser(description="Spine character color modification")
    parser.add_argument(
        "--preset",
        choices=list(COLOR_PRESETS.keys()) + ["all"],
        default="red",
        help="Color preset to apply (default: red, 'all' runs every preset)",
    )
    parser.add_argument("--list", action="store_true", help="List available presets and exit")
    args = parser.parse_args()

    if args.list:
        print("Available presets:")
        for name, preset in COLOR_PRESETS.items():
            print(f"  {name:8s} — {preset['label']}")
        return

    if args.preset == "all":
        for name in COLOR_PRESETS:
            run_preset(name)
    else:
        run_preset(args.preset)


if __name__ == "__main__":
    main()
