#!/usr/bin/env python3
"""Generate On It's app icons.

Kept in the repo so the icons can be regenerated if the brand colour moves,
rather than being opaque binaries nobody can edit. Run from this directory:

    python3 make-icons.py
"""

from PIL import Image, ImageDraw

TEAL = (15, 107, 96)
TEAL_DEEP = (10, 78, 70)
CREAM = (250, 247, 242)


def rounded_square(size, radius_ratio, bg_from, bg_to, pad_ratio=0.0):
    """Rounded tile with a soft vertical gradient and a drawn check mark."""
    scale = 4  # supersample, then downsample for clean edges
    s = size * scale
    pad = int(s * pad_ratio)
    inner = s - pad * 2

    gradient = Image.new("RGB", (1, inner))
    for y in range(inner):
        t = y / max(1, inner - 1)
        gradient.putpixel((0, y), tuple(
            round(bg_from[i] + (bg_to[i] - bg_from[i]) * t) for i in range(3)
        ))
    gradient = gradient.resize((inner, inner))

    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, inner - 1, inner - 1], radius=int(inner * radius_ratio), fill=255
    )

    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(gradient, (pad, pad), mask)

    # A check mark, drawn as a thick polyline with rounded joints.
    draw = ImageDraw.Draw(canvas)
    w = int(inner * 0.105)
    points = [
        (pad + inner * 0.28, pad + inner * 0.53),
        (pad + inner * 0.44, pad + inner * 0.68),
        (pad + inner * 0.73, pad + inner * 0.34),
    ]
    draw.line(points, fill=CREAM, width=w, joint="curve")
    for x, y in points:
        draw.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=CREAM)

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    # Standard icons keep a little breathing room inside the tile.
    rounded_square(192, 0.23, TEAL, TEAL_DEEP).save("icon-192.png")
    rounded_square(512, 0.23, TEAL, TEAL_DEEP).save("icon-512.png")
    # Maskable icons must survive an aggressive circular crop, so the artwork
    # sits inside the 80% safe zone with the tile bled to the edges.
    rounded_square(512, 0.5, TEAL, TEAL_DEEP, pad_ratio=0.0).save("icon-maskable-512.png")
    print("wrote icon-192.png, icon-512.png, icon-maskable-512.png")


if __name__ == "__main__":
    main()
