"""Draw the production floor plan in world metres with north (+Z) up."""
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/art/chapter-1'
level = json.loads((ROOT / 'shared/levels/chapter-1.json').read_text(encoding='utf-8'))
paper, ink, muted = '#e6deca', '#243338', '#586666'
gold, blue = '#a5582d', '#247978'
im = Image.new('RGB', (1660, 1210), paper)
d = ImageDraw.Draw(im)
font_dir = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'


def text(x, y, s, size, color=ink, bold=False):
    font = ImageFont.truetype(str(font_dir / ('malgunbd.ttf' if bold else 'malgun.ttf')), size)
    d.text((x,y), s, font=font, fill=color, anchor='lt')


def pt(x,z):
    return round(450+x*27), round(898-z*27)


def rect(w,e,s,n,fill,outline=None,width=1):
    d.rectangle([pt(w,n),pt(e,s)], fill=fill, outline=outline, width=width)


def line(points,color,width):
    d.line([pt(*p) for p in points], fill=color, width=width, joint='curve')


def pin(x,z,number):
    a,b=pt(x,z)
    d.ellipse((a-13,b-13,a+13,b+13),fill=ink,outline=paper,width=2)
    font=ImageFont.truetype(str(font_dir/'malgunbd.ttf'),16)
    d.text((a,b),str(number),font=font,fill='white',anchor='mm')


text(65,48,'망각의 서재',21,muted,True)
text(65,83,'사진에서 지워진 사람',47,ink,True)
text(897,92,'챕터 1   /   공간 설계 시트',27,ink,True)
d.line((65,149,1590,149),fill=ink,width=2)
d.rectangle((65,177,835,1112),fill='#d4ccb9')
for x in range(-12,14,2):
    line([(x,-6.9),(x,24.8)], '#c9c2b2',1)
for z in range(-6,25,2):
    line([(-12.5,z),(12.8,z)], '#c9c2b2',1)
# Paint adjoining floor polygons, then draw the real openings on the perimeter.
for room in [(-4.5,4.5,-6,7),(-2,2,7,19.1),(-3,3,19.1,25.5),
             (3,4.9,21.3,23.9),(4.9,7.1,4.2,25.2),(4.5,4.9,4.55,6.25)]:
    rect(*room,'#f5eddc')
for boundary in [[(-4.5,-6),(4.5,-6),(4.5,4.55)],[(4.5,6.25),(4.5,7),(1.5,7)],
                 [(-4.5,-6),(-4.5,7),(-1.5,7)],[(-2,7),(-2,19.1),(-3,19.1),(-3,25.5),(3,25.5),(3,23.9)],
                 [(2,7),(2,19.1),(3,19.1),(3,21.3)],[(3,21.3),(4.9,21.3),(4.9,6.25),(4.5,6.25)],
                 [(3,23.9),(4.9,23.9),(4.9,25.2),(7.1,25.2),(7.1,4.2),(4.9,4.2),(4.9,4.55),(4.5,4.55)]]:
    line(boundary,ink,5)
for shelf in level['zones']['readingShelves']:
    x, _, z = shelf['position']
    width, _, depth = shelf['size']
    rect(x-width/2,x+width/2,z-depth/2,z+depth/2,'#67584b')
rect(-.8,1.6,1.25,2.35,'#705042')
rect(-.95,.95,22.58,23.42,'#705042')
for x in [-1.05,0,1.05]:
    rect(x-.21,x+.21,16.35,16.85,'#a98f69')
for x,z,w,h in [(.65,12.1,2.7,.65),(1.5,12.8,.65,.72),(1.7,13.7,.65,.72),(-1.65,14.8,.65,.72)]:
    rect(x-w/2,x+w/2,z-h/2,z+h/2,'#7d8280')
line([(0,-4.5),(0,.65),(-1.25,.85),(-1.25,2.8),(0,5.2),(0,9.3),(-1.24,10.8),(-1.25,13.5),(-.5,15.4),(-.53,17.4),(0,18.5),(0,21.9)],gold,4)
line([(.35,22),(2,22.6),(5.9,22.6),(5.9,5.4),(2.1,5.4),(2.05,3.4),(1.93,.85),(.7,.65)],blue,4)
for x,z,num in [(0,-4.5,1),(.4,1.8,2),(-1.6,10.8,3),(0,16.6,4),(0,23,5),(3.2,22.6,6)]:
    pin(x,z,num)
text(89,200,'N  ↑',21,ink,True)
text(903,211,'공간의 순서',32,ink,True)
rows=[('1','남쪽 입구','서가 사이로 사진 액자와 등불이 보인다.'),
      ('2','열람실 기록대','사진을 조사하고 북쪽 아치로 향한다.'),
      ('3','무너진 회랑','서쪽 벽화에서 단서를 읽고 잔해를 지난다.'),
      ('4','세 받침과 봉인문','벽화에서 본 순서대로 봉인을 맞춘다.'),
      ('5','봉인 보관실','서명 원부에서 사진 속 이름을 되찾는다.'),
      ('6','동쪽 귀환 통로','빗장을 열고 남쪽으로 돌아가 사진을 복원한다.')]
for i,(n,title,desc) in enumerate(rows):
    y=283+i*100
    text(907,y,n,21,gold,True)
    text(958,y-1,title,25,ink,True)
    text(958,y+36,desc,20,muted)
d.line((902,899,1567,899), fill='#a69e89',width=1)
for i,(color,caption) in enumerate([(gold,'탐색'),(blue,'지름길 귀환')]):
    y=937+i*48
    d.line((907,y+10,975,y+10),fill=color,width=5)
    text(999,y,caption,19)
x,y=pt(-10,-5)
d.line((x,y,x+135,y),fill=ink,width=4)
for k in range(6):
    d.line((x+k*27,y-5,x+k*27,y+5),fill=ink,width=2)
text(x,y+17,'5 m',16)
text(65,1148,'북쪽이 위  ·  바닥 평면 기준  ·  표식과 경로는 읽기 쉽게 확대해 표시',19,muted)
OUT.mkdir(parents=True, exist_ok=True)
im.save(OUT/'floor-plan.webp',quality=94,method=6)
