"""
Shared pieces for the models in tools/blender/: building parts as bmesh solids,
bevels with hardened normals, booleans, the two UV maps, the ambient-occlusion
bake and the glTF export with quantized geometry. A model script imports this
(it sits next to it) and calls finish() at the end.

Every model is built straight in the site's own frame: metres, y up. Its file is
exported without an axis swap.
"""
import bpy
import bmesh
import json
import math
import os
import struct
import tempfile
from mathutils import Matrix

TMP = tempfile.gettempdir()


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


class Kit:
    def __init__(self):
        reset()
        self.M = {}
        self.parts = []   # (object, node name, uv: ('box',) | ('round', axis, c0, c1, r))

    # ---------------- materials ----------------
    def material(self, name, colour, metal=0.0, rough=0.5):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes['Principled BSDF']
        p.inputs['Base Color'].default_value = (*colour, 1)
        p.inputs['Metallic'].default_value = metal
        p.inputs['Roughness'].default_value = rough
        self.M[name] = m
        return m

    # ---------------- solids ----------------
    def obj(self, bm, name, mat, node, uv):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        o.data.materials.append(self.M[mat])
        self.parts.append((o, node, uv))
        return o

    @staticmethod
    def add_box(bm, w, h, d, x, y, z, rot=0.0):
        """A box; rot turns it about z."""
        c, s = math.cos(rot), math.sin(rot)
        for v in bmesh.ops.create_cube(bm, size=1)['verts']:
            px, py, pz = v.co.x * w, v.co.y * h, v.co.z * d
            v.co = (px * c - py * s + x, px * s + py * c + y, pz + z)

    @staticmethod
    def add_lathe(bm, profile, seg, x=0.0, y=0.0, z=0.0, axis='y', loop=False):
        """
        Turn a profile of (radius, height) points about an axis through (x, y, z).
        A point with radius 0 closes the end. The profile runs so the solid's
        outside is on its right going along it (bottom to top up the outside).
        """
        rings = []
        for r, h in profile:
            if r <= 1e-7:
                rings.append([bm.verts.new((0, h, 0))])
                continue
            rings.append([bm.verts.new((math.cos(2 * math.pi * k / seg) * r, h, math.sin(2 * math.pi * k / seg) * r)) for k in range(seg)])
        for a, b in zip(rings, rings[1:] + (rings[:1] if loop else [])):
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                for k in range(seg):
                    bm.faces.new((a[0], b[k], b[(k + 1) % seg]))
            elif len(b) == 1:
                for k in range(seg):
                    bm.faces.new((a[k], b[0], a[(k + 1) % seg]))
            else:
                for k in range(seg):
                    bm.faces.new((a[k], b[k], b[(k + 1) % seg], a[(k + 1) % seg]))
        vs = [v for r in rings for v in r]
        for v in vs:
            px, py, pz = v.co
            if axis == 'z':      # turn the y axis onto z
                px, py, pz = px, -pz, py
            elif axis == 'x':
                px, py, pz = py, -px, pz
            v.co = (px + x, py + y, pz + z)
        bmesh.ops.remove_doubles(bm, verts=vs, dist=1e-7)

    def box(self, w, h, d, x, y, z, mat, node='body', name='box', rot=0.0):
        bm = bmesh.new()
        self.add_box(bm, w, h, d, x, y, z, rot)
        return self.obj(bm, name, mat, node, ('box',))

    def lathe(self, profile, seg, x, y, z, mat, node='body', name='lathe', axis='y', loop=False):
        bm = bmesh.new()
        self.add_lathe(bm, profile, seg, x, y, z, axis, loop)
        r = max(p[0] for p in profile)
        c = {'y': (x, z), 'z': (x, y), 'x': (y, z)}[axis]
        return self.obj(bm, name, mat, node, ('round', axis, c[0], c[1], r))

    def cyl(self, r, length, x, y, z, mat, seg=32, node='body', name='cyl', axis='y'):
        h = length / 2
        return self.lathe([(0, -h), (r, -h), (r, h), (0, h)], seg, x, y, z, mat, node, name, axis)

    def cutter(self, build):
        bm = bmesh.new()
        build(bm)
        me = bpy.data.meshes.new('cutter')
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new('cutter', me)
        bpy.context.scene.collection.objects.link(o)
        o.hide_render = True
        return o

    @staticmethod
    def cut(o, c):
        m = o.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = c
        m.solver = 'EXACT'
        m.use_self = True
        m.use_hole_tolerant = True
        return o

    @staticmethod
    def bevel(o, width, seg=2, angle=40):
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = width
        m.segments = seg
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(angle)
        m.use_clamp_overlap = True
        m.harden_normals = True
        return o

    # ---------------- finishing ----------------
    def finish(self, out, origins, ao_size=512, ao_dist=0.02, uv_scale=4.0):
        """
        Apply everything, map both UVs, join each node's parts (its origin at origins[node]),
        bake the crevices into one texture, export, quantize.
        """
        for o, node, uv in self.parts:
            if not any(m.type == 'BEVEL' for m in o.modifiers):
                self.bevel(o, 0.0003, 1)
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        for o, node, uv in self.parts:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            old = o.data
            o.modifiers.clear()
            o.data = me
            bpy.data.meshes.remove(old)
        for o in [o for o in bpy.data.objects if o.name.startswith('cutter')]:
            bpy.data.objects.remove(o, do_unlink=True)

        # UV0 for the site's own textures: turned parts mapped flat along their axis (spun
        # rings centre on it), the rest a box map repeating every 1/uv_scale metres
        for o, node, uv in self.parts:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            lay = bm.loops.layers.uv.new('UV0')
            for f in bm.faces:
                ax = max(range(3), key=lambda i: abs(f.normal[i]))
                for l in f.loops:
                    x, y, z = l.vert.co
                    if uv[0] == 'round':
                        _, axis, c0, c1, r = uv
                        a, b = {'y': (x - c0, z - c1), 'z': (x - c0, y - c1), 'x': (y - c0, z - c1)}[axis]
                        l[lay].uv = (a / (2 * r) + 0.5, b / (2 * r) + 0.5)
                    elif ax == 2:
                        l[lay].uv = (x * uv_scale, y * uv_scale)
                    elif ax == 0:
                        l[lay].uv = (z * uv_scale, y * uv_scale)
                    else:
                        l[lay].uv = (x * uv_scale, z * uv_scale)
            bm.to_mesh(o.data)
            bm.free()

        nodes = []
        for name, origin in origins.items():
            objs = [o for o, n, _ in self.parts if n == name]
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            bpy.ops.object.join()
            j = bpy.context.view_layer.objects.active
            j.name = j.data.name = name
            j.data.transform(Matrix.Translation([-c for c in origin]))
            j.location = origin
            nodes.append(j)

        for o in nodes:
            o.data.uv_layers.new(name='UV1')
            o.data.uv_layers.active = o.data.uv_layers['UV1']
        bpy.ops.object.select_all(action='DESELECT')
        for o in nodes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = nodes[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
        bpy.ops.object.mode_set(mode='OBJECT')

        self.bake(nodes, ao_size, ao_dist)

        for o in nodes:
            o.data.uv_layers.active = o.data.uv_layers['UV0']
            o.data.uv_layers['UV0'].active_render = True
        os.makedirs(os.path.dirname(out), exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        for o in nodes:
            o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=False, export_apply=True,
                                  export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='AUTO',
                                  export_cameras=False, export_lights=False, export_animations=False)
        for o in nodes:
            print(o.name, len(o.data.vertices), 'verts', len(o.data.polygons), 'faces')
        quantize(out)
        print('wrote', out, os.path.getsize(out) // 1024, 'KB')

    def bake(self, nodes, size, dist):
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 96
        scene.cycles.device = 'CPU'
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in ('OPTIX', 'CUDA'):
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    scene.cycles.device = 'GPU'
                    print('bake on', kind)
                    break
        except Exception as err:  # no card: the processor does it, slower
            print('bake on CPU', err)
        if scene.world is None:
            scene.world = bpy.data.worlds.new('World')
        scene.world.light_settings.distance = dist
        img = bpy.data.images.new('ao', size, size, alpha=False)
        for m in self.M.values():
            n = m.node_tree.nodes.new('ShaderNodeTexImage')
            n.image = img
            n.name = 'AO'
            m.node_tree.nodes.active = n
        # each node on its own, apart from the others
        home = [o.location.copy() for o in nodes]
        for i, o in enumerate(nodes[1:]):
            o.location.x += 2.0 * (i + 1)
        bpy.ops.object.select_all(action='DESELECT')
        for o in nodes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = nodes[0]
        bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
        for o, l in zip(nodes, home):
            o.location = l
        jpg = os.path.join(TMP, 'model_ao.jpg')
        s = scene.render.image_settings
        s.file_format, s.quality, s.color_mode = 'JPEG', 82, 'BW'
        img.save_render(jpg, scene=scene)
        ao = bpy.data.images.load(jpg)
        ao.colorspace_settings.name = 'Non-Color'
        grp = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        if 'Occlusion' not in [s.name for s in grp.interface.items_tree]:
            grp.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        for m in self.M.values():
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


def quantize(path):
    """
    Positions as 16-bit, normals as 8-bit, the baked map's coordinates as 16-bit integers
    (KHR_mesh_quantization, which three's GLTFLoader reads without a decoder). Each mesh's
    positions are scaled into ±1 and its node takes the scale back.
    """
    raw = open(path, 'rb').read()
    jlen = struct.unpack_from('<I', raw, 12)[0]
    gj = json.loads(raw[20:20 + jlen])
    blen = struct.unpack_from('<I', raw, 20 + jlen)[0]
    bin_ = raw[28 + jlen:28 + jlen + blen]
    acc, views = gj['accessors'], gj['bufferViews']
    COUNT = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def floats(a):
        v = views[a['bufferView']]
        n = COUNT[a['type']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride', 4 * n)
        return [struct.unpack_from('<%df' % n, bin_, off + i * stride) for i in range(a['count'])]

    new = {}
    for node in gj['nodes']:
        if 'mesh' not in node:
            continue
        prims = gj['meshes'][node['mesh']]['primitives']
        S = max(max(abs(c) for c in acc[p['attributes']['POSITION']]['max'] + acc[p['attributes']['POSITION']]['min']) for p in prims)
        for p in prims:
            ai = p['attributes']['POSITION']
            if ai not in new:
                q = [tuple(int(round(c / S * 32767)) for c in v) for v in floats(acc[ai])]
                new[ai] = (b''.join(struct.pack('<3hxx', *v) for v in q), 8)
                acc[ai].update(componentType=5122, normalized=True, min=[min(v[i] for v in q) for i in range(3)], max=[max(v[i] for v in q) for i in range(3)])
            ni = p['attributes'].get('NORMAL')
            if ni is not None and ni not in new:
                q = [tuple(max(-127, min(127, int(round(c * 127)))) for c in v) for v in floats(acc[ni])]
                new[ni] = (b''.join(struct.pack('<3bx', *v) for v in q), 4)
                acc[ni].update(componentType=5120, normalized=True)
                acc[ni].pop('min', None)
                acc[ni].pop('max', None)
            ti = p['attributes'].get('TEXCOORD_1')
            if ti is not None and ti not in new:
                q = [tuple(max(0, min(65535, int(round(c * 65535)))) for c in v) for v in floats(acc[ti])]
                new[ti] = (b''.join(struct.pack('<2H', *v) for v in q), 4)
                acc[ti].update(componentType=5123, normalized=True)
                acc[ti].pop('min', None)
                acc[ti].pop('max', None)
        node['scale'] = [S, S, S]
    out = bytearray()
    nviews, remap = [], {}
    for vi, v in enumerate(views):
        users = [i for i, a in enumerate(acc) if a.get('bufferView') == vi]
        if users and all(u in new for u in users):
            continue
        while len(out) % 4:
            out.append(0)
        off = v.get('byteOffset', 0)
        remap[vi] = len(nviews)
        nviews.append(dict(v, byteOffset=len(out)))
        out += bin_[off:off + v['byteLength']]
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
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(out)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(out), 0x004E4942) + bytes(out))
