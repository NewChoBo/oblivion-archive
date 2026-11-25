"""Draw the library mission route over its authored ground-floor walls."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEVELS = ROOT / 'shared/levels'
from citadel_sources import data
level = data('chapter-1.json')
site = data('fortress-exterior.json')
ox, _, oz = site['chapterJoin']['offset']
scale = 21
def point(x, z):
    return 495 + scale*x, 545 - scale*z
svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="760" viewBox="0 0 1280 760">',
       '<title>대서고 지상층 · 지워진 이름을 찾는 길</title>',
       '<style>text{font-family:"Malgun Gothic",sans-serif;fill:#253e42}.stage{font-size:15px;font-weight:700;fill:white;text-anchor:middle}</style>',
       '<defs><pattern id="grid" width="21" height="21" patternUnits="userSpaceOnUse"><path d="M21 0H0V21" fill="none" stroke="#d1d5ca" stroke-width=".8"/></pattern></defs>',
       '<rect width="1280" height="760" fill="#f6f2e7"/>',
       '<text x="42" y="55" font-size="34" font-weight="700">대서고 지상층</text><text x="43" y="86" font-size="17">사진에서 지워진 사람 · 상부 단구 보행면</text>',
       '<rect x="35" y="104" width="923" height="595" fill="url(#grid)"/>']
def rect(x1,x2,z1,z2,fill,stroke='none'):
    x,y=point(x1,z2)
    svg.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{(x2-x1)*scale:.2f}" height="{(z2-z1)*scale:.2f}" fill="{fill}" stroke="{stroke}"/>')
def path(pts,color,dash='none'):
    coords=' '.join('%.1f,%.1f'%point(x,z) for x,z in pts)
    svg.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="{dash}"/>')
hall=site['scriptorium']
rect(-hall['width']/2,hall['width']/2,oz+hall['frontZ'],oz+hall['frontZ']+hall['depth'],'#e1dfcf','#737b71')
wing=site['libraryWings']
for x in wing['centers']:
    rect(x-wing['width']/2,x+wing['width']/2,oz+wing['frontZ'],oz+wing['frontZ']+wing['depth'],'#e4e1d4','#737b71')
rect(-2,18.3,8.3,12.3,'#cbd7ce')
rect(12.05,18.2,7.3,13.3,'#d7d4be')
for items in level['zones'].values():
    for item in items:
        if 'bounds' not in item or item['prefab'] not in ('plaster-wall','stone-wall'):continue
        (x1,x2),(y1,y2),(z1,z2)=item['bounds']
        # The corridor ceiling also uses the stone-wall prefab. Only vertical slabs appear in plan.
        if y2-y1 <= min(x2-x1,z2-z1):continue
        rect(x1,x2,z1,z2,'#3d5150')
        openings=item.get('openings',[])
        if 'frame' in item:
            frame=level['doorFrames'][item['frame']]
            c,r=frame['center'],frame['width']/2
            openings=[{'span':[c-r,c+r],'height':[0,frame['spring']]}]
        for opening in openings:
            if opening['height'][0]>.01:continue
            a,b=opening['span']
            if item['openingAxis']=='x':rect(a,b,z1,z2,'#e1dfcf')
            else:rect(x1,x2,a,b,'#e1dfcf')
out='#a85631';back='#30756e'
path([(0,-6.12),(.4,.8),(-1.5,1),(-1.5,3.2),(0,4.1),(0,10.3),(3.6,11.43),(8,10.3),(9.4,10.3),(12,10.3),(15,10.3)],out)
path([(15,10.3),(15.4,8.5),(15.4,5.4),(8.37,5.4),(2.6,5.4),(2.3,.6),(.4,.8)],back,'7 5')
stages=[(.4,.83,'빛바랜 사진'),(3.6,11.43,'벽화의 흔적'),(9.4,10.3,'세 봉인 받침'),(15,10.3,'서명 원부'),(15.4,7.15,'남쪽 빗장'),(8.37,5.4,'본관 연결문')]
svg.extend(['<text x="985" y="161" font-size="22" font-weight="700">탐험 동선</text>',
            '<path d="M985 191h34" stroke="#a85631" stroke-width="4"/><text x="1028" y="197" font-size="15">원본 서고로</text>',
            '<path d="M985 222h34" stroke="#30756e" stroke-width="4" stroke-dasharray="6 4"/><text x="1028" y="228" font-size="15">열람실로 귀환</text>'])
for i,(x,z,name) in enumerate(stages,1):
    px,py=point(x,z); color=out if i<5 else back
    for cx,cy in [(px,py),(998,244+43*i)]:
        svg.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{color}"/><text x="{cx}" y="{cy+5}" class="stage">{i}</text>')
    svg.append(f'<text x="1022" y="{250+43*i}" font-size="17">{name}</text>')
for x,z,label in [(-15.5,7,'서쪽 열람동'),(0,15.8,'본관'),(0,-2.8,'중앙 열람실'),(15.5,1.5,'동쪽 원본 서고')]:
    px,py=point(x,z);svg.append(f'<text x="{px}" y="{py}" text-anchor="middle" font-size="17" fill="#4d6260">{label}</text>')
svg.extend(['<path d="M926 169v-45m-6 10 6-10 6 10" fill="none" stroke="#253e42" stroke-width="2"/><text x="920" y="117" font-size="14">북</text>',
            '<path d="M45 720h105m-105-4v8m105-8v8" stroke="#253e42"/><text x="161" y="726" font-size="14">5 m</text></svg>'])
(ROOT/'docs/art/chapter-1/library-route.svg').write_text('\n'.join(svg),encoding='utf8')
