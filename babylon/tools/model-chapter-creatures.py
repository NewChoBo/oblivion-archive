"""Build the two chapter creature models and their articulated nodes as GLB."""
import json
import math
import runpy
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/chapter-art'
geometry = runpy.run_path(str(Path(__file__).with_name('model-archive-tools.py')))
Model, unit, cross, sub = (geometry[key] for key in ('Model', 'unit', 'cross', 'sub'))
sin, cos, pi = math.sin, math.cos, math.pi

FINISH = {
    'Fluid ink': ([.048, .055, .071], .12, .30),
    'Ink ridges': ([.061, .073, .094], .17, .41),
    'Old binding boards': ([.12, .074, .040], .02, .78),
    'Torn parchment': ([.31, .205, .115], 0, .86),
    'Binding threads': ([.40, .229, .092], .19, .58),
    'Split porcelain': ([.68, .55, .39], 0, .60),
    'Luminous ink': ([.06, .49, .56], .05, .36),
    'Abyssal carapace': ([.079, .105, .143], .13, .64),
    'Dorsal armor': ([.13, .159, .212], .20, .51),
    'Underbelly ribs': ([.081, .080, .101], .04, .70),
}

SURFACE_UV = {
    'Fluid ink': (1.52, .72, 1.04, .34),
    'Old binding boards': (2.1, 1.06, .84, .28),
    'Torn parchment': (2.5, 1.42, 1.28, .48),
    'Split porcelain': (2.15, .6, 1.78, .30),
}


TEXTURES = Path(__file__).resolve().parents[2] / 'asset-sources/Art/Chapter1/model-textures'


class Creature(Model):
    def __init__(self):
        super().__init__()
        self.animations = []

    def clip(self, name, times, rotations, translations=None):
        """Author local-space poses in degrees and metres; glTF stores XYZW quaternions."""
        clock = self.accessor(times, 5126, 'SCALAR')
        self.accessors[clock].update(min=[times[0]], max=[times[-1]])
        nodes = {node['name']: i for i, node in enumerate(self.nodes)}
        channels, samplers = [], []
        for path, tracks in [('rotation', rotations), ('translation', translations or {})]:
            for joint, keys in tracks.items():
                assert len(keys) == len(times), (name, joint)
                if path == 'rotation':
                    keys = [quaternion(*angles) for angles in keys]
                index = self.accessor(keys, 5126, 'VEC4' if path == 'rotation' else 'VEC3')
                channels.append(dict(sampler=len(samplers), target=dict(node=nodes[joint], path=path)))
                samplers.append(dict(input=clock, output=index, interpolation='LINEAR'))
        self.animations.append(dict(name=name, samplers=samplers, channels=channels))

    def shell(self, node, finish, points, triangles, outward):
        positions, normals, indices = self.parts.setdefault((node, finish), ([], [], []))
        start = len(positions)
        positions.extend(points)
        normals.extend([[0., 0., 0.] for _ in points])
        for a, b, c in triangles:
            normal = cross(sub(points[b], points[a]), sub(points[c], points[a]))
            if sum(x * y for x, y in zip(normal, outward)) < 0:
                b, c = c, b
                normal = tuple(-value for value in normal)
            for index in (a, b, c):
                indices.append(start + index)
                for axis in range(3):
                    normals[start + index][axis] += normal[axis]

    def save_creature(self, name):
        materials = []
        images, textures = [], []
        finishes = list(dict.fromkeys(finish for _, finish in self.parts))
        for label in finishes:
            rgb, metal, roughness = FINISH[label]
            surface = {'name': label, 'pbrMetallicRoughness': {
                'baseColorFactor': [*rgb, 1], 'metallicFactor': metal, 'roughnessFactor': roughness}}
            if label == 'Luminous ink':
                surface['emissiveFactor'] = [.015, .27, .34]
            if label == 'Split porcelain':
                surface['doubleSided'] = True
            if label in SURFACE_UV:
                self.binary.extend(bytes(-len(self.binary) % 4))
                pigment = TEXTURES / name / (label.lower().replace(' ', '-') + '.png')
                png = pigment.read_bytes()
                self.views.append(dict(buffer=0, byteOffset=len(self.binary), byteLength=len(png)))
                self.binary.extend(png)
                surface['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(textures)}
                textures.append({'source': len(images)})
                images.append(dict(name=label, mimeType='image/png', bufferView=len(self.views) - 1))
            materials.append(surface)

        for (node, finish), (positions, normals, indices) in self.parts.items():
            if 'mesh' not in self.nodes[node]:
                self.nodes[node]['mesh'] = len(self.meshes)
                self.meshes.append({'name': self.nodes[node]['name'], 'primitives': []})
            colors = []
            for x, y, z in positions:
                phase = (x * .23 + y * .78 + z * .36) if name == 'outer-leviathan' else (9*x + 13*y + 7*z)
                value = .78 + .16 * sin(phase) + .06 * cos(4.3 * phase + y * 2.2)
                colors.append((value, value, min(1., value + .035)))
            attrs = {
                'POSITION': self.accessor(positions, 5126, 'VEC3'),
                'NORMAL': self.accessor([unit(n) if any(n) else (0,0,-1) for n in normals], 5126, 'VEC3'),
                'COLOR_0': self.accessor(colors, 5126, 'VEC3'),
            }
            if finish in SURFACE_UV:
                sx, sz, sy, depth = SURFACE_UV[finish]
                uv = [(x*sx + z*sz + y*.17, y*sy + z*depth) for x, y, z in positions]
                attrs['TEXCOORD_0'] = self.accessor(uv, 5126, 'VEC2')
            self.meshes[self.nodes[node]['mesh']]['primitives'].append({
                'attributes': attrs, 'indices': self.accessor(indices, 5123, 'SCALAR'),
                'material': finishes.index(finish),
            })

        self.binary.extend(bytes(-len(self.binary) % 4))
        doc = {'asset': {'version': '2.0', 'generator': 'Oblivion Archive creature art'},
               'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': self.nodes, 'meshes': self.meshes,
               'materials': materials, 'animations': self.animations,
               'accessors': self.accessors, 'bufferViews': self.views,
               'buffers': [{'byteLength': len(self.binary)}]}
        if images:
            doc.update(images=images, textures=textures)
        meta = json.dumps(doc, separators=(',', ':')).encode()
        meta += b' ' * (-len(meta) % 4)
        header = struct.pack('<4sII', b'glTF', 2, 28 + len(meta) + len(self.binary))
        (OUT / f'{name}.glb').write_bytes(header + struct.pack('<I4s', len(meta), b'JSON') + meta
                                         + struct.pack('<I4s', len(self.binary), b'BIN\0') + self.binary)


def quaternion(x, y, z):
    x, y, z = (math.radians(angle) / 2 for angle in (x, y, z))
    return (sin(x)*cos(y)*cos(z) - cos(x)*sin(y)*sin(z),
            cos(x)*sin(y)*cos(z) + sin(x)*cos(y)*sin(z),
            cos(x)*cos(y)*sin(z) - sin(x)*sin(y)*cos(z),
            cos(x)*cos(y)*cos(z) + sin(x)*sin(y)*sin(z))


def ink_motion(model):
    # Each pose addresses the same joints. Windup ends at contact; the recovery
    # clip begins on that exact silhouette even if attack timing changes.
    # Height, body, mask, trailing fringe, long striking arm, folded arm.
    rest = (.06, (0,0,0), (1,-3,-2), (2,0,0), (3,0,-9), (-9,0,3))
    inhale = (.105, (-2,2,2), (-3,5,2), (-8,0,3), (-7,4,-14), (-2,-4,6))
    settle = (.037, (2,-2,-1), (4,-6,-3), (9,1,-2), (9,-2,-6), (-13,4,1))
    glide = (.08, (-9,0,-3), (8,2,3), (-21,0,6), (-15,-6,-13), (-18,4,8))
    sweep = (.14, (-14,3,3), (12,-5,-4), (-34,-3,-5), (-30,8,-19), (-8,-5,4))
    recoil = (.012, (12,-4,8), (23,9,-15), (-8,0,-9), (32,18,-23), (25,-13,12))
    tremor = (.019, (10,-3,7), (20,6,-12), (1,2,-7), (28,15,-21), (22,-10,11))
    draw = (.11, (7,-16,-9), (-5,21,4), (-12,7,6), (-42,-23,-30), (24,12,13))
    contact = (.035, (-16,12,6), (11,-9,-5), (25,-3,-7), (70,8,-6), (-27,-16,9))
    follow = (.026, (-12,16,5), (7,-13,-3), (34,2,-5), (65,22,4), (-20,-10,6))

    def clip(name, times, poses):
        joints = ('InkBody', 'InkMask', 'InkFringe', 'InkReach', 'InkFold')
        model.clip(name, times, {node: [p[i+1] for p in poses] for i, node in enumerate(joints)},
                   {'InkBody': [(0, p[0], 0) for p in poses]})

    clip('Hover', [0, .8, 1.6, 2.35, 3.2], [rest, inhale, rest, settle, rest])
    clip('Glide', [0, .48, 1.12, 1.6], [glide, sweep, settle, glide])
    clip('Windup', [0, .17, .235, .32], [rest, draw, draw, contact])
    clip('Recover', [0, .085, .28, .48], [contact, follow, settle, rest])
    clip('Stagger', [0, .14, .32, .48], [recoil, tremor, recoil, recoil])


def leviathan_motion(model):
    # The paired fins sweep together; the eight tendrils trail that impulse.
    period = 6.4
    times = [period*i/24 for i in range(25)]
    phases = [2*pi*i/24 for i in range(25)]
    rotations = {'Outer leviathan': [(2*sin(t), 1.5*sin(t), 3*sin(t-.3)) for t in phases]}
    for joint, side in [('LeviathanFinL', 1), ('LeviathanFinR', -1)]:
        rotations[joint] = [(side*(5+11*sin(t)+2*sin(2*t)), side*2*cos(t), 0) for t in phases]
    for i in range(8):
        rotations[f'LeviathanTendril{i}'] = [
            (0, 6*sin(t-.62*i), 9*sin(t-.45*i-.7) + 2*sin(2*t-.55*i)) for t in phases]
    model.clip('VoidSwim', times, rotations)


def swept(model, node, finish, controls, sides=12):
    """Sample a curved centreline and radii between each sculpted profile section."""
    sections = []
    for i in range(len(controls) - 1):
        a, b, c, d = (controls[k] for k in (max(0, i - 1), i, i + 1, min(len(controls) - 1, i + 2)))
        for step in range(4):
            t = step / 4
            values = [(2*q + (-p+r)*t + (2*p-5*q+4*r-s)*t*t + (-p+3*q-3*r+s)*t*t*t)/2
                      for p, q, r, s in zip(a, b, c, d)]
            sections.append((*values[:3], max(.001, values[3]), max(.001, values[4])))
    model.tube(node, finish, [*sections, controls[-1]], sides)


def torn_board(model, node, finish, start, end, across, thickness):
    outline = [(-.96, 0), (.91, .03), (1, .37), (.78, .94), (.55, .82), (.37, 1),
               (.13, .88), (-.18, .97), (-.42, .84), (-.58, .98), (-.85, .91), (-1, .35)]
    direction = sub(end, start)
    normal = unit(cross(direction, across))
    rings = [[tuple(start[i] + direction[i]*v + across[i]*u + normal[i]*(level + .014*sin(pi*v))
                    for i in range(3)) for u, v in outline] for level in (-thickness/2, thickness/2)]
    model.loft(node, finish, rings, True)


def mask(model, node):
    rows = [(-.27,.023,-.104,.006),(-.21,.065,-.13,.008),(-.12,.110,-.144,.009),
            (-.069,.143,-.157,.011),(-.020,.171,-.13,.009),(.034,.180,-.135,.012),
            (.090,.169,-.130,.015),(.155,.147,-.115,.022),(.218,.108,-.095,.034)]
    count = 11
    for side in (-1, 1):
        points = []
        for index, (y, width, depth, gap) in enumerate(rows):
            for i in range(count):
                u = i / (count - 1)
                edge = (.012 * sin(index * 2.7)) * u**2
                points.append((side * (gap + (width-gap)*u), y + edge, depth + .078*u*u - .013*sin(pi*u)))
        triangles = []
        for j in range(len(rows) - 1):
            for i in range(count - 1):
                if (j == 4 and 3 <= i < 8) or (j == 3 and 4 <= i < 7):
                    continue
                a = j*count + i
                triangles.extend([(a,a+1,a+count+1), (a,a+count+1,a+count)])
        model.shell(node, 'Split porcelain', points, triangles, (0,0,-1))
        swept(model, node, 'Fluid ink', [(side*.043,-.023,-.108,.016,.021),
            (side*.093,-.004,-.124,.045,.027),(side*.147,.025,-.096,.009,.009)], 14)
        swept(model, node, 'Luminous ink', [(side*.067,-.019,-.146,.003,.004),
            (side*.096,-.009,-.15,.014,.008),(side*.124,.012,-.129,.003,.003)], 10)
        swept(model, node, 'Luminous ink', [(side*.106,-.018,-.145,.005,.004),
            (side*.112,-.105,-.131,.004,.003),(side*.091,-.17,-.117,.001,.001)], 7)
    swept(model, node, 'Luminous ink', [(-.012,.14,-.113,.002,.003),(.005,.055,-.126,.007,.004),
         (-.004,-.05,-.151,.006,.005),(.008,-.141,-.129,.004,.003),(-.006,-.25,-.105,.001,.001)], 9)


def ink_apparition():
    m = Creature()
    root = m.node('Ink apparition')
    body = m.node('InkBody', root)
    core = [(0,.19,.17,.024,.026),(-.10,.44,.12,.12,.09),(.03,.75,.07,.22,.16),
            (.08,1.1,.03,.252,.20),(-.04,1.4,.04,.315,.224),
            (-.02,1.75,.07,.35,.27),(.01,2.11,.11,.44,.31),(.05,2.35,.15,.31,.26),
            (.025,2.47,.10,.092,.088)]
    swept(m, body, 'Fluid ink', core, 24)
    for i in range(9):
        angle = 2*pi*i/9
        controls = []
        for k, height in enumerate([.29,.58,.98,1.34,1.67,2.08,2.36]):
            a = angle + height * 1.85
            width = [.041,.13,.22,.27,.33,.36,.25][k]
            radius = [.010,.025,.046,.042,.045,.052,.021][k]
            controls.append((width*cos(a),height,.11+width*.76*sin(a),radius,radius*.72))
        swept(m, body, 'Ink ridges', controls, 9)
    tail = m.node('InkFringe', body, (0,.88,.08))
    for i in range(8):
        a = i*2*pi/8
        x, z = .18*cos(a), .17*sin(a)
        drop = .48+.23*sin(i*1.71)**2
        swept(m, tail, 'Fluid ink', [(x,0,z,.043,.037),
              (x*1.35,-.22,z*1.15,.03,.026),
              (x*.62-.08,-drop*.8,z*.63,.013,.012),
              (x*.57-.09,-drop,z*.74,.0025,.003)], 9)
    for side in (1, -1):
        for i in range(5):
            z = -.24 + .12*i
            start = (side*(.09+.058*(i%2)),2.44-.026*i,z+.14)
            end = (side*(.53+.07*sin(i*1.2)),1.81-.059*i,z-.014)
            across = (side*.075,.021,.105)
            torn_board(m, body, 'Old binding boards', start, end, across, .037)
            torn_board(m, body, 'Torn parchment', (start[0],start[1]-.07,start[2]-.045),
                       (end[0]+side*.07,end[1]-.15,end[2]-.034), across, .014)
            if i % 2 == 0:
                swept(m, body, 'Binding threads', [(*start,.008,.006),
                      (side*.39,2.25-.035*i,z+.04,.009,.007),
                      (end[0],end[1]+.10,end[2]+.032,.003,.003)], 7)

    head = m.node('InkMask', body, (.018,2.105,-.302))
    swept(m, head, 'Fluid ink', [(0,-.27,.025,.031,.029),(0,-.12,.047,.127,.066),
          (0,.045,.036,.178,.114),(.011,.20,.038,.149,.106),(.02,.285,.075,.043,.032)], 24)
    mask(m, head)
    for side, reach in [(1, True), (-1, False)]:
        arm = m.node('InkReach' if reach else 'InkFold', body, (side*.40,1.99,.095))
        if reach:
            chain = [(0,.035,0,.12,.12),(.13,-.31,-.019,.119,.10),
                     (.18,-.72,-.06,.076,.082),(.20,-1.07,-.12,.066,.080),
                     (.13,-1.47,-.23,.052,.044)]
        else:
            chain = [(0,.023,0,.121,.11),(-.14,-.32,-.03,.10,.095),
                     (-.17,-.67,-.06,.078,.075),(-.02,-.75,-.23,.068,.068),
                     (.23,-.57,-.36,.047,.046)]
        swept(m, arm, 'Fluid ink', chain, 17)
        for offset in [-.033,.028]:
            swept(m, arm, 'Ink ridges', [(x+offset,y,z-.045,.021,.017) for x,y,z,_,_ in chain], 8)
        x,y,z,_,_ = chain[-1]
        for i in range(4):
            shift = (i-1.4)*.040
            curl = .18+.075*sin(i*.8)
            swept(m, arm, 'Ink ridges', [(x+shift,y,z,.021,.018),
                  (x+shift*1.8+.024,y-curl*.43,z-.045,.018,.014),
                  (x+shift*2+.005,y-curl*.83,z-.082,.010,.011),
                  (x+shift*1.84-.025,y-curl,z-.14,.002,.003)], 9)
    ink_motion(m)
    m.save_creature('ink-apparition')


def outer_leviathan():
    m = Creature()
    root = m.node('Outer leviathan')
    body = m.node('LeviathanBody', root)
    spine = [(-15.8,-.40,0,.028,.032),(-11.9,.12,.45,.38,.28),(-9.1,.64,.49,1.11,.61),
             (-6.3,1.19,.20,1.80,1.14),(-2.8,1.07,-.16,2.52,1.77),
             (.9,.69,-.08,2.74,2.03),(4.4,.33,.10,2.41,1.65),
             (8.1,.14,.52,1.85,1.03),(11.55,.04,.51,1.09,.53),
             (14.25,-.20,.22,.64,.26),(15.2,-.35,.13,.031,.038)]
    swept(m, body, 'Abyssal carapace', spine, 32)
    for side in (-1, 1):
        for i in range(12):
            x = -8.9+i*1.63
            swell = sin(pi*(i+.5)/12)
            swept(m, body, 'Underbelly ribs', [(x,.81,side*(.37+1.1*swell),.19,.31),
                   (x+.45,-.36,side*(.7+1.78*swell),.17,.29),
                   (x+.93,-1.11*swell-.52,side*(.9+1.14*swell),.12,.21),
                   (x+.26,-2.04*swell-.51,side*.50,.04,.10)], 10)
        fin = m.node('LeviathanFinL' if side == 1 else 'LeviathanFinR', root, (-.4,.46,side*1.25))
        layers = [(-2.6,2.25),(0,2.92),(2.2,2.5),(4.5,2.05),(6.9,1.38)]
        for i, (x, spread) in enumerate(layers):
            swept(m, fin, 'Dorsal armor', [(x,.06,0,.43,1.18),
                   (x-1.3,.37,side*spread,.29,1.69),
                   (x-2.35,.49+i*.13,side*(spread+1.7-i*.18),.137,.84),
                   (x-4.64,.87+i*.08,side*(spread+2.9-i*.27),.006,.03)], 15)
        for i in range(7):
            x = -10+i*3.0
            lift = sin(pi*(i+.5)/7)
            swept(m, body, 'Dorsal armor', [(x,.45+1.62*lift,side*(.52+1.02*lift),.24,.21),
                   (x+1.1,.88+1.85*lift,side*(.29+1.28*lift),.26,.24),
                   (x+.61,1.30+2.37*lift,side*(.09+.89*lift),.10,.17),
                   (x-1.05,1.30+2.77*lift,side*.43,.008,.021)], 12)

    for i in range(8):
        x = -6.8 + i*1.3
        side = -1 if i % 2 else 1
        pivot = m.node(f'LeviathanTendril{i}', root, (x,-1.40+.17*abs(3-i),side*.89))
        thick = .34 if i in (3, 4) else .19
        reach = 6.2+.65*i
        path = [(0,0,0,thick,thick),(1.25,-.88,.7*side,thick*.93,thick*.75),
                (2.65,-2.08,1.52*side,thick*.68,thick*.64),
                (reach*.69,-2.77,1.65*side,thick*.44,thick*.47),
                (reach*.85,-2.98+.52*sin(i),2.08*side,thick*.21,thick*.24),
                (reach,-2.44+.62*sin(i*1.2),2.6*side,.013,.019)]
        swept(m, pivot, 'Abyssal carapace', path, 13)
        if i in (3, 4):
            for x,y,z,w,h in path[1:-1]:
                swept(m, pivot, 'Underbelly ribs',
                      [(x-.17,y+.09,z,w*.93,h*.96),(x,y,z,w*1.19,h*1.15),
                       (x+.16,y-.088,z,w*.94,h*.93)], 10)
    leviathan_motion(m)
    m.save_creature('outer-leviathan')


if __name__ == '__main__':
    ink_apparition()
    outer_leviathan()
