"""Build the chapter's glTF character and scenery from the approved art sheets."""
import json
import math
import runpy
import struct
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'asset-sources/Art/Chapter1'
OUT = ROOT / 'public/assets/chapter-art'
ORIGINAL = ROOT / 'asset-sources/Art/ThirdParty/KayKit'
geometry = runpy.run_path(str(Path(__file__).with_name('model-archive-tools.py')))
Model, unit = geometry['Model'], geometry['unit']
sin, cos, pi = math.sin, math.cos, math.pi

FINISH = {
    'Indigo wool': ('cloth', [1,1,1], 0), 'Hood blue': ('cloth',[.55,1,1],0),
    'Oxblood leather': ('leather',[1,1,1],0), 'Walnut wood': ('walnut',[1,1,1],0),
    'Carved slate': ('slate',[.82,.85,.88],0), 'Warm porcelain mask': (None,[.76,.65,.48],0),
    'Old brass metal': (None,[.65,.36,.12],.66), 'Polished brass metal': (None,[.89,.59,.25],.81),
    'Ivory leaves': (None,[.68,.51,.30],0), 'Dark ink': (None,[.027,.019,.023],0),
    'Teal binding': (None,[.04,.14,.14],0), 'Linen sleeve': ('linen',[1,1,1],0),
    'Moss folio': ('linen',[.15,.235,.15],0),'Peacock folio': ('linen',[.09,.22,.24],0),
}

ROUGHNESS = {
    'Walnut wood': .53, 'Carved slate': .82, 'Oxblood leather': .66,
    'Old brass metal': .46, 'Polished brass metal': .29, 'Warm porcelain mask': .38,
}
RELIEF = {'walnut': .42, 'slate': .58}


def textures():
    atlas=Image.open(ART/'material-study.webp').convert('RGB')
    w,h=atlas.size
    for i,name in enumerate(['cloth','leather','walnut','slate']):
        x,y=i%2*w//2,i//2*h//2
        tile=atlas.crop((x+2,y+2,x+w//2-2,y+h//2-2))
        tile.resize((512,512),Image.Resampling.LANCZOS).save(OUT/(name+'.jpg'),quality=91)
    Image.open(ART/'scribe-face.webp').convert('RGB').resize((512,512),Image.Resampling.LANCZOS).save(OUT/'face.jpg',quality=92)
    fibers=ImageOps.autocontrast(Image.open(OUT/'cloth.jpg').convert('L'),cutoff=1)
    ImageOps.colorize(fibers,'#8d7862','#e5d6b5').save(OUT/'linen.jpg',quality=88)
    runner=ImageOps.colorize(fibers.resize((512,832)),'#451c26','#9b5550')
    d=ImageDraw.Draw(runner)
    for b,color,width in [(9,'#442c28',7),(18,'#c09a61',4),(25,'#a2784d',2),(49,'#b98955',3)]:
        d.rectangle((b,b,511-b,831-b),outline=color,width=width)
    for side in [37,474]:
        for y in range(46,810,26):
            d.line([(side,y-9),(side+6,y),(side,y+9),(side-6,y),(side,y-9)],fill='#b88d5c',width=2)
    runner.save(OUT/'reading-runner.jpg',quality=89)


class ChapterModel(Model):
    def __init__(self, source=None):
        super().__init__()
        self.doc={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],
                  'materials':[],'textures':[],'images':[],'samplers':[]}
        if source:
            raw=source.read_bytes()
            length=struct.unpack_from('<I',raw,12)[0]
            self.doc=json.loads(raw[20:20+length])
            self.binary=bytearray(raw[28+length:])
            self.nodes=self.doc['nodes']
            self.meshes=self.doc['meshes']
            self.views=self.doc['bufferViews']
            self.accessors=self.doc['accessors']
        self.doc['asset']['generator']='Oblivion Archive · chapter art'
        self.finish={}
        self.head_joint=None

    def texture(self, uri):
        sampler={'magFilter':9729,'minFilter':9987,'wrapS':33648,'wrapT':33648}
        samplers=self.doc['samplers']
        if sampler not in samplers:
            samplers.append(sampler)
        image={'uri':uri}
        if image not in self.doc['images']:
            self.doc['images'].append(image)
        texture={'sampler':samplers.index(sampler),'source':self.doc['images'].index(image)}
        if texture not in self.doc['textures']:
            self.doc['textures'].append(texture)
        return self.doc['textures'].index(texture)

    def material(self,name):
        if name in self.finish:
            return self.finish[name]
        tex,col,metal=FINISH[name]
        pbr={'baseColorFactor':[*col,1],'roughnessFactor':ROUGHNESS.get(name,.91),'metallicFactor':metal}
        if tex:
            pbr['baseColorTexture']={'index':self.texture(tex+'.jpg')}
        mat={'name':name,'pbrMetallicRoughness':pbr,'doubleSided':True}
        if tex in RELIEF:
            mat['normalTexture']={'index':self.texture(tex+'-normal.png'),'scale':RELIEF[tex]}
        self.finish[name]=len(self.doc['materials'])
        self.doc['materials'].append(mat)
        return self.finish[name]

    def quad(self,node,mat,points):
        p,n,ind=self.parts.setdefault((node,mat),([],[],[]))
        normal=unit(geometry['cross'](geometry['sub'](points[1],points[0]),geometry['sub'](points[2],points[0])))
        first=len(p)
        p.extend(points);n.extend([normal]*4)
        ind.extend(first+k for k in (0,1,2,0,2,3))

    def save_asset(self,name):
        for (node,material),(p,n,idx) in self.parts.items():
            if 'mesh' not in self.nodes[node]:
                self.nodes[node]['mesh']=len(self.meshes)
                self.meshes.append({'name':self.nodes[node]['name'],'primitives':[]})
            normals=[unit(a) for a in n]
            attrs={'POSITION':self.accessor(p,5126,'VEC3'),'NORMAL':self.accessor(normals,5126,'VEC3')}
            if FINISH[material][0]:
                uv=[]
                for (x,y,z),(nx,ny,nz) in zip(p,normals):
                    if abs(ny)>max(abs(nx),abs(nz)):
                        uv.append((x,z))
                    elif abs(nx)>abs(nz):
                        uv.append((z,-y))
                    else:
                        uv.append((x,-y))
                attrs['TEXCOORD_0']=self.accessor(uv,5126,'VEC2')
            if material=='Warm porcelain mask':
                # The mask replaces the head mesh in bind coordinates.
                attrs['WEIGHTS_0']=self._vec4((1.,0.,0.,0.),len(p),'4f',5126)
                attrs['JOINTS_0']=self._vec4((self.head_joint,0,0,0),len(p),'4B',5121)
            self.meshes[self.nodes[node]['mesh']]['primitives'].append({'attributes':attrs,
                'material':self.material(material),'indices':self.accessor(idx,5123,'SCALAR')})
        self.doc.update(nodes=self.nodes, meshes=self.meshes, bufferViews=self.views, accessors=self.accessors)
        self.binary.extend(bytes(-len(self.binary)%4))
        self.doc['buffers']=[{'byteLength':len(self.binary)}]
        meta=json.dumps(self.doc,separators=(',',':')).encode()
        meta+=b' '*(-len(meta)%4)
        header=struct.pack('<4sII',b'glTF',2,28+len(meta)+len(self.binary))
        (OUT/(name+'.glb')).write_bytes(header+struct.pack('<I4s',len(meta),b'JSON')+meta
                                        +struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary)

    def _vec4(self,value,count,fmt,component):
        self.binary.extend(bytes(-len(self.binary)%4))
        data=struct.pack('<'+fmt,*value)*count
        self.views.append({'buffer':0,'byteOffset':len(self.binary),'byteLength':len(data)})
        self.binary.extend(data)
        self.accessors.append({'bufferView':len(self.views)-1,'componentType':component,'count':count,'type':'VEC4'})
        return len(self.accessors)-1


WOOD, RED, BRASS, GOLD='Walnut wood','Oxblood leather','Old brass metal','Polished brass metal'
WOOL, STONE, PAGES='Indigo wool','Carved slate','Ivory leaves'


def block(m,node,mat,center,size,bevel=.012):
    x,y,z=center
    w,h,d=[v/2 for v in size]
    b=min(bevel,w*.45,h*.45,d*.45)
    rings=[]
    for dy,inset in [(-h,b),(-h+b,0),(h-b,0),(h,b)]:
        a,c=w-inset,d-inset
        k=min(b,a*.25,c*.25)
        rings.append([(x+u,y+dy,z+v) for u,v in
                      [(-a+k,-c),(a-k,-c),(a,-c+k),(a,c-k),(a-k,c),(-a+k,c),(-a,c-k),(-a,-c+k)]])
    m.loft(node,mat,rings,True)


def plate(m,node,mat,outline,z,thick=.012):
    rings=[[(x,y,z+dz) for x,y in outline] for dz in (0,thick)]
    m.loft(node,mat,rings,True)


def diamond(m,node,x,y,z,w,h):
    plate(m,node,BRASS,[(x,y+h),(x+w,y),(x,y-h),(x-w,y)],z)
    plate(m,node,GOLD,[(x,y+h*.65),(x+w*.65,y),(x,y-h*.65),(x-w*.65,y)],z-.005,.005)


def cord(m,node,mat,points,r=.009):
    m.tube(node,mat,[(*p,r,r) for p in points],6)


def lathe(m,node,mat,x,z,profile):
    rings=[[(x+r*cos(i*pi/12),y,z+r*sin(i*pi/12)) for i in range(24)] for y,r in profile]
    m.loft(node,mat,rings)


def simple_box(m,node,mat,x,y,z,w,h,d):
    points=[(x+a*w/2,y+b*h/2,z+c*d/2) for c in [-1,1] for b in [-1,1] for a in [-1,1]]
    for face in [(0,2,3,1),(4,5,7,6),(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3)]:
        m.quad(node,mat,[points[i] for i in face])


def bookshelf():
    m=ChapterModel();n=m.node('Walnut folio bookcase')
    block(m,n,WOOD,(0,1.47,-.245),(2.02,2.75,.076))
    for x in [-.95,.95]:
        block(m,n,WOOD,(x,1.44,.005),(.129,2.77,.55))
        for y in [.18,1.39,2.69]:
            block(m,n,BRASS,(x,y,.281),(.145,.077,.026))
    for y,thick,w in [(.08,.15,2.07),(.60,.091,1.87),(1.34,.078,1.87),(2.07,.078,1.87),(2.82,.13,2.1)]:
        block(m,n,WOOD,(0,y,0),(w,thick,.60))
    for x in [-.45,.45]:
        block(m,n,RED,(x,.349,.19),(.82,.385,.07))
        block(m,n,BRASS,(x,.36,.235),(.12,.026,.025))
    bindings=[RED,WOOD,'Peacock folio',RED,'Moss folio',WOOD]
    for row,y in enumerate([.65,1.385,2.115]):
        cursor=-.855
        for i in range(12):
            w=.096+.019*((7*i+row)%5)
            h=.42+.046*((3*i+2*row)%5)
            x=cursor+w/2;cursor+=w+.013
            z=.19+.013*((i+row)%3)
            mat=bindings[(i+row*2)%len(bindings)]
            simple_box(m,n,PAGES,x,y+h/2,z-.13,w-.013,h-.019,.25)
            simple_box(m,n,mat,x,y+h/2,z,w,h,.036)
            for side in [-1,1]:
                simple_box(m,n,mat,x+side*(w/2-.004),y+h/2,z-.13,.008,h,.27)
            for frac in [.16,.80,.86]:
                simple_box(m,n,BRASS,x,y+h*frac,z+.021,w*.96,.010,.009)
            simple_box(m,n,PAGES if i%4==0 else BRASS,x,y+h*.62,z+.020,w*.57,.038,.007)
    m.save_asset('folio-bookcase')


def counter(m,node,w=2.50,h=1.26,d=1.17):
    base=d/2
    block(m,node,WOOD,(0,h*.52,0),(w-.10,h*.82,d-.12))
    for y,hw,hd,th in [(.09,w-.05,d-.04,.16),(.205,w-.09,d-.085,.07),(h-.15,w-.06,d-.055,.08),(h-.064,w,d,.128)]:
        block(m,node,WOOD,(0,y,0),(hw,th,hd),.023)
    for x in [-.345*w,-.115*w,.115*w,.345*w]:
        block(m,node,RED,(x,h*.52,-base+.033),(w*.197,h*.55,.065))
        # Recessed panel framed with raised wood moulding and four gilt pins.
        for sign in [-1,1]:
            block(m,node,WOOD,(x+sign*w*.097,h*.52,-base+.001),(.032,h*.59,.038))
            block(m,node,WOOD,(x,h*.52+sign*h*.281,-base+.001),(w*.205,.032,.038))
            for edge in [-1,1]:
                diamond(m,node,x+sign*w*.083,h*.52+edge*h*.242,-base-.012,.013,.019)
    for x in [-w*.46,0,w*.46]:
        block(m,node,WOOD,(x,h*.51,-base+.007),(.09,h*.72,.065))
        for y in [.23,h-.16]:
            block(m,node,BRASS,(x,y,-base-.03),(.115,.034,.025))
    diamond(m,node,0,h*.61,-base-.063,.095,.145)
    plate(m,node,'Dark ink',[(-.009,h*.63),(.009,h*.63),(.005,h*.59),(.012,h*.56),(-.012,h*.56)],-base-.071,.008)
    for x in [-1,1]:
        for z in [-1,1]:
            block(m,node,BRASS,(x*(w/2-.077),h-.058,z*(d/2-.041)),(.135,.093,.09))
    # Cut the apron silhouette into small scallops between the feet.
    for i in range(10):
        x=-w*.45+i*w*.09
        plate(m,node,WOOD,[(x,.17),(x+w*.09,.17),(x+w*.09,.045),(x+w*.065,.067),
              (x+w*.045,.093),(x+w*.024,.067),(x,.045)],-base+.014,.048)


def scenery():
    m=ChapterModel();node=m.node('Walnut archivist counter')
    counter(m,node)
    for i,(x,z) in enumerate([(-.89,.12),(-.83,.14),(-.78,.13)]):
        y=1.292+i*.062
        for offset,mat,th in [(-.023,RED,.013),(0,PAGES,.037),(.023,RED,.013)]:
            block(m,node,mat,(x,y+offset,z),(.39,th,.25))
    m.save_asset('reading-counter')
    m=ChapterModel();node=m.node('Carved slate rune plinth')
    for y,w,h,d in [(.055,.42,.11,.50),(.14,.37,.07,.44),(.37,.30,.43,.36),(.61,.35,.065,.42),(.686,.42,.10,.50)]:
        block(m,node,STONE,(0,y,0),(w,h,d),.018)
    diamond(m,node,0,.38,-.187,.097,.148)
    m.save_asset('rune-plinth')
    m=ChapterModel();node=m.node('Walnut seal gate')
    for i in range(8):
        x=(i-3.5)*.323
        block(m,node,WOOD,(x,1.47,0),(.32,2.94,.15),.012)
    for side in [-1,1]:
        for y in [.16,1.55,2.81]:
            block(m,node,BRASS,(0,y,side*.088),(2.61,.09,.034))
            for x in [-1.13,-.58,.58,1.13]:
                block(m,node,GOLD,(x,y,side*.109),(.033,.032,.014))
        for x in [-1.25,0,1.25]:
            block(m,node,BRASS,(x,1.47,side*.081),(.057,2.90,.025))
    diamond(m,node,0,1.55,-.13,.215,.277)
    m.save_asset('seal-gate')
    m=ChapterModel();node=m.node('Walnut signature lectern')
    counter(m,node,1.88,1.14,.85)
    # Backboard faces the entering player. The sun repeats the metalwork on the gate.
    block(m,node,WOOD,(0,1.92,.32),(1.42,1.65,.10))
    block(m,node,RED,(0,1.96,.257),(1.23,1.43,.03))
    for x in [-.69,.69]:
        block(m,node,BRASS,(x,1.94,.24),(.047,1.59,.043))
    for y in [1.16,2.72]:
        block(m,node,BRASS,(0,y,.24),(1.42,.05,.043))
    for i in range(14):
        a=i*pi/7
        def ray(r,b): return (r*sin(a)+b*cos(a),2.18+r*cos(a)-b*sin(a))
        plate(m,node,BRASS,[ray(.165,-.039),ray(.395,0),ray(.165,.044)],.204,.028)
    plate(m,node,GOLD,[(.161*sin(i*pi/16),2.18+.161*cos(i*pi/16)) for i in range(32)],.182,.044)
    m.save_asset('vault-lectern')
    m=ChapterModel();node=m.node('Carved slate corridor pier')
    for xw,y,zdepth,h in [(.24,.10,.40,.2),(.235,.225,.39,.065),(.18,1.72,.33,2.94),
                         (.212,3.17,.35,.08),(.235,3.27,.38,.12),(.25,3.46,.4,.25)]:
        block(m,node,STONE,(0,y,0),(xw,h,zdepth),.014)
    for y in [.27,2.96,3.24]:
        block(m,node,BRASS,(0,y,0),(.218,.025,.366))
    m.save_asset('corridor-pier')
    m=ChapterModel();node=m.node('Fractured slate archivolt')
    # The outside envelope follows the existing rubble collider. Eroded edges break its silhouette.
    outline=[(-.48,-.25),(-.31,-.49),(.17,-.48),(.49,-.24),(.44,.27),(.24,.49),(-.28,.46),(-.49,.23)]
    rings=[]
    for y,s,offset in [(0,.87,0),(.12,1,0),(.65,.98,.017),(.89,.84,.032),(1,.63,.048)]:
        rings.append([(x*s+offset,y-(max(x,0)*.32 if y>.8 else 0),z*s) for x,z in outline])
    m.loft(node,STONE,rings,True)
    m.save_asset('fallen-stone')


def scribe_mask(m, head_mesh, head_bone):
    # Profile of the shell in head-local coordinates: height, half-width,
    # center depth, edge depth. The center ridge sits inside the hood opening.
    profile = [
        (.052, .062, .188, .126), (.114, .137, .236, .138),
        (.214, .201, .267, .148), (.331, .238, .318, .158),
        (.402, .250, .298, .168), (.446, .249, .285, .174),
        (.521, .242, .265, .177), (.601, .211, .246, .176),
        (.667, .152, .223, .172), (.704, .072, .192, .162),
    ]
    columns = [-1, -.76, -.23, 0, .23, .76, 1]
    surface = [
        [(width * u, y, edge + (center - edge) * (1 - abs(u) ** 1.55)) for u in columns]
        for y, width, center, edge in profile
    ]
    lining = m.node('Mask eye recesses', head_bone)
    crest = m.node('Mask brass inlay', head_bone)

    def shell(points):
        m.quad(head_mesh, 'Warm porcelain mask', [(x, 1.2414255 + y, z) for x, y, z in points])

    def recessed(point):
        x, y, z = point
        return (x, y, z - .025)

    for row, (bottom, top) in enumerate(zip(surface, surface[1:])):
        for column in range(len(columns) - 1):
            quad = [bottom[column], bottom[column + 1], top[column + 1], top[column]]
            if row == 4 and column in (1, 4):
                back = [recessed(point) for point in quad]
                m.quad(lining, 'Dark ink', back)
                for left, right in ((0, 1), (1, 2), (2, 3), (3, 0)):
                    shell([quad[left], quad[right], back[right], back[left]])
            else:
                shell(quad)
    edge = surface[0] + [row[-1] for row in surface[1:]] + surface[-1][-2::-1] + [
        row[0] for row in reversed(surface[1:-1])
    ]
    for a, b in zip(edge, edge[1:] + edge[:1]):
        shell([a, b, recessed(b), recessed(a)])
    m.quad(crest, BRASS, [(0, .623, .243), (.028, .572, .251), (0, .531, .267), (-.028, .572, .251)])


def scribe():
    m=ChapterModel(ORIGINAL/'Rogue_Hooded.glb')
    names={n['name']:i for i,n in enumerate(m.nodes)}
    # Retain the skinned limbs, their hand sockets and locomotion clips.
    # The new head, mantle and field equipment replace the rogue's stock hood, cape and weapons.
    for n in m.nodes:
        if n['name'] in ['Knife_Offhand','Knife','1H_Crossbow','2H_Crossbow','Throwable','Rogue_Cape']:
            n.pop('mesh',None)
    palette=(ORIGINAL/'scribe-palette.png').read_bytes()
    m.binary.extend(bytes(-len(m.binary)%4))
    m.views.append({'buffer':0,'byteOffset':len(m.binary),'byteLength':len(palette)})
    m.binary.extend(palette)
    m.doc['images'][0]={'name':'Scribe base palette','mimeType':'image/png','bufferView':len(m.views)-1}
    def unpack(index,fmt):
        a=m.accessors[index];v=m.views[a['bufferView']]
        start=v.get('byteOffset',0)+a.get('byteOffset',0)
        stride=v.get('byteStride',struct.calcsize(fmt))
        return [struct.unpack_from(fmt,m.binary,start+k*stride) for k in range(a['count'])]
    # Give the existing weighted limbs real cloth/leather UVs instead of flat palette coordinates.
    for part in ['Body','ArmLeft','ArmRight','LegLeft','LegRight']:
        mesh=m.meshes[m.nodes[names['Rogue_'+part]]['mesh']]
        prim=mesh['primitives'][0]
        attrs=prim['attributes']
        positions=unpack(attrs['POSITION'],'<3f')
        normals=unpack(attrs['NORMAL'],'<3f')
        uv=[((z if abs(nx)>abs(nz) else x)*2.4,-y*2.4) for (x,y,z),(nx,_,nz) in zip(positions,normals)]
        attrs['TEXCOORD_0']=m.accessor(uv,5126,'VEC2')
        components={5123:'<H',5125:'<I'}
        indices=[v[0] for v in unpack(prim['indices'],components[m.accessors[prim['indices']]['componentType']])]
        groups={}
        for p in range(0,len(indices),3):
            tri=indices[p:p+3]
            x=sum(abs(positions[i][0]) for i in tri)/3
            y=sum(positions[i][1] for i in tri)/3
            mat=WOOL if part=='Body' or part.startswith('Leg') and y>.245 else RED
            if part.startswith('Arm') and x<.62:mat='Linen sleeve'
            groups.setdefault(mat,[]).extend(tri)
        mesh['primitives']=[dict(prim,material=m.material(mat),indices=m.accessor(tri,5123,'SCALAR')) for mat,tri in groups.items()]
    head=names['Rogue_Head_Hooded']
    del m.nodes[head]['mesh']
    m.head_joint=m.doc['skins'][0]['joints'].index(names['head'])
    scribe_mask(m, head, names['head'])
    hood=m.node('Folded petrol hood',names['head'])
    opening=[(0,.78),(.14,.68),(.247,.565),(.294,.42),(.307,.24),(.287,.108),
             (.22,.036),(.12,-.014),(0,-.037),(-.12,-.014),(-.22,.036),(-.291,.106),
             (-.315,.247),(-.295,.415),(-.246,.565),(-.142,.684)]
    def hood_ring(scale,z,raise_y,shift=0):
        return [(x*scale+shift,.32+(y-.32)*scale+raise_y,z+.044*(y/.78)) for x,y in opening]
    rings=[hood_ring(1,.205,0),hood_ring(1.105,.066,.016),
           hood_ring(1.03,-.125,.04),hood_ring(.79,-.25,.084,-.018),hood_ring(.26,-.375,.19,-.056),
           hood_ring(.024,-.446,.228,-.105)]
    for front,back in zip(rings,rings[1:]):
        for i in range(len(opening)):
            j=(i+1)%len(opening)
            m.quad(hood,'Hood blue',[front[i],front[j],back[j],back[i]])
    lip=hood_ring(.95,.195,0)
    for i in range(len(opening)):
        j=(i+1)%len(opening)
        m.quad(hood,'Dark ink',[rings[0][i],lip[i],lip[j],rings[0][j]])
    cord(m,hood,BRASS,rings[0]+[rings[0][0]],.007)
    cord(m,hood,'Teal binding',[r[0] for r in rings],.012)
    mantle=m.node('Split indigo quill mantle',names['chest'])
    def mantle_point(a,t,extra=0):
        fold=1+.043*cos(a*8)*t
        rx=(.221+.265*t+extra)*fold
        rz=(.173+.206*t+extra)*fold
        split=.081*math.exp(-((a-pi)/.095)**2)*t
        y=.30-t*(.47+.10*(1-cos(a))/2+.028*cos(6*a))+split
        return (rx*sin(a),y,rz*cos(a))
    angles=[.065+(2*pi-.13)*i/56 for i in range(57)]
    for low,high,mat in [(0,.16,'Hood blue'),(.16,.78,WOOL),(.78,.82,BRASS),(.82,.925,WOOL),
                          (.925,.96,GOLD),(.96,1,WOOL)]:
        for a,b in zip(angles,angles[1:]):
            m.quad(mantle,mat,[mantle_point(a,high),mantle_point(b,high),mantle_point(b,low),mantle_point(a,low)])
    # Engraved feather lies on the flaring back surface, with a real raised midrib.
    def plume(t,s=0):
        x=-.087+.157*t+s
        y=-.168+.375*t
        z=-.192-.216*((.30-y)/.59)-.025
        return (x,y,z)
    cord(m,mantle,GOLD,[plume(i/12) for i in range(13)],.009)
    for i in range(7):
        t=.11+i*.105
        for side in [-1,1]:
            wing=side*.07*sin(pi*(t+.045))**.65
            m.quad(mantle,BRASS if side<0 else GOLD,[plume(t),plume(t+.048),plume(t+.16,wing),plume(t+.081,wing*.79)])
    clasp=m.node('Shoulder clasp',names['chest'])
    lathe(m,clasp,GOLD,0,.273,[(.16,.038),(.19,.048),(.211,.030)])
    book=m.node('Oxblood field ledger',names['chest'],(.236,-.31,-.318))
    book_angle=-.14
    m.nodes[book]['rotation']=[0,0,sin(book_angle/2),cos(book_angle/2)]
    block(m,book,PAGES,(0,0,0),(.32,.407,.096))
    for z in [-.059,.059]:
        block(m,book,RED,(0,0,z),(.357,.44,.026))
    for j in range(4):
        block(m,book,BRASS,(-.173,(j-1.5)*.09,0),(.02,.022,.139))
    block(m,book,RED,(0,.009,-.081),(.362,.056,.027))
    diamond(m,book,.021,.009,-.101,.046,.054)
    for sign in [-1,1]:
        for side in [-1,1]:
            x,y=.173*sign,.212*side
            plate(m,book,BRASS,[(x,y),(x-sign*.066,y),(x-sign*.056,y-side*.018),(x,y-side*.065)],-.078,.012)
    quiver=m.node('Leather arrow quiver',names['chest'],(-.28,-.04,-.28))
    tilt=.29
    m.nodes[quiver]['rotation']=[0,0,sin(tilt/2),cos(tilt/2)]
    lathe(m,quiver,RED,0,0,[(-.39,.047),(-.34,.073),(.19,.084),(.27,.092),(.27,.068),(.13,.066)])
    for y,r in [(-.31,.077),(.205,.091),(.253,.098)]:
        lathe(m,quiver,BRASS,0,0,[(y-.014,r),(y+.014,r)])
    for x,z,height in [(-.032,0,.429),(.025,-.023,.406),(.023,.029,.448)]:
        lathe(m,quiver,WOOD,x,z,[(.16,.009),(height,.009)])
        for side in [-1,1]:
            m.quad(quiver,PAGES,[(x,height-.085,z),(x+side*.022,height-.057,z),
                                   (x+side*.022,height-.018,z),(x,height-.009,z)])
    m.node('QuiverMouth',quiver,(0,.39,0))
    # Sling follows the back of the torso below the mantle and terminates at the ledger.
    points=[(-.22,.22,-.18),(-.14,.084,-.24),(-.045,-.082,-.302),(.086,-.212,-.33),(.204,-.31,-.333)]
    for a,b in zip(points,points[1:]):
        m.quad(mantle,RED,[a,(a[0]+.042,a[1]+.012,a[2]-.005),(b[0]+.042,b[1]+.012,b[2]-.005),b])
    for side in ['l','r']:
        sleeve=m.node('Linen upper sleeve '+side,names['upperarm.'+side])
        lathe(m,sleeve,'Linen sleeve',0,0,[(-.028,.111),(.01,.150),(.068,.155),(.119,.145),(.175,.128),(.212,.107),(.238,.085)])
        cuff=m.node('Bookbinder cuff '+side,names['lowerarm.'+side])
        lathe(m,cuff,'Teal binding',0,0,[(.097,.099),(.108,.103),(.225,.088),(.244,.083)])
        lathe(m,cuff,BRASS,0,0,[(.109,.105),(.119,.105)])
    m.save_asset('archive-scribe')


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    textures()
    scribe()
    scenery()
    bookshelf()
