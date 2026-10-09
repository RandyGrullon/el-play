"""Genera los íconos PNG de la PWA con la marca de El Play (home plate + pelota).

Uso: python scripts/make-icons.py   (requiere Pillow)
Las formas son las mismas de public/logo.svg y src/components/brand/Logo.tsx (viewBox 64x64).
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / 'public'
SS = 8  # supersampling para bordes suaves

BLUE = (30, 79, 216)
NAVY = (30, 58, 138)
RED = (214, 31, 58)
SEAM = (225, 29, 46)
BG = (9, 12, 17)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    """Degradado diagonal azul → azul marino → rojo"""
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = lerp(BLUE, NAVY, t / 0.55) if t < 0.55 else lerp(NAVY, RED, (t - 0.55) / 0.45)
    return img


def plate_polygon(scale, ox, oy):
    """Home plate con esquinas redondeadas (aproximadas con arcos)"""
    pts = []
    corners = [((14, 11), 6, 180, 270), ((50, 11), 6, 270, 360)]
    for (cx, cy), r, a0, a1 in corners:
        for a in range(a0, a1 + 1, 5):
            pts.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
    pts += [(56, 32.6), (54.24, 36.84), (36.24, 54.84)]
    for a in range(45, 136, 5):  # punta inferior redondeada
        pts.append((32 + 6 * math.cos(math.radians(a)), 50.6 + 6 * math.sin(math.radians(a))))
    pts += [(27.76, 54.84), (9.76, 36.84), (8, 32.6)]
    return [(ox + x * scale, oy + y * scale) for x, y in pts]


def seam_points(sign, offset=0.0):
    """Curva de costura (bezier cuadrática aproximada) en coordenadas 64x64"""
    pts = []
    for i in range(41):
        t = i / 40
        y = 17.4 + 18.6 * t
        bulge = 4.8 * math.sin(math.pi * t)
        x = 32 + sign * (8.6 - bulge) + offset
        pts.append((x, y))
    return pts


def draw_icon(size, padding, background):
    big = size * SS
    canvas = Image.new('RGBA', (big, big), background + (255,) if background else (0, 0, 0, 0))
    scale = (big - 2 * padding * SS) / 48  # el plato ocupa x 8..56 (48 unidades)
    ox = padding * SS - 8 * scale
    oy = padding * SS - 5 * scale + (big - 2 * padding * SS - 50 * scale) / 2
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).polygon(plate_polygon(scale, ox, oy), fill=255)
    canvas.paste(gradient(big), (0, 0), mask)

    draw = ImageDraw.Draw(canvas)
    cx, cy, r = ox + 32 * scale, oy + 26.7 * scale, 13 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))
    to_px = lambda p: (ox + p[0] * scale, oy + p[1] * scale)
    for sign in (-1, 1):
        line = [to_px(p) for p in seam_points(sign)]
        draw.line(line, fill=SEAM + (255,), width=max(1, round(1.3 * scale)), joint='curve')
        for p in seam_points(sign, offset=sign * 1.1)[1::5]:  # puntadas por fuera de la costura
            x, y = to_px(p)
            d = 0.85 * scale
            draw.ellipse([x - d, y - d, x + d, y + d], fill=SEAM + (255,))
    return canvas.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    draw_icon(192, 22, BG).convert('RGB').save(PUBLIC / 'pwa-192x192.png')
    draw_icon(512, 64, BG).convert('RGB').save(PUBLIC / 'pwa-512x512.png')  # margen seguro para "maskable"
    draw_icon(180, 22, BG).convert('RGB').save(PUBLIC / 'apple-touch-icon.png')
    print('íconos generados en', PUBLIC)
