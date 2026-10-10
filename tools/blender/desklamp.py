"""
The brass reading lamp on the archive's reading table (two of them, the same),
modelled for real: a weighted, stepped, turned base on a felt pad, the stem with
a collar and a joint, a knuckle with its pin and nuts, the arm out to a second
knuckle, and the shade, spun brass outside with a rolled rim and white enamel
inside, the bakelite socket and the bulb. Written to public/models/desklamp.glb.

Sizes and places follow deskLamp() in src/app/archive/room.ts, in its own frame:
metres, origin the middle of the base on the desk, y up, the shade out along +z.
The lights, the pull chain, the glow and the switching stay in that code.

Run (from the repository root):
  blender -b --factory-startup -P tools/blender/desklamp.py -- [out.glb] [ao size]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Kit  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.join(REPO, 'public', 'models', 'desklamp.glb')
AO_SIZE = int(ARGS[1]) if len(ARGS) > 1 else 512

k = Kit()
# named by role: the site swaps each for its own material of that name
k.material('brass', (0.48, 0.3, 0.07), 0.85, 0.35)
k.material('enamel', (0.9, 0.88, 0.82), 0.0, 0.3)
k.material('felt', (0.05, 0.12, 0.07), 0.0, 0.95)
k.material('socket', (0.02, 0.015, 0.01), 0.0, 0.4)
k.material('bulb', (0.95, 0.93, 0.85), 0.0, 0.2)

# where the shade hangs (as in room.ts) and the height of the arm
SX, SY, SZ = 0.0, 0.36, 0.19
ARM_Y = 0.458

# ---------------- the base: a felt pad, then the turned, stepped, weighted brass ----------------
k.bevel(k.cyl(0.081, 0.002, 0, 0.001, 0, 'felt', 64, name='felt'), 0.0004, 1)
base = [(0, 0.002), (0.084, 0.002), (0.085, 0.003), (0.085, 0.010), (0.083, 0.012), (0.078, 0.013), (0.0745, 0.0155),
        (0.0745, 0.019), (0.0705, 0.021), (0.052, 0.022), (0.048, 0.025), (0.034, 0.026), (0.030, 0.029), (0.019, 0.030),
        (0.0165, 0.033), (0.0125, 0.036), (0, 0.036)]
k.bevel(k.lathe(base, 64, 0, 0, 0, 'brass', name='base'), 0.0005, 2, 30)

# ---------------- the stem, a collar at its foot and a joint half-way ----------------
top = ARM_Y - 0.012
k.bevel(k.cyl(0.008, top - 0.034, 0, (top + 0.034) / 2, 0, 'brass', 28, name='stem'), 0.0004, 1)
k.bevel(k.lathe([(0, 0.034), (0.0125, 0.034), (0.0125, 0.040), (0.0095, 0.046), (0, 0.046)], 32, 0, 0, 0, 'brass', name='collar'), 0.0006, 2, 30)
k.bevel(k.lathe([(0, 0.212), (0.0105, 0.212), (0.0105, 0.2175), (0.0095, 0.2185), (0.0095, 0.2215), (0.0105, 0.2225), (0.0105, 0.228), (0, 0.228)],
                32, 0, 0, 0, 'brass', name='joint'), 0.0004, 1, 30)


def ball(r, n=12):
    return [(r * math.sin(math.pi * i / n), -r * math.cos(math.pi * i / n)) for i in range(n + 1)]


# ---------------- the knuckle on the stem: a ball, the pin through it, a nut each side ----------------
k.lathe(ball(0.012), 28, 0, ARM_Y, 0, 'brass', name='knuckle')
k.bevel(k.cyl(0.0035, 0.034, 0, ARM_Y, 0, 'brass', 16, name='pin', axis='x'), 0.0005, 1)
for sx in (-1, 1):
    k.bevel(k.cyl(0.0062, 0.004, sx * 0.0175, ARM_Y, 0, 'brass', 6, name='nut', axis='x'), 0.0006, 1)

# ---------------- the arm out to the shade, and the second knuckle ----------------
a0, a1 = 0.008, SZ - 0.009
k.bevel(k.cyl(0.0055, a1 - a0, 0, ARM_Y, (a0 + a1) / 2, 'brass', 24, name='arm', axis='z'), 0.0004, 1)
k.lathe(ball(0.0095), 24, SX, ARM_Y, SZ, 'brass', name='knuckle2')

# ---------------- the shade: spun brass outside, rolled rim, white enamel inside ----------------
outer = [(0.0955, -0.004), (0.093, -0.001), (0.088, 0.006), (0.080, 0.018), (0.070, 0.033), (0.060, 0.047), (0.050, 0.061),
         (0.040, 0.074), (0.032, 0.082), (0.024, 0.087), (0.016, 0.0895), (0.0125, 0.090), (0, 0.0905)]
k.lathe(outer, 64, SX, SY, SZ, 'brass', name='shade')
inner = [(0, 0.087), (0.012, 0.087), (0.016, 0.0865), (0.024, 0.084), (0.032, 0.079), (0.040, 0.071), (0.050, 0.058),
         (0.060, 0.044), (0.070, 0.030), (0.080, 0.015), (0.087, 0.003), (0.0915, -0.003)]
k.lathe(inner, 64, SX, SY, SZ, 'enamel', name='enamel')
rim = [(0.0935 + 0.0024 * math.cos(2 * math.pi * i / 10), -0.0037 + 0.0024 * math.sin(2 * math.pi * i / 10)) for i in range(10)]
k.lathe(rim, 64, SX, SY, SZ, 'brass', name='rim', loop=True)
# the neck up to the knuckle
k.bevel(k.lathe([(0, 0.088), (0.0125, 0.088), (0.0125, 0.091), (0.010, 0.093), (0.010, ARM_Y - SY - 0.006), (0, ARM_Y - SY - 0.006)],
                32, SX, SY, SZ, 'brass', name='neck'), 0.0005, 1, 30)
# inside: the bakelite socket and the bulb hanging from it
k.bevel(k.lathe([(0, 0.057), (0.012, 0.057), (0.0125, 0.06), (0.0125, 0.08), (0.011, 0.084), (0, 0.084)], 32, SX, SY, SZ, 'socket', name='socket'), 0.0006, 1, 30)
bulb = [(0, 0.016), (0.011, 0.018), (0.020, 0.025), (0.0265, 0.037), (0.026, 0.047), (0.020, 0.055), (0.0115, 0.060), (0.009, 0.063), (0, 0.063)]
k.lathe(bulb, 32, SX, SY, SZ, 'bulb', name='bulb')

k.finish(OUT, {'body': (0, 0, 0)}, ao_size=AO_SIZE, ao_dist=0.02)
