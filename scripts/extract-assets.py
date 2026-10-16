"""Cuts the supplied sprite sheets into game-ready files.

Inputs (in a source directory): sprites.png, fields.png, portraits.png, balls.png
Outputs: public/assets/*.png and src/render/atlas.json

Usage: python3 scripts/extract-assets.py <source-dir>
"""
import json, sys, os
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets')
BG = (44, 104, 255, 255)
CELL_BG = (31, 73, 178, 255)

# ---------------------------------------------------------------- player sprites
sheet = Image.open(os.path.join(SRC, 'sprites.png')).convert('RGBA')
px = sheet.load()
W, H = sheet.size
clean = Image.new('RGBA', (W, H), (0, 0, 0, 0))
cp = clean.load()

# animation rows: (name, first cell x, y, frame count); cells are 34px with a 42px pitch
ROWS = [
    ('qbWalk', 16, 27, 2), ('qbAim', 16, 80, 7), ('qbAimOld', 16, 133, 1), ('qbThrow', 16, 186, 1),
    ('handoff', 16, 239, 2), ('qbSlide', 16, 292, 7),
    ('firstDownKneel', 16, 361, 7), ('firstDown', 16, 414, 6), ('celebrate', 16, 467, 2), ('spike', 16, 520, 3),
    ('stand', 16, 589, 3), ('standBall', 16, 642, 3),
    ('wrestle', 158, 589, 2), ('falling', 158, 642, 2), ('fallingBall', 158, 695, 2), ('getUp', 158, 748, 2), ('getUpBall', 158, 801, 2),
    ('run', 326, 27, 6), ('runBall', 326, 80, 6), ('stiffArm', 326, 133, 6), ('truck', 326, 186, 6), ('truckDouble', 326, 239, 6),
    ('jumpCatch', 326, 292, 5), ('jumpCatchBall', 326, 345, 5), ('jump', 326, 398, 3), ('dive', 326, 451, 3), ('diveBall', 326, 504, 3),
    ('jockey', 326, 557, 4), ('taunt', 326, 610, 6), ('kneel', 326, 663, 1),
    ('standBallAlt', 594, 27, 3), ('runBallAlt', 594, 80, 6), ('stiffArmAlt', 594, 133, 6), ('jumpCatchBallAlt', 594, 186, 5),
    ('jumpAlt', 594, 239, 3), ('diveBallAlt', 594, 292, 3), ('fallingBallAlt', 594, 345, 2), ('getUpBallAlt', 594, 398, 2),
    ('spikeAlt', 594, 451, 3), ('kick1', 594, 520, 3), ('kick2', 594, 573, 5), ('place', 594, 626, 2),
]

def opaque(c):
    return c[3] > 0 and c != BG and c != CELL_BG and c[:3] != (255, 255, 255)

atlas = {}
for name, x0, y0, n in ROWS:
    frames = []
    for i in range(n):
        cx = x0 + i * 42
        xs, ys = [], []
        for y in range(y0, y0 + 34):
            for x in range(cx, cx + 34):
                c = px[x, y]
                if opaque(c):
                    cp[x, y] = c
                    xs.append(x)
                    ys.append(y)
        if not xs:
            continue
        bx, by, bx2, by2 = min(xs), min(ys), max(xs), max(ys)
        # anchor: horizontal centre of the cell, feet at the bottom of the bounding box
        frames.append([bx, by, bx2 - bx + 1, by2 - by + 1, bx - (cx + 17)])
    atlas[name] = frames
clean.save(os.path.join(OUT, 'sprites.png'))

# ---------------------------------------------------------------- balls (in-game spin frames)
balls = Image.open(os.path.join(SRC, 'balls.png')).convert('RGBA')
bp = balls.load()
ball_frames = []
ball_img = Image.new('RGBA', (40, 10), (0, 0, 0, 0))
for i, yc in enumerate([25, 32, 39, 46]):
    xs, ys = [], []
    for y in range(yc - 3, yc + 3):
        for x in range(70, 92):
            c = bp[x, y]
            if c[3] > 0 and c != BG and c[:3] != (255, 255, 255):
                xs.append(x)
                ys.append(y)
    bx, by = min(xs), min(ys)
    w, h = max(xs) - bx + 1, max(ys) - by + 1
    piece = balls.crop((bx, by, bx + w, by + h))
    pc = piece.load()
    for y in range(h):
        for x in range(w):
            c = pc[x, y]
            if c == BG or c[:3] == (255, 255, 255):
                pc[x, y] = (0, 0, 0, 0)
    ball_img.paste(piece, (i * 10, 0))
    ball_frames.append([i * 10, 0, w, h])
ball_img.save(os.path.join(OUT, 'ball.png'))

# ---------------------------------------------------------------- fields
fields = Image.open(os.path.join(SRC, 'fields.png')).convert('RGBA')
FIELDS = {
    'standard': (32, 56), 'championship': (1360, 56), 'roof1': (32, 332), 'roof2': (1360, 332),
    'rainy': (32, 608), 'snowy': (1360, 608),
}
for k, (x, y) in FIELDS.items():
    fields.crop((x, y, x + 1300, y + 237)).save(os.path.join(OUT, 'fields', f'{k}.png'))

# ---------------------------------------------------------------- portraits
por = Image.open(os.path.join(SRC, 'portraits.png')).convert('RGBA')
pp = por.load()
def has_face(x, y):
    n = 0
    for yy in range(y, y + 36):
        for xx in range(x, x + 27):
            c = pp[xx, yy]
            if c[3] > 0 and c != BG:
                n += 1
    return n > 200
players, coaches = [], []
for r in range(15):
    for col in range(6):
        x, y = 34 + col * 48, 44 + r * 48
        if has_face(x, y):
            players.append([x, y, 27, 36])
for r in range(6):
    for col in range(6):
        x, y = 354 + col * 48, 44 + r * 48
        if has_face(x, y):
            coaches.append([x, y, 27, 36])
clean_p = Image.new('RGBA', por.size, (0, 0, 0, 0))
cpp = clean_p.load()
for x, y, w, h in players + coaches:
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            c = pp[xx, yy]
            cpp[xx, yy] = (255, 255, 255, 255) if c[3] == 0 or c == BG else c
clean_p.save(os.path.join(OUT, 'portraits.png'))

meta = {
    'sprites': atlas,
    'ball': ball_frames,
    'field': {'w': 1300, 'h': 237, 'goal0': 150, 'goal100': 1150, 'top': 30, 'bottom': 204, 'pxPerYardX': 10},
    'portraits': {'players': players, 'coaches': coaches},
}
with open(os.path.join(ROOT, 'src', 'render', 'atlas.json'), 'w') as f:
    json.dump(meta, f)
print('frames', sum(len(v) for v in atlas.values()), 'portraits', len(players), len(coaches))
