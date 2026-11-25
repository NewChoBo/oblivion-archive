"""Rebuild any one of the citadel's original, repeating stone and slate finishes."""
import argparse
import math
import random
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[2] / 'public/assets/citadel'
PALETTE = {
    'ashlar': ((133, 143, 142), 4, 7),
    'flagstone': ((152, 151, 140), 3, 4),
    'kiln-brick': ((153, 105, 82), 5, 10),
    'roof-slate': ((87, 106, 119), 6, 8),
    'basalt': ((105, 113, 118), 4, 0),
}


def paint(name):
    color, columns, rows = PALETTE[name]
    rng = random.Random(name)
    n = 512
    if name == 'basalt':
        source = OUT.parents[2] / 'asset-sources/Art/Chapter1/citadel-basalt.webp'
        albedo = Image.open(source).convert('RGB').resize((n,n), Image.Resampling.LANCZOS)
        write_surface(name, albedo, albedo.convert('L').filter(ImageFilter.GaussianBlur(.6)))
        return
    h = Image.new('L', (n, n), 45)
    pigment = Image.new('L', (n, n), 82)
    relief, value = ImageDraw.Draw(h), ImageDraw.Draw(pigment)
    if rows:
        for row in range(rows):
            start = int((row % 2) * n / columns * .5)
            cuts = [start] + [start + round((i+rng.uniform(-.16,.16))*n/columns) for i in range(1, columns)] + [start+n]
            for a,b in zip(cuts,cuts[1:]):
                y, bottom = round(row*n/rows),round((row+1)*n/rows)
                level, tone = rng.randint(166,194),rng.randint(108,147)
                for shift in (-n,0):
                    left,right = a+shift,b+shift
                    lip = 3 if name!='roof-slate' else 10
                    poly=[(left+2,y+2),(right-2,y+2),(right-2,bottom-lip),(right-lip,bottom-2),(left+lip,bottom-2),(left+2,bottom-lip)]
                    relief.polygon(poly,fill=level)
                    value.polygon(poly,fill=tone)
    else:
        h.paste(150,(0,0,n,n));pigment.paste(125,(0,0,n,n))
    bevel = h.filter(ImageFilter.GaussianBlur(1.35))
    height = bytearray(bevel.tobytes()); stone=pigment.tobytes()
    rgb=bytearray(n*n*3)
    for y in range(n):
        for x in range(n):
            i=y*n+x
            mineral = math.sin(2*math.pi*(3*x+5*y)/n + .6*math.sin(2*math.pi*5*x/n))
            fine = rng.uniform(-4,4)
            stratum = 6*mineral + 4*math.cos(2*math.pi*(x-3*y)/n)
            height[i]=max(0,min(255,round(height[i]+stratum*.39+fine*.45)))
            tone=(stone[i]-126)*.66 + stratum + fine
            rgb[i*3:i*3+3]=bytes(max(0,min(255,round(c+tone))) for c in color)
    hm=Image.frombytes('L',(n,n),bytes(height))
    albedo = Image.frombytes('RGB', (n,n), bytes(rgb))
    write_surface(name, albedo, hm)


def write_surface(name, albedo, hm):
    n = hm.width
    dx=ImageChops.subtract(ImageChops.offset(hm,1,0),ImageChops.offset(hm,-1,0),2,128)
    dy=ImageChops.subtract(ImageChops.offset(hm,0,-1),ImageChops.offset(hm,0,1),2,128)
    normal=bytearray(n*n*3)
    for i,(a,b) in enumerate(zip(dx.tobytes(),dy.tobytes())):
        u,v=(a-128)/19,(b-128)/19
        scale=127/math.sqrt(1+u*u+v*v)
        normal[i*3:i*3+3]=bytes([round(128+scale*u),round(128+scale*v),round(128+scale)])
    albedo.save(OUT/(name+'.jpg'),quality=91)
    Image.frombytes('RGB',(n,n),bytes(normal)).save(OUT/(name+'-normal.png'),optimize=True)


def paint_glass():
    n = 256
    image = Image.new('RGB', (n,n))
    rng = random.Random('lead cames')
    for y in range(n):
        for x in range(n):
            # Diagonal lead cames hold individually tinted, streaked panes.
            a, b = (x + y/2) / 64, (x - y/2) / 64
            lead = min(abs(a-round(a)), abs(b-round(b))) * 64
            band = (math.floor(a) + 3*math.floor(b)) % 4
            streak = 8*math.sin((x + 2*y)*math.tau/n) + rng.uniform(-4,4)
            color = [(128,154,162),(190,167,132),(147,168,157),(171,151,133)][band]
            if lead < 1.6: color = (39,50,54)
            elif lead < 2.7: color = (92,100,93)
            image.putpixel((x,y),tuple(round(c+streak) for c in color))
    image.save(OUT/'leaded-glass.png',optimize=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('surface',nargs='?',choices=[*PALETTE,'leaded-glass'])
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    for surface in ([args.surface] if args.surface else [*PALETTE,'leaded-glass']):
        if surface == 'leaded-glass': paint_glass()
        else: paint(surface)
