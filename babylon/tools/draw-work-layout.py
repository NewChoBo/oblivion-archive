"""Draw and check the current work routes against the Chapter 1 survey (metres)."""
from html import escape
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'docs/art/chapter-1'
LEVELS = ROOT / 'shared/levels'
read = lambda path: json.loads(path.read_text('utf8'))
from citadel_sources import data, SOURCES
proposal = SOURCES['workLayout']
site = data('fortress-exterior.json')
spec = data('citadel-construction.json')
level = data('chapter-1.json')
prefabs = read(LEVELS/'environment-prefabs.json')['prefabs']
contours = json.loads(subprocess.check_output(['node', '--experimental-strip-types','babylon/tools/export-citadel-survey.mjs'],cwd=ROOT))
f, b, r = (proposal[k] for k in ('freight','bindery','reading'))
ink, paper, muted, rust, teal, stone, wood = '#1f3336','#f6f3e9','#536668','#9d4b2f','#236b67','#d5dcd2','#b49371'


def segment_distance(p, a, c):
    dx, dz = c[0]-a[0], c[1]-a[1]
    if dx==dz==0:
        return math.dist(p,a)
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)))
    return math.dist(p,(a[0]+t*dx,a[1]+t*dz))


def distance_to_path(p, path):
    return min(segment_distance(p,a,c) for a,c in zip(path,path[1:]))


def samples(path, spacing=.025):
    for a,c in zip(path,path[1:]):
        n=max(1,math.ceil(math.dist(a,c)/spacing))
        for i in range(n+1):
            yield (a[0]+(c[0]-a[0])*i/n,a[1]+(c[1]-a[1])*i/n)


def polar(t):
    rad=math.radians(t)
    return (f['mast'][0]+f['radius']*math.cos(rad), f['mast'][1]+f['radius']*math.sin(rad))


def outline(x0,x1,z0,z1):
    return [(x0,z0),(x1,z0),(x1,z1),(x0,z1)]


def footprint(x,z,w,d):
    return outline(x-w/2,x+w/2,z-d/2,z+d/2)


def within(p,polygon):
    x,z=p
    return sum((a[1]>z)!=(c[1]>z) and x<a[0]+(z-a[1])*(c[0]-a[0])/(c[1]-a[1])
               for a,c in zip(polygon,polygon[1:]+polygon[:1]))%2==1


landing=polar(f['turnDegrees'])
assert math.dist(landing,f['loadPath'][0])<1e-6
rim=contours['freight'][0]
assert within(landing,rim) and not within(polar(0),rim)
half_diagonal=math.hypot(f['load'][0],f['load'][2])/2
landing_clear=distance_to_path(landing,rim+rim[:1])-half_diagonal-spec['wall']['width']
pickup_clear=polar(0)[0]-max(x for x,z in rim)-half_diagonal
high_clear=f['carryBottom']-spec['wall']['height']-spec['wall']['merlon'][1]
assert min(landing_clear,pickup_clear,high_clear)>0
east=site['freight']['building'][1]
roof_clear=min(polar(t)[0] for t in range(f['turnDegrees']+1))-half_diagonal-(east+.28)
assert roof_clear>0
lane_gap=min(distance_to_path(p,f['loadPath']) for p in samples(f['visitorPath']))-(f['visitorLaneWidth']+f['loadLaneWidth'])/2-.025
assert lane_gap>0, 'The two traffic lanes overlap'
crate_w,crate_h,crate_d=spec['furniture']['crate'][1]
for x,y,z in f['crates']:
    if y:
        assert [x,0,z] in f['crates'] and abs(y-crate_h)<1e-6
    for path,width in [(f['loadPath'],f['loadLaneWidth']),(f['visitorPath'],f['visitorLaneWidth'])]:
        assert distance_to_path((x,z),path)>width/2+math.hypot(crate_w,crate_d)/2
door=f['receivingDoor']
assert door['width']>=f['loadLaneWidth'] and door['height']>f['load'][1]
assert any(a[0]>east>c[0] and abs(a[1]-door['z'])+f['loadLaneWidth']/2<=door['width']/2
           and c[1]==a[1] for a,c in zip(f['loadPath'],f['loadPath'][1:]))
stool_gap=distance_to_path(b['stool'],b['visitorPath'])-b['visitorLaneWidth']/2-b['stoolRadius']
assert stool_gap>0
assert r['deskTop']-r['desktopThickness']>r['seatTop']


class Sheet:
    def __init__(self,title,subtitle):
        self.lines=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="940" viewBox="0 0 1440 940" role="img">',
                    f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>',
                    '<style>text{font-family:"Malgun Gothic",sans-serif}</style>',
                    f'<rect width="1440" height="940" fill="{paper}"/>']
        self.text(44,56,title,32,ink,700)
        self.text(44,92,subtitle,17)
        self.line([(44,115),(1396,115)],ink,1)

    def text(self,x,y,value,size=17,color=muted,weight=400,anchor='start'):
        self.lines.append(f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" fill="{color}" font-weight="{weight}" font-size="{size}">{escape(str(value))}</text>')

    def line(self,points,color=ink,width=2,dash=None,fill='none',closed=False):
        tag='polygon' if closed else 'polyline'
        points=' '.join(f'{x:.2f},{y:.2f}' for x,y in points)
        dashed=f' stroke-dasharray="{dash}"' if dash else ''
        self.lines.append(f'<{tag} points="{points}" fill="{fill}" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"{dashed}/>')

    def dot(self,x,y,n,color=rust):
        self.lines.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{color}" stroke="{paper}" stroke-width="2"/>')
        self.text(x,y+4,n,13,'white',700,'middle')

    def note(self,x,y,n,title,lines,color=rust):
        self.dot(x+12,y-5,n,color)
        self.text(x+36,y,title,21,ink,700)
        for i,line in enumerate(lines):
            self.text(x+36,y+30+i*24,line,16)

    def save(self,name,footer):
        self.line([(44,873),(1396,873)],muted,1)
        self.text(44,909,footer,16)
        self.text(1396,909,'망각의 서재  /  현행 제작 기준',16,teal,700,'end')
        (ART/name).write_text('\n'.join([*self.lines,'</svg>'])+'\n','utf8')


def map_view(sheet,ox,oy,scale):
    def project(p):
        return ox+p[0]*scale,oy-p[1]*scale
    def draw(points,**style):
        sheet.line([project(p) for p in points],**style)
    return project,draw


s=Sheet('성채를 쓰는 세 사람','화물은 낮은 광장에서 나누고, 서기관은 필요한 책만 들고 대계단을 오른다. 북쪽 ↑')
pt,draw=map_view(s,436,594,6.0)
for group in ('arrival','bridge','lookout','westWalk','court','stairs','terrace','freight','bindery'):
    for polygon in contours[group]:
        draw(polygon,closed=True,fill=stone,color=muted,width=1)
for group in ('bindery','freight'):
    draw(outline(*site[group]['building']),closed=True,fill='#c5ad91')
hall,wing=site['scriptorium'],site['libraryWings']
for x,w,z,d in [(0,hall['width'],hall['frontZ'],hall['depth'])]+[(x,wing['width'],wing['frontZ'],wing['depth']) for x in wing['centers']]:
    draw(outline(x-w/2,x+w/2,z,z+d),closed=True,fill='#b2c5bb')
for x in site['gate']['towerX']:
    gx,gz=pt((x,site['gate']['center'][1]));s.lines.append(f'<circle cx="{gx}" cy="{gz}" r="12" fill="{muted}"/>')
draw(f['transfer'],color=rust,width=4)
draw([(x,z) for x,y,z in site['bridge']['stations']]+[(-2,4),(-4,10),(-3,15),(0,19),(0,36)],color=teal,width=4)
draw([(-13,2.5),(-9.6,3.6),(-6.5,7),(-4,13),(0,19),(0,36)],color=rust,width=3,dash='6 6')
for n,p,col in [('1',landing,rust),('2',(-18.5,2.5),rust),('3',(0,26.5),teal),('4',(0,43),teal),('5',(15.5,52),teal)]:
    s.dot(*pt(p),n,col)
for start,end in [((138,794),(323,805)),((159,541),(232,508)),((635,534),(623,535)),
                  ((176,606),(300,583)),((642,286),(569,289))]:
    s.line([start,end],muted,1)
for x,y,text in [(66,800,'선착장'),(60,546,'서쪽 천문대'),(642,538,'하역장'),(98,614,'제본 공방'),(652,291,'원본 서고')]:
    s.text(x,y,text,17,ink)
s.note(830,185,1,'하역인',['동쪽 하역문에서 창고로 인수한다.','닫힌 상자는 광장 층에서 분류한다.'])
s.note(830,305,2,'제본공',['수선할 책만 서쪽 공방으로 보낸다.','천구 남쪽을 지나 아케이드 개구부로 운반한다.'])
s.note(830,425,3,'서기관',['대계단 아래에서 손으로 들 분량을 정한다.','계단에 수레 자국이나 하역 상자를 두지 않는다.'],teal)
s.note(830,545,4,'처음 온 플레이어',['석교에서는 별창, 정문에서는 사진이 시선을 받는다.','본편의 기본 시작점은 열람실이다.'],teal)
s.note(830,665,5,'돌아오는 플레이어',['원부를 찾은 뒤 동쪽 빗장을 열면 사진으로 돌아온다.','일하는 사람의 출입문을 귀환문과 구별한다.'],teal)
s.line([(60,838),(120,838)],ink,3);s.text(65,829,'10 m',13)
s.save('work-citadel.svg','청록 실선  방문 동선      적갈 실선  운반      적갈 점선  소분 후 손운반')

s=Sheet('하역장  /  상자를 어디에 내려놓는가','광장 기준 평면 · 북쪽 ↑ · 바깥쪽 줄 끝에서 하역문까지 하중의 경로를 추적한다.')
pt,draw=map_view(s,-517,732,39)
draw(rim,closed=True,fill=stone,color=muted)
x0,x1,z0,z1=site['freight']['building']
draw(outline(x0,x1,z0,z1),closed=True,fill='#e8e0d1',width=1)
dz=door['width']/2
for wall in [[(x0,6.35),(x0,z0),(x1,z0),(x1,door['z']-dz)],[(x1,door['z']+dz),(x1,z1),(x0,z1),(x0,10.65)]]:
    draw(wall,color=ink,width=5)
for x,y,z in f['crates']:
    draw(footprint(x,z,crate_w,crate_d),closed=True,color=rust,fill=wood)
    if y:s.text(*pt((x,z)),'×2',15,ink,700,'middle')
for path,width,col,fill in [(f['loadPath'],f['loadLaneWidth'],rust,'#d9b9a3'),(f['visitorPath'],f['visitorLaneWidth'],teal,'#aacdc2')]:
    draw(path,color=fill,width=width*39);draw(path,color=col,width=2,dash='5 4')
arc=[polar(a) for a in range(f['turnDegrees']+1)]
draw([f['mast'],*arc,f['mast']],color=rust,dash='4 5',width=1.5)
draw(arc,color=rust,width=4)
draw(footprint(*landing,f['load'][0],f['load'][2]),closed=True,color=rust,width=2)
for n,p in [(1,polar(0)),(2,f['mast']),(3,landing),(4,(east,door['z'])),(5,(24,6.85))]:
    s.dot(*pt(p),n,teal if n==5 else rust)
s.text(65,788,'기존 서문 4.30 m',18,ink);s.text(360,788,'신설 동문 2.40 m',18,ink)
s.line([(65,826),(143,826)],ink,3);s.text(80,818,'2 m',14)
s.note(920,178,1,'수직 인양',['바깥 정지점 X 35.10 / Z 8.20.','난간을 벗어난 자리에서 끌어올린다.'])
s.note(920,292,2,'회전 중심',['X 30.50 / Z 8.20, 반경 4.60 m.','고정 돌기초 위에서 상부 팔만 90° 돈다.'])
s.note(920,406,3,'착지와 인계',['X 30.50 / Z 12.80. 상자를 포장에 내린다.','회전 중 상자 바닥은 +2.10 m를 유지한다.'])
s.note(920,520,4,'직원 하역문',['창고 동벽 Z 11.40에 미닫이문을 낸다.','상자가 내려앉고 줄이 멎으면 작업자가 들어간다.'])
s.note(920,634,5,'방문자와 운반인',['서쪽 입구에서 1.20 m 관람 통로와','1.60 m 화물 통로를 나눈다.'],teal)
s.save('freight-transfer.svg',f'평면 및 높이 검토  ·  인양 시작 여유 약 {pickup_clear:.2f} m  ·  회전 시 여장 위 {high_clear:.2f} m  ·  지붕 처마 옆 약 {roof_clear:.2f} m')

s=Sheet('제본 공방  /  접지에서 책이 되기까지','원화 시점은 동쪽 문에서 서쪽. 평면은 북쪽 ↑. 남벽에 앉아서 꿰매는 자리와 서서 누르는 자리를 차례로 놓는다.')
pt,draw=map_view(s,1640,585,66)
x0,x1,z0,z1=site['bindery']['building']
draw(outline(x0,x1,z0,z1),closed=True,fill='#e7e1d3',width=1)
draw([(x1,.9),(x1,z0),(x0,z0),(x0,z1),(x1,z1),(x1,4.1)],color=ink,width=5)
for center,size in [(b['sewing'],b['benchSize']),(b['pressTable'],spec['furniture']['table'][1]),(b['shelf'],b['shelfSize'])]:
    draw(footprint(*center,size[0],size[2]),closed=True,fill=wood)
for p,size in [(b['sewing'],b['frameSize']),(b['press'],spec['furniture']['press'][1])]:
    draw(footprint(*p,size[0],size[2]),closed=True,fill='#74533e')
draw(b['visitorPath'],color='#bed4c9',width=66*b['visitorLaneWidth']);draw(b['visitorPath'],color=teal,dash='5 5')
draw(b['workingSpots'],color=rust,width=3,dash='6 6')
for n,p in enumerate(b['workingSpots'],1):s.dot(*pt(p),n)
s.text(135,746,'서쪽 벽',17);s.text(720,746,'동쪽 출입구',17)
s.line([(130,790),(196,790)],ink,3);s.text(146,783,'1 m',14)
s.note(906,195,1,'접고 꿰매는 자리',['접지를 순서대로 놓고 실 지지대에 꿰맨다.','상판 0.76 m, 걸상 좌면 0.44 m.'])
s.note(906,337,2,'서서 누르는 자리',['서쪽 상판 1.015 m 위에 기존 누름틀을 둔다.','세로 나사 아래에 책과 누름판이 놓인다.'])
s.note(906,479,3,'건조한 대기 선반',['북벽에 폭 4.03 m, 깊이 0.55 m 선반을 둔다.','묶음과 목판은 수평으로 보관한다.'])
s.note(906,621,'→','입구에서의 시야',['공방 도구에는 조작 표시를 주지 않는다.','가운데 1.40 m 폭을 비워 작업을 볼 수 있다.'],teal)
s.save('bindery-sequence.svg',f'걸상 외곽과 관람 통로 사이 보수적 여유 {stool_gap:.2f} m  ·  공방 원화의 인물은 기물 크기를 판단하기 위한 기준')

s=Sheet('열람동과 본관  /  앉아서 읽고, 서서 찾는 자리','왼쪽은 서쪽 열람동 가구의 옆면, 오른쪽은 본관 사진 기록대의 첫 접근 평면이다. 두 공간은 용도가 다르다.')
s.text(56,173,'열람동  /  앉은 사람의 무릎과 등 뒤',22,ink,700)
def side(x,y):return 105+x*220,544-y*220
def sidebox(x0,x1,y0,y1):
    s.line([side(x0,y0),side(x1,y0),side(x1,y1),side(x0,y1)],closed=True,fill=wood)
sidebox(0,r['deskDepth'],r['deskTop']-r['desktopThickness'],r['deskTop'])
sidebox(.08,.16,0,r['deskTop']-r['desktopThickness'])
sidebox(.52,.60,0,r['deskTop']-r['desktopThickness'])
assert r['deskDepth']-.60>=r['kneeDepth'], 'The front legs intrude into the knee space'
seat_start=1.22;seat_end=seat_start+r['seatDepth']
sidebox(seat_start,seat_end,r['seatTop']-.05,r['seatTop'])
sidebox(seat_start+.05,seat_start+.12,0,r['seatTop']-.05)
sidebox(seat_end-.06,seat_end,0,r['backHeight'])
s.line([side(-.12,0),side(seat_end+r['backAisle'],0)],ink,2)
s.line([side(seat_end,.12),side(seat_end+r['backAisle'],.12)],teal,2)
s.text(490,499,'등 뒤 통행 1.20 m',16,teal)
s.text(70,329,'상판 +0.76',17,rust);s.text(396,410,'등 +0.83',16);s.text(389,478,'좌면 +0.44',16,rust)
s.text(65,623,'상판 밑 +0.70 m. 앉는 쪽에서 안으로 0.45 m는',18)
s.text(65,653,'가로 보강대와 앞다리를 비워 무릎이 들어가게 한다.',18)
s.text(65,715,'현행 1.015 m 작업대와 높이 0.88 m의 통짜 벤치를 교체한다.',16)
s.line([(766,145),(766,826)],muted,1)
s.text(800,173,'본관  /  열람실 첫 접근',22,ink,700)
pt,draw=map_view(s,1095,552,30)
counter=next(p for p in level['zones']['readingRoom'] if p['id']=='reading-counter')
cx,_,cz=counter['position'];cw,_,cd=prefabs[counter['prefab']]['parts'][0]['size']
room=next(p for p in level['zones']['readingRoom'] if p['id']=='reading-floor')
rw,_,rd=room['size'];_,_,rz=room['position']
draw(footprint(0,rz,rw,rd),closed=True,fill=stone,color=muted)
draw(footprint(cx,cz,cw,cd),closed=True,fill=wood)
for sign in (-1,1):
    draw([(0,-4.5),(sign*2.15,-.6),(sign*2.15,3.25),(0,5.35),(0,6.83)],color=teal,width=2,dash='6 4')
return_door=next(p for p in level['zones']['readingRoom'] if p['id']=='reading-shortcut-door')['position']
return_x,_,return_z=return_door
draw([(return_x,return_z),(3.15,3.8),(2.25,1.4),(1.8,.2),(.4,.2)],color=rust,width=3,dash='3 6')
draw([(0,-4.5),(.5,cz)],color=rust,width=2)
s.dot(*pt((0,-4.5)),1,teal);s.dot(*pt((.5,cz)),2);s.dot(*pt((0,6.83)),3,teal)
s.dot(*pt((return_x,return_z)),4,rust)
s.text(805,786,'① 시작　② 사진　③ 북쪽 아치　④ 귀환문',18,ink,700)
s.text(805,818,'귀환 때에는 기록대 동쪽 끝을 돌아 남향 액자의 앞면을 본다.',16)
s.save('reading-posture.svg','치수는 이 게임의 모델·카메라용 설계값  ·  평면 좌표는 본관의 게임 좌표  ·  좌우 우회와 시선은 각각 따로 표시')

s=Sheet('무너진 회랑과 봉인 보관실  /  단서를 보고 빠져나오는 길',
        '북쪽 ↑  ·  본관 좌표(m)  ·  잔해, 봉인 받침, 원부대의 실제 바닥 치수 위에 다음 배치를 그렸다.')
pt,draw=map_view(s,244,830,51)
c=proposal['corridor']
corridor=level['zones']['corridor']
vault=level['zones']['vault']
south=next(item['bounds'][2][1] for item in corridor if item['id']=='corridor-wall-east')
north=next(item['bounds'][2][0] for item in corridor if item['id']=='corridor-wall-west')
draw(outline(-2,11.75,south,north),closed=True,fill=stone)
draw(outline(12.05,18.2,7.3,13.3),closed=True,fill='#dfd9c6')
for wall in [([(11.75,8.9),(12.05,8.9),(12.05,11.7),(11.75,11.7)]),
             ([(14.1,7.3),(16.7,7.3),(16.7,7.1),(14.1,7.1)])]:
    draw(wall,closed=True,fill='#b5d3c6',color=teal,width=1)
plinth_limits=[]
for item in [*corridor,*vault]:
    part=prefabs[item['prefab']]['parts'][0]
    if item['prefab'] not in ('fallen-stone','rune-plinth','vault-lectern','folio-bookcase','corridor-pier') and item['id']!='corridor-step':
        continue
    x,_,z=item['position']
    w,_,d=item.get('size') or part['size']
    if item.get('heading',0)==90:
        w,d=d,w
    if item['prefab']=='rune-plinth':
        draw(footprint(x,z-c['plinthShiftZ'],w,d),closed=True,color=muted,width=1,dash='3 2')
        plinth_limits.append((z-d/2,z+d/2))
    col=wood if item['prefab'] in ('rune-plinth','vault-lectern','folio-bookcase') else '#97a59c'
    draw(footprint(x,z,w,d),closed=True,color=ink,width=1,fill=col)
passage=min(z for z,_ in plinth_limits)-south
assert passage>=c['southPassageWidth']-1e-6 and max(z for _,z in plinth_limits)<north
draw([(2.73,12.22),(4.47,12.22)],color=rust,width=5)
draw([(8.1,south+.1),(8.1,north-.1)],color=teal,width=3,dash='4 4')
draw([(0,7),(0,10.3),(3.6,11.45),(4.15,11.52),(5.2,11.52),(6.5,10.3),(8.2,10.3)],color=teal,width=3)
draw(c['walkPastPlinths'],color=teal,width=3,dash='5 4')
draw([(11.9,10.3),(14.95,10.3),(15,8.8),(15.4,8.5),(15.4,7.15)],color=teal,width=3)
for n,p in [(1,(3.6,11.45)),(2,(8.1,10.3)),(3,(9.4,8.9)),(4,(15,10.3)),(5,(15.4,7.15))]:
    s.dot(*pt(p),n,teal)
s.text(166,175,'열람실에서 ↑',16);s.text(590,175,'실선  이동·관찰    점선  받침 바깥 우회',16,teal)
s.line([(1240,185),(1342,185)],ink,3);s.text(1274,175,'2 m',14)
s.note(54,549,1,'잉크가 닿기 전에 관찰',['북벽의 세 양각을 왼쪽부터 읽는다.','벽화 앞 X 3.60에서 다음 봉인선이 보인다.'])
s.note(516,549,2,'쫓기다가 손을 쓰는 자리',['X 8.10의 봉인선을 지난 뒤 받침을 돌린다.','잔해는 벽 가까이에 남겨 회피 동선을 읽게 한다.'])
s.note(988,549,3,'받침 남쪽의 연속 통로',[f'세 받침을 북쪽으로 {c["plinthShiftZ"]:.2f} m 함께 옮긴다.',f'남벽과 받침 사이 폭 {passage:.2f} m. 표식 순서를 유지한다.'])
s.note(54,712,4,'원부 읽기',['서쪽에서 읽으면 기록대가 앞, 빗장은 오른쪽이다.','원부를 읽고 돌아설 자리에 소품을 추가하지 않는다.'])
s.note(640,712,5,'빗장을 보고 귀환',['원부를 등지고 남쪽 문을 바라볼 때는 문이 선택된다.','세 받침의 접근점과 글자도 받침과 함께 옮긴다.'])
s.save('seal-approach.svg','남쪽 통로 폭은 받침 단면을 지난 자리에서 측정  ·  회랑의 휨과 어깨 카메라를 포함한 통과 여부는 모델 배치 뒤 확인')
checks={'source':spec['workLayout'],'status':proposal['status'],'units':'m','landingEdgeClearance':landing_clear,'pickupEdgeClearance':pickup_clear,
        'turnParapetClearance':high_clear,'turnRoofClearance':roof_clear,'trafficLaneSeparation':lane_gap,'binderyStoolClearance':stool_gap,'plinthSouthPassage':passage}
(ART/'work-layout-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n','utf8')
print(f'5 sheets. Quay landing {landing_clear:.2f} m, traffic separation ≥ {lane_gap:.2f} m, plinth passage {passage:.2f} m.')
