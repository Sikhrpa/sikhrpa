#!/usr/bin/env python3
"""
Sikh Rifle and Pistol Association (SikhRPA) 501(c)(3)
Automated Handgun Asset Scrubbing, Background Removal & 1:1 Scale Calibrator.

This script automates:
1. Downloading manufacturer press imagery or community catalog assets.
2. Converting white studio backdrops to transparent RGBA channels.
3. Stripping EXIF, camera, timestamp, and tracking metadata completely.
4. Auto-cropping tight to the outer physical perimeter (muzzle to beavertail, sights to baseplate).
5. Calibrating pixel resolution to exact physical inches (1:1 scale at standard PPI).
6. Generating web-optimized PNGs and compiling the JSON database for handgun-compare.html.
"""

import os
import sys
import json
import urllib.request
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

# Scale standard: 100 pixels = 1.0 physical inch (Retina 2x fidelity for 50px/inch UI rendering)
TARGET_PPI = 100

# Base project directory structure
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ASSETS_DIR = BASE_DIR / "assets" / "handguns"
MANIFEST_FILE = DATA_DIR / "handgun_manifest.json"
DATABASE_FILE = DATA_DIR / "handgun_database.json"

DEFAULT_HANDGUN_MANIFEST = [
    {
        "id": "glock-19-gen3",
        "name": "Glock 19 Gen 3",
        "brand": "Glock",
        "caliber": "9x19mm",
        "category": "Compact",
        "rosterStatus": "Certified CA Roster Legal",
        "specs": {
            "lengthIn": 7.36,
            "heightIn": 5.04,
            "widthIn": 1.26,
            "barrelIn": 4.02,
            "weightOz": 23.6,
            "capacity": "10 Rounds (CA Max)",
            "action": "Safe Action Striker",
            "frame": "Polymer"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Glock_19_Generation_4-removebg.png/640px-Glock_19_Generation_4-removebg.png"
    },
    {
        "id": "sig-p365-ca",
        "name": "Sig Sauer P365 (CA Model)",
        "brand": "Sig Sauer",
        "caliber": "9x19mm",
        "category": "Micro-Compact",
        "rosterStatus": "Certified CA Roster Legal (Added 2024)",
        "specs": {
            "lengthIn": 5.80,
            "heightIn": 4.30,
            "widthIn": 1.06,
            "barrelIn": 3.10,
            "weightOz": 17.8,
            "capacity": "10 Rounds (CA Max)",
            "action": "Striker Fired",
            "frame": "Polymer with Stainless Chassis"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/SIG_Sauer_P365_left_side-no_bg.png/640px-SIG_Sauer_P365_left_side-no_bg.png"
    },
    {
        "id": "springfield-hellcat-ca",
        "name": "Springfield Hellcat OSP (CA)",
        "brand": "Springfield Armory",
        "caliber": "9x19mm",
        "category": "Micro-Compact",
        "rosterStatus": "Certified CA Roster Legal (Added 2024)",
        "specs": {
            "lengthIn": 6.00,
            "heightIn": 4.00,
            "widthIn": 1.00,
            "barrelIn": 3.00,
            "weightOz": 17.9,
            "capacity": "10 Rounds (CA Max)",
            "action": "Striker Fired",
            "frame": "Polymer with Adaptive Grip"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Springfield_Armory_Hellcat_Desert_FDE_left_side.jpg/640px-Springfield_Armory_Hellcat_Desert_FDE_left_side.jpg"
    },
    {
        "id": "sw-shield-plus-ca",
        "name": "S&W M&P Shield Plus (CA)",
        "brand": "Smith & Wesson",
        "caliber": "9x19mm",
        "category": "Subcompact",
        "rosterStatus": "Certified CA Roster Legal (Added 2024)",
        "specs": {
            "lengthIn": 6.10,
            "heightIn": 4.60,
            "widthIn": 1.10,
            "barrelIn": 3.10,
            "weightOz": 20.2,
            "capacity": "10 Rounds (CA Max)",
            "action": "Striker Fired",
            "frame": "Polymer with Armornite Finish"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Smith_%26_Wesson_M%26P_Shield_9mm_%2816248081752%29.jpg/640px-Smith_%26_Wesson_M%26P_Shield_9mm_%2816248081752%29.jpg"
    },
    {
        "id": "sw-shield-9-ca",
        "name": "S&W M&P Shield 9mm Gen 1 (CA)",
        "brand": "Smith & Wesson",
        "caliber": "9x19mm",
        "category": "Subcompact",
        "rosterStatus": "Certified CA Roster Legal",
        "specs": {
            "lengthIn": 6.10,
            "heightIn": 4.60,
            "widthIn": 0.95,
            "barrelIn": 3.10,
            "weightOz": 20.8,
            "capacity": "7 / 8 Rounds",
            "action": "Striker Fired",
            "frame": "Polymer (Slim Single-Stack)"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Smith_%26_Wesson_M%26P_Shield_9mm_%2816248081752%29.jpg/640px-Smith_%26_Wesson_M%26P_Shield_9mm_%2816248081752%29.jpg"
    },
    {
        "id": "glock-26-gen3",
        "name": "Glock 26 Gen 3 (Baby Glock)",
        "brand": "Glock",
        "caliber": "9x19mm",
        "category": "Subcompact",
        "rosterStatus": "Certified CA Roster Legal",
        "specs": {
            "lengthIn": 6.50,
            "heightIn": 4.17,
            "widthIn": 1.26,
            "barrelIn": 3.43,
            "weightOz": 21.5,
            "capacity": "10 Rounds (CA Max)",
            "action": "Safe Action Striker",
            "frame": "Polymer (Double-Stack Subcompact)"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Glock_26_%286971790359%29.jpg/640px-Glock_26_%286971790359%29.jpg"
    },
    {
        "id": "cz-75-p01",
        "name": "CZ 75 P-01 (Decocker)",
        "brand": "CZ-USA",
        "caliber": "9x19mm",
        "category": "Compact",
        "rosterStatus": "Certified CA Roster Legal",
        "specs": {
            "lengthIn": 7.20,
            "heightIn": 5.03,
            "widthIn": 1.38,
            "barrelIn": 3.75,
            "weightOz": 28.1,
            "capacity": "10 Rounds (CA Max)",
            "action": "DA/SA with Decocker",
            "frame": "Forged Aluminum Alloy"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/CZ_75_short_rail.png/640px-CZ_75_short_rail.png"
    },
    {
        "id": "ruger-lcr-38",
        "name": "Ruger LCR .38 Special +P",
        "brand": "Ruger",
        "caliber": ".38 Special +P",
        "category": "Snub-Nose Revolver",
        "rosterStatus": "Certified CA Roster Legal",
        "specs": {
            "lengthIn": 6.50,
            "heightIn": 4.50,
            "widthIn": 1.28,
            "barrelIn": 1.87,
            "weightOz": 13.5,
            "capacity": "5 Rounds",
            "action": "DAO (Enclosed Hammer)",
            "frame": "Aerospace Aluminum / Polymer"
        },
        "sourceUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Ruger_LCR.jpg/640px-Ruger_LCR.jpg"
    }
]

def download_image(url: str, output_path: Path) -> bool:
    """Downloads an image file using browser User-Agent headers to prevent 403 Forbidden errors."""
    if not url:
        return False

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36 SikhRPA/1.0"
        )
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            if response.status == 200:
                with open(output_path, "wb") as f:
                    f.write(response.read())
                return True
    except Exception as exc:
        print(f"  [!] Download error from {url}: {exc}")
    return False

def scrub_background_and_metadata(img: Image.Image) -> Image.Image:
    """
    1. Converts image to RGBA format.
    2. Converts white and near-white studio backdrop pixels into transparent alpha channels.
    3. Completely removes EXIF, camera serials, timestamps, and geolocation tags.
    """
    rgba = img.convert("RGBA")
    datas = rgba.getdata()

    cleaned_pixels = []
    # Threshold for studio backdrop removal (RGB channels > 240)
    for pixel in datas:
        r, g, b, a = pixel
        if a < 15:
            cleaned_pixels.append((0, 0, 0, 0))
        elif r > 240 and g > 240 and b > 240:
            cleaned_pixels.append((255, 255, 255, 0))
        else:
            cleaned_pixels.append((r, g, b, a))

    # Reconstruct clean Image object without any incoming EXIF dictionaries
    scrubbed = Image.new("RGBA", rgba.size)
    scrubbed.putdata(cleaned_pixels)
    return scrubbed

def trim_and_scale_to_physical(img: Image.Image, length_in: float, height_in: float, ppi: int = TARGET_PPI) -> Image.Image:
    """
    1. Trims all surrounding empty margins tight to the firearm's outermost extremities.
    2. Scales using high-fidelity Lanczos interpolation so width = (lengthIn * ppi) and height = (heightIn * ppi).
    """
    bbox = img.getbbox()
    if not bbox:
        return img

    # Tight crop around the non-transparent firearm silhouette
    cropped = img.crop(bbox)

    target_width = int(round(length_in * ppi))
    target_height = int(round(height_in * ppi))

    # High-fidelity Lanczos resampling to preserve slide serrations, triggers, and sight contours
    rescaled = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    return rescaled

def generate_fallback_silhouette(gun_id: str, length_in: float, height_in: float, ppi: int = TARGET_PPI) -> Image.Image:
    """Generates an accurate geometric silhouette fallback if a remote press photo is unavailable."""
    w = int(round(length_in * ppi))
    h = int(round(height_in * ppi))

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    slide_h = int(h * 0.40)
    grip_w = int(w * 0.38)
    trigger_x = int(w * 0.52)

    # Slide & Sights (Upper Assembly)
    draw.rounded_rectangle([0, 4, w, slide_h], radius=int(slide_h * 0.12), fill=(15, 23, 42, 245), outline=(30, 41, 59, 255), width=2)
    draw.rectangle([12, 0, 20, 4], fill=(15, 23, 42, 255))
    draw.rectangle([w - 20, 0, w - 8, 4], fill=(15, 23, 42, 255))

    # Grip & Frame (Lower Assembly)
    draw.polygon([
        (w - 10, slide_h),
        (w - int(grip_w * 0.25), h),
        (w - grip_w, h),
        (trigger_x - int(w * 0.12), slide_h + int(h * 0.22)),
        (trigger_x, slide_h)
    ], fill=(15, 23, 42, 245), outline=(30, 41, 59, 255))

    # Trigger Guard Loop
    draw.arc([trigger_x - int(w * 0.18), slide_h, trigger_x + int(w * 0.02), slide_h + int(h * 0.35)],
             start=0, end=180, fill=(217, 119, 6, 255), width=3)

    return img

def run_pipeline():
    """Main pipeline execution loop."""
    print("=" * 72)
    print(" SikhRPA Handgun Asset Scrubbing & Physical Scaling Pipeline")
    print(f" Standardized Output Scale: {TARGET_PPI} Pixels = 1.0 Physical Inch")
    print("=" * 72)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    # Load or initialize manifest
    if MANIFEST_FILE.exists():
        with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        print(f"Loaded existing manifest with {len(manifest)} models from {MANIFEST_FILE.name}")
    else:
        manifest = DEFAULT_HANDGUN_MANIFEST
        with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print(f"Created default California Roster manifest with {len(manifest)} models.")

    processed_database = []

    for index, gun in enumerate(manifest, start=1):
        gun_id = gun["id"]
        name = gun["name"]
        specs = gun["specs"]
        length_in = float(specs["lengthIn"])
        height_in = float(specs["heightIn"])
        source_url = gun.get("sourceUrl", "")

        raw_cache_path = ASSETS_DIR / f"{gun_id}_raw.png"
        final_output_path = ASSETS_DIR / f"{gun_id}.png"

        print(f"\n[{index}/{len(manifest)}] Processing: {name}")
        print(f"  Physical: {length_in}\" L × {height_in}\" H ({round(length_in * 25.4, 1)}mm × {round(height_in * 25.4, 1)}mm)")

        image_available = False

        # 1. Fetch raw asset if not already cached
        if not raw_cache_path.exists() and source_url:
            print(f"  Downloading from: {source_url[:65]}...")
            image_available = download_image(source_url, raw_cache_path)
        elif raw_cache_path.exists():
            image_available = True

        # 2. Scrub background, strip EXIF, and scale tight
        try:
            if image_available and raw_cache_path.exists():
                with Image.open(raw_cache_path) as source_img:
                    scrubbed = scrub_background_and_metadata(source_img)
                    calibrated = trim_and_scale_to_physical(scrubbed, length_in, height_in, TARGET_PPI)
                    calibrated.save(final_output_path, "PNG", optimize=True)
                    print(f"  ✓ Calibrated PNG saved: {final_output_path.name} ({calibrated.width}x{calibrated.height} px)")
            else:
                print(f"  [~] Remote asset unavailable. Generating geometric calibrated silhouette...")
                fallback = generate_fallback_silhouette(gun_id, length_in, height_in, TARGET_PPI)
                fallback.save(final_output_path, "PNG", optimize=True)
                print(f"  ✓ Fallback silhouette saved: {final_output_path.name} ({fallback.width}x{fallback.height} px)")

            # Record final calibrated entry into database JSON
            gun_entry = dict(gun)
            gun_entry["assetPath"] = f"assets/handguns/{gun_id}.png"
            gun_entry["pixelDimensions"] = {
                "width": int(round(length_in * TARGET_PPI)),
                "height": int(round(height_in * TARGET_PPI)),
                "scalePpi": TARGET_PPI
            }
            processed_database.append(gun_entry)

        except Exception as err:
            print(f"  [X] Failed processing {gun_id}: {err}")

    with open(DATABASE_FILE, "w", encoding="utf-8") as f:
        json.dump(processed_database, f, indent=2)

    print("\n" + "=" * 72)
    print(f" Pipeline Complete: {len(processed_database)} firearms calibrated and scrubbed.")
    print(f" Database JSON: {DATABASE_FILE}")
    print(f" Assets Directory: {ASSETS_DIR}")
    print("=" * 72)

if __name__ == "__main__":
    run_pipeline()
