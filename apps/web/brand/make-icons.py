"""Derive the PWA / favicon icon set from the logo master (brand/logo-source.webp).

Only downscaling (Lanczos) — the logo itself is never redrawn, cropped or
stretched. The maskable variant shrinks the whole logo into the 80 % safe
zone and fills the margin by repeating the logo's own edge pixels, so the
dark gradient background continues without a seam.

Run from apps/web (needs Pillow, which is not a project dependency):
    python3 brand/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

WEB = Path(__file__).resolve().parent.parent
SOURCE = WEB / 'brand' / 'logo-source.webp'
PUBLIC = WEB / 'public'

# Share of the maskable canvas the logo occupies. The farthest detail (the
# small speech bubbles, top-left) sits ~0.52 of the logo's width from its
# centre; at 0.75 that is ~0.39, inside the 0.40 safe-zone radius.
MASKABLE_SCALE = 0.75


def resized(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def maskable(img: Image.Image, size: int) -> Image.Image:
    inner = round(size * MASKABLE_SCALE)
    pad = (size - inner) // 2
    far = pad + inner
    logo = resized(img, inner)
    canvas = Image.new('RGB', (size, size))
    canvas.paste(logo, (pad, pad))
    # Edge replication: stretch the outermost row/column into each margin.
    canvas.paste(logo.crop((0, 0, inner, 1)).resize((inner, pad)), (pad, 0))
    canvas.paste(logo.crop((0, inner - 1, inner, inner)).resize((inner, size - far)), (pad, far))
    canvas.paste(logo.crop((0, 0, 1, inner)).resize((pad, inner)), (0, pad))
    canvas.paste(logo.crop((inner - 1, 0, inner, inner)).resize((size - far, inner)), (far, pad))
    for x0, y0, x1, y1, px in (
        (0, 0, pad, pad, (0, 0)),
        (far, 0, size, pad, (inner - 1, 0)),
        (0, far, pad, size, (0, inner - 1)),
        (far, far, size, size, (inner - 1, inner - 1)),
    ):
        canvas.paste(logo.getpixel(px), (x0, y0, x1, y1))
    # Soften the streaks edge replication leaves in the margin, then put the
    # untouched logo back on top.
    canvas = canvas.filter(ImageFilter.GaussianBlur(12))
    canvas.paste(logo, (pad, pad))
    return canvas


def main() -> None:
    # The master is sRGB; browsers assume sRGB for untagged PNGs.
    img = Image.open(SOURCE).convert('RGB')
    outputs = {
        'icons/icon-512.png': resized(img, 512),
        'icons/icon-192.png': resized(img, 192),
        'icons/icon-32.png': resized(img, 32),
        'apple-touch-icon.png': resized(img, 180),
        'icons/icon-512-maskable.png': maskable(img, 512),
    }
    for rel, out in outputs.items():
        out.save(PUBLIC / rel, optimize=True)
        print(f'{rel}: {out.size[0]}x{out.size[1]}')


if __name__ == '__main__':
    main()
