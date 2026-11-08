#!/usr/bin/env python3
"""Regenerate optimized site images from source-media/ (YouTube thumbnails of
BarberROME's own uploads — see README "Sources"). Requires Pillow.
Usage: python3 scripts/images.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source-media"
OUT = ROOT / "src" / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

# name: (source file, crop box (l,t,r,b) or None, output widths)
JOBS = {
    # hero
    "hero-wide":      ("4G-7JNXefeg.jpg", None, [640, 960, 1280]),
    "hero-tall":      ("-h9Jb3zs91c.jpg", (280, 0, 1000, 720), [480, 720]),
    # track tiles (square)
    "tile-bay-play":   ("aAporcw0NFE.jpg", (280, 0, 1000, 720), [360, 720]),
    "tile-top-down":   ("-h9Jb3zs91c.jpg", (280, 0, 1000, 720), [360, 720]),
    "tile-funky-flow": ("y18TQdFT898.jpg", (280, 0, 1000, 720), [360, 720]),
    "tile-playah-way": ("ryC7cK5mD_8.jpg", (360, 0, 1080, 720), [360, 720]),
    "tile-dominamor":  ("e653fXuzv8Y.jpg", (280, 0, 1000, 720), [360, 720]),
    # 16:9 video posters for track pages
    "poster-bay-play":   ("tSmkDrN3A8s.jpg", (0, 60, 640, 420), [640]),
    "poster-top-down":   ("DpbIpMfDxnQ.jpg", (0, 60, 640, 420), [640]),
    "poster-funky-flow": ("y18TQdFT898.jpg", None, [640, 960]),
    "poster-playah-way": ("ryC7cK5mD_8.jpg", None, [640, 960]),
    "poster-dominamor":  ("e653fXuzv8Y.jpg", None, [640, 960]),
    # chair-to-mic cards (4:5)
    "card-chair":    ("DecpFaNtjew.jpg", (437, 60, 842, 566), [405]),
    "card-roots":    ("oar_mjeLuNKwtP8.jpg", (0, 0, 1080, 1350), [400, 640]),
    "card-releases": ("nEKHOoovPcQ.jpg", (352, 0, 928, 720), [400, 576]),
    "card-stage":    ("bNbY8cIzt4I.jpg", (712, 0, 1280, 710), [400, 568]),
    "card-now":      ("oar_7mh39MPtp_A.jpg", (0, 250, 1080, 1600), [400, 640]),
    # identity strip + footer locations
    "id-chair":      ("0ckDgRi7iXw.jpg", (437, 40, 842, 546), [405]),
    "loc-sf":        ("oar_mjeLuNKwtP8.jpg", (0, 0, 1080, 1350), [320]),
    "loc-vallejo":   ("0ckDgRi7iXw.jpg", (437, 40, 842, 546), [320]),
}

def save(im, base, w):
    h = round(im.height * w / im.width)
    r = im.resize((w, h), Image.LANCZOS) if w < im.width else im
    r.save(OUT / f"{base}-{w}.webp", "WEBP", quality=72, method=6)
    r.save(OUT / f"{base}-{w}.jpg", "JPEG", quality=74, optimize=True, progressive=True)
    return r.size

for name, (f, box, widths) in JOBS.items():
    im = Image.open(SRC / f).convert("RGB")
    if box: im = im.crop(box)
    for w in widths:
        print(name, w, save(im, name, min(w, im.width)))

# Open Graph / Twitter card 1200x630
im = Image.open(SRC / "4G-7JNXefeg.jpg").convert("RGB").crop((40, 45, 1240, 675))
im.save(OUT / "og-barberrome.jpg", "JPEG", quality=80, optimize=True, progressive=True)
print("og", im.size)
