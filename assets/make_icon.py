"""Generate FreeFlow icons: a cream waveform on a dark rounded square.
Outputs icon.ico (16..256), icon.png (512), tray.png / tray-rec.png (32 px),
and for macOS icon.icns (inset on Apple's 1024 grid, needs iconutil) plus the
monochrome menu bar templates tray*Template.png (18 pt, @2x).
Run: python assets/make_icon.py
"""
import os
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
DARK = (26, 26, 26, 255)        # #1a1a1a
CREAM = (255, 255, 235, 255)    # #ffffeb
RED = (248, 113, 113, 255)      # #f87171
BARS = [0.28, 0.55, 0.92, 0.70, 0.40, 0.80, 0.50]  # relative heights of the waveform bars


def render(size, bg=DARK, fg=CREAM, dot=None, rounded=True):
    s = size * 4  # supersample for smooth edges
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=bg)
    n = len(BARS)
    pad = s * 0.18
    inner = s - 2 * pad
    gap = inner / (n * 2 - 1)
    bar_w = gap
    cy = s / 2
    for i, h in enumerate(BARS):
        x0 = pad + i * 2 * gap
        bh = inner * 0.9 * h
        d.rounded_rectangle((x0, cy - bh / 2, x0 + bar_w, cy + bh / 2), radius=int(bar_w / 2), fill=fg)
    if dot:
        r = s * 0.13
        d.ellipse((s - pad * 0.55 - 2 * r, pad * 0.55, s - pad * 0.55, pad * 0.55 + 2 * r), fill=dot)
    return im.resize((size, size), Image.LANCZOS)


def render_template(pt, scale, alpha=255, dot=False):
    """Black bars on transparent: macOS tints Template images for the light / dark menu bar."""
    size = pt * scale
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink = (0, 0, 0, alpha)
    n = len(BARS)
    pad = s * 0.06
    inner = s - 2 * pad
    gap = inner / (n * 2 - 1)
    cy = s / 2
    for i, h in enumerate(BARS):
        if dot and i >= n - 2 and h > 0.45:
            h = 0.45                      # leave room for the recording dot
        x0 = pad + i * 2 * gap
        bh = inner * h
        d.rounded_rectangle((x0, cy - bh / 2, x0 + gap, cy + bh / 2), radius=int(gap / 2), fill=ink)
    if dot:
        r, halo = s * 0.15, s * 0.06
        cx, cy0 = s - pad - r, pad + r
        d.ellipse((cx - r - halo, cy0 - r - halo, cx + r + halo, cy0 + r + halo), fill=(0, 0, 0, 0))  # clear gap
        d.ellipse((cx - r, cy0 - r, cx + r, cy0 + r), fill=(0, 0, 0, 255))
    return im.resize((size, size), Image.LANCZOS)


def write_icns(path):
    """Apple icon grid: an 824 px body centred on a 1024 px canvas."""
    if not shutil.which("iconutil"):
        print("iconutil not found (macOS only): icon.icns not regenerated")
        return
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    canvas.alpha_composite(render(824), (100, 100))
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "icon.iconset")
        os.mkdir(iconset)
        for base in (16, 32, 128, 256, 512):
            canvas.resize((base, base), Image.LANCZOS).save(os.path.join(iconset, f"icon_{base}x{base}.png"))
            canvas.resize((base * 2, base * 2), Image.LANCZOS).save(os.path.join(iconset, f"icon_{base}x{base}@2x.png"))
        subprocess.check_call(["iconutil", "-c", "icns", iconset, "-o", path])


def main():
    big = render(512)
    big.save(os.path.join(HERE, "icon.png"))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [render(sz) for sz in sizes]
    frames[-1].save(os.path.join(HERE, "icon.ico"), format="ICO", sizes=[(sz, sz) for sz in sizes],
                    append_images=frames[:-1])
    render(32).save(os.path.join(HERE, "tray.png"))
    render(32, dot=RED).save(os.path.join(HERE, "tray-rec.png"))
    render(32, bg=(113, 113, 110, 255)).save(os.path.join(HERE, "tray-loading.png"))
    # Overlay "pill" logo: cream bars without background, for the renderer.
    render(64, rounded=False).save(os.path.join(HERE, "wave.png"))
    # macOS menu bar templates (18 pt) and application icon.
    for name, kw in (("tray", {}), ("tray-rec", {"dot": True}), ("tray-loading", {"alpha": 110})):
        render_template(18, 1, **kw).save(os.path.join(HERE, f"{name}Template.png"))
        render_template(18, 2, **kw).save(os.path.join(HERE, f"{name}Template@2x.png"))
    write_icns(os.path.join(HERE, "icon.icns"))
    print("icons written to", HERE)


if __name__ == "__main__":
    main()
