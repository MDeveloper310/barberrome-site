#!/usr/bin/env python3
"""Site imagery from hand-picked video frames (see README "Sources").

Frames live in source-media/frames/<slot-hint>__<videoId>_<m>m<ss>s.jpg — full 1920x1080
video frames captured paused at 1080p (PLAYAH WAY: 720p source), letterbox bars removed.
Each job: crop with a chosen focal box, resize, apply a restrained dark grade
(lifted blacks, slight desaturation, maroon shadows / gold highlights, vignette, grain,
optional bottom fade under HTML titles) and an optional small source tag.

Usage: python3 scripts/images.py            (all jobs)
       python3 scripts/images.py --sheet    (also writes preview/review-contact-sheet.jpg)
Requires Pillow + numpy."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source-media" / "frames"
OUT = ROOT / "src" / "assets" / "img"
FONT = ROOT / "src" / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

F_ART  = "artist-overlook__4G-7JNXefeg_1m39s.jpg"   # SF-cap man, sunglasses, rooftops (ALL I KNOW)
F_CAR  = "hero-wide__qIjw-tHmnQU_0m12s.jpg"         # black 5.0 convertible, gold wires (California livin')
F_DRV  = "driver-car__qIjw-tHmnQU_0m55s.jpg"        # driver, top down, red leather (California livin')
F_PW20 = "playah-way__ryC7cK5mD_8_0m20s.jpg"        # PLAYAH WAY, mural + Jungle Life sign, wide
F_PW36 = "playah-way__ryC7cK5mD_8_0m36s.jpg"        # PLAYAH WAY, SF-cap man close, friend behind
F_CROUCH = ROOT / "source-media" / "owner" / "og-photo__supplied-by-owner.jpg"  # owner photo (1536x2048): crouched by the convertible
F_ASTRO= "top-down-mood__DpbIpMfDxnQ_1m17s.jpg"     # TOP DOWN Astro shoot, back to camera, light tubes

# name: dict(src, box=(l,t,r,b) in the 1920x1080 frame, widths, fade=bottom darkening 0..1,
#            tag=small source label or None, ratio check only for sanity)
JOBS = {
    "hero-wide":       dict(src=F_CAR,  box=(0, 0, 1920, 1080),   widths=[640, 960, 1280, 1920], fade=0.0,  tag=None, exposure=0.86),
    "hero-tall":       dict(src=F_CROUCH, box=(466, 540, 1414, 2140), widths=[480, 640],    fade=0.0,  tag=None, exposure=0.96),  # mobile: owner crouch — face/cap centered above the BARBER ROME title; wire wheel beside him
    "tile-top-down":   dict(src=F_DRV,  box=(180, 0, 1260, 1080), widths=[360, 720],             fade=0.55, tag="STILL · CALIFORNIA LIVIN'"),
    "tile-playah-way": dict(src=F_PW36, box=(840, 0, 1920, 1080), widths=[360, 720],             fade=0.55, tag="PLAYAH WAY · VIDEO"),
    "tile-funky-flow": dict(src=F_ART,  box=(260, 0, 1340, 1080), widths=[360, 720],             fade=0.55, tag="STILL · ALL I KNOW VIDEO"),
    "poster-top-down":   dict(src=F_ASTRO, box=(0, 0, 1920, 1080), widths=[640, 960, 1280], fade=0.25, tag=None),
    "poster-playah-way": dict(src=F_PW20,  box=(0, 0, 1920, 1080), widths=[640, 960, 1280], fade=0.25, tag=None),
    "card-releases":   dict(src=F_ASTRO, box=(760, 0, 1624, 1080), widths=[400, 640],    fade=0.35, tag=None),
}
# Stage 2: vertical shorts (675x1200 panel cut out of the 1920x1200 capture's black sidebars)
F_PERF = "performance-overlook__4G-7JNXefeg_1m21s.jpg"   # ALL I KNOW, light cap, back three-quarter, rooftops
F_COMB = "barber-detail__DecpFaNtjew_0m44s.jpg"           # "The IV experience" — comb + tattooed hand (kept; unused by card-chair)
F_CHAIR = ROOT / "source-media" / "owner" / "chair-iv-cut__supplied-by-owner.jpg"  # owner photo: outdoor cut under blue canopy, IV mark
F_TOOL = "barber-tools__0ckDgRi7iXw_0m44s.jpg"            # "IV, Vallejo CA" — 3 stacked clipper panels
F_SHOP = "barber-work__0ckDgRi7iXw_0m22s.jpg"             # "IV, Vallejo CA" — SF-cap barber cutting
F_TAY  = "location-taylor-market__mjeLuNKwtP8_0m20s.jpg"  # "TAYLOR & MARKET" short — signs + man
F_NSTR = "stage-northstar__7mh39MPtp_A_0m24s.jpg"         # NorthStar Studio, Vallejo — performer on stage
TAG_AIK = "STILL · ALL I KNOW VIDEO"; TAG_CAL = "STILL · CALIFORNIA LIVIN'"
JOBS.update({
    "tile-bay-play":     dict(src=F_TAY,  box=(0, 170, 675, 845),   widths=[360, 720], fade=0.55, tag="STILL · TAYLOR & MARKET, SF"),
    "tile-dominamor":    dict(src=F_CAR,  box=(820, 140, 1580, 900), widths=[360, 720], fade=0.55, tag=TAG_CAL),
    "poster-bay-play":   dict(src=F_DRV,  box=(0, 0, 1920, 1080),    widths=[640, 960, 1280], fade=0.25, tag=TAG_CAL),
    "poster-funky-flow": dict(src=F_PERF, box=(0, 0, 1920, 1080),    widths=[640, 960, 1280], fade=0.25, tag=TAG_AIK),
    "poster-dominamor":  dict(src=F_CAR,  box=(0, 180, 1440, 990),   widths=[640, 960, 1280], fade=0.25, tag=TAG_CAL),
    "card-chair":  dict(src=F_CHAIR, box=(0, 0, 1186, 1483), widths=[400, 640], fade=0.35, tag=None, exposure=0.90),  # owner outdoor IV cut: face, clippers, boy; IV kept bottom-right
    "card-roots":  dict(src=F_TAY,  box=(0, 150, 675, 994),  widths=[400, 640], fade=0.35, tag=None),
    "card-stage":  dict(src=F_NSTR, box=(0, 50, 675, 894),  widths=[400, 640], fade=0.35, tag=None),
    "card-now":    dict(src=F_PW20, box=(640, 0, 1504, 1080), widths=[400, 640], fade=0.35, tag=None),
    "id-chair":    dict(src=F_SHOP, box=(0, 200, 675, 1044), widths=[405, 640], fade=0.0, tag=None),
    "loc-sf":      dict(src=F_TAY,  box=(68, 120, 608, 795), widths=[320, 540], fade=0.0, tag=None),
    "loc-vallejo": dict(src=F_TOOL, box=(200, 395, 520, 795), widths=[320], fade=0.0, tag=None),
})
PENDING = []

MAROON = np.array([0.43, 0.11, 0.14]); GOLD = np.array([0.80, 0.65, 0.32])   # grade tones (photos)
ACCENT = (232, 134, 42)   # UI accent orange (#e8862a) for tags, rules, OG wordmark

def grade(im, fade=0.0, exposure=0.80, seed=7):
    a = np.asarray(im).astype(np.float32) / 255.0
    h, w, _ = a.shape
    lum = (a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None]
    a = lum + (a - lum) * 0.80                      # -20% saturation
    a = 0.5 + (a - 0.5) * 1.07                      # gentle contrast
    a = a * exposure
    sh = (1 - lum) ** 2; hi = lum ** 2
    a = a * (1 - 0.14 * sh) + MAROON * 0.14 * sh    # maroon in the shadows
    a = a * (1 - 0.08 * hi) + GOLD * 0.08 * hi      # warm gold highlights
    a = 0.028 + a * 0.972                           # lifted blacks: keep detail, never crushed
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r2 = ((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2
    a *= (1 - 0.34 * np.clip(r2 - 0.15, 0, 1.6) / 1.6)[..., None]   # soft vignette
    if fade:
        t = np.clip((yy / h - 0.45) / 0.55, 0, 1) ** 1.4
        a *= (1 - fade * t)[..., None]                               # room for the HTML title
    rng = np.random.default_rng(seed)
    a += rng.normal(0, 0.010, (h, w, 1)).astype(np.float32)          # fine grain
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))

def tag(im, text):
    d = ImageDraw.Draw(im)
    s = max(13, im.width // 44)
    f = ImageFont.truetype(str(FONT / "barlow-condensed-600.woff2"), s)
    tw = d.textlength(text, font=f) + s * 0.25 * len(text) * 0.0
    pad = s // 2
    x = im.width - tw - pad * 3; y = pad * 2
    d.rectangle([x - pad, y - pad // 2, x + tw + pad, y + s + pad // 2], fill=(14, 14, 14))
    d.rectangle([x - pad, y - pad // 2, x - pad + max(2, s // 6), y + s + pad // 2], fill=ACCENT)
    d.text((x + pad // 2, y - s * 0.08), text, font=f, fill=(243, 240, 234))
    return im

def accent(im):
    """thin gold rule along the bottom-left — the site's 'gold line' detail"""
    d = ImageDraw.Draw(im)
    t = max(2, im.width // 360)
    d.rectangle([0, im.height - t, int(im.width * 0.28), im.height], fill=ACCENT)
    return im

def save(im, base, w):
    h = round(im.height * w / im.width)
    r = im.resize((w, h), Image.LANCZOS) if w != im.width else im
    r.save(OUT / f"{base}-{w}.webp", "WEBP", quality=74, method=6)
    r.save(OUT / f"{base}-{w}.jpg", "JPEG", quality=78, optimize=True, progressive=True)

def build(name, j):
    src_path = j["src"] if isinstance(j["src"], Path) else SRC / j["src"]
    src = Image.open(src_path).convert("RGB")
    l, t, r, btm = j["box"]
    if btm > src.height:   # box runs past the bottom: continue the ground as a plain gradient into the page background (sits under the hero's dark fade + text)
        ext = btm - src.height
        base = np.asarray(src.crop((0, src.height - 60, src.width, src.height))).astype(np.float32).mean(axis=(0, 1))
        t_ = np.linspace(0, 1, ext)[:, None, None] ** 0.6
        fill = (base * (1 - t_) + np.array([15, 15, 15], np.float32) * t_) * np.ones((1, src.width, 1), np.float32)
        big = np.zeros((btm, src.width, 3), np.float32); big[:src.height] = np.asarray(src); big[src.height:] = fill
        blend = 80                                                   # soften the join: last rows of the frame ease into the fill colour
        w_ = np.linspace(0, 1, blend)[:, None, None]
        big[src.height - blend:src.height] = big[src.height - blend:src.height] * (1 - w_) + base * w_
        src = Image.fromarray(big.clip(0, 255).astype(np.uint8))
    im = src.crop(j["box"])
    top = max(j["widths"])
    im = im.resize((top, round(im.height * top / im.width)), Image.LANCZOS)
    im = grade(im, fade=j.get("fade", 0), exposure=j.get("exposure", 0.80))
    if name.startswith("tile-"): accent(im)
    for w in j["widths"]:
        r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        if j.get("tag"): r = tag(r, j["tag"])
        save(r, name, w)
    return im

F_OWNER = ROOT / "source-media" / "owner" / "og-photo__supplied-by-owner.jpg"   # photo supplied by owner (Nov 8, 2026)

def og():
    """Share card 1200x630: the owner's photo (cropped, not stretched) on the right, feathered into a blurred,
    darkened copy of itself; BARBER ROME wordmark on the left, clear of his face."""
    from PIL import ImageFilter, ImageEnhance
    W, H = 1200, 630
    im = Image.open(F_OWNER).convert("RGB")
    bg = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    top = max(0, (bg.height - H) // 2)
    bg = bg.crop((0, top, W, top + H)).filter(ImageFilter.GaussianBlur(28))
    bg = ImageEnhance.Brightness(bg).enhance(0.38)
    # crop chosen by eye: cap/face, chain, the gold-center wire wheel and his shoes all stay in frame
    fg = im.crop((100, 435, 1536, 1640)).resize((750, H), Image.LANCZOS)
    mask = Image.linear_gradient("L").rotate(90).resize((140, H))          # soft left edge into the blur
    m = Image.new("L", fg.size, 255); m.paste(mask, (0, 0))
    bg.paste(fg, (W - fg.width, 0), m)
    d = ImageDraw.Draw(bg)
    big = ImageFont.truetype(str(FONT / "barlow-condensed-800.woff2"), 120)
    sm = ImageFont.truetype(str(FONT / "barlow-condensed-600.woff2"), 28)
    d.text((56, 180), "BARBER", font=big, fill=(243, 240, 234))
    d.text((56, 284), "ROME", font=big, fill=ACCENT)                       # whole ROME orange
    d.rectangle([56, 430, 92, 434], fill=ACCENT)
    x = 104; d.text((x, 414), "BAY AREA RAP  ·  SF", font=sm, fill=(210, 205, 196))
    x += d.textlength("BAY AREA RAP  ·  SF", font=sm) + 10                 # draw the arrow (font has no →)
    d.line([(x, 432), (x + 22, 432)], fill=ACCENT, width=3); d.polygon([(x + 22, 426), (x + 30, 432), (x + 22, 438)], fill=ACCENT)
    d.text((x + 40, 414), "VALLEJO", font=sm, fill=(210, 205, 196))
    bg.save(OUT / "og-barberrome.jpg", "JPEG", quality=86, optimize=True, progressive=True)
    return bg


if __name__ == "__main__":
    done = {n: build(n, j) for n, j in JOBS.items()}
    done["og-barberrome"] = og()
    print("built:", ", ".join(done)); print("pending:", ", ".join(PENDING))
    if "--sheet" in sys.argv:
        cells = [(n, Image.open(OUT / f"{n}-{max(JOBS[n]['widths'])}.jpg")) for n in JOBS] + [("og-barberrome", done["og-barberrome"])]
        W = 2000; cw = W // 4; rows = []
        sheet_h = 0; layout = []
        for i, (n, im) in enumerate(cells):
            t = im.copy(); t.thumbnail((cw - 20, 420)); layout.append((n, t))
        rowh = [max(t.height for _, t in layout[i:i+4]) + 40 for i in range(0, len(layout), 4)]
        S = Image.new("RGB", (W, sum(rowh) + 80), (20, 20, 20)); d = ImageDraw.Draw(S)
        f = ImageFont.truetype(str(FONT / "barlow-condensed-600.woff2"), 26)
        d.text((14, 20), "BarberRome · final replacement images (graded, all slots) — " + str(len(cells)) + " assets", font=ImageFont.truetype(str(FONT / "barlow-condensed-600.woff2"), 20), fill=ACCENT)
        y = 70
        for r, i in enumerate(range(0, len(layout), 4)):
            for k, (n, t) in enumerate(layout[i:i+4]):
                x = k * cw + 10; S.paste(t, (x, y)); d.text((x, y + t.height + 4), n, font=f, fill=(243, 240, 234))
            y += rowh[r]
        p = Path("/workspace/image-plan/review-final.jpg"); S.save(p, quality=86); print("sheet:", p, S.size)
