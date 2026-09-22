#!/usr/bin/env python3
# Generates the ZCode++ application icon set from a single procedural source.
# Draws at high supersample (4096px) then downsamples each target with LANCZOS so all
# sizes share one crisp, coherent design.
#
# Output:
#   public/logo/icons/{16,32,48,64,128,256,512,1024}.png + 1024x1024.jpg
#   public/icon_512@2x.png
#   packages/desktop/build/icons/{16,32,48,64,128,256,512,1024}.png
#   packages/desktop/build/icon.png / icon_windows.png / icon_installer.png
#   packages/desktop/build/icon.ico / icon_installer.ico
#   packages/desktop/build/icon.icns / icon_installer.icns
import math
import os
import struct
import sys
from io import BytesIO

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SS = 4096  # master supersample size

# ---- palette: a unified brand hue (cohesive, not a random gradient) ----
BG_TOP = (46, 39, 205)        # top tone of the single indigo-violet hue
BG_BOT = (27, 22, 130)        # bottom tone of the SAME hue
ACCENT = (86, 219, 255)       # bright cyan accent for "++"
MARK = (255, 255, 255)        # white Z


def build_master():
    S = SS
    # 1. background: smooth single-hue vertical depth (two close tones of one hue)
    bg = Image.new("RGBA", (S, S), BG_BOT)
    dp = bg.load()
    for y in range(S):
        t = y / (S - 1)
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        for x in range(S):
            dp[x, y] = (r, g, b, 255)

    # rounded-square mask (~23% corner radius)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)

    # soft glass sheen near the top (same hue)
    sheen = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(sheen)
    cx, cy = S // 2, int(S * 0.22)
    rmax = S * 0.82
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - cx, y - cy) / rmax
            if d < 1.0:
                v = int(46 * (1.0 - d) ** 2)
                if v:
                    sd.point((x, y), fill=v)
    overlay = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    overlay.putalpha(sheen)
    out = Image.alpha_composite(out, overlay)

    # 2. bold geometric block "Z" (white)
    zl, zr = int(S * 0.268), int(S * 0.732)
    zt, zb = int(S * 0.315), int(S * 0.655)
    t = int(S * 0.112)
    zd = ImageDraw.Draw(out)
    zd.rounded_rectangle([zl, zt, zr, zt + t], radius=t // 3, fill=MARK)
    zd.rounded_rectangle([zl, zb - t, zr, zb], radius=t // 3, fill=MARK)

    # slanted diagonal joining top-right corner to bottom-left corner
    diag = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(diag)
    x1, y1 = zl, zb - t
    x2, y2 = zr, zt + t
    dd.line([x1, y1, x2, y2], fill=MARK, width=t)
    # round the line caps to match rounded bars
    cap_r = t / 2
    for (pxc, pyc) in [(x1, y1), (x2, y2)]:
        crew = Image.new("L", (S, S), 0)
        cdraw = ImageDraw.Draw(crew)
        cdraw.ellipse(
            [pxc - cap_r, pyc - cap_r, pxc + cap_r, pyc + cap_r], fill=255
        )
        circ = Image.new("RGBA", (S, S), MARK + (255,))
        circ.putalpha(crew)
        diag = Image.alpha_composite(diag, circ)
    out = Image.alpha_composite(out, diag)

    # 3. "++" badge (bright cyan accent), two pluses side by side, centered
    def draw_plus(cxx, cyy):
        arm = int(S * 0.029)
        thick = int(S * 0.010)
        pd = ImageDraw.Draw(out)
        pd.rectangle([cxx - arm, cyy - thick, cxx + arm, cyy + thick], fill=ACCENT)
        pd.rectangle([cxx - thick, cyy - arm, cxx + thick, cyy + arm], fill=ACCENT)

    py0 = int(S * 0.785)
    draw_plus(S // 2 - int(S * 0.066), py0)
    draw_plus(S // 2 + int(S * 0.066), py0)

    return out


def render(size):
    master = IMG  # global
    if size == SS:
        return master.copy()
    return master.resize((size, size), Image.LANCZOS)


IMG = build_master()


def png_bytes(img):
    b = BytesIO()
    img.save(b, format="PNG")
    return b.getvalue()


def flatten_jpg(img, size):
    # white backdrop (these are banner/README uses, not OS icons)
    b = Image.new("RGBA", (size, size), (255, 255, 255))
    b = Image.alpha_composite(b, img)
    o = b.convert("RGB")
    f = BytesIO()
    o.save(f, format="JPEG", quality=92)
    return f.getvalue()


def save_ico(img, path, sizes=(16, 24, 32, 48, 64, 128, 256)):
    img = img.copy()
    img.save(path, format="ICO", sizes=[(s, s) for s in sizes])


def build_icns(pngs):
    # icns container (Big-endian), retinas use PNG chunks ic07/ic08/ic09/ic10
    chunks = b""
    for type_id, data in pngs:
        chunks += struct.pack(">4sI", type_id.encode(), len(data) + 8) + data
    header = struct.pack(">4sI", b"icns", 8 + len(chunks))
    return header + chunks


def main():
    targets = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
    targets = sorted(set(targets))

    public_dir = os.path.join(ROOT, "public", "logo", "icons")
    desktop_icons = os.path.join(ROOT, "packages", "desktop", "build", "icons")
    desktop_build = os.path.join(ROOT, "packages", "desktop", "build")
    for d in (public_dir, desktop_icons, desktop_build):
        os.makedirs(d, exist_ok=True)

    # PNG set (public + desktop build icons)
    for size in targets:
        img = render(size)
        ext = "jpg" if size == 1024 else "png"
        with open(os.path.join(public_dir, f"{size}x{size}.{ext}"), "wb") as f:
            if ext == "jpg":
                f.write(flatten_jpg(img, size))
            else:
                f.write(png_bytes(img))
        if size == 1024:
            # desktop build keeps a 1024px PNG even though public uses jpg for README
            with open(os.path.join(desktop_icons, "1024x1024.png"), "wb") as f:
                f.write(png_bytes(img))
        if ext == "png":
            with open(os.path.join(desktop_icons, f"{size}x{size}.png"), "wb") as f:
                f.write(png_bytes(img))

    # macOS dock icon (public/icon_512@2x.png) = 512px full-bg render
    with open(os.path.join(ROOT, "public", "icon_512@2x.png"), "wb") as f:
        f.write(png_bytes(render(512)))

    # desktop build root assets
    with open(os.path.join(desktop_build, "icon.png"), "wb") as f:
        f.write(png_bytes(render(512)))
    with open(os.path.join(desktop_build, "icon_windows.png"), "wb") as f:
        f.write(png_bytes(render(256)))
    with open(os.path.join(desktop_build, "icon_installer.png"), "wb") as f:
        f.write(png_bytes(render(512)))

    # ICO (app + installer)
    save_ico(render(256), os.path.join(desktop_build, "icon.ico"))
    save_ico(render(256), os.path.join(desktop_build, "icon_installer.ico"))

    # ICNS (app + installer) via standard retina PNG chunks
    def icns_chunks():
        out = []
        for type_id, size in (("ic07", 128), ("ic08", 256), ("ic09", 512), ("ic10", 1024)):
            out.append((type_id, png_bytes(render(size))))
        return out

    with open(os.path.join(desktop_build, "icon.icns"), "wb") as f:
        f.write(build_icns(icns_chunks()))
    with open(os.path.join(desktop_build, "icon_installer.icns"), "wb") as f:
        f.write(build_icns(icns_chunks()))

    print("generated icon set OK")


if __name__ == "__main__":
    main()