"""Orthographic site plan and unfolded route section for the floating citadel."""
import json
import math
import subprocess
import unicodedata
from pathlib import Path

root = Path(__file__).resolve().parents[2]
from citadel_sources import data
p = data('fortress-exterior.json')
survey = json.loads(subprocess.check_output(['node', '--experimental-strip-types','babylon/tools/export-citadel-survey.mjs'],cwd=root))
ink, teal, amber = '#253e42', '#386e70', '#a45b32'
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="980" viewBox="0 0 1440 980">',
       '<title>별을 건너는 성채 · 배치도와 보행 종단면</title>',
       '<style>text{font-family:"Malgun Gothic",sans-serif}</style>',
       '<defs><pattern id="grid" width="34.5" height="34.5" patternUnits="userSpaceOnUse"><path d="M34.5 0H0V34.5" fill="none" stroke="#c6cdbf"/></pattern></defs>',
       '<rect width="1440" height="980" fill="#f6f2e7"/>']


def text(x,y,s,size=16,fill=ink,bold=400):
    svg.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{bold}" fill="{fill}">{s}</text>')


def path(points,fill='none',color=ink,width=1.6,closed=False,dash='none'):
    coords=' '.join(f'{x:.2f},{y:.2f}' for x,y in points)
    tag='polygon' if closed else 'polyline'
    svg.append(f'<{tag} points="{coords}" fill="{fill}" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-dasharray="{dash}"/>')


def P(x,z): return (469+6.9*x,606-6.9*z)


def circle(x,z,r,fill):
    cx,cy=P(x,z)
    svg.append(f'<circle cx="{cx}" cy="{cy}" r="{r*6.9}" fill="{fill}" stroke="{ink}" stroke-width="1.7"/>')


def leader(x,z,tx,ty,name):
    px,py=P(x,z)
    width=sum(16 if unicodedata.east_asian_width(ch) in ('W','F') else 8 for ch in name)
    path([(px,py),(tx+width+4 if px>tx+width else tx-7,ty-5)],color=teal,width=1)
    text(tx,ty,name,16,teal,600)


def route(name,color):
    stations=p[name]['stations']
    points=[P(x,z) for x,_,z in stations]
    for panel in survey[name]:
        path([P(*v) for v in panel],color,ink,.65,True)
    path(points,color=amber,width=2,dash='5 4')


text(46,60,'별을 건너는 성채',36,bold=700)
text(898,55,'망각의 서재   /   외부 공간 설계   ·   단위 m',18,teal,600)
path([(46,82),(1394,82)])
text(46,127,'배치도',23,bold=700)
svg.append('<rect x="46" y="146" width="824" height="758" fill="url(#grid)" stroke="#acb7ab"/>')
for name in ['arrival','court','terrace','bindery','freight']:
    path([P(*v) for v in survey[name][0]],'#d6dfd2' if name!='terrace' else '#b1c9bc',closed=True)
for name in ['bridge','westWalk','stairs']: route(name,'#e5d8ba')
look=p['lookout']
path([P(*v) for v in survey['lookout'][0]],'#b1c9bc',closed=True)
circle(*look['center'],1.0,'#daba82')
for x in p['gate']['towerX']: circle(x,p['gate']['center'][1],p['gate']['radius'],'#8ba9a1')
circle(*p['court']['orrery'],1.5,'#daba82')
hall=p['scriptorium']; z=hall['frontZ']; w=hall['width']/2
path([P(-w,z),P(w,z),P(w,z+hall['depth']),P(-w,z+hall['depth'])],'#abc4bd',closed=True)
for x in [-w,w]:
    for end in [z,z+hall['depth']]: circle(x,end,.8,'#78988f')
def footprint(x0,x1,z0,z1,fill):
    path([P(x0,z0),P(x1,z0),P(x1,z1),P(x0,z1)],fill,closed=True)
wing=p['libraryWings']
for x in wing['centers']:
    footprint(x-wing['width']/2,x+wing['width']/2,z,z+wing['depth'],'#bbd0ca')
for key in ['bindery','freight']:
    footprint(*p[key]['building'],'#d7b998')
path([P(*p['court']['outline'][i]) for i in [*p['gallery']['edgeIndices'],8]],color=teal,width=4)
leader(-16,-36,108,825,'도착섬  −2.0')
leader(-6,-15,550,694,'굽은 석교 · 세 아치')
leader(4.3,-1,613,666,'원형 쌍탑 관문')
leader(1,9,664,443,'천구의 광장  ±0.0')
leader(13.5,11,696,493,'동쪽 아케이드')
leader(-30,15.8,84,463,'서쪽 천문대  +2.0')
leader(-18,2.5,88,619,'제본 공방')
leader(23,8.5,716,591,'하역 창고')
leader(16,49,683,251,'원본 서고동')
leader(-16,49,143,255,'서쪽 열람동')
leader(0,25,573,421,'계단참  +2.0')
leader(0,34,115,400,'상부 테라스  +4.5')
leader(2,41,564,184,'대서고')
text(747,212,'북 ↑',17,teal,700)
path([(72,878),(141,878)],width=3);text(73,871,'10 m',13)
text(908,127,'보행 종단면',23,bold=700)
text(908,159,'석교에서 서고까지의 중심선을 펼쳐 본 높이',15,teal)
def section(stations,top,labels):
    dist=[0]
    for a,b in zip(stations,stations[1:]):
        dist.append(dist[-1]+math.hypot(b[0]-a[0],b[2]-a[2]))
    points=[(926+440*d/dist[-1],top-21*v[1]) for d,v in zip(dist,stations)]
    path([*points,(points[-1][0],top+64),(926,top+64)],'#d7dfd2',closed=True)
    path(points,color=teal,width=3)
    for i,txt,dy in labels:
        x,y=points[i];text(min(x,1329),y+dy,txt,15,ink,600)
    text(927,top+88,f'수평 경로 {dist[-1]:.1f} m',14,teal)
section([*p['bridge']['stations'],*p['stairs']['stations']],321,[(0,'−2.0',-10),(8,'관문  0.0',-13),(-3,'+2.0',-9),(-1,'+4.5',-12)])
text(908,471,'광장에서 천문대로',20,bold=700)
section(p['westWalk']['stations'],555,[(0,'0.0',-12),(-1,'+2.0',-12)])
text(908,704,'조립 기준',20,bold=700)
for i,line in enumerate(['0.5 m 격자는 폭과 높이의 기준으로 쓴다.',
    '석교와 성벽은 굽은 중심선을 따라 잇는다.',
    '쌍탑은 지름 4 m, 천문대는 지름 10 m다.',
    '두 계단 사이의 수평 참은 길이 2.5 m다.',
    '서고 두 날개를 합친 전면 폭은 43 m다.', '가장 높은 첨탑은 광장 위 30 m다.']):
    text(908,743+i*31,line,16)
text(46,949,'설계 기준   /   신규 성채 원화의 도착섬, 굽은 석교, 원형 관문, 광장, 제본 공방, 하역 창고와 대서고',16,teal)
svg.append('</svg>')
(root/'docs/art/chapter-1/fortress-blueprint.svg').write_text('\n'.join(svg)+'\n',encoding='utf-8')
