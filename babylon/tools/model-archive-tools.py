"""Build the archive's two authored glTF props using only the Python standard library."""
import json
import math
import struct
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'arcane'
TAU = math.tau


def sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    length = math.hypot(*v) or 1
    return tuple(a/length for a in v)


# Linear pigment values for the game's ink pass.
FINISH = {
    'Walnut': ([.17,.078,.037], .08, .54),
    'Bookbinder leather': ([.085,.036,.027], 0, .76),
    'Gilt edges': ([.76,.44,.15], .52, .35),
    'Patinated brass': ([.33,.21,.09], .42, .50),
    'Peacock enamel': ([.032,.23,.20], .18, .31),
    'Horn': ([.77,.64,.43], .09, .43),
    'Moonstone': ([.18,.70,.75], .12, .25),
    'Sunstone': ([.78,.40,.083], .15, .28),
}


TEXTURES = Path(__file__).resolve().parents[2] / 'asset-sources/Art/Chapter1/model-textures'


class Model:
    def __init__(self):
        self.parts = {}
        self.nodes = []
        self.meshes = []
        self.accessors = []
        self.views = []
        self.binary = bytearray()

    def node(self, name, parent=None, position=(0,0,0)):
        index = len(self.nodes)
        self.nodes.append(dict(name=name, translation=position))
        if parent is not None:
            self.nodes[parent].setdefault('children', []).append(index)
        return index

    def loft(self, node, finish, rings, faceted=False):
        """Join section rings, with smooth wood bevels or individually cut gem facets."""
        vertices, normals, indices = self.parts.setdefault((node, finish), ([], [], []))
        count = len(rings[0])
        start = len(vertices)
        verts = [p for ring in rings for p in ring]
        center = lambda ring: tuple(sum(p[j] for p in ring)/len(ring) for j in range(3))
        centers = [center(r) for r in rings]
        faces = []
        for i in range(len(rings)-1):
            for j in range(count):
                a = i*count+j
                b = i*count+(j+1)%count
                outward = sub(verts[a], centers[i])
                faces.extend([((a,b,b+count), outward), ((a,b+count,a+count), outward)])
        for i, adjacent in [(0,1),(len(rings)-1,len(rings)-2)]:
            for j in range(1,count-1):
                faces.append(((i*count,i*count+j,i*count+j+1),sub(centers[i],centers[adjacent])))
        if not faceted:
            vertices.extend(verts)
            normals.extend([[0,0,0] for _ in verts])
        for tri, outward in faces:
            a,b,c = tri
            n = cross(sub(verts[b],verts[a]),sub(verts[c],verts[a]))
            if math.hypot(*n) < 1e-13:
                continue
            if sum(x*y for x,y in zip(n,outward)) < 0:
                tri = (a,c,b)
                n = tuple(-v for v in n)
            if faceted:
                for k in tri:
                    indices.append(len(vertices))
                    vertices.append(verts[k])
                    normals.append(unit(n))
            else:
                for k in tri:
                    indices.append(start+k)
                    for d in range(3):
                        normals[start+k][d] += n[d]

    def tube(self, node, finish, sections, sides=12, flat=False):
        # Each section gives its center and the two radii perpendicular to its tangent.
        rings = []
        for i,(x,y,z,w,h) in enumerate(sections):
            tangent = unit(sub(sections[min(i+1,len(sections)-1)][:3],sections[max(0,i-1)][:3]))
            ref = (1,0,0) if abs(tangent[0])<.92 else (0,1,0)
            v = unit(cross(tangent,ref))
            u = cross(v,tangent)
            rings.append([tuple((x,y,z)[d]+u[d]*w*math.cos(TAU*j/sides)+v[d]*h*math.sin(TAU*j/sides)
                                for d in range(3)) for j in range(sides)])
        self.loft(node,finish,rings,flat)

    def accessor(self, data, component, kind):
        size = {'VEC4':4,'VEC3':3,'VEC2':2,'SCALAR':1}[kind]
        values = [v for row in data for v in row] if size>1 else data
        while len(self.binary)%4:
            self.binary.append(0)
        offset = len(self.binary)
        fmt = 'f' if component==5126 else 'H'
        self.binary.extend(struct.pack('<'+str(len(values))+fmt, *values))
        self.views.append(dict(buffer=0,byteOffset=offset,byteLength=len(self.binary)-offset))
        acc = dict(bufferView=len(self.views)-1,componentType=component,count=len(data),type=kind)
        if size==3:
            acc['min'],acc['max'] = [min(axis) for axis in zip(*data)],[max(axis) for axis in zip(*data)]
        self.accessors.append(acc)
        return len(self.accessors)-1

    def save(self, name):
        materials = []
        images=[]
        textures=[]
        for label,(col,metal,rough) in FINISH.items():
            mat = dict(name=label,pbrMetallicRoughness=dict(baseColorFactor=[*col,1],metallicFactor=metal,roughnessFactor=rough))
            if label in ('Walnut','Bookbinder leather'):
                while len(self.binary)%4:
                    self.binary.append(0)
                pigment = TEXTURES / Path(name).stem / (label.lower().replace(' ', '-') + '.png')
                png = pigment.read_bytes()
                self.views.append(dict(buffer=0,byteOffset=len(self.binary),byteLength=len(png)))
                self.binary.extend(png)
                mat['pbrMetallicRoughness']['baseColorTexture']=dict(index=len(textures))
                textures.append(dict(source=len(images)))
                images.append(dict(name=label,mimeType='image/png',bufferView=len(self.views)-1))
            if label in ('Moonstone','Sunstone'):
                mat['emissiveFactor'] = [v*.48 for v in col]
            materials.append(mat)
        for (node,finish),(positions,normals,indices) in self.parts.items():
            if 'mesh' not in self.nodes[node]:
                self.nodes[node]['mesh'] = len(self.meshes)
                self.meshes.append(dict(name=self.nodes[node]['name'],primitives=[]))
            attrs=dict(POSITION=self.accessor(positions,5126,'VEC3'),NORMAL=self.accessor([unit(n) for n in normals],5126,'VEC3'))
            if finish in ('Walnut','Bookbinder leather'):
                uv=[(x*14+y*6,z*3) if 'quill' in name else (x*13+z*4,y*3.2) for x,y,z in positions]
                attrs['TEXCOORD_0']=self.accessor(uv,5126,'VEC2')
            if finish in ('Moonstone','Sunstone'):
                colors=[]
                for nx,ny,nz in map(unit,normals):
                    facet=.66+.32*math.sin(13*nx+9*ny+5*nz)
                    colors.append((facet,.58+.42*facet,1.0))
                attrs['COLOR_0']=self.accessor(colors,5126,'VEC3')
            primitive=dict(attributes=attrs,indices=self.accessor(indices,5123,'SCALAR'),material=list(FINISH).index(finish))
            self.meshes[self.nodes[node]['mesh']]['primitives'].append(primitive)
        doc=dict(asset=dict(version='2.0',generator='Oblivion Archive'),scene=0,scenes=[dict(nodes=[0])],nodes=self.nodes,
                 meshes=self.meshes,materials=materials,images=images,textures=textures,accessors=self.accessors,bufferViews=self.views,buffers=[dict(byteLength=len(self.binary))])
        meta=json.dumps(doc,separators=(',',':')).encode()
        meta += b' '*(-len(meta)%4)
        self.binary.extend(bytes(-len(self.binary)%4))
        blob=struct.pack('<4sII',b'glTF',2,28+len(meta)+len(self.binary))+struct.pack('<I4s',len(meta),b'JSON')+meta
        (OUTPUT/name).write_bytes(blob+struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary)


def spindle(model, node, finish, profile, sides=20, flat=False):
    model.tube(node,finish,[(0,0,z,r,r) for z,r in profile],sides,flat)


def spiral(model,node,axis,start,end,radius,turns,thickness):
    sections=[]
    for i in range(turns*18+1):
        t = i/(turns*18)
        a,b = radius*math.cos(TAU*turns*t),radius*math.sin(TAU*turns*t)
        h=start+(end-start)*t
        p=(a,b,h) if axis=='z' else (a,h,b)
        sections.append((*p,thickness,thickness))
    model.tube(node,'Bookbinder leather',sections,6)


def wand():
    m=Model()
    body=m.node('Vesper quill')
    m.node('Grip',body,(0,0,-.15))
    m.node('Focus',body,(0,0,.35))
    spindle(m,body,'Walnut',[(-.295,.006),(-.284,.026),(-.263,.031),(-.246,.022),(-.08,.022),
        (-.058,.031),(-.035,.027),(.04,.020),(.115,.021),(.155,.029),(.172,.028)],24)
    spindle(m,body,'Bookbinder leather',[(-.249,.023),(-.238,.026),(-.1,.026),(-.083,.023)])
    spiral(m,body,'z',-.237,-.095,.0253,8,.0022)
    for z,r in [(-.266,.032),(-.246,.027),(-.083,.028),(-.066,.032),(.12,.025),(.151,.033)]:
        spindle(m,body,'Gilt edges',[(z-.005,r-.004),(z-.003,r),(z+.003,r),(z+.005,r-.004)])
    spindle(m,body,'Peacock enamel',[(-.065,.03),(-.057,.032),(-.041,.031),(-.035,.025)])
    # Three open quill barbs cage the stone; the gaps leave its silhouette visible.
    for i in range(3):
        angle=i*TAU/3+.4
        for finish,offset,width in [('Patinated brass',0,1),('Gilt edges',.004,.32)]:
            sections=[]
            for z,r,w,h,twist in [(.14,.018,.010,.006,0),(.17,.029,.019,.008,.10),(.20,.049,.024,.009,.24),
                        (.238,.058,.019,.007,.42),(.27,.052,.013,.006,.62),(.302,.037,.008,.003,.78),(.317,.029,.001,.001,.9)]:
                a=angle+twist
                sections.append(((r+offset)*math.cos(a),(r+offset)*math.sin(a),z,w*width,h*width))
            m.tube(body,finish,sections,10)
        # Long twisting inlays bind the dark stem to the crown.
        stem=[]
        for j in range(19):
            t=j/18
            a=angle-.75+t*.75
            r=.020+.009*(abs(t-.50)*2)**2
            stem.append((r*math.cos(a),r*math.sin(a),-.035+.18*t,.0026,.0026))
        m.tube(body,'Gilt edges',stem,6)
    spindle(m,body,'Moonstone',[(.164,.002),(.206,.025),(.258,.034),(.289,.029),(.35,.0003)],7,True)
    spindle(m,body,'Moonstone',[(-.305,.0004),(-.296,.013),(-.286,.017),(-.281,.009)],8,True)
    m.save('vesper-quill.glb')


def bow():
    m=Model()
    body=m.node('Dawn folio')
    m.node('Grip',body)
    # The shelf sits above the grip on the archer's inside (glTF -X).
    m.node('ArrowRest',body,(-.045,.080,0))
    m.tube(body,'Patinated brass',[(0,.064,0,.022,.015),(-.025,.065,0,.017,.009),
        (-.045,.072,0,.017,.005),(-.053,.075,0,.013,.004)],12)
    m.tube(body,'Bookbinder leather',[(0,y,0,r,r*.88) for y,r in [(-.105,.021),(-.086,.029),(0,.025),(.085,.029),(.105,.021)]],18)
    spiral(m,body,'y',-.078,.078,.025,8,.0023)
    for side,label in [(1,'Upper'),(-1,'Lower')]:
        limb=m.node(label+'Limb',body,(0,side*.085,0))
        # Broad laminated inner limb narrows into an ivory, forward-turning nock.
        profile=[(0,.0,.031,.023),(.031,.015,.043,.025),(.068,.022,.047,.024),(.105,.015,.042,.021),
                 (.145,-.003,.038,.016),(.21,-.046,.031,.014),(.269,-.095,.024,.011),
                 (.31,-.141,.016,.010),(.343,-.151,.014,.009),(.379,-.13,.010,.008),(.392,-.12,.003,.004)]
        m.tube(limb,'Walnut',[(0,side*y,z,w,h) for y,z,w,h in profile],16)
        for sign in (-1,1):
            edge=[(sign*w*.83,side*y,z,w*.15,h*.60) for y,z,w,h in profile]
            m.tube(limb,'Gilt edges',edge,8)
        for face in (-1,1):
            enamel=[(0,side*y,z+face*h*.90,w*.72,.0038) for y,z,w,h in profile[1:-2]]
            m.tube(limb,'Peacock enamel',enamel,10)
            # A feather vein with paired barbs follows both faces of each limb.
            vein=[(0,side*y,z+face*(h+.004),.0023,.002) for y,z,w,h in profile[1:-2]]
            m.tube(limb,'Gilt edges',vein,6)
            for i in [2,3,4,5]:
                y,z,w,h=profile[i]
                ny,nz,_,nh=profile[i+1]
                for sign in (-1,1):
                    m.tube(limb,'Gilt edges',[(0,side*y,z+face*(h+.004),.0022,.002),
                        (sign*w*.51,side*(y*.45+ny*.55),z*.45+nz*.55+face*(h*.45+nh*.55+.002),.001,.001)],6)
        m.tube(limb,'Horn',[(0,side*y,z,w*1.08,h*1.15) for y,z,w,h in profile[-4:]],12)
        for y in (.005,.020):
            m.tube(limb,'Patinated brass',[(0,side*(y+k),.004+k,.035,.026) for k in (-.003,.003)],16)
        m.node(label+'Nock',limb,(0,side*.379,-.13))
    arrow=m.node('LightArrow',body)
    spindle(m,arrow,'Horn',[(0,.002),(.014,.006),(.53,.0045),(.55,.006)],12)
    spindle(m,arrow,'Gilt edges',[(.52,.006),(.529,.009),(.545,.009),(.551,.006)])
    spindle(m,arrow,'Sunstone',[(.541,.003),(.557,.021),(.576,.018),(.625,.0002)],5,True)
    for i in range(3):
        a=i*TAU/3
        vane=[(r*math.cos(a),r*math.sin(a),z,w,w*.38) for z,r,w in
              [(.018,.008,.002),(.027,.021,.008),(.042,.024,.010),(.081,.010,.005),(.093,.005,.001)]]
        m.tube(arrow,'Peacock enamel',vane,8)
    m.node('ArrowPoint',arrow,(0,0,.625))
    m.save('dawn-folio.glb')


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    wand()
    bow()
