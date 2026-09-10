#!/usr/bin/env python3
"""
Sikh Rifle and Pistol Association (SikhRPA)
Handgun Asset Scrubbing, Alpha Keying & Scale Calibration Pipeline

Features:
- Full browser impersonation headers to bypass basic CDN/bot filters.
- Automatic white/studio background detection and transparent alpha conversion.
- Tight bounding box cropping of the firearm silhouette.
- 1:1 physical scale normalization (100 pixels per inch).
- Strips EXIF and camera metadata.
- Emits clean production assets to assets/handguns/ and builds data/handgun_database.json.
"""

import os
import sys
import json
import io
import urllib.request
import urllib.parse
from PIL import Image, ImageDraw

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO_ROOT, "data", "handgun_manifest.json")
OUTPUT_DIR = os.path.join(REPO_ROOT, "assets", "handguns")
DATABASE_PATH = os.path.join(REPO_ROOT, "data", "handgun_database.json")

# Standardized pixel density: 100 pixels = 1.0 inch
PIXELS_PER_INCH = 100

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
    "Referer": "https://www.google.com/"
}

def fetch_image_data(url: str) -> bytes:
    """
    Downloads image bytes with full browser spoofing headers.
    Supports optional SCRAPER_API_KEY environment variable if running via proxy.
    """
    scraper_key = os.environ.get("SCRAPER_API_KEY")
    if scraper_key:
        encoded_target = urllib.parse.quote(url)
        url = f"http://api.scraperapi.com?api_key={scraper_key}&url={encoded_target}"

    req = urllib.request.Request(url, headers=BROWSER_HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read()

def strip_background_to_alpha(img: Image.Image, tolerance: int = 28) -> Image.Image:
    """
    Detects if the source has a solid studio backdrop (white/light grey)
    and converts background pixels to transparent alpha.
    """
    rgba = img.convert("RGBA")
    
    # Sample corner pixels to detect backdrop tint
    corners = [
        rgba.getpixel((0, 0)),
        rgba.getpixel((rgba.width - 1, 0)),
        rgba.getpixel((0, rgba.height - 1)),
        rgba.getpixel((rgba.width - 1, rgba.height - 1))
    ]
    avg_r = sum(c[0] for c in corners) // 4
    avg_g = sum(c[1] for c in corners) // 4
    avg_b = sum(c[2] for c in corners) // 4

    # If the corners are light (typical studio lightbox), key it out
    if avg_r > 200 and avg_g > 200 and avg_b > 200:
        datas = rgba.getdata()
        new_data = []
        for item in datas:
            # Check Euclidean distance from corner sample
            diff = abs(item[0] - avg_r) + abs(item[1] - avg_g) + abs(item[2] - avg_b)
            if diff <= tolerance * 3 or (item[0] > 240 and item[1] > 240 and item[2] > 240):
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)
        rgba.putdata(new_data)

    return rgba

def crop_and_calibrate(img: Image.Image, length_in: float, height_in: float) -> Image.Image:
    """
    Tightly bounds non-transparent pixels and scales image to exact physical dimensions.
    """
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    target_w = max(10, int(round(length_in * PIXELS_PER_INCH)))
    target_h = max(10, int(round(height_in * PIXELS_PER_INCH)))

    return img.resize((target_w, target_h), Image.Resampling.LANCZOS)

def generate_silhouette(length_in: float, height_in: float) -> Image.Image:
    """
    Emergency fallback procedural silhouette if network fails.
    """
    target_w = int(round(length_in * PIXELS_PER_INCH))
    target_h = int(round(height_in * PIXELS_PER_INCH))
    
    img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    color = (24, 33, 47, 240)
    
    slide_h = int(target_h * 0.38)
    draw.rounded_rectangle([0, int(target_h * 0.05), target_w, slide_h], radius=6, fill=color)
    
    grip_points = [
        (int(target_w * 0.40), int(slide_h * 0.85)),
        (int(target_w * 0.98), slide_h),
        (int(target_w * 0.90), target_h - 2),
        (int(target_w * 0.60), target_h - 2),
    ]
    draw.polygon(grip_points, fill=color)
    return img

def process_all_assets():
    if not os.path.exists(MANIFEST_PATH):
        print(f"Error: Manifest not found at {MANIFEST_PATH}")
        sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    db_records = []
    print(f"Starting asset pipeline for {len(manifest)} firearms...")

    for item in manifest:
        gun_id = item["id"]
        make = item["make"]
        model = item["model"]
        length_in = float(item["lengthIn"])
        height_in = float(item["heightIn"])
        source_url = item.get("source_url", "")
        out_filename = f"{gun_id}.png"
        out_filepath = os.path.join(OUTPUT_DIR, out_filename)

        print(f"\nProcessing [{gun_id}] {make} {model}...")
        processed_img = None

        if source_url and source_url.startswith("http"):
            try:
                print(f"  Fetching: {source_url}")
                raw_bytes = fetch_image_data(source_url)
                raw_img = Image.open(io.BytesIO(raw_bytes))
                
                # Strip backdrop to transparent alpha
                alpha_img = strip_background_to_alpha(raw_img)
                # Crop to physical boundary and scale to 1:1
                processed_img = crop_and_calibrate(alpha_img, length_in, height_in)
                print(f"  Scrubbed and calibrated successfully: {processed_img.width}x{processed_img.height} px")
            except Exception as e:
                print(f"  Warning: Download failed ({e}). Falling back to procedural silhouette.")
                processed_img = generate_silhouette(length_in, height_in)
        else:
            print("  No remote URL provided. Generating procedural silhouette.")
            processed_img = generate_silhouette(length_in, height_in)

        # Save clean PNG without EXIF
        clean_buffer = Image.new("RGBA", processed_img.size)
        clean_buffer.paste(processed_img, (0, 0))
        clean_buffer.save(out_filepath, "PNG", optimize=True)

        record = dict(item)
        record["assetPath"] = f"assets/handguns/{out_filename}"
        record["pixelWidth"] = processed_img.width
        record["pixelHeight"] = processed_img.height
        db_records.append(record)

    with open(DATABASE_PATH, "w", encoding="utf-8") as f:
        json.dump(db_records, f, indent=2)
    print(f"\nCompleted! Generated {len(db_records)} calibrated assets and wrote {DATABASE_PATH}")

if __name__ == "__main__":
    process_all_assets()
