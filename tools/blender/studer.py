"""
The Studer A807 MK II by the archive's reading table, modelled for real:
the machine's still body (chassis, side cheeks, transport plate, vents, the
three heads under their cover, capstan and pinch roller, guides, splicing
bar, meter bridge, knobs), one 10½-inch NAB reel, and the two tension arms
(nodes armL and armR, each with its origin on its pivot so the site can swing
it), written to public/models/studer.glb with its geometry quantized. Everything that moves, lights up or
carries print (keys, lamps, the timer, the VU dials and needles, the printed
bridge face, the badge, the tape) stays in src/app/archive/studer.ts, which
also keeps the old all-code machine for when this file cannot be read.

Positions copy studer.ts exactly, in its own frame: metres, origin the
middle of the foot, y up, the face towards +z. The file is written in that
frame as it is (no axis swap on export), so the site lays it straight in.

Only the crevices are baked (ambient occlusion over a few centimetres), into
one texture on a second UV map; the room's light stays live.

Run (from the repository root):
  blender -b --factory-startup -P tools/blender/studer.py -- [out.glb] [ao size]
"""
import bpy
import bmesh
import math
import os
import sys
import tempfile
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.join(REPO, 'public', 'models', 'studer.glb')
AO_SIZE = int(ARGS[1]) if len(ARGS) > 1 else 1024
TMP = tempfile.gettempdir()

# ---------------- the machine's numbers (as in studer.ts) ----------------
W, H, D = 0.465, 0.5, 0.265
BRIDGE = 0.138
SPIN_X, SPIN_Y = 0.145, 0.392
REEL_R, HUB_R = 0.1335, 0.05
FACE = D / 2
TAPE_Z = FACE + 0.03
BZ = FACE + 0.01


def X(px):
    return (px - 652) * 0.000564


def Y(py):
    return (945 - py) * 0.000577


# the tension arms (as in studer.ts): pivot under the knob, the roller ARM_LEN out at the resting angle
ARM_LEN = 0.045
ARM_ROLLER = 0.009
ARMS = {'armL': (X(300), Y(597), math.radians(110)), 'armR': (X(1012), Y(592), math.radians(70))}

# the tape between the two guide rollers runs along their lower common tangent; the heads and
# the capstan sit just above it, touching the tape, the pinch roller just below
GUIDE_R = 0.021
TAPE_HALF = 0.0003
_gl, _gr = (X(405), Y(580)), (X(900), Y(577))
_phi = math.atan2(_gr[1] - _gl[1], _gr[0] - _gl[0])
_p1 = (_gl[0] + (GUIDE_R + TAPE_HALF) * math.sin(_phi), _gl[1] - (GUIDE_R + TAPE_HALF) * math.cos(_phi))


def tape_y(x):
    """The tape's centre line between the guides, at x."""
    return _p1[1] + (x - _p1[0]) * math.tan(_phi)


# ---------------- scene ----------------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
COLL = scene.collection


def material(name, colour, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*colour, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m


# named by role: the site swaps each for its own material of that name
M = {
    'alu': material('alu', (0.78, 0.79, 0.8), 0.35, 0.34),
    'aluRound': material('aluRound', (0.8, 0.81, 0.82), 0.4, 0.28),
    'black': material('black', (0.012, 0.012, 0.013), 0, 0.55),
    'charcoal': material('charcoal', (0.02, 0.02, 0.021), 0, 0.5),
    'rubber': material('rubber', (0.008, 0.008, 0.008), 0, 0.85),
    'brass': material('brass', (0.48, 0.29, 0.05), 0.85, 0.3),
    'reelAlu': material('reelAlu', (0.78, 0.8, 0.81), 0.3, 0.36),
    'white': material('white', (0.88, 0.88, 0.88), 0, 0.5),
    'cream': material('cream', (0.69, 0.6, 0.43), 0, 0.6),
    'chrome': material('chrome', (0.8, 0.81, 0.82), 1.0, 0.18),
}

parts = []   # (object, which: 'body' | 'reel', uv: ('box',) | ('round', cx, cy, r))


def obj_from(bm, name, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    if mat:
        o.data.materials.append(mat)
    return o


def add_box(bm, w, h, d, x, y, z, rot=0.0):
    r = bmesh.ops.create_cube(bm, size=1)
    vs = r['verts']
    c, s = math.cos(rot), math.sin(rot)
    for v in vs:
        px, py, pz = v.co.x * w, v.co.y * h, v.co.z * d
        v.co = (px * c - py * s + x, px * s + py * c + y, pz + z)


def add_cyl(bm, r, depth, x, y, z, seg=32, r2=None, knurl=0.0):
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    for v in res['verts']:
        if knurl:
            a = math.atan2(v.co.y, v.co.x)
            k = round(a / (2 * math.pi / seg))
            if k % 2:
                v.co.x *= 1 - knurl
                v.co.y *= 1 - knurl
        v.co.x += x
        v.co.y += y
        v.co.z += z


def box(w, h, d, x, y, z, mat, which='body', name='box', rot=0.0, uv=('box',)):
    bm = bmesh.new()
    add_box(bm, w, h, d, x, y, z, rot)
    o = obj_from(bm, name, M[mat])
    parts.append((o, which, uv))
    return o


def cyl(r, depth, x, y, z, mat, seg=32, which='body', name='cyl', r2=None, knurl=0.0, uv=None):
    bm = bmesh.new()
    add_cyl(bm, r, depth, x, y, z, seg, r2, knurl)
    o = obj_from(bm, name, M[mat])
    parts.append((o, which, uv or ('round', x, y, max(r, r2 or 0))))
    return o


def cutter(build):
    bm = bmesh.new()
    build(bm)
    return obj_from(bm, 'cutter')


def cut(o, c):
    m = o.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = c
    m.solver = 'EXACT'
    m.use_self = True
    m.use_hole_tolerant = True
    c.hide_render = True
    return o


def bevel(o, width, seg=2, angle=40):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.use_clamp_overlap = True
    m.harden_normals = True
    return o


# ======================================================================
# the body
# ======================================================================

# chassis behind the face
bevel(box(W - 0.03, H - 0.01, D - 0.02, 0, H / 2, -0.005, 'charcoal', name='chassis'), 0.0015)

# brushed side cheeks, rounded, with the rack ears at the foot (two slotted holes each)
for sx in (-1, 1):
    bevel(box(0.016, H, D, sx * (W / 2 - 0.008), H / 2, 0, 'alu', name='cheek'), 0.003, 3)
    ear = box(0.012, BRIDGE + 0.004, 0.004, sx * (W / 2 + 0.004), BRIDGE / 2, FACE + 0.012, 'alu', name='ear')
    cut(ear, cutter(lambda bm, sx=sx: [add_box(bm, 0.0035, 0.008, 0.01, sx * (W / 2 + 0.004), y, FACE + 0.012) for y in (0.02, BRIDGE - 0.02)]))
    bevel(ear, 0.0007)

# the transport plate, matt black, with the carrying-handle slot and the tension arms' slots cut into it
plate = box(W - 0.032, H - BRIDGE, 0.01, 0, BRIDGE + (H - BRIDGE) / 2, FACE - 0.005, 'black', name='plate')


def arc_prism(bm, cx, cy, r, a0, a1, width, z, depth, n=16):
    """A curved slot: the band r ± width/2 between angles a0 and a1, depth deep."""
    ring = [(cx + math.cos(a0 + (a1 - a0) * k / n) * (r + width / 2), cy + math.sin(a0 + (a1 - a0) * k / n) * (r + width / 2)) for k in range(n + 1)]
    ring += [(cx + math.cos(a1 + (a0 - a1) * k / n) * (r - width / 2), cy + math.sin(a1 + (a0 - a1) * k / n) * (r - width / 2)) for k in range(n + 1)]
    lo = [bm.verts.new((px, py, z - depth / 2)) for px, py in ring]
    hi = [bm.verts.new((px, py, z + depth / 2)) for px, py in ring]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    m = len(ring)
    for k in range(m):
        bm.faces.new((lo[k], lo[(k + 1) % m], hi[(k + 1) % m], hi[k]))


def plate_cuts(bm):
    add_box(bm, 0.022, 0.012, 0.012, X(655), Y(103), FACE)
    # the arc each tension arm's roller post swings through
    for name, (px, py, rest) in ARMS.items():
        side = 1 if name == 'armL' else -1
        arc_prism(bm, px, py, ARM_LEN, rest - side * 0.3, rest + side * 0.35, 0.0065, FACE, 0.008)


cut(plate, cutter(plate_cuts))
bevel(plate, 0.0008)

# vents: a raised grille with real slots, top pair and middle pair
for (cx, cy, w, rows) in ((X(610), Y(100), 0.035, 6), (X(700), Y(100), 0.035, 6), (X(605), Y(415), 0.03, 5), (X(668), Y(415), 0.03, 5)):
    h = rows * 0.0045 + 0.003
    g = box(w, h, 0.003, cx, cy, FACE + 0.0015, 'black', name='vent')
    cut(g, cutter(lambda bm, cx=cx, cy=cy, w=w, rows=rows: [add_box(bm, w - 0.004, 0.0027, 0.01, cx, cy - (rows - 1) / 2 * 0.0045 + i * 0.0045, FACE) for i in range(rows)]))
    bevel(g, 0.0004)

# spindle motors: a flange on the plate, the hub, the shaft the reel's centre goes over
for sx in (-1, 1):
    bevel(cyl(0.024, 0.003, sx * SPIN_X, SPIN_Y, FACE + 0.0015, 'aluRound', 40, name='spinFlange'), 0.0008, 1)
    bevel(cyl(0.016, 0.03, sx * SPIN_X, SPIN_Y, FACE + 0.015, 'aluRound', 40, name='spinHub'), 0.0012)
    bevel(cyl(0.0055, 0.008, sx * SPIN_X, SPIN_Y, FACE + 0.034, 'aluRound', 24, name='spinShaft'), 0.0008)

# the head assembly: brushed base plate, its screws, the long rounded hood, the lower block
hx = (X(480) + X(840)) / 2
bevel(box(X(840) - X(480), Y(520) - Y(690), 0.006, hx, (Y(520) + Y(690)) / 2, FACE + 0.003, 'alu', name='headPlate'), 0.001)
for (px, py) in ((555, 530), (610, 530), (495, 625), (825, 625)):
    s = cyl(0.0028, 0.003, X(px), Y(py), FACE + 0.0068, 'aluRound', 20, name='screw')
    cut(s, cutter(lambda bm, px=px, py=py: add_box(bm, 0.0045, 0.0006, 0.003, X(px), Y(py), FACE + 0.0083, 0.6)))
    bevel(s, 0.0009, 2)
bevel(box(X(827) - X(492), Y(550) - Y(600), 0.04, (X(492) + X(827)) / 2, (Y(550) + Y(600)) / 2, FACE + 0.026, 'alu', name='hood'), 0.011, 5)
# the lower block sits under the tape, clear of it
bevel(box(X(710) - X(570), 0.015, 0.036, (X(570) + X(710)) / 2, 0.1755, FACE + 0.018, 'alu', name='headBlock'), 0.003, 3)

# the heads under the hood: erase, record, playback, left to right, their round faces down on the
# tape; record and playback in mu-metal shields; all three on a black carrier screwed to the plate
HOOD_LOW = Y(600)
bevel(box(0.105, 0.016, 0.016, -0.026, HOOD_LOW - 0.001, FACE + 0.014, 'charcoal', name='headCarrier'), 0.001)
for hx_, wide, shield in ((-0.064, 0.011, False), (-0.03, 0.015, True), (0.004, 0.015, True)):
    y0 = tape_y(hx_) + TAPE_HALF          # the head's face, on the tape's upper side
    r = wide / 2
    top = HOOD_LOW + 0.004
    bevel(cyl(r, 0.012, hx_, y0 + r, TAPE_Z, 'chrome', 32, name='headFace', uv=('round', hx_, y0 + r, r)), 0.0006, 2)
    bevel(box(wide, top - (y0 + r), 0.012, hx_, (y0 + r + top) / 2, TAPE_Z, 'chrome', name='headBody'), 0.0006, 2)
    # the gap, a dark hairline across the face
    box(0.0005, 0.0012, 0.0122, hx_, y0 + 0.0004, TAPE_Z, 'black', name='headGap')
    if shield:
        for sz in (-1, 1):
            bevel(box(wide + 0.004, top - y0 - 0.0035, 0.0008, hx_, (y0 + 0.0035 + top) / 2, TAPE_Z + sz * 0.0072, 'alu', name='shield'), 0.0003, 1)
    # the head's foot on the carrier
    bevel(box(wide + 0.002, 0.006, 0.008, hx_, top - 0.002, FACE + 0.02, 'charcoal', name='headFoot'), 0.0006, 1)
# the black rubber head shield flap, and the little tape marker on the left
bevel(box(0.02, 0.03, 0.012, X(752), Y(578), FACE + 0.048, 'rubber', name='flap'), 0.004, 3)
bevel(box(0.008, 0.012, 0.01, X(545), Y(537), FACE + 0.01, 'cream', name='marker'), 0.001)

# capstan and pinch roller: alu boss, black rubber roller, a turned cap, the shaft
# the capstan shaft just above the tape, the pinch roller pressing up from below, on its arm
cx = X(750)
cap_y = tape_y(cx) + TAPE_HALF + 0.004
bevel(cyl(0.011, 0.004, cx, cap_y, FACE + 0.002, 'aluRound', 32, name='capstanBoss'), 0.0008)
bevel(cyl(0.004, 0.036, cx, cap_y, FACE + 0.018, 'chrome', 24, name='capstan'), 0.0006)
py_ = tape_y(cx) - TAPE_HALF - 0.011
bevel(cyl(0.006, 0.02, cx, py_, FACE + 0.01, 'aluRound', 24, name='rollerBoss'), 0.0008)
bevel(cyl(0.011, 0.016, cx, py_, TAPE_Z, 'rubber', 40, name='roller'), 0.0015, 3)
bevel(cyl(0.0062, 0.004, cx, py_, TAPE_Z + 0.009, 'aluRound', 32, name='rollerCap'), 0.0012)
pv = (cx + 0.03, py_ - 0.012)
ang = math.atan2(py_ - pv[1], cx - pv[0])
ln = math.hypot(cx - pv[0], py_ - pv[1])
bevel(box(ln, 0.008, 0.004, (cx + pv[0]) / 2, (py_ + pv[1]) / 2, FACE + 0.008, 'alu', name='pinchArm', rot=ang), 0.0012, 2)
bevel(cyl(0.006, 0.008, pv[0], pv[1], FACE + 0.006, 'aluRound', 24, name='pinchPivot'), 0.001)

# guide rollers: a post, the roller between two flanges (the tape runs at TAPE_Z between them), a domed cap
for (px, py) in ((405, 580), (900, 577)):
    gx, gy = X(px), Y(py)
    bevel(cyl(0.009, 0.024, gx, gy, FACE + 0.012, 'aluRound', 32, name='guidePost'), 0.0008)
    bevel(cyl(0.021, 0.012, gx, gy, FACE + 0.03, 'chrome', 40, name='guide'), 0.0006)
    for fz in (0.0255, 0.0345):
        bevel(cyl(0.0235, 0.0012, gx, gy, FACE + fz, 'chrome', 40, name='guideFlange'), 0.0004)
    bevel(cyl(0.007, 0.003, gx, gy, FACE + 0.0375, 'chrome', 32, name='guideCap'), 0.0012, 2)

# the tension arms: a short stem on the plate stays put; each arm is its own node, origin at the pivot,
# drawn at its resting angle (the site turns it): a bar out to a flanged roller the tape goes round,
# the knurled knob over the pivot
for name, (px, py, rest) in ARMS.items():
    bevel(cyl(0.005, 0.006, px, py, FACE + 0.003, 'alu', 20, name='armStem'), 0.0005, 1)
    rx, ry = px + math.cos(rest) * ARM_LEN, py + math.sin(rest) * ARM_LEN
    bevel(box(ARM_LEN, 0.008, 0.004, (px + rx) / 2, (py + ry) / 2, FACE + 0.008, 'chrome', which=name, name='armBar', rot=rest), 0.0015, 2)
    bevel(cyl(0.0055, 0.004, rx, ry, FACE + 0.008, 'chrome', 24, which=name, name='armEnd'), 0.0012, 1)
    bevel(cyl(0.003, TAPE_Z - FACE - 0.004, rx, ry, (FACE + 0.008 + TAPE_Z - 0.004) / 2 + 0.002, 'chrome', 16, which=name, name='armPost'), 0.0004, 1)
    bevel(cyl(ARM_ROLLER, 0.008, rx, ry, TAPE_Z, 'chrome', 32, which=name, name='armRoller'), 0.0005, 1)
    for fz in (-0.0042, 0.0042):
        bevel(cyl(ARM_ROLLER + 0.0018, 0.0008, rx, ry, TAPE_Z + fz, 'chrome', 32, which=name, name='armFlange'), 0.0003, 1)
    bevel(cyl(0.004, 0.003, rx, ry, TAPE_Z + 0.0058, 'chrome', 20, which=name, name='armCap'), 0.0012, 2)
    bevel(cyl(0.012, 0.01, px, py, FACE + 0.015, 'aluRound', 40, knurl=0.06, which=name, name='armKnob'), 0.0012, 1, 60)

# the splicing bar, its groove along it and the two cutting slots across it
sb = box(X(1050) - X(845), Y(655) - Y(690), 0.01, (X(845) + X(1050)) / 2, (Y(655) + Y(690)) / 2, FACE + 0.005, 'alu', name='splice')


def splice_cuts(bm):
    add_box(bm, X(1040) - X(855), 0.0032, 0.004, (X(845) + X(1050)) / 2, Y(672), FACE + 0.0105)
    add_box(bm, 0.0008, 0.03, 0.006, X(1000), Y(672), FACE + 0.01)
    add_box(bm, 0.0008, 0.03, 0.006, X(1022), Y(672), FACE + 0.01, math.radians(45))


cut(sb, cutter(splice_cuts))
bevel(sb, 0.0008)

# ---------------- the meter bridge ----------------
bevel(box(W - 0.032, BRIDGE, 0.02, 0, BRIDGE / 2, FACE - 0.016, 'charcoal', name='bridge'), 0.001)
for y in (BRIDGE - 0.0015, 0.0015):
    bevel(box(W - 0.032, 0.003, 0.03, 0, y, FACE - 0.004, 'charcoal', name='bridgeLip'), 0.0008)
# a black bezel round each meter window, deep enough to make a well the dial sits in
for ox in (0, 230):
    mx, my = (X(580 + ox) + X(745 + ox)) / 2, (Y(728) + Y(800)) / 2
    ww, hh = X(745) - X(580), Y(728) - Y(800)
    bz = box(ww + 0.006, hh + 0.006, 0.0065, mx, my, BZ - 0.00275 + 0.0015, 'black', name='bezel')
    cut(bz, cutter(lambda bm, mx=mx, my=my, ww=ww, hh=hh: add_box(bm, ww, hh, 0.02, mx, my, BZ)))
    bevel(bz, 0.0007)
# and a thin frame round the timer window
lx, ly = (X(310) + X(425)) / 2, (Y(740) + Y(775)) / 2
lw, lh = X(425) - X(310), Y(740) - Y(775)
lf = box(lw + 0.004, lh + 0.004, 0.002, lx, ly, BZ + 0.0015, 'black', name='lcdFrame')
cut(lf, cutter(lambda bm: add_box(bm, lw, lh, 0.01, lx, ly, BZ)))
bevel(lf, 0.0004)

# level knobs: a turned aluminium skirt, a knurled black cap, the white line; the trimmer hole between each pair
for ox in (0, 230):
    for kx in (605, 705):
        x, y = X(kx + ox), Y(880)
        bevel(cyl(0.0135, 0.004, x, y, BZ + 0.002, 'aluRound', 40, r2=0.0125, name='skirt'), 0.0006)
        bevel(cyl(0.0105, 0.014, x, y, BZ + 0.009, 'black', 36, knurl=0.05, name='knob'), 0.0012, 1, 60)
        a = -0.15
        box(0.0009, 0.009, 0.0008, x - math.sin(a) * 0.005, y + math.cos(a) * 0.005, BZ + 0.0162, 'white', name='knobLine', rot=a)
        if kx == 605:
            t = cyl(0.0032, 0.0012, X(655 + ox), Y(858), BZ + 0.0006, 'black', 20, name='trim')
            cut(t, cutter(lambda bm, ox=ox: add_cyl(bm, 0.002, 0.004, X(655 + ox), Y(858), BZ + 0.0012, 16)))

# the right-hand column: phones jack (nut and hole), monitor selector with its pointer, level knob, small jack
j = cyl(0.0055, 0.004, X(1006), Y(745), BZ + 0.002, 'aluRound', 24, name='jack')
cut(j, cutter(lambda bm: add_cyl(bm, 0.0032, 0.01, X(1006), Y(745), BZ + 0.004, 20)))
bevel(j, 0.0005)
bevel(cyl(0.0075, 0.009, X(1004), Y(785), BZ + 0.0045, 'charcoal', 32, name='selector'), 0.001)
box(0.003, 0.013, 0.004, X(1004), Y(785), BZ + 0.0105, 'charcoal', name='selectorBar', rot=-0.5)
bevel(cyl(0.006, 0.01, X(1005), Y(905), BZ + 0.005, 'black', 32, knurl=0.06, name='levelKnob'), 0.001, 1, 60)
j2 = cyl(0.004, 0.003, X(1035), Y(905), BZ + 0.0015, 'aluRound', 20, name='jack2')
cut(j2, cutter(lambda bm: add_cyl(bm, 0.002, 0.01, X(1035), Y(905), BZ + 0.003, 16)))

# ======================================================================
# the reel: a 10½-inch NAB metal reel, origin at its centre, axis +z
# ======================================================================


def windows(bm, z, depth):
    for i in range(3):
        a0 = i * math.pi * 2 / 3 + 0.55
        a1 = a0 + 1.0
        n = 14
        outer = [(math.cos(a0 + (a1 - a0) * k / n) * 0.118, math.sin(a0 + (a1 - a0) * k / n) * 0.118) for k in range(n + 1)]
        b0, b1 = a1 - 0.08, a0 + 0.08
        inner = [(math.cos(b0 + (b1 - b0) * k / n) * 0.062, math.sin(b0 + (b1 - b0) * k / n) * 0.062) for k in range(n + 1)]
        ring = outer + inner
        lo = [bm.verts.new((px, py, z - depth / 2)) for px, py in ring]
        hi = [bm.verts.new((px, py, z + depth / 2)) for px, py in ring]
        bm.faces.new(lo[::-1])
        bm.faces.new(hi)
        m = len(ring)
        for k in range(m):
            bm.faces.new((lo[k], lo[(k + 1) % m], hi[(k + 1) % m], hi[k]))
    add_cyl(bm, 0.0095, depth, 0, 0, z, 24)


for z0 in (-0.0062, 0.0046):
    zc = z0 + 0.0008
    f = cyl(REEL_R, 0.0016, 0, 0, zc, 'reelAlu', 96, which='reel', name='flange', uv=('round', 0, 0, REEL_R))
    cut(f, cutter(lambda bm, zc=zc: windows(bm, zc, 0.01)))
    bevel(f, 0.0005, 1, 30)
bevel(cyl(HUB_R, 0.0108, 0, 0, 0, 'aluRound', 56, which='reel', name='hub'), 0.0008)
nab = cyl(0.036, 0.016, 0, 0, 0.012, 'brass', 56, which='reel', name='nab')
cut(nab, cutter(lambda bm: [add_box(bm, 0.008, 0.012, 0.01, math.cos(a) * 0.03, math.sin(a) * 0.03, 0.02, a) for a in (0.5, 0.5 + 2 * math.pi / 3, 0.5 + 4 * math.pi / 3)]))
bevel(nab, 0.0008)
bevel(cyl(0.026, 0.008, 0, 0, 0.023, 'aluRound', 40, r2=0.024, which='reel', name='cap'), 0.0012, 2)
for i in range(3):
    a = i * math.pi * 2 / 3
    bevel(box(0.012, 0.006, 0.006, math.cos(a) * 0.04, math.sin(a) * 0.04, 0.016, 'brass', which='reel', name='ear', rot=a), 0.0008)

# ======================================================================
# apply, UV maps, join
# ======================================================================
for o, which, uv in parts:
    if not any(m.type == 'BEVEL' for m in o.modifiers):
        bevel(o, 0.0003, 1)
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
for o, which, uv in parts:
    if o.modifiers:
        e = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(e)
        old = o.data
        o.modifiers.clear()
        o.data = me
        bpy.data.meshes.remove(old)
if os.environ.get('STUDER_DEBUG'):
    for o, which, uv in sorted(parts, key=lambda p: -len(p[0].data.vertices))[:25]:
        print('part', o.name, len(o.data.vertices))
for o in [o for o in bpy.data.objects if o.name.startswith('cutter')]:
    bpy.data.objects.remove(o, do_unlink=True)

# UV0, for the site's own textures: turned parts get a planar map round their axis (the rings
# of the brushed texture centre on it); everything else a box map, a texture repeat every 25 cm
S = 4.0
for o, which, uv in parts:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    lay = bm.loops.layers.uv.new('UV0')
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            x, y, z = l.vert.co
            if uv[0] == 'round':
                _, cx, cy, r = uv
                l[lay].uv = ((x - cx) / (2 * r) + 0.5, (y - cy) / (2 * r) + 0.5)
            elif ax == 2:
                l[lay].uv = (x * S, y * S)
            elif ax == 0:
                l[lay].uv = (z * S, y * S)
            else:
                l[lay].uv = (x * S, z * S)
    bm.to_mesh(o.data)
    bm.free()


def join(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    j.data.name = name
    return j


body = join('body', [o for o, w, _ in parts if w == 'body'])
reel = join('reel', [o for o, w, _ in parts if w == 'reel'])
arms = []
for name, (px, py, rest) in ARMS.items():
    a = join(name, [o for o, w, _ in parts if w == name])
    a.data.transform(Matrix.Translation((-px, -py, 0)))
    a.location = (px, py, 0)
    arms.append(a)
NODES = [body, reel] + arms

# UV1: one shared, non-overlapping layout for the baked crevices
for o in NODES:
    o.data.uv_layers.new(name='UV1')
    o.data.uv_layers.active = o.data.uv_layers['UV1']
bpy.ops.object.select_all(action='DESELECT')
for o in NODES:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')

# ======================================================================
# bake the crevices
# ======================================================================
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.device = 'CPU'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        prefs.compute_device_type = kind
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = 'GPU'
            print('bake on', kind, gpus[0].name)
            break
except Exception as err:  # no card: the processor does it, slower
    print('bake on CPU', err)
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.light_settings.distance = 0.025

img = bpy.data.images.new('studer_ao', AO_SIZE, AO_SIZE, alpha=False)
for m in M.values():
    nt = m.node_tree
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    n.name = 'AO'
    nt.nodes.active = n

# the moving parts are baked on their own, away from the machine (their crevices only)
home = [o.location.copy() for o in NODES]
for i, o in enumerate(NODES[1:]):
    o.location.x += 2.0 * (i + 1)
bpy.ops.object.select_all(action='DESELECT')
for o in NODES:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
for o, l in zip(NODES, home):
    o.location = l

jpg = os.path.join(TMP, 'studer_ao.jpg')
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 82
scene.render.image_settings.color_mode = 'BW'
img.save_render(jpg, scene=scene)
ao = bpy.data.images.load(jpg)
ao.name = 'studer_ao'
ao.colorspace_settings.name = 'Non-Color'

# wire it as glTF occlusion: AO image (on UV1) -> red -> "glTF Material Output".Occlusion
grp = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
if 'Occlusion' not in [s.name for s in grp.interface.items_tree]:
    grp.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
for m in M.values():
    nt = m.node_tree
    t = nt.nodes['AO']
    t.image = ao
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'UV1'
    nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(t.outputs['Color'], sep.inputs['Color'])
    g = nt.nodes.new('ShaderNodeGroup')
    g.node_tree = grp
    nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])

for o in NODES:
    o.data.uv_layers.active = o.data.uv_layers['UV0']
    o.data.uv_layers['UV0'].active_render = True

# ======================================================================
# export
# ======================================================================
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for o in NODES:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_yup=False,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
for o in NODES:
    print(o.name, len(o.data.vertices), 'verts', len(o.data.polygons), 'faces')


def quantize(path):
    """
    Store positions as 16-bit and normals as 8-bit integers (KHR_mesh_quantization, which
    three's GLTFLoader reads without any decoder): about a third off the file. Each mesh's
    positions are scaled into ±1 and its node takes the scale back.
    """
    import json
    import struct
    raw = open(path, 'rb').read()
    jlen = struct.unpack_from('<I', raw, 12)[0]
    gj = json.loads(raw[20:20 + jlen])
    blen = struct.unpack_from('<I', raw, 20 + jlen)[0]
    bin_ = raw[28 + jlen:28 + jlen + blen]
    acc, views = gj['accessors'], gj['bufferViews']
    SIZE = {5126: 4, 5123: 2, 5125: 4, 5121: 1}
    COUNT = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def floats(a):
        v = views[a['bufferView']]
        n = COUNT[a['type']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride', 4 * n)
        return [struct.unpack_from('<%df' % n, bin_, off + i * stride) for i in range(a['count'])]

    new = {}   # accessor index -> (bytes, stride)
    for ni, node in enumerate(gj['nodes']):
        if 'mesh' not in node:
            continue
        prims = gj['meshes'][node['mesh']]['primitives']
        S = max(max(abs(c) for c in acc[p['attributes']['POSITION']]['max'] + acc[p['attributes']['POSITION']]['min']) for p in prims)
        for p in prims:
            ai = p['attributes']['POSITION']
            if ai in new:
                continue
            q = [tuple(int(round(c / S * 32767)) for c in v) for v in floats(acc[ai])]
            new[ai] = (b''.join(struct.pack('<3hxx', *v) for v in q), 8)
            acc[ai].update(componentType=5122, normalized=True, min=[min(v[i] for v in q) for i in range(3)], max=[max(v[i] for v in q) for i in range(3)])
            ni_ = p['attributes'].get('NORMAL')
            if ni_ is not None and ni_ not in new:
                qn = [tuple(max(-127, min(127, int(round(c * 127)))) for c in v) for v in floats(acc[ni_])]
                new[ni_] = (b''.join(struct.pack('<3bx', *v) for v in qn), 4)
                acc[ni_].update(componentType=5120, normalized=True)
                acc[ni_].pop('min', None)
                acc[ni_].pop('max', None)
            # the baked map's coordinates all lie in 0..1: 16 bits each
            ti = p['attributes'].get('TEXCOORD_1')
            if ti is not None and ti not in new:
                qt = [tuple(max(0, min(65535, int(round(c * 65535)))) for c in v) for v in floats(acc[ti])]
                new[ti] = (b''.join(struct.pack('<2H', *v) for v in qt), 4)
                acc[ti].update(componentType=5123, normalized=True)
                acc[ti].pop('min', None)
                acc[ti].pop('max', None)
        node['scale'] = [S, S, S]
    # write the buffer again: replaced accessors get views of their own, the rest are copied
    out = bytearray()
    nviews = []
    remap = {}
    for vi, v in enumerate(views):
        users = [i for i, a in enumerate(acc) if a.get('bufferView') == vi]
        if users and all(u in new for u in users):
            continue
        while len(out) % 4:
            out.append(0)
        off = v.get('byteOffset', 0)
        nv = dict(v, byteOffset=len(out))
        out += bin_[off:off + v['byteLength']]
        remap[vi] = len(nviews)
        nviews.append(nv)
    for ai, (data, stride) in new.items():
        while len(out) % 4:
            out.append(0)
        nviews.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data), 'byteStride': stride, 'target': 34962})
        out += data
        acc[ai]['bufferView'] = len(nviews) - 1
        acc[ai].pop('byteOffset', None)
    for i, a in enumerate(acc):
        if i not in new and 'bufferView' in a:
            a['bufferView'] = remap[a['bufferView']]
    for im in gj.get('images', []):
        im['bufferView'] = remap[im['bufferView']]
    gj['bufferViews'] = nviews
    gj['buffers'] = [{'byteLength': len(out)}]
    for k in ('extensionsUsed', 'extensionsRequired'):
        gj[k] = sorted(set(gj.get(k, [])) | {'KHR_mesh_quantization'})
    js = json.dumps(gj, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    while len(out) % 4:
        out.append(0)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(out), 0x004E4942) + bytes(out))


quantize(OUT)
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
