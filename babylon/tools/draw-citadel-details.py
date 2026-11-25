"""Publish dimensional construction sheets and the castle's asset schedule."""
import json
from html import escape
from pathlib import Path

root = Path(__file__).resolve().parents[2]
folder = root/'docs/art/chapter-1'
from citadel_sources import data
spec,site,maps = (data(n) for n in ['citadel-construction.json','fortress-exterior.json','citadel-materials.json'])
# Keep dimensions and part counts in the live schedule. The Korean sheets own their captions.
ko = json.loads((Path(__file__).parent/'locales/ko/citadel-sheets.json').read_text('utf8'))
ink,teal,copper,grey = '#203331','#396b66','#a34e30','#61716a'
def sheet(title,label):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1020" viewBox="0 0 1440 1020"><title>{title}</title>',
         '<style>text{font-family:"Malgun Gothic",sans-serif}.heading{font-weight:700}</style><rect width="1440" height="1020" fill="#f4f1e7"/>',
         f'<text class="heading" x="48" y="70" font-size="38" fill="{ink}">{title}</text><text x="1392" y="66" text-anchor="end" fill="{teal}" font-size="18">대서고 성채　 /　{label}　 /　단위 m</text><path d="M48 96H1392" stroke="{ink}"/>']
def text(x,y,txt,size=17,color=ink,bold=False):
    art.append(f'<text x="{x}" y="{y}" fill="{color}" font-weight="{700 if bold else 400}" font-size="{size}">{escape(txt)}</text>')
def poly(pts,stroke=ink,fill='none',weight=2,close=False):
    d=' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)
    art.append(f'<{"polygon" if close else "polyline"} points="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{weight}" stroke-linejoin="round"/>')
def dimension(x1,x2,y,value):
    poly([(x1,y),(x2,y)],teal,weight=1)
    for x in [x1,x2]:poly([(x-4,y+5),(x+4,y-5)],teal,weight=1)
    text((x1+x2)/2-20,y-8,value,15,teal)
def finish(name):
    (folder/name).write_text('\n'.join([*art,'</svg>'])+'\n','utf8')
art=sheet('대계단 · 벽체 접합 상세','구조 단면')
text(48,142,'계단 종단',23,bold=True);text(48,172,'광장 기준 높이 0.00. 각 단의 모서리를 같은 측점에서 난간 안쪽까지 연장한다.',17,grey)
stairs=site['stairs']['stations'];counts=spec['stairs']['treadCounts'];sx=lambda z:90+(z-19)*63;sy=lambda y:558-y*55
outline=[(sx(z),sy(h)) for _,h,z in stairs]
poly([*outline,(sx(32.5),sy(-2.9)),(sx(19),sy(-2.9))],ink,'#ccd5ca',2,True)
for i,n in enumerate(counts):
    _,y,z=stairs[i];_,yy,zz=stairs[i+1]
    pts=[(sx(z),sy(y))]
    for k in range(n):
        h=y+(yy-y)*(k+1)/n
        pts.extend([(sx(z+(zz-z)*k/n),sy(h)),(sx(z+(zz-z)*(k+1)/n),sy(h))])
    if not n:pts.append((sx(zz),sy(yy)))
    poly(pts,copper,weight=3)
poly([(x,y-spec['wall']['height']*55) for x,y in outline],teal,weight=3)
for i,t in enumerate(['5.00','2.50','6.00']):
    dimension(outline[i][0],outline[i+1][0],764,t)
text(90,803,'하부 계단',17);text(399,803,'수평 계단참',17);text(650,803,'상부 계단',17)
poly([(70,558),(974,558)],grey,weight=.8);text(975,563,'±0.00',15,teal);text(952,316,'+4.50',15,teal)
text(52,900,'11단 × 0.182  /  디딤폭 0.455',17);text(510,900,'14단 × 0.179  /  디딤폭 0.429',17)
poly([(1010,152),(1010,952)],grey,weight=.8)
text(1040,155,'난간 횡단',23,bold=True);text(1040,190,'보행면과 만나는 실제 절단면',16,grey)
x0,y0=1272,438;unit=150;wall=spec['wall']
x1=x0-wall['width']*unit;top=y0-wall['height']*unit
poly([(1050,y0),(x1,y0),(x1,top+2),(x1+2,top),(x0-2,top),(x0,top+2),(x0,604),(1050,604)],ink,'#c4d0c6',2,True)
poly([(1050,y0),(x1,y0)],copper,weight=3);dimension(x1,x0,top-16,'0.36')
lamp=x1-.31*unit
poly([(lamp-.27*unit,y0+.16*unit),(lamp+.27*unit,y0+.16*unit),(lamp+.19*unit,y0-1.05*unit),(lamp-.19*unit,y0-1.05*unit)],ink,'#8e9c92',2,True)
poly([(lamp-.16*unit,y0-1.05*unit),(lamp+.16*unit,y0-1.05*unit),(lamp+.30*unit,y0-1.25*unit),(lamp-.30*unit,y0-1.25*unit)],ink,'#b49371',2,True)
text(1284,(top+y0)/2,'1.04',16,teal);text(1050,630,'같은 외곽선에서 수직으로 내린다.',16)
text(1050,666,'윗모서리 모따기 15 mm',16);text(1050,697,'포장 → 난간 안쪽 면에서 종료',16)
text(1050,728,'축대 → 난간 바깥 면과 일치',16);text(1050,759,'기단선과 바닥에 돌출 띠 없음',16)
text(1050,810,'등잔 중심: 벽 안쪽에서 0.31 m',16);text(1050,842,'받침 하단 0.16 m를 포장에 묻음',16)
text(48,974,'주황선  실제 디딤돌     청록선  난간 상단     좌측 종단은 가독성을 위해 수평·수직 축척을 따로 표시했다.',16,teal)
finish('citadel-stair-section.svg')
art=sheet('대서고 · 관문 입면','입면과 재질')
text(48,144,'남쪽에서 본 대서고',24,bold=True)
def X(v):return 520+18*v
def Y(v):return 765-18*v
h,w=site['scriptorium'],site['libraryWings'];base=w['height']
for center,width,eave,ridge in [*((cx,w['width'],w['eaves'],w['ridge']) for cx in w['centers']),(0,h['width'],h['eaves'],h['ridge'])]:
    poly([(X(center-width/2),Y(base)),(X(center-width/2),Y(eave)),(X(center),Y(ridge)),(X(center+width/2),Y(eave)),(X(center+width/2),Y(base))],ink,'#c4cfc5',2,True)
    poly([(X(center-width/2),Y(eave)),(X(center),Y(ridge)),(X(center+width/2),Y(eave))],ink,'#80999a',2,True)
    if center:
        for wx in [center-3.9,center+3.9]:
            poly([(X(wx-.79),Y(base+2.425)),(X(wx-.79),Y(base+5.675)),(X(wx+.79),Y(base+5.675)),(X(wx+.79),Y(base+2.425))],ink,'#c9a160',2,True)
    else:
        art.append(f'<path d="M{X(-4)} {Y(8.85)} V{Y(16.45)} Q{X(-3)} {Y(19.8)} {X(0)} {Y(21.1)} Q{X(3)} {Y(19.8)} {X(4)} {Y(16.45)} V{Y(8.85)}Z" fill="#c4a262" stroke="{ink}"/>')
        for dx in [-1.5,0,1.5]:poly([(X(dx),Y(8.85)),(X(dx),Y(19))],teal,weight=2)
    frame=data('chapter-1.json')['doorFrames']['south-entrance']
    span,spring,rise=(2.80,2.10,1.80) if center else (frame['width'],frame['spring'],frame['rise'])
    def jamb(side,step):
        from math import cos,pi,sin
        angle=step*pi/30
        return X(center+side*span*(cos(angle)-.5)),Y(base+spring+rise*sin(angle)/sin(pi/3))
    poly([(X(center-span/2),Y(base)),*(jamb(-1,k) for k in range(11)),
          *(jamb(1,k) for k in range(9,-1,-1)),(X(center+span/2),Y(base))],ink,ink,1,True)
for x,high in zip([-8.5,8.5],h['pinnacles'][:2]):
    poly([(X(x-1),Y(base)),(X(x-.7),Y(20)),(X(x),Y(high)),(X(x+.7),Y(20)),(X(x+1),Y(base))],ink,'#9fb0aa',2,True)
dimension(X(-21.5),X(21.5),727,'43.00');dimension(X(-8.5),X(8.5),782,'17.00')
text(70,844,'양익 폭 12.00 · 중앙 별창 폭 8.00 · 지붕 용마루 +25.50 · 첨탑 최고 +30.00',17)
text(70,890,'정문　폭 2.76 / 기점 1.95 / 첨두 상승 1.61. 문틀과 정면 벽은 같은 개구부를 사용한다.',17,teal)
poly([(987,135),(987,933)],grey,weight=1)
text(1025,147,'쌍탑 관문 정면',22,bold=True);tx=lambda x:1190+x*23;ty=lambda y:490-y*23
for x in site['gate']['towerX']:
    poly([(tx(x-2),ty(0)),(tx(x-1.86),ty(8.7)),(tx(x+1.86),ty(8.7)),(tx(x+2),ty(0))],ink,'#b4c4bc',2,True)
art.append(f'<path d="M{tx(-2.70)} {ty(0)}V{ty(7.72)}H{tx(2.70)}V{ty(0)}H{tx(2.40)}V{ty(4.28)}Q{tx(2)} {ty(6)} {tx(0)} {ty(6.98)}Q{tx(-2)} {ty(6)} {tx(-2.4)} {ty(4.28)}V{ty(0)}Z" fill="#849b94" stroke="{ink}"/>')
dimension(tx(-2.4),tx(2.4),526,'4.80');text(1025,583,'기둥 중심 간격 8.60',17);text(1025,615,'탑체와 아치가 닿는 면을 절단',16)
text(1025,727,'납유리 창 상세',22,bold=True);text(1025,765,'본관 유리 후퇴 0.20',16);text(1025,795,'양익 유리 35 mm · 창턱 깊이 0.51',16);text(1025,825,'빛은 유리면에, 옆면은 석재로',16)
text(48,974,'입면은 광장의 ±0.00을 공유한다. 두 탑 단면의 내측 접합은 문설주 속으로 들어간다.',16,teal)
finish('citadel-elevations.svg')
art=sheet('작업동과 서고의 가구 배치','바닥 기준점과 점유 면적')
text(48,138,'북쪽 ↑　 ·　표시 치수는 성채 기준 m　 ·　색면은 에셋의 평면 점유 범위',17,teal)
rooms=[('bindery','제본 공방',site['bindery']['building']),('freight','하역 창고',site['freight']['building'])]
for group,label,cx in [('westLibrary','서쪽 열람동',-15.5),('eastLibrary','동쪽 원본 서고',15.5)]:
    rooms.append((group,label,[cx-6,cx+6,36,59]))
for i,(group,label,bounds) in enumerate(rooms):
    x0,x1,z0,z1=bounds
    left=68+(i%2)*685;top=185+(i//2)*403
    scale=min(334/(x1-x0),288/(z1-z0))
    X=lambda x:left+45+(x-x0)*scale
    Z=lambda z:top+52+(z1-z)*scale
    text(left,top,label,23,bold=True)
    poly([(X(x0),Z(z0)),(X(x1),Z(z0)),(X(x1),Z(z1)),(X(x0),Z(z1))],ink,'#e2e6d8',2,True)
    for j,(kind,x,y,z) in enumerate(spec['placements'][group],1):
        title,(w,h,d),mat,_=spec['furniture'][kind]
        cz=z-.195 if kind=='case' else z
        corners=[(X(x+dx*w/2),Z(cz+dz*d/2)) for dx,dz in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        poly(corners,ink,{'wood':'#ba976e'}[mat],1.3,True)
        text(X(x)+4,Z(z)-4,str(j),13,copper,True)
        text(left+408,top+52+j*30,f'{j}. {ko["furniture"].get(kind, {}).get("name", title)}',15)
        text(left+408,top+65+j*30,f'({x:g}, {y:g}, {z:g})',12,grey)
    dimension(X(x0),X(x1),Z(z0)+22,f'{x1-x0:.2f}')
text(48,980,'모든 가구의 회전은 0°. 하역 창고 2번과 3번은 같은 자리의 두 층이며, 제본 공방 3번은 1번 작업대 위에 설치한다.',16,teal)
finish('citadel-furnishings.svg')
css='''*{box-sizing:border-box}html{background:#f4f1e7;color:#213634;font:16px/1.65 "Malgun Gothic",sans-serif}body{max-width:1230px;margin:auto;padding:clamp(18px,4vw,62px)}a{color:#25615f}h1,h2,h3{line-height:1.3}h1{font-size:clamp(32px,5vw,58px);margin:.4em 0}h2{margin-top:2em;font-size:28px}img{width:100%;display:block}figure{margin:0}figcaption,small{color:#526760}header{border-bottom:1px solid #93a49b;padding-bottom:24px}.plans,.palette{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.plans figure{background:#faf8f1;border:1px solid #b7c3b8}.plans figcaption{padding:.6em 1em}.swatch{min-height:48px;border:1px solid #798781;background-size:80px}.palette{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.palette p{font-size:14px}.list article{display:grid;grid-template-columns:170px 1fr 1fr;gap:18px;padding:18px 0;border-top:1px solid #b8c4b7}.list h3,.list p{margin:.2em 0}.list p{font-size:15px}summary{cursor:pointer}nav{margin:20px 0}nav a{display:inline-block;padding:.35em .2em}nav+h2{margin-top:.8em}.list b{color:#315c55}@media(max-width:720px){.plans,.list article{grid-template-columns:1fr}.list article{gap:3px}}@media print{body{padding:8mm}.plans{display:block}.plans figure,article{break-inside:avoid}}'''
s=['<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>성채 설계도와 에셋 배치표</title><style>'+css+'</style><body><header><a href="./#fortress">챕터 1 아트 갤러리</a><h1>별을 건너는 성채</h1><p>'+ko['intent']+'</p><small>'+ko['datum']+'</small></header><nav aria-label="도면 바로 열기"><a href="work-review.html">생활 동선과 고증 검토안</a> · <a href="fortress-blueprint.svg">성채 배치도</a> · <a href="citadel-stair-section.svg">계단 상세</a> · <a href="citadel-elevations.svg">건물 입면</a> · <a href="library-route.svg">지상층 동선</a> · <a href="citadel-furnishings.svg">가구 배치</a></nav><h2>제작 도면</h2><div class="plans">']
for file,title in [('fortress-blueprint.svg','성채 배치와 보행 높이'),('citadel-stair-section.svg','계단 종단과 난간 횡단'),('citadel-elevations.svg','본관·양익·쌍탑의 입면'),('library-route.svg','지상층 구획과 챕터 동선'),('citadel-furnishings.svg','작업동·서고의 가구별 배치와 기준점')]:
    s.append(f'<figure><a href="{file}"><img alt="{title}" src="{file}"></a><figcaption>{title}</figcaption></figure>')
radius=spec['wall']['turnRadius'];s+=['</div><p>'+ko['assembly']+f' 평면 모서리는 접선 원호 R {radius:.2f}를 쓴다. 인접 변이 짧으면 접선 길이를 짧은 변의 24%까지 줄인다. 호의 표본 간 최대 각도는 7.5°다.</p><h2>구역별 에셋 배치표</h2><div class="list">']
for district in spec['districts']:
    d = {**district, **ko['districts'].get(district['id'], {})}
    s.append(f'<article><h3>{d["name"]}</h3><div><p><b>{d["asset"]}</b></p><p>{d["place"]}</p><p>{d["measure"]}</p></div><div><p>{d["style"]}</p><small>{d["collision"]}</small></div></article>')
s+=['</div><h2>구조와 부속 배치</h2>']
for assembly in spec['assemblies']:
    parts=[*assembly['parts'],*(p for group in assembly['sets'] for p in spec['partSets'][group])]
    heading = ko['assemblies'].get(assembly['name'], assembly)
    labels = []
    for part in parts:
        label = ko['parts'].get(part, part)
        if part in assembly['counts']:
            label += f' ({assembly["counts"][part]})'
        labels.append(label)
    s.append(f'<details><summary><b>{heading["name"]}</b></summary><p>{heading["layout"]}</p><p>'+ ' · '.join(labels)+'</p></details>')
s+=['<h2>색과 표면</h2><details><summary>성채 컨셉아트 원본</summary><a href="floating-citadel.webp"><img src="floating-citadel.webp" alt="석교에서 계단과 호박빛 대서고로 이어지는 성채 컨셉아트"></a></details><p>색표는 광원을 입히기 전의 기준색이다. 낮은 채도의 석조 위에 책과 기억이 돌아오는 장소만 따뜻하게 밝힌다.</p><div class="palette">']
for slot,title,desc in spec['materials']:
    material = ko['materials'].get(slot, {})
    title, desc = material.get('name', title), material.get('description', desc)
    color=spec['palette'][slot];entry=maps.get(slot if slot!='glass' else 'libraryLight',{});image=entry.get('albedo')
    url=('../../../assets/'+image) if image else ''
    fill=f'background-image:url({url});' if image else ''
    s.append(f'<div><div class="swatch" style="background-color:{color};{fill}border-left:24px solid {color}"></div><b>{title}</b><br><small>{color} · '+(f'{entry["meters"]:.1f} m 반복' if entry else '단색 재질')+f'</small><p>{desc}</p></div>')
s+=['</div><h2>가구 제작 치수</h2><div class="list">']
for kind,(title,dims,slot,origin) in spec['furniture'].items():
    caption = ko['furniture'].get(kind, {})
    title, origin = caption.get('name', title), caption.get('origin', origin)
    s.append(f'<article><h3>{title}</h3><p>폭 × 높이 × 깊이<br>{" × ".join(map(str,dims))} m</p><p>배치 원점　{origin}<br>주 재질　{spec["palette"][slot]}</p></article>')
s+=['</div><h2>실내 소품 배치</h2><div class="list">']
level=data('chapter-1.json');catalog=data('environment-prefabs.json')
for zone,assets in level['zones'].items():
    for p in assets:
        prefab=catalog['prefabs'][p['prefab']];model=prefab.get('model')
        if not model:continue
        x,y,z=p['position'];dims=p.get('size',prefab['parts'][0].get('size')); modelyaw=p.get('model',{}).get('yawDegrees',0)
        size=' × '.join(map(str,dims))
        name = ko['interiorModels'].get(p['name'], p['name'])
        s.append(f'<article><h3>{name}</h3><p>{model["path"].split("/")[-1]}<br><small>{p["id"]}</small></p><p>게임 좌표 ({x}, {y}, {z})<br>충돌체 {size} m · 배치 회전 {p.get("heading",0)}° · 모형 상대 회전 {modelyaw}°</p></article>')
s+=['</div><p>현행 배치는 citadel-construction.json의 workLayout 참조를 통해 게임과 도면이 같은 원본을 사용한다. <a href="work-layout-checks.json">작업 동선 검사값</a> · <a href="citadel-placement-schedule.json">현행 배치와 치수 원본</a></p></body></html>'];(folder/'construction.html').write_text('\n'.join(s)+'\n','utf8')
(folder/'citadel-placement-schedule.json').write_text(json.dumps({'source':spec['workLayout'],'construction':spec,'site':site,'chapter':level},ensure_ascii=False,indent=2)+'\n','utf8')
